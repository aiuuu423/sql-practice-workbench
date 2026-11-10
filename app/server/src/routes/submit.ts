import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { SubmitRequestSchema } from "@shared/schemas";
import { judgeResults } from "../judge";
import type { MysqlRunner } from "../mysql";
import type { ProgressStore } from "../progressStore";
import type { QuestionStore } from "../questionStore";
import { assertSafeReadOnlySql } from "../sqlGuard";

export function registerSubmitRoutes(
  app: FastifyInstance,
  runner: MysqlRunner,
  questions: QuestionStore,
  progress: ProgressStore
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

    const timestamp = new Date().toISOString();
    const startedAt = performance.now();

    try {
      const learnerSql = assertSafeReadOnlySql(payload.data.sql).normalizedSql;
      const answerPath = resolve(
        questions.answersDirectory,
        question.answerFile
      );
      const answerSql = assertSafeReadOnlySql(
        await readFile(answerPath, "utf8")
      ).normalizedSql;
      const [actual, expected] = await Promise.all([
        runner.execute(learnerSql),
        runner.execute(answerSql)
      ]);
      const verdict = judgeResults(actual, expected, {
        requiredColumns: question.requiredColumns,
        orderSensitive: question.orderSensitive,
        numericTolerance: question.numericTolerance
      });
      const persistence = await progress.recordSubmission({
        timestamp,
        questionId: question.id,
        sql: payload.data.sql,
        verdict: verdict.passed ? "passed" : "failed",
        durationMs: actual.durationMs,
        errorCategory: verdict.passed ? null : "result_mismatch"
      });

      return {
        result: actual,
        verdict,
        progress: persistence.progress,
        syncWarning: persistence.syncWarning
      };
    } catch (error) {
      const code =
        typeof error === "object" &&
        error &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code.toLowerCase()
          : "query_error";
      await progress.recordSubmission({
        timestamp,
        questionId: question.id,
        sql: payload.data.sql,
        verdict: "error",
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        errorCategory: code
      });
      throw error;
    }
  });
}
