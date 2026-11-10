import type {
  HealthResponse,
  QueryResult,
  QuestionsResponse,
  ResetResponse,
  SubmitResponse
} from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  questions: () => request<QuestionsResponse>("/api/questions"),
  execute: (sql: string) =>
    request<QueryResult>("/api/execute", {
      method: "POST",
      body: JSON.stringify({ sql })
    }),
  submit: (questionId: string, sql: string) =>
    request<SubmitResponse>("/api/submit", {
      method: "POST",
      body: JSON.stringify({ questionId, sql })
    }),
  reset: () =>
    request<ResetResponse>("/api/reset", {
      method: "POST",
      body: JSON.stringify({ confirmation: "RESET sql_practice" })
    })
};
