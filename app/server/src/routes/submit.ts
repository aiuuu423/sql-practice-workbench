import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { SubmitRequestSchema } from "@shared/schemas";
import type { CoachAnalysisRequest } from "../coachPrompt";
import type {
  CoachQueueInput,
  CoachService
} from "../coachService";
import { judgeResults } from "../judge";
import type { MysqlRunner } from "../mysql";
import type { ProgressStore } from "../progressStore";
import type { QuestionStore } from "../questionStore";
import { assertSafeReadOnlySql } from "../sqlGuard";

export function registerSubmitRoutes(
  app: FastifyInstance,
  runner: MysqlRunner,
  questions: QuestionStore,
  progress: ProgressStore,
  coach: CoachService
) {
  app.post("/api/submit", async (request, reply) => {
    const payload = SubmitRequestSchema.safeParse(request.body);
    if (!payload.success) {
      return reply.code(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "questionId and SQL are required"
        }
      });
    }

    const question = questions.getInternalQuestion(payload.data.questionId);
    if (!question) {
      return reply.code(404).send({
        error: { code: "QUESTION_NOT_FOUND", message: "Question was not found" }
      });
    }
    const submission = payload.data;
    const selectedQuestion = question;

    const timestamp = new Date().toISOString();
    const startedAt = performance.now();

    async function queueCoach(input: {
      verdict: "passed" | "failed" | "error";
      reason: string;
      differences: CoachAnalysisRequest["outcome"]["differences"];
      executionError: CoachAnalysisRequest["outcome"]["executionError"];
      progressData: Awaited<ReturnType<ProgressStore["getProgress"]>>;
    }) {
      const questionProgress =
        input.progressData.questions[selectedQuestion.id];
      const profile = await coach.getProfile();
      const queueInput: CoachQueueInput = {
        questionId: selectedQuestion.id,
        verdict: input.verdict,
        failedAttempts: questionProgress.failedAttempts,
        errorAttempts: questionProgress.errorAttempts,
        analysis: {
          question: {
            id: selectedQuestion.id,
            module: selectedQuestion.module,
            title: selectedQuestion.title,
            difficulty: selectedQuestion.difficulty,
            prompt: selectedQuestion.prompt,
            schemaTables: [...selectedQuestion.schemaTables],
            requiredColumns: [...selectedQuestion.requiredColumns],
            orderSensitive: selectedQuestion.orderSensitive
          },
          learnerSql: submission.sql,
          outcome: {
            verdict: input.verdict,
            reason: input.reason,
            differences: input.differences,
            executionError: input.executionError
          },
          attempt: {
            failedAttempts: questionProgress.failedAttempts,
            errorAttempts: questionProgress.errorAttempts,
            weakPoints: Object.keys(profile.weakPoints)
          }
        }
      };
      return coach.enqueue(queueInput);
    }

    try {
      const learnerSql = assertSafeReadOnlySql(submission.sql).normalizedSql;
      const answerPath = resolve(
        questions.answersDirectory,
        selectedQuestion.answerFile
      );
      const answerSql = assertSafeReadOnlySql(
        await readFile(answerPath, "utf8")
      ).normalizedSql;
      const [actual, expected] = await Promise.all([
        runner.execute(learnerSql),
        runner.execute(answerSql)
      ]);
      const verdict = judgeResults(actual, expected, {
        requiredColumns: selectedQuestion.requiredColumns,
        orderSensitive: selectedQuestion.orderSensitive,
        numericTolerance: selectedQuestion.numericTolerance
      });
      const persistence = await progress.recordSubmission({
        timestamp,
        questionId: selectedQuestion.id,
        sql: submission.sql,
        verdict: verdict.passed ? "passed" : "failed",
        durationMs: actual.durationMs,
        errorCategory: verdict.passed ? null : "result_mismatch"
      });
      const coachJob = await queueCoach({
        verdict: verdict.passed ? "passed" : "failed",
        reason: verdict.reason,
        differences: {
          missingRows: verdict.missingRows,
          unexpectedRows: verdict.unexpectedRows,
          positionalDiffs: verdict.positionalDiffs
        },
        executionError: null,
        progressData: persistence.progress
      });

      return {
        result: actual,
        verdict,
        progress: persistence.progress,
        syncWarning: persistence.syncWarning,
        coachJob
      };
    } catch (error) {
      const code =
        typeof error === "object" &&
        error &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code.toLowerCase()
          : "query_error";
      const persistence = await progress.recordSubmission({
        timestamp,
        questionId: selectedQuestion.id,
        sql: submission.sql,
        verdict: "error",
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        errorCategory: code
      });
      const message =
        error instanceof Error ? error.message : "Query execution failed";
      const coachJob = await queueCoach({
        verdict: "error",
        reason: message,
        differences: null,
        executionError: { code: code.toUpperCase(), message },
        progressData: persistence.progress
      });
      if (error && typeof error === "object") {
        Object.assign(error, {
          coachJob,
          progress: persistence.progress
        });
      }
      throw error;
    }
  });
}
