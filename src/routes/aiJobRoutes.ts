import {
  Request,
  Router,
} from "express";
import { timingSafeEqual } from "crypto";

import {
  AiChatHistoryItem,
  claimNextAiJob,
  completeAiJob,
  createAiJob,
  failAiJob,
  getAiWorkerStatus,
  getPublicAiJob,
  recordAiWorkerHeartbeat,
} from "../services/aiJobStore";

function isWorkerAuthorized(req: Request) {
  const expected =
    process.env.AI_WORKER_KEY || "";

  const supplied =
    req.header("x-ai-worker-key") || "";

  if (!expected || !supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  if (
    expectedBuffer.length !==
    suppliedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    expectedBuffer,
    suppliedBuffer
  );
}

function requireWorker(req: Request) {
  return isWorkerAuthorized(req);
}

export function createAiJobRoutes() {
  const router = Router();

  router.get("/api/ai/status", (_req, res) => {
    res.json({
      status: "ok",
      worker: getAiWorkerStatus(),
    });
  });

  router.post("/api/ai/jobs", (req, res) => {
    const message = String(
      req.body?.message || ""
    )
      .trim()
      .slice(0, 1500);

    if (!message) {
      return res.status(400).json({
        status: "error",
        message: "Message is required",
      });
    }

    const history: AiChatHistoryItem[] =
      Array.isArray(req.body?.history)
        ? req.body.history
            .filter(
              (item: AiChatHistoryItem) =>
                item &&
                (item.role === "user" ||
                  item.role === "assistant") &&
                typeof item.content === "string"
            )
            .slice(-8)
            .map(
              (item: AiChatHistoryItem) => ({
                role: item.role,
                content: item.content.slice(
                  0,
                  2000
                ),
              })
            )
        : [];

    const job = createAiJob(
      message,
      history
    );

    return res.status(202).json({
      status: "accepted",
      jobId: job.jobId,
      jobStatus: job.status,
      createdAt: job.createdAt,
    });
  });

  router.get(
    "/api/ai/jobs/:jobId",
    (req, res) => {
      const job = getPublicAiJob(
        req.params.jobId
      );

      if (!job) {
        return res.status(404).json({
          status: "error",
          message: "AI job not found",
        });
      }

      return res.json({
        status: "ok",
        job,
      });
    }
  );

  router.post(
    "/api/ai/worker/heartbeat",
    (req, res) => {
      if (!requireWorker(req)) {
        return res.status(401).json({
          status: "error",
          message: "Unauthorized",
        });
      }

      recordAiWorkerHeartbeat();

      return res.json({
        status: "ok",
      });
    }
  );

  router.get(
    "/api/ai/worker/next",
    (req, res) => {
      if (!requireWorker(req)) {
        return res.status(401).json({
          status: "error",
          message: "Unauthorized",
        });
      }

      recordAiWorkerHeartbeat();

      const job = claimNextAiJob();

      if (!job) {
        return res.status(204).send();
      }

      return res.json({
        status: "ok",
        job,
      });
    }
  );

  router.post(
    "/api/ai/worker/:jobId/complete",
    (req, res) => {
      if (!requireWorker(req)) {
        return res.status(401).json({
          status: "error",
          message: "Unauthorized",
        });
      }

      const answer = String(
        req.body?.answer || ""
      ).trim();

      if (!answer) {
        return res.status(400).json({
          status: "error",
          message: "Answer is required",
        });
      }

      const completed = completeAiJob(
        req.params.jobId,
        answer,
        req.body?.model,
        req.body?.meta
      );

      if (!completed) {
        return res.status(404).json({
          status: "error",
          message: "AI job not found",
        });
      }

      return res.json({
        status: "ok",
      });
    }
  );

  router.post(
    "/api/ai/worker/:jobId/fail",
    (req, res) => {
      if (!requireWorker(req)) {
        return res.status(401).json({
          status: "error",
          message: "Unauthorized",
        });
      }

      const error = String(
        req.body?.error ||
          "AI processing failed"
      ).slice(0, 1000);

      const failed = failAiJob(
        req.params.jobId,
        error
      );

      if (!failed) {
        return res.status(404).json({
          status: "error",
          message: "AI job not found",
        });
      }

      return res.json({
        status: "ok",
      });
    }
  );

  return router;
}

