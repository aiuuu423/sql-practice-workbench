import type {
  JudgeVerdict,
  ProgressData,
  PublicQuestion,
  QueryResult
} from "@shared/schemas";

export type { JudgeVerdict, ProgressData, PublicQuestion, QueryResult };

export interface HealthResponse {
  connected: boolean;
  version: string;
  database: string;
}

export interface QuestionsResponse {
  questions: PublicQuestion[];
  progress: ProgressData;
}

export interface SubmitResponse {
  result: QueryResult;
  verdict: JudgeVerdict;
  progress: ProgressData;
  syncWarning?: string;
}

export interface ResetResponse {
  reset: true;
  counts: { users: number; orders: number };
}
