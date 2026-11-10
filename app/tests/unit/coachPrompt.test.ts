import { describe, expect, test } from "vitest";
import {
  buildCoachMessages,
  type CoachAnalysisRequest
} from "@server/coachPrompt";

const request: CoachAnalysisRequest = {
  question: {
    id: "D01",
    module: "基础筛选",
    title: "10 月活跃邀请用户",
    difficulty: "L1",
    prompt: "查询符合条件的用户。",
    schemaTables: ["users"],
    requiredColumns: ["user_id", "city"],
    orderSensitive: true
  },
  learnerSql: "SELECT user_id FROM users",
  outcome: {
    verdict: "failed",
    reason: "Output columns do not match",
    differences: {
      missingRows: [{ user_id: 1, city: "北京" }],
      unexpectedRows: [],
      positionalDiffs: []
    },
    executionError: null
  },
  attempt: {
    failedAttempts: 1,
    errorAttempts: 0,
    weakPoints: ["date_boundary"]
  },
  includeStageSummary: false
};

describe("buildCoachMessages", () => {
  test("includes only the public coaching context", () => {
    const unsafeInput = {
      ...request,
      question: {
        ...request.question,
        answerFile: "d01.sql",
        referenceSql: "SELECT secret_answer FROM users"
      },
      ARK_API_KEY: "secret-key"
    } as CoachAnalysisRequest;

    const serialized = JSON.stringify(buildCoachMessages(unsafeInput));

    expect(serialized).toContain("SELECT user_id FROM users");
    expect(serialized).toContain("Output columns do not match");
    expect(serialized).toContain("date_boundary");
    expect(serialized).not.toContain("answerFile");
    expect(serialized).not.toContain("secret_answer");
    expect(serialized).not.toContain("secret-key");
  });

  test("requires concise Chinese JSON and withholds full SQL before pass", () => {
    const [systemMessage] = buildCoachMessages(request);

    expect(systemMessage.content).toContain("只返回 JSON");
    expect(systemMessage.content).toContain("不得提供完整替代 SQL");
    expect(systemMessage.content).toContain("中文");
  });
});
