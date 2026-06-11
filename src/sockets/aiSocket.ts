import { timingSafeEqual } from "crypto";
import type { Server, Socket } from "socket.io";

import {
  AiChatHistoryItem,
  claimNextAiJob,
  completeAiJob,
  createAiJob,
  failAiJob,
  recordAiWorkerHeartbeat,
} from "../services/aiJobStore";

const workers = new Map<string, Socket>();
const busyWorkers = new Set<string>();

function secureCompare(expected: string, supplied: string) {
  if (!expected || !supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  if (expectedBuffer.length !== suppliedBuffer.length) {
    return false;
  }

  return timingSafeEqual(
    expectedBuffer,
    suppliedBuffer
  );
}

function isWorkerAuthorized(socket: Socket) {
  const expectedKey =
    process.env.AI_WORKER_KEY || "";

  const suppliedKey = String(
    socket.handshake.auth?.workerKey || ""
  );

  return secureCompare(
    expectedKey,
    suppliedKey
  );
}

function getAvailableWorker() {
  for (const [socketId, socket] of workers) {
    if (
      socket.connected &&
      !busyWorkers.has(socketId)
    ) {
      return socket;
    }
  }

  return null;
}

export function dispatchNextAiSocketJob(
  io: Server
) {
  const worker = getAvailableWorker();

  if (!worker) return false;

  const job = claimNextAiJob();

  if (!job) return false;

  busyWorkers.add(worker.id);

  worker.emit("ai-worker:job", job);

  console.log("[AI_SOCKET] Job dispatched", {
    jobId: job.jobId,
    workerSocketId: worker.id,
  });

  return true;
}

export function registerAiSocketHandlers(
  io: Server
) {
  io.on("connection", (socket) => {
    const workerKeyWasProvided =
      Boolean(socket.handshake.auth?.workerKey);

    if (workerKeyWasProvided) {
      if (!isWorkerAuthorized(socket)) {
        socket.emit("ai-worker:error", {
          message: "Unauthorized worker",
        });

        socket.disconnect(true);
        return;
      }

      workers.set(socket.id, socket);
      recordAiWorkerHeartbeat();

      socket.emit("ai-worker:ready", {
        socketId: socket.id,
      });

      console.log("[AI_SOCKET] Worker connected", {
        socketId: socket.id,
      });

      dispatchNextAiSocketJob(io);

      socket.on("ai-worker:heartbeat", () => {
        recordAiWorkerHeartbeat();
      });

      socket.on(
        "ai-worker:request-next",
        () => {
          busyWorkers.delete(socket.id);
          recordAiWorkerHeartbeat();
          dispatchNextAiSocketJob(io);
        }
      );

      socket.on(
        "ai-worker:complete",
        (
          payload: {
            jobId?: string;
            answer?: string;
            model?: string;
            meta?: unknown;
          },
          acknowledge?: (
            result: Record<string, unknown>
          ) => void
        ) => {
          const jobId = String(
            payload?.jobId || ""
          );

          const answer = String(
            payload?.answer || ""
          ).trim();

          if (!jobId || !answer) {
            acknowledge?.({
              status: "error",
              message:
                "jobId and answer are required",
            });

            return;
          }

          const completed = completeAiJob(
            jobId,
            answer,
            payload.model,
            payload.meta
          );

          if (!completed) {
            acknowledge?.({
              status: "error",
              message: "AI job not found",
            });

            return;
          }

          io.to(`ai-job:${jobId}`).emit(
            "ai:completed",
            {
              jobId,
              answer,
              model: payload.model,
              meta: payload.meta,
            }
          );

          busyWorkers.delete(socket.id);

          acknowledge?.({
            status: "ok",
          });

          console.log("[AI_SOCKET] Job completed", {
            jobId,
          });

          dispatchNextAiSocketJob(io);
        }
      );

      socket.on(
        "ai-worker:fail",
        (
          payload: {
            jobId?: string;
            error?: string;
          },
          acknowledge?: (
            result: Record<string, unknown>
          ) => void
        ) => {
          const jobId = String(
            payload?.jobId || ""
          );

          const error = String(
            payload?.error ||
              "AI processing failed"
          );

          const failed = failAiJob(
            jobId,
            error
          );

          if (failed) {
            io.to(`ai-job:${jobId}`).emit(
              "ai:failed",
              {
                jobId,
                error,
              }
            );
          }

          busyWorkers.delete(socket.id);

          acknowledge?.({
            status: failed
              ? "ok"
              : "error",
          });

          dispatchNextAiSocketJob(io);
        }
      );

      socket.on("disconnect", () => {
        workers.delete(socket.id);
        busyWorkers.delete(socket.id);

        console.log(
          "[AI_SOCKET] Worker disconnected",
          {
            socketId: socket.id,
          }
        );
      });

      return;
    }

    socket.on(
      "ai:submit",
      (
        payload: {
          message?: string;
          history?: AiChatHistoryItem[];
        },
        acknowledge?: (
          result: Record<string, unknown>
        ) => void
      ) => {
        const message = String(
          payload?.message || ""
        )
          .trim()
          .slice(0, 1500);

        if (!message) {
          acknowledge?.({
            status: "error",
            message: "Message is required",
          });

          return;
        }

        const history =
          Array.isArray(payload?.history)
            ? payload.history
                .filter(
                  (item) =>
                    item &&
                    (item.role === "user" ||
                      item.role ===
                        "assistant") &&
                    typeof item.content ===
                      "string"
                )
                .slice(-8)
            : [];

        const job = createAiJob(
          message,
          history
        );

        socket.join(
          `ai-job:${job.jobId}`
        );

        acknowledge?.({
          status: "accepted",
          jobId: job.jobId,
          jobStatus: job.status,
          createdAt: job.createdAt,
        });

        dispatchNextAiSocketJob(io);
      }
    );
  });
}
