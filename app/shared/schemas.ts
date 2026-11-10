import { z } from "zod";

export const DifficultySchema = z.enum(["L1", "L2", "L3", "L4"]);

export const QuestionSchema = z.object({
  id: z.string().min(1),
  module: z.string().min(1),
  title: z.string().min(1),
  difficulty: DifficultySchema,
  prompt: z.string().min(1),
  schemaTables: z.array(z.string().min(1)).min(1),
  requiredColumns: z.array(z.string().min(1)).min(1),
  orderSensitive: z.boolean(),
  numericTolerance: z.number().nonnegative(),
  prerequisites: z.array(z.string().min(1)),
  starterSql: z.string(),
  answerFile: z.string().regex(/^[a-z0-9_-]+\.sql$/i)
});

export const QuestionManifestSchema = z.array(QuestionSchema).min(1);

export const PublicQuestionSchema = QuestionSchema.omit({
  answerFile: true
}).extend({
  locked: z.boolean().default(false),
  status: z.enum(["available", "passed"]).default("available")
});

export const ExecuteRequestSchema = z.object({
  sql: z.string()
});

export const QueryRowSchema = z.record(z.string(), z.unknown());

export const QueryResultSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(QueryRowSchema),
  durationMs: z.number().nonnegative(),
  truncated: z.boolean()
});

export const SubmitRequestSchema = ExecuteRequestSchema.extend({
  questionId: z.string().min(1)
});

export const JudgeVerdictSchema = z.object({
  passed: z.boolean(),
  reason: z.string(),
  columnDiff: z
    .object({
      expected: z.array(z.string()),
      actual: z.array(z.string())
    })
    .nullable(),
  missingRows: z.array(QueryRowSchema),
  unexpectedRows: z.array(QueryRowSchema),
  positionalDiffs: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      expected: QueryRowSchema.nullable(),
      actual: QueryRowSchema.nullable()
    })
  )
});

export const QuestionProgressSchema = z.object({
  status: z.enum(["available", "passed"]).default("available"),
  attempts: z.number().int().nonnegative().default(0),
  failedAttempts: z.number().int().nonnegative().default(0),
  errorAttempts: z.number().int().nonnegative().default(0),
  passedAt: z.string().nullable().default(null),
  latestVerdict: z.enum(["passed", "failed", "error"]).nullable().default(null),
  recurringErrors: z.record(z.string(), z.number().int().nonnegative()).default({})
});

export const ProgressDataSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  questions: z.record(z.string(), QuestionProgressSchema)
});

export const SubmissionRecordSchema = z.object({
  timestamp: z.string(),
  questionId: z.string(),
  sql: z.string(),
  verdict: z.enum(["passed", "failed", "error"]),
  durationMs: z.number().nonnegative(),
  errorCategory: z.string().nullable()
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

export const CoachFeedbackSchema = z.object({
  diagnosis: z.string().min(1).max(800),
  explanation: z.string().min(1).max(1600),
  nextHint: z.string().min(1).max(800),
  reviewTopics: z.array(z.string().min(1).max(80)).max(8),
  mistakeTags: z.array(z.string().min(1).max(80)).max(8),
  stageSummary: z.string().min(1).max(1600).nullable()
});

export const CoachJobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed"
]);

export const CoachJobSchema = z.object({
  id: z.string().uuid(),
  questionId: z.string(),
  status: CoachJobStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  feedback: CoachFeedbackSchema.nullable(),
  error: z.string().nullable(),
  syncWarning: z.string().optional()
});

export const CoachProfileSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  weakPoints: z.record(
    z.string(),
    z.object({
      count: z.number().int().nonnegative(),
      lastSeenAt: z.string()
    })
  ),
  reviewTopics: z.record(z.string(), z.number().int().nonnegative()),
  questionSummaries: z.record(z.string(), z.string()),
  latestSummary: z.string().nullable()
});

export type Question = z.infer<typeof QuestionSchema>;
export type PublicQuestion = z.infer<typeof PublicQuestionSchema>;
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;
export type QueryRow = z.infer<typeof QueryRowSchema>;
export type QueryResult = z.infer<typeof QueryResultSchema>;
export type SubmitRequest = z.infer<typeof SubmitRequestSchema>;
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;
export type QuestionProgress = z.infer<typeof QuestionProgressSchema>;
export type ProgressData = z.infer<typeof ProgressDataSchema>;
export type SubmissionRecord = z.infer<typeof SubmissionRecordSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type CoachFeedback = z.infer<typeof CoachFeedbackSchema>;
export type CoachJobStatus = z.infer<typeof CoachJobStatusSchema>;
export type CoachJob = z.infer<typeof CoachJobSchema>;
export type CoachProfile = z.infer<typeof CoachProfileSchema>;
