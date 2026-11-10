import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createProgressStore,
  type ProgressStorePaths
} from "@server/progressStore";

const markerBlock =
  "<!-- sql-workbench:start -->\nOld generated text.\n<!-- sql-workbench:end -->";

describe("progress store", () => {
  let directory: string;
  let paths: ProgressStorePaths;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sql-progress-"));
    paths = {
      progressPath: join(directory, "progress.json"),
      submissionsPath: join(directory, "submissions.jsonl"),
      learningPlanPath: join(directory, "plan.md"),
      exerciseBankPath: join(directory, "exercises.md"),
      errorLogPath: join(directory, "errors.md")
    };

    await Promise.all([
      writeFile(paths.learningPlanPath, `Plan prose\n\n${markerBlock}\n\nPlan end\n`),
      writeFile(paths.exerciseBankPath, `Exercise prose\n\n${markerBlock}\n`),
      writeFile(paths.errorLogPath, `Error prose\n\n${markerBlock}\n`)
    ]);
  });

  afterEach(async () => {
    // Temporary directories are left to the OS so a failing test remains inspectable.
  });

  test("appends submissions and atomically marks a passed question", async () => {
    const store = await createProgressStore(paths, ["D01", "D02"]);
    await store.recordSubmission({
      timestamp: "2026-11-10T00:00:00.000Z",
      questionId: "D01",
      sql: "SELECT 1",
      verdict: "passed",
      durationMs: 12,
      errorCategory: null
    });

    const progress = await store.getProgress();
    const history = await readFile(paths.submissionsPath, "utf8");

    expect(progress.questions.D01.status).toBe("passed");
    expect(progress.questions.D01.attempts).toBe(1);
    expect(history.trim().split("\n")).toHaveLength(1);
    await expect(readFile(`${paths.progressPath}.tmp`, "utf8")).rejects.toThrow();
  });

  test("aggregates repeated error categories", async () => {
    const store = await createProgressStore(paths, ["D01"]);
    const failedAttempt = {
      timestamp: "2026-11-10T00:00:00.000Z",
      questionId: "D01",
      sql: "SELECT missing FROM users",
      verdict: "error" as const,
      durationMs: 1,
      errorCategory: "unknown_column"
    };

    await store.recordSubmission(failedAttempt);
    await store.recordSubmission(failedAttempt);

    expect(
      (await store.getProgress()).questions.D01.recurringErrors.unknown_column
    ).toBe(2);
  });

  test("migrates old progress and counts failed and error attempts", async () => {
    await writeFile(
      paths.progressPath,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-11-09T00:00:00.000Z",
        questions: {
          D01: {
            status: "available",
            attempts: 0,
            passedAt: null,
            latestVerdict: null,
            recurringErrors: {}
          }
        }
      })
    );
    const store = await createProgressStore(paths, ["D01"]);

    expect((await store.getProgress()).questions.D01).toMatchObject({
      failedAttempts: 0,
      errorAttempts: 0
    });

    await store.recordSubmission({
      timestamp: "2026-11-10T00:00:00.000Z",
      questionId: "D01",
      sql: "SELECT 1",
      verdict: "failed",
      durationMs: 1,
      errorCategory: "result_mismatch"
    });
    await store.recordSubmission({
      timestamp: "2026-11-10T00:01:00.000Z",
      questionId: "D01",
      sql: "SELECT missing FROM users",
      verdict: "error",
      durationMs: 1,
      errorCategory: "unknown_column"
    });

    expect((await store.getProgress()).questions.D01).toMatchObject({
      failedAttempts: 1,
      errorAttempts: 1
    });
  });

  test("replaces only generated Markdown marker contents", async () => {
    const store = await createProgressStore(paths, ["D01"]);
    await store.recordSubmission({
      timestamp: "2026-11-10T00:00:00.000Z",
      questionId: "D01",
      sql: "SELECT 1",
      verdict: "failed",
      durationMs: 2,
      errorCategory: "result_mismatch"
    });

    const plan = await readFile(paths.learningPlanPath, "utf8");
    const exercises = await readFile(paths.exerciseBankPath, "utf8");
    const errors = await readFile(paths.errorLogPath, "utf8");

    expect(plan).toContain("Plan prose");
    expect(plan).toContain("Plan end");
    expect(plan).toContain("已完成：0 / 1");
    expect(exercises).toContain("| D01 | 待通过 | 1 |");
    expect(errors).toContain("result_mismatch");
  });
});
