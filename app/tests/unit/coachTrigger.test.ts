import { describe, expect, test } from "vitest";
import { loadConfig } from "@server/config";
import { shouldGenerateStageSummary } from "@server/coachService";

const baseEnvironment = {
  MYSQL_HOST: "127.0.0.1",
  MYSQL_PORT: "3306",
  MYSQL_DATABASE: "sql_practice",
  MYSQL_RUNNER_USER: "runner",
  MYSQL_RUNNER_PASSWORD: "runner-password",
  MYSQL_RESET_USER: "reset",
  MYSQL_RESET_PASSWORD: "reset-password",
  API_PORT: "3001",
  MAX_EXECUTION_MS: "3000",
  MAX_RESULT_ROWS: "500"
};

describe("shouldGenerateStageSummary", () => {
  test("triggers for a passed submission", () => {
    expect(
      shouldGenerateStageSummary({
        verdict: "passed",
        failedAttempts: 0,
        errorAttempts: 0
      })
    ).toBe(true);
  });

  test.each([
    [2, 0, false],
    [3, 0, true],
    [4, 1, false],
    [3, 3, true]
  ])(
    "uses every third failed/error attempt",
    (failedAttempts, errorAttempts, expected) => {
      expect(
        shouldGenerateStageSummary({
          verdict: "failed",
          failedAttempts,
          errorAttempts
        })
      ).toBe(expected);
    }
  );
});

describe("Ark configuration", () => {
  test("keeps Ark optional", () => {
    expect(loadConfig(baseEnvironment).ark).toEqual({
      configured: false,
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      timeoutMs: 30_000
    });
  });

  test("requires a model when an API key is configured", () => {
    expect(() =>
      loadConfig({ ...baseEnvironment, ARK_API_KEY: "local-secret" })
    ).toThrow("ARK_MODEL is required when ARK_API_KEY is set");
  });

  test("loads a configured Ark client without exposing values in errors", () => {
    expect(
      loadConfig({
        ...baseEnvironment,
        ARK_API_KEY: "local-secret",
        ARK_MODEL: "endpoint-id",
        ARK_TIMEOUT_MS: "5000"
      }).ark
    ).toEqual({
      configured: true,
      apiKey: "local-secret",
      model: "endpoint-id",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      timeoutMs: 5000
    });
  });
});
