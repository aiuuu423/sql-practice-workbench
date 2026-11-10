import type {
  CoachFeedback,
  CoachJob,
  CoachProfile,
  JudgeVerdict,
  ProgressData,
  PublicQuestion,
  QueryResult
} from "@shared/schemas";

export type {
  CoachFeedback,
  CoachJob,
  CoachProfile,
  JudgeVerdict,
  ProgressData,
  PublicQuestion,
  QueryResult
};

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
  coachJob: CoachEnqueueResult;
}

export type CoachEnqueueResult =
  | { id: string; status: "queued" }
  | { id: ""; status: "unavailable" };

export type CoachJobView =
  | CoachJob
  | {
      id: "";
      questionId: string;
      status: "unavailable";
      feedback: null;
      error: null;
    }
  | {
      id: string;
      questionId: string;
      status: "queued" | "running";
      feedback: null;
      error: null;
    };

export interface CoachFeedbackRecord {
  timestamp: string;
  questionId: string;
  verdict: "passed" | "failed" | "error";
  feedback: CoachFeedback;
  providerCategory: string | null;
}

export interface CoachProfileResponse {
  configured: boolean;
  profile: CoachProfile;
  latestFeedback: Record<string, CoachFeedbackRecord>;
}

export interface CoachJobResponse {
  job: CoachJob;
}

export interface ResetResponse {
  reset: true;
  counts: { users: number; orders: number };
}
