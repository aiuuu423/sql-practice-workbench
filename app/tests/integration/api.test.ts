import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "@server/app";
import {
  createProgressStore,
  type ProgressStore
} from "@server/progressStore";

describe("core API", () => {
  let app: FastifyInstance;
  let progressStore: ProgressStore;

  beforeAll(async () => {
    const directory = await mkdtemp(join(tmpdir(), "sql-api-progress-"));
    const marker =
      "<!-- sql-workbench:start -->\nTest\n<!-- sql-workbench:end -->\n";
    const learningPlanPath = join(directory, "plan.md");
    const exerciseBankPath = join(directory, "exercises.md");
    const errorLogPath = join(directory, "errors.md");
    await Promise.all([
      writeFile(learningPlanPath, marker),
      writeFile(exerciseBankPath, marker),
      writeFile(errorLogPath, marker)
    ]);
    progressStore = await createProgressStore(
      {
        progressPath: join(directory, "progress.json"),
        submissionsPath: join(directory, "submissions.jsonl"),
        learningPlanPath,
        exerciseBankPath,
        errorLogPath
      },
      ["D01", "D02", "D03", "J02", "C01", "W01", "W03"]
    );
    app = await createApp({ progress: progressStore });
  });

  afterAll(async () => {
    await app.close();
  });

  test("reports the connected MySQL version", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.version).toMatch(/^8\.0\./);
    expect(body.database).toBe("sql_practice");
  });

  test("lists public questions without answer paths", async () => {
    const response = await app.inject({ method: "GET", url: "/api/questions" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.questions).toHaveLength(7);
    expect(body.questions[0]).not.toHaveProperty("answerFile");
  });

  test("executes a safe query and returns metadata", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: {
        sql: "SELECT user_id, city FROM users ORDER BY user_id LIMIT 2"
      }
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.columns).toEqual(["user_id", "city"]);
    expect(body.rows).toHaveLength(2);
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
    expect(body.truncated).toBe(false);
  });

  test("rejects unsafe SQL before execution", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: { sql: "DELETE FROM users" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("UNSAFE_SQL");
  });

  test("maps MySQL query errors to a learner-readable 422 response", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/execute",
      payload: { sql: "SELECT missing_column FROM users" }
    });
    const body = response.json();

    expect(response.statusCode).toBe(422);
    expect(body.error.code).toBe("ER_BAD_FIELD_ERROR");
    expect(body.error.message).toContain("missing_column");
  });

  test("grades a submission without exposing reference SQL", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/submit",
      payload: {
        questionId: "D01",
        sql: "SELECT user_id, city, register_time FROM users WHERE 1 = 0"
      }
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.verdict.passed).toBe(false);
    expect(body.coachJob).toEqual({ id: "", status: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("invite_code");
    expect(body).not.toHaveProperty("referenceSql");
  });

  test("requires reset confirmation and restores fixture counts", async () => {
    const rejected = await app.inject({
      method: "POST",
      url: "/api/reset",
      payload: { confirmation: "RESET" }
    });
    expect(rejected.statusCode).toBe(400);

    const response = await app.inject({
      method: "POST",
      url: "/api/reset",
      payload: { confirmation: "RESET sql_practice" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().counts).toEqual({ users: 8, orders: 12 });
  });

  test("serves the built frontend in production mode", async () => {
    const productionApp = await createApp({
      progress: progressStore,
      serveStatic: true
    });
    try {
      const response = await productionApp.inject({ method: "GET", url: "/" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain("SQL Practice Workbench");
    } finally {
      await productionApp.close();
    }
  });
});
