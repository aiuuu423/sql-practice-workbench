import { describe, expect, test, vi } from "vitest";
import {
  ArkClientError,
  createArkClient
} from "@server/arkClient";
import type { CoachAnalysisRequest } from "@server/coachPrompt";

const request: CoachAnalysisRequest = {
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
  },
  includeStageSummary: false
};

const validFeedback = {
  diagnosis: "筛选条件缺失",
  explanation: "当前查询没有限制状态。",
  nextHint: "先补充状态条件。",
  reviewTopics: ["WHERE"],
  mistakeTags: ["missing_filter"],
  stageSummary: null
};

describe("createArkClient", () => {
  test("calls the OpenAI-compatible endpoint and parses JSON feedback", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify(validFeedback) } }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const client = createArkClient({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://ark.test/api/v3/",
      timeoutMs: 100,
      fetchImpl
    });

    await expect(client.analyze(request)).resolves.toEqual(validFeedback);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://ark.test/api/v3/chat/completions");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(options?.body))).toMatchObject({
      model: "test-model",
      response_format: { type: "json_object" },
      temperature: 0.2
    });
  });

  test("maps authentication failures without exposing provider bodies", async () => {
    const client = createArkClient({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://ark.test/api/v3",
      timeoutMs: 100,
      fetchImpl: vi.fn<typeof fetch>(async () =>
        new Response("secret provider body", { status: 401 })
      )
    });

    await expect(client.analyze(request)).rejects.toMatchObject({
      category: "authentication",
      message: "Ark authentication failed"
    });
  });

  test("maps aborted requests to timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url: string | URL | Request, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );
    const client = createArkClient({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://ark.test/api/v3",
      timeoutMs: 5,
      fetchImpl
    });

    await expect(client.analyze(request)).rejects.toMatchObject({
      category: "timeout"
    });
  });

  test.each([
    {
      response: { choices: [{ message: { content: "not-json" } }] },
      label: "malformed JSON"
    },
    {
      response: {
        choices: [
          { message: { content: JSON.stringify({ diagnosis: "incomplete" }) } }
        ]
      },
      label: "invalid feedback schema"
    }
  ])("rejects $label as an invalid model response", async ({ response }) => {
    const client = createArkClient({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://ark.test/api/v3",
      timeoutMs: 100,
      fetchImpl: vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify(response), { status: 200 })
      )
    });

    await expect(client.analyze(request)).rejects.toBeInstanceOf(ArkClientError);
    await expect(client.analyze(request)).rejects.toMatchObject({
      category: "invalid_model_response"
    });
  });
});
