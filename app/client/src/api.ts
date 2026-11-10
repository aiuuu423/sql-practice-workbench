import type {
  CoachEnqueueResult,
  CoachJobResponse,
  CoachProfileResponse,
  HealthResponse,
  ProgressData,
  QueryResult,
  QuestionsResponse,
  ResetResponse,
  SubmitResponse
} from "./types";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly coachJob?: CoachEnqueueResult,
    readonly progress?: ProgressData
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

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
    throw new ApiClientError(
      body.error?.message ?? `Request failed (${response.status})`,
      body.coachJob,
      body.progress
    );
  }
  return body as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  questions: () => request<QuestionsResponse>("/api/questions"),
  coachProfile: () =>
    request<CoachProfileResponse>("/api/coach/profile"),
  coachJob: (id: string) =>
    request<CoachJobResponse>(
      `/api/coach/jobs/${encodeURIComponent(id)}`
    ),
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
