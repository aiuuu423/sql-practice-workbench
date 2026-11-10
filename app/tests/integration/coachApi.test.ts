import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "@server/app";
import type {
  CoachQueueInput,
  CoachService
} from "@server/coachService";
import { createProgressStore } from "@server/progressStore";
import type { CoachJob, CoachProfile } from "@shared/schemas";

const profile: CoachProfile = {
  version: 1,
  updatedAt: "2026-11-10T00:00:00.000Z",
  weakPoints: {},
  reviewTopics: {},
  questionSummaries: {},
  latestSummary: null
};

const completedJob: CoachJob = {
  id: "00000000-0000-4000-8000-000000000001",
  questionId: "D01",
  status: "completed",
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:01.000Z",
  feedback: {
    diagnosis: "筛选条件缺失",
    explanation: "查询结果与题目不一致。",
    nextHint: "检查 WHERE。",
    reviewTopics: ["WHERE"],
    mistakeTags: ["missing_filter"],
    stageSummary: null
  },
  error: null
};

describe("coach API", () => {
  let app: FastifyInstance;
  let enqueue: ReturnType<typeof vi.fn<(input: CoachQueueInput) => {
    id: string;
    status: "queued";
  }>>;

  beforeAll(async () => {
    const directory = await mkdtemp(join(tmpdir(), "sql-coach-api-"));
    const workbenchMarker =
      "<!-- sql-workbench:start -->\nTest\n<!-- sql-workbench:end -->\n";
    const learningPlanPath = join(directory, "plan.md");
    const exerciseBankPath = join(directory, "exercises.md");
    const errorLogPath = join(directory, "errors.md");
    await Promise.all([
      writeFile(learningPlanPath, workbenchMarker),
      writeFile(exerciseBankPath, workbenchMarker),
      writeFile(errorLogPath, workbenchMarker)
    ]);
    const progress = await createProgressStore(
      {
        progressPath: join(directory, "progress.json"),
        submissionsPath: join(directory, "submissions.jsonl"),
        learningPlanPath,
        exerciseBankPath,
        errorLogPath
      },
      ["D01", "D02", "D03", "J02", "C01", "W01", "W03"]
    );

    enqueue = vi.fn(() => ({
      id: "00000000-0000-4000-8000-000000000001",
      status: "queued" as const
    }));
    const coach = {
      configured: true,
      enqueue,
      getJob: vi.fn((id: string) =>
        id === completedJob.id ? completedJob : undefined
      ),
      getProfile: vi.fn(async () => profile),
      getLatestFeedback: vi.fn(async () => null)
    } as unknown as CoachService;

    app = await createApp({ progress, coach });
  });

  afterAll(async () => {
    await app.close();
  });

  test("returns a queued coach job without waiting for model work", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/submit",
      payload: {
        questionId: "D01",
        sql: "SELECT user_id, city, register_time FROM users WHERE 1 = 0"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().coachJob).toEqual({
      id: completedJob.id,
      status: "queued"
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: "D01",
        verdict: "failed",
        failedAttempts: 1,
        analysis: expect.objectContaining({
          learnerSql: expect.stringContaining("SELECT user_id")
        })
      })
    );
  });

  test("queues coaching for unsafe SQL while preserving HTTP 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/submit",
      payload: { questionId: "D01", sql: "DELETE FROM users" }
    });
    const body = response.json();

    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe("UNSAFE_SQL");
    expect(body.coachJob.status).toBe("queued");
    expect(body.progress.questions.D01.errorAttempts).toBeGreaterThan(0);
  });

  test("queues coaching for MySQL errors while preserving HTTP 422", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/submit",
      payload: {
        questionId: "D01",
        sql: "SELECT missing_column FROM users"
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: { code: "ER_BAD_FIELD_ERROR" },
      coachJob: { status: "queued" }
    });
  });

  test("serves completed jobs and profile without provider secrets", async () => {
    const jobResponse = await app.inject({
      method: "GET",
      url: `/api/coach/jobs/${completedJob.id}`
    });
    const profileResponse = await app.inject({
      method: "GET",
      url: "/api/coach/profile"
    });

    expect(jobResponse.statusCode).toBe(200);
    expect(jobResponse.json().job).toEqual(completedJob);
    expect(profileResponse.json()).toMatchObject({
      configured: true,
      profile
    });
    expect(JSON.stringify(profileResponse.json())).not.toContain("apiKey");
    expect(JSON.stringify(profileResponse.json())).not.toContain("answerFile");
  });

  test("returns 404 for an unknown or expired job", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/coach/jobs/00000000-0000-4000-8000-000000000099"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("COACH_JOB_NOT_FOUND");
  });
});
