import { describe, expect, test, vi } from "vitest";
import {
  createCoachService,
  type CoachQueueInput
} from "@server/coachService";
import type { CoachAnalysisRequest } from "@server/coachPrompt";
import type { CoachFeedback, CoachProfile } from "@shared/schemas";

const feedback: CoachFeedback = {
  diagnosis: "条件缺失",
  explanation: "查询口径不完整。",
  nextHint: "检查 WHERE。",
  reviewTopics: ["WHERE"],
  mistakeTags: ["missing_filter"],
  stageSummary: null
};

const emptyProfile: CoachProfile = {
  version: 1,
  updatedAt: "2026-11-10T00:00:00.000Z",
  weakPoints: {},
  reviewTopics: {},
  questionSummaries: {},
  latestSummary: null
};

function queueInput(overrides: Partial<CoachQueueInput> = {}): CoachQueueInput {
  return {
    questionId: "D01",
    verdict: "failed",
    failedAttempts: 1,
    errorAttempts: 0,
    analysis: {
      question: {
        id: "D01",
        module: "基础筛选",
        title: "筛选用户",
        difficulty: "L1",
        prompt: "查询用户",
        schemaTables: ["users"],
        requiredColumns: ["user_id"],
        orderSensitive: false
      },
      learnerSql: "SELECT user_id FROM users",
      outcome: {
        verdict: "failed",
        reason: "rows differ",
        differences: null,
        executionError: null
      },
      attempt: {
        failedAttempts: 1,
        errorAttempts: 0,
        weakPoints: []
      }
    },
    ...overrides
  };
}

function createFakeStore() {
  return {
    recordFeedback: vi.fn(async () => ({
      profile: emptyProfile,
      syncWarning: undefined
    })),
    getProfile: vi.fn(async () => emptyProfile),
    getLatestFeedback: vi.fn(async () => null)
  };
}

describe("createCoachService", () => {
  test("returns queued before model completion and then persists feedback", async () => {
    let resolveAnalysis!: (value: CoachFeedback) => void;
    const client = {
      analyze: vi.fn(
        () =>
          new Promise<CoachFeedback>((resolve) => {
            resolveAnalysis = resolve;
          })
      )
    };
    const store = createFakeStore();
    const service = createCoachService({
      configured: true,
      client,
      store,
      createId: () => "00000000-0000-4000-8000-000000000001",
      now: () => new Date("2026-11-10T00:00:00.000Z")
    });

    const queued = service.enqueue(queueInput());

    expect(queued).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      status: "queued"
    });
    expect(store.recordFeedback).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(client.analyze).toHaveBeenCalledTimes(1));
    expect(service.getJob(queued.id)?.status).toBe("running");
    resolveAnalysis(feedback);
    await vi.waitFor(() =>
      expect(service.getJob(queued.id)?.status).toBe("completed")
    );
    expect(store.recordFeedback).toHaveBeenCalledTimes(1);
    expect(service.getJob(queued.id)?.feedback).toEqual(feedback);
  });

  test("processes jobs in insertion order with one active model call", async () => {
    const resolvers: Array<(value: CoachFeedback) => void> = [];
    const client = {
      analyze: vi.fn(
        () =>
          new Promise<CoachFeedback>((resolve) => {
            resolvers.push(resolve);
          })
      )
    };
    let id = 0;
    const service = createCoachService({
      configured: true,
      client,
      store: createFakeStore(),
      createId: () =>
        `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`
    });

    const first = service.enqueue(queueInput());
    const second = service.enqueue(queueInput({ questionId: "D02" }));
    await vi.waitFor(() => expect(client.analyze).toHaveBeenCalledTimes(1));

    resolvers[0](feedback);
    await vi.waitFor(() => expect(client.analyze).toHaveBeenCalledTimes(2));
    expect(service.getJob(first.id)?.status).toBe("completed");
    expect(service.getJob(second.id)?.status).toBe("running");

    resolvers[1](feedback);
    await vi.waitFor(() =>
      expect(service.getJob(second.id)?.status).toBe("completed")
    );
  });

  test("marks client failures without leaking provider details", async () => {
    const service = createCoachService({
      configured: true,
      client: {
        analyze: vi.fn(async () => {
          throw new Error("provider secret response");
        })
      },
      store: createFakeStore(),
      createId: () => "00000000-0000-4000-8000-000000000001"
    });
    const job = service.enqueue(queueInput());

    await vi.waitFor(() =>
      expect(service.getJob(job.id)?.status).toBe("failed")
    );
    expect(service.getJob(job.id)?.error).toBe(
      "AI 分析暂不可用，下次提交将自动重试。"
    );
    expect(JSON.stringify(service.getJob(job.id))).not.toContain("provider secret");
  });

  test("adds the stage-summary flag from counters", async () => {
    const client = {
      analyze: vi.fn(async (_request: CoachAnalysisRequest) => feedback)
    };
    const service = createCoachService({
      configured: true,
      client,
      store: createFakeStore()
    });

    service.enqueue(
      queueInput({ failedAttempts: 2, errorAttempts: 1 })
    );
    await vi.waitFor(() => expect(client.analyze).toHaveBeenCalledTimes(1));

    expect(client.analyze.mock.calls[0][0].includeStageSummary).toBe(true);
  });

  test("keeps only the 100 newest jobs", async () => {
    let id = 0;
    const service = createCoachService({
      configured: true,
      client: { analyze: vi.fn(async () => feedback) },
      store: createFakeStore(),
      createId: () =>
        `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`
    });

    const first = service.enqueue(queueInput());
    let latest = first;
    for (let index = 0; index < 100; index += 1) {
      latest = service.enqueue(queueInput());
    }
    await vi.waitFor(() =>
      expect(service.getJob(latest.id)?.status).toBe("completed")
    );

    expect(service.getJob(first.id)).toBeUndefined();
    expect(service.getJob(latest.id)).toBeDefined();
  });

  test("returns unavailable without invoking a client", () => {
    const service = createCoachService({
      configured: false,
      store: createFakeStore()
    });

    expect(service.enqueue(queueInput())).toEqual({
      id: "",
      status: "unavailable"
    });
  });
});
