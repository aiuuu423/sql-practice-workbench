import { randomUUID } from "node:crypto";
import type {
  CoachFeedback,
  CoachJob,
  CoachProfile
} from "@shared/schemas";
import type { CoachAnalysisRequest } from "./coachPrompt";
import type { CoachFeedbackRecord } from "./coachStore";

export function shouldGenerateStageSummary(input: {
  verdict: "passed" | "failed" | "error";
  failedAttempts: number;
  errorAttempts: number;
}) {
  if (input.verdict === "passed") return true;
  const totalErrors = input.failedAttempts + input.errorAttempts;
  return totalErrors > 0 && totalErrors % 3 === 0;
}

export interface CoachQueueInput {
  questionId: string;
  verdict: "passed" | "failed" | "error";
  failedAttempts: number;
  errorAttempts: number;
  analysis: Omit<CoachAnalysisRequest, "includeStageSummary">;
}

export interface CoachClient {
  analyze(request: CoachAnalysisRequest): Promise<CoachFeedback>;
}

export interface CoachStoreDependency {
  recordFeedback(
    record: CoachFeedbackRecord
  ): Promise<{ profile: CoachProfile; syncWarning?: string }>;
  getProfile(): Promise<CoachProfile>;
  getLatestFeedback(questionId: string): Promise<CoachFeedbackRecord | null>;
}

export function createCoachService(dependencies: {
  configured: boolean;
  client?: CoachClient;
  store: CoachStoreDependency;
  now?: () => Date;
  createId?: () => string;
}) {
  const jobs = new Map<string, CoachJob>();
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? randomUUID;
  let workQueue: Promise<void> = Promise.resolve();

  function updateJob(id: string, changes: Partial<CoachJob>) {
    const current = jobs.get(id);
    if (!current) return;
    jobs.set(id, {
      ...current,
      ...changes,
      updatedAt: now().toISOString()
    });
  }

  async function processJob(id: string, input: CoachQueueInput) {
    const client = dependencies.client;
    if (!client) {
      updateJob(id, {
        status: "failed",
        error: "AI 分析暂不可用，下次提交将自动重试。"
      });
      return;
    }

    updateJob(id, { status: "running" });
    try {
      const feedback = await client.analyze({
        ...input.analysis,
        includeStageSummary: shouldGenerateStageSummary({
          verdict: input.verdict,
          failedAttempts: input.failedAttempts,
          errorAttempts: input.errorAttempts
        })
      });
      const timestamp = now().toISOString();
      const persisted = await dependencies.store.recordFeedback({
        timestamp,
        questionId: input.questionId,
        verdict: input.verdict,
        feedback,
        providerCategory: null
      });
      updateJob(id, {
        status: "completed",
        feedback,
        error: null,
        ...(persisted.syncWarning
          ? { syncWarning: persisted.syncWarning }
          : {})
      });
    } catch {
      updateJob(id, {
        status: "failed",
        feedback: null,
        error: "AI 分析暂不可用，下次提交将自动重试。"
      });
    }
  }

  function enqueue(input: CoachQueueInput) {
    if (!dependencies.configured) {
      return { id: "", status: "unavailable" as const };
    }

    const id = createId();
    const timestamp = now().toISOString();
    jobs.set(id, {
      id,
      questionId: input.questionId,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
      feedback: null,
      error: null
    });

    while (jobs.size > 100) {
      const oldest = jobs.keys().next().value as string | undefined;
      if (!oldest) break;
      jobs.delete(oldest);
    }

    workQueue = workQueue
      .then(() => processJob(id, input))
      .catch(() => undefined);

    return { id, status: "queued" as const };
  }

  function getJob(id: string) {
    const job = jobs.get(id);
    return job ? structuredClone(job) : undefined;
  }

  return {
    configured: dependencies.configured,
    enqueue,
    getJob,
    getProfile: () => dependencies.store.getProfile(),
    getLatestFeedback: (questionId: string) =>
      dependencies.store.getLatestFeedback(questionId)
  };
}

export type CoachService = ReturnType<typeof createCoachService>;
