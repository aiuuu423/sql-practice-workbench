import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import {
  createCoachStore,
  type CoachStorePaths
} from "@server/coachStore";
import type { CoachFeedback } from "@shared/schemas";

const feedback: CoachFeedback = {
  diagnosis: "缺少状态筛选",
  explanation: "查询没有限制 active 用户。",
  nextHint: "检查 WHERE 中的状态条件。",
  reviewTopics: ["WHERE", "日期边界"],
  mistakeTags: ["missing_filter", "date_boundary"],
  stageSummary: "需要巩固多条件筛选。"
};

describe("coach store", () => {
  let directory: string;
  let paths: CoachStorePaths;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sql-coach-"));
    paths = {
      feedbackPath: join(directory, "coach_feedback.jsonl"),
      profilePath: join(directory, "coach_profile.json"),
      knowledgeNotesPath: join(directory, "knowledge.md"),
      errorLogPath: join(directory, "errors.md")
    };
    await Promise.all([
      writeFile(
        paths.knowledgeNotesPath,
        [
          "Knowledge prose",
          "",
          "<!-- sql-workbench:start -->",
          "Existing workbench content",
          "<!-- sql-workbench:end -->",
          "",
          "<!-- sql-coach:start -->",
          "Old coach content",
          "<!-- sql-coach:end -->",
          "",
          "Knowledge end"
        ].join("\n")
      ),
      writeFile(
        paths.errorLogPath,
        [
          "Error prose",
          "",
          "<!-- sql-coach:start -->",
          "Old coach errors",
          "<!-- sql-coach:end -->"
        ].join("\n")
      )
    ]);
  });

  test("creates an empty versioned profile when local state is missing", async () => {
    const store = await createCoachStore(paths);

    expect(await store.getProfile()).toEqual({
      version: 1,
      updatedAt: expect.any(String),
      weakPoints: {},
      reviewTopics: {},
      questionSummaries: {},
      latestSummary: null
    });
  });

  test("appends feedback and aggregates the learning profile", async () => {
    const store = await createCoachStore(paths);
    const first = await store.recordFeedback({
      timestamp: "2026-11-10T01:00:00.000Z",
      questionId: "D01",
      verdict: "failed",
      feedback,
      providerCategory: null
    });
    await store.recordFeedback({
      timestamp: "2026-11-10T02:00:00.000Z",
      questionId: "D01",
      verdict: "passed",
      feedback: { ...feedback, stageSummary: "筛选模块已完成。" },
      providerCategory: null
    });

    const profile = await store.getProfile();
    const history = await readFile(paths.feedbackPath, "utf8");

    expect(first.syncWarning).toBeUndefined();
    expect(history.trim().split("\n")).toHaveLength(2);
    expect(profile.weakPoints.missing_filter).toEqual({
      count: 2,
      lastSeenAt: "2026-11-10T02:00:00.000Z"
    });
    expect(profile.reviewTopics.WHERE).toBe(2);
    expect(profile.questionSummaries.D01).toBe("筛选模块已完成。");
    expect(profile.latestSummary).toBe("筛选模块已完成。");
    await expect(readFile(`${paths.profilePath}.tmp`, "utf8")).rejects.toThrow();
    expect(await store.getLatestFeedback("D01")).toMatchObject({
      verdict: "passed",
      feedback: { diagnosis: "缺少状态筛选" }
    });
  });

  test("replaces only AI-owned Markdown sections", async () => {
    const store = await createCoachStore(paths);
    await store.recordFeedback({
      timestamp: "2026-11-10T01:00:00.000Z",
      questionId: "D01",
      verdict: "failed",
      feedback,
      providerCategory: null
    });

    const knowledge = await readFile(paths.knowledgeNotesPath, "utf8");
    const errors = await readFile(paths.errorLogPath, "utf8");

    expect(knowledge).toContain("Knowledge prose");
    expect(knowledge).toContain("Knowledge end");
    expect(knowledge).toContain("Existing workbench content");
    expect(knowledge).toContain("需要巩固多条件筛选");
    expect(knowledge).not.toContain("Old coach content");
    expect(errors).toContain("Error prose");
    expect(errors).toContain("missing_filter");
    expect(errors).not.toContain("Old coach errors");
  });

  test("keeps structured feedback when Markdown files are missing", async () => {
    const store = await createCoachStore({
      ...paths,
      knowledgeNotesPath: join(directory, "missing-knowledge.md"),
      errorLogPath: join(directory, "missing-errors.md")
    });

    const result = await store.recordFeedback({
      timestamp: "2026-11-10T01:00:00.000Z",
      questionId: "D01",
      verdict: "error",
      feedback,
      providerCategory: null
    });

    expect(result.syncWarning).toMatch(/Markdown synchronization failed/);
    expect((await store.getProfile()).weakPoints.missing_filter.count).toBe(1);
    expect(
      (await readFile(paths.feedbackPath, "utf8")).trim().split("\n")
    ).toHaveLength(1);
  });
});
