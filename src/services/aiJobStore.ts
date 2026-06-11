import { randomUUID } from "crypto";

export type AiChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type AiJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

type AiJob = {
  id: string;
  message: string;
  history: AiChatHistoryItem[];
  status: AiJobStatus;
  answer?: string;
  error?: string;
  model?: string;
  meta?: unknown;
  createdAt: number;
  updatedAt: number;
  claimedAt?: number;
};

const jobs = new Map<string, AiJob>();
const waitingJobIds: string[] = [];

const JOB_TTL_MS = 30 * 60 * 1000;
const STALE_PROCESSING_MS = 2 * 60 * 1000;
const WORKER_OFFLINE_AFTER_MS = 15000;

let lastWorkerHeartbeatAt = 0;

function maintainJobs() {
  const now = Date.now();

  for (const job of jobs.values()) {
    if (
      job.status === "processing" &&
      job.claimedAt &&
      now - job.claimedAt > STALE_PROCESSING_MS
    ) {
      job.status = "queued";
      job.claimedAt = undefined;
      job.updatedAt = now;

      if (!waitingJobIds.includes(job.id)) {
        waitingJobIds.push(job.id);
      }
    }
  }

  for (const [jobId, job] of jobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(jobId);
    }
  }
}

export function createAiJob(
  message: string,
  history: AiChatHistoryItem[]
) {
  maintainJobs();

  const now = Date.now();

  const job: AiJob = {
    id: randomUUID(),
    message,
    history,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(job.id, job);
  waitingJobIds.push(job.id);

  return {
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
  };
}

export function claimNextAiJob() {
  maintainJobs();

  while (waitingJobIds.length > 0) {
    const jobId = waitingJobIds.shift();

    if (!jobId) continue;

    const job = jobs.get(jobId);

    if (!job || job.status !== "queued") {
      continue;
    }

    const now = Date.now();

    job.status = "processing";
    job.claimedAt = now;
    job.updatedAt = now;

    return {
      jobId: job.id,
      message: job.message,
      history: job.history,
    };
  }

  return null;
}

export function completeAiJob(
  jobId: string,
  answer: string,
  model?: string,
  meta?: unknown
) {
  const job = jobs.get(jobId);

  if (!job) return false;

  job.status = "completed";
  job.answer = answer;
  job.model = model;
  job.meta = meta;
  job.error = undefined;
  job.updatedAt = Date.now();

  return true;
}

export function failAiJob(
  jobId: string,
  error: string
) {
  const job = jobs.get(jobId);

  if (!job) return false;

  job.status = "failed";
  job.error = error;
  job.updatedAt = Date.now();

  return true;
}

export function getPublicAiJob(jobId: string) {
  maintainJobs();

  const job = jobs.get(jobId);

  if (!job) return null;

  return {
    jobId: job.id,
    status: job.status,
    answer: job.answer,
    error: job.error,
    model: job.model,
    meta: job.meta,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export function recordAiWorkerHeartbeat() {
  lastWorkerHeartbeatAt = Date.now();
}

export function getAiWorkerStatus() {
  const now = Date.now();
  const online =
    lastWorkerHeartbeatAt > 0 &&
    now - lastWorkerHeartbeatAt <
      WORKER_OFFLINE_AFTER_MS;

  return {
    online,
    lastHeartbeatAt:
      lastWorkerHeartbeatAt || null,
  };
}
