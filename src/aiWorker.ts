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

const RENDER_SERVER_URL = (
  process.env.AI_RENDER_SERVER_URL ||
  "https://pop-bus-server.onrender.com"
).replace(/\/+$/, "");

const LOCAL_AI_URL =
  process.env.LOCAL_AI_URL ||
  "http://localhost:4000/api/ai/chat";

const AI_WORKER_KEY =
  process.env.AI_WORKER_KEY || "";

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 10000;
const LOCAL_AI_TIMEOUT_MS = 90000;

function sleep(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function getWorkerHeaders() {
  return {
    "Content-Type": "application/json",
    "x-ai-worker-key": AI_WORKER_KEY,
  };
}

async function sendHeartbeat() {
  const response = await fetch(
    `${RENDER_SERVER_URL}/api/ai/worker/heartbeat`,
    {
      method: "POST",
      headers: getWorkerHeaders(),
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Heartbeat failed with status ${response.status}`
    );
  }
}

async function claimNextJob(): Promise<AiJob | null> {
  const response = await fetch(
    `${RENDER_SERVER_URL}/api/ai/worker/next`,
    {
      method: "GET",
      headers: {
        "x-ai-worker-key": AI_WORKER_KEY,
      },
    }
  );

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Job claim failed with status ${response.status}`
    );
  }

  const payload = (await response.json()) as {
    job?: AiJob;
  };

  return payload.job || null;
}

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

async function completeJob(
  job: AiJob,
  result: LocalAiResponse
) {
  const response = await fetch(
    `${RENDER_SERVER_URL}/api/ai/worker/${job.jobId}/complete`,
    {
      method: "POST",
      headers: getWorkerHeaders(),
      body: JSON.stringify({
        answer: result.answer,
        model: result.model,
        meta: result.meta,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Completing job failed with status ${response.status}`
    );
  }
}

async function failJob(
  job: AiJob,
  errorMessage: string
) {
  try {
    await fetch(
      `${RENDER_SERVER_URL}/api/ai/worker/${job.jobId}/fail`,
      {
        method: "POST",
        headers: getWorkerHeaders(),
        body: JSON.stringify({
          error: errorMessage,
        }),
      }
    );
  } catch (error) {
    console.error(
      "[AI_WORKER] Could not report failed job",
      error
    );
  }
}

async function processJob(job: AiJob) {
  console.log("[AI_WORKER] Processing job", {
    jobId: job.jobId,
    message: job.message,
  });

  try {
    const result = await askLocalAi(job);

    await completeJob(job, result);

    console.log("[AI_WORKER] Job completed", {
      jobId: job.jobId,
      model: result.model,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown AI worker error";

    console.error("[AI_WORKER] Job failed", {
      jobId: job.jobId,
      message,
    });

    await failJob(job, message);
  }
}

async function runWorker() {
  if (!AI_WORKER_KEY) {
    console.error(
      "[AI_WORKER] AI_WORKER_KEY is missing"
    );

    process.exit(1);
  }

  console.log("[AI_WORKER] Started", {
    renderServer: RENDER_SERVER_URL,
    localAi: LOCAL_AI_URL,
  });

  let lastHeartbeatAt = 0;

  while (true) {
    try {
      const now = Date.now();

      if (
        now - lastHeartbeatAt >=
        HEARTBEAT_INTERVAL_MS
      ) {
        await sendHeartbeat();
        lastHeartbeatAt = now;

        console.log(
          "[AI_WORKER] Heartbeat sent"
        );
      }

      const job = await claimNextJob();

      if (job) {
        await processJob(job);
      } else {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      console.error("[AI_WORKER] Loop error", {
        message:
          error instanceof Error
            ? error.message
            : "Unknown worker loop error",
      });

      await sleep(5000);
    }
  }
}

void runWorker();
