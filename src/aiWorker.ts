import { io } from "socket.io-client";

type AiJob = {
  jobId: string;
  message: string;
  history: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

type LocalAiResponse = {
  status?: string;
  answer?: string;
  model?: string;
  meta?: unknown;
  message?: string;
};

type WorkerAcknowledgement = {
  status?: string;
  message?: string;
};

const RENDER_SERVER_URL = (
  process.env.AI_RENDER_SERVER_URL ||
  "https://pop-bus-server.onrender.com"
).replace(/\/+$/, "");

const LOCAL_AI_URL =
  process.env.LOCAL_AI_URL ||
  "http://localhost:4000/api/ai/chat";

const AI_WORKER_KEY =
  process.env.AI_WORKER_KEY || "";

const LOCAL_AI_TIMEOUT_MS = 90000;
const ACK_TIMEOUT_MS = 15000;
const HEARTBEAT_INTERVAL_MS = 10000;

if (!AI_WORKER_KEY) {
  console.error(
    "[AI_SOCKET_WORKER] AI_WORKER_KEY is missing"
  );

  process.exit(1);
}

const socket = io(RENDER_SERVER_URL, {
  transports: ["websocket"],
  auth: {
    workerKey: AI_WORKER_KEY,
  },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

let currentJobId: string | null = null;

async function askLocalAi(job: AiJob) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, LOCAL_AI_TIMEOUT_MS);

  try {
    const response = await fetch(LOCAL_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        message: job.message,
        history: job.history,
      }),
    });

    const payload =
      (await response.json()) as LocalAiResponse;

    if (!response.ok) {
      throw new Error(
        payload.message ||
          `Local AI returned status ${response.status}`
      );
    }

    if (!payload.answer?.trim()) {
      throw new Error(
        "Local AI returned an empty answer"
      );
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function emitWithAcknowledgement(
  eventName: string,
  payload: Record<string, unknown>
) {
  return new Promise<WorkerAcknowledgement>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `${eventName} acknowledgement timed out`
          )
        );
      }, ACK_TIMEOUT_MS);

      socket.emit(
        eventName,
        payload,
        (result: WorkerAcknowledgement) => {
          clearTimeout(timeout);

          if (result?.status !== "ok") {
            reject(
              new Error(
                result?.message ||
                  `${eventName} failed`
              )
            );

            return;
          }

          resolve(result);
        }
      );
    }
  );
}

async function processJob(job: AiJob) {
  if (currentJobId) {
    console.warn(
      "[AI_SOCKET_WORKER] Ignored unexpected concurrent job",
      {
        currentJobId,
        receivedJobId: job.jobId,
      }
    );

    return;
  }

  currentJobId = job.jobId;

  console.log("[AI_SOCKET_WORKER] Job received", {
    jobId: job.jobId,
    message: job.message,
  });

  try {
    const result = await askLocalAi(job);

    currentJobId = null;

    await emitWithAcknowledgement(
      "ai-worker:complete",
      {
        jobId: job.jobId,
        answer: result.answer,
        model: result.model,
        meta: result.meta,
      }
    );

    console.log(
      "[AI_SOCKET_WORKER] Job completed",
      {
        jobId: job.jobId,
        model: result.model,
      }
    );
  } catch (error) {
    currentJobId = null;

    const message =
      error instanceof Error
        ? error.message
        : "Unknown AI worker error";

    console.error(
      "[AI_SOCKET_WORKER] Job failed",
      {
        jobId: job.jobId,
        message,
      }
    );

    try {
      await emitWithAcknowledgement(
        "ai-worker:fail",
        {
          jobId: job.jobId,
          error: message,
        }
      );
    } catch (reportError) {
      console.error(
        "[AI_SOCKET_WORKER] Could not report failure",
        reportError
      );
    }
  }
}

socket.on("connect", () => {
  console.log("[AI_SOCKET_WORKER] Connected", {
    socketId: socket.id,
    server: RENDER_SERVER_URL,
  });
});

socket.on("ai-worker:ready", (payload) => {
  console.log("[AI_SOCKET_WORKER] Ready", payload);
});

socket.on("ai-worker:job", (job: AiJob) => {
  void processJob(job);
});

socket.on("ai-worker:error", (payload) => {
  console.error(
    "[AI_SOCKET_WORKER] Server error",
    payload
  );
});

socket.on("disconnect", (reason) => {
  console.warn(
    "[AI_SOCKET_WORKER] Disconnected",
    {
      reason,
    }
  );
});

socket.on("connect_error", (error) => {
  console.error(
    "[AI_SOCKET_WORKER] Connection error",
    {
      message: error.message,
    }
  );
});

setInterval(() => {
  if (socket.connected) {
    socket.emit("ai-worker:heartbeat");
  }
}, HEARTBEAT_INTERVAL_MS);

console.log("[AI_SOCKET_WORKER] Starting", {
  server: RENDER_SERVER_URL,
  localAi: LOCAL_AI_URL,
});
