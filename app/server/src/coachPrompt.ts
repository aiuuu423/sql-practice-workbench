import type { PublicQuestion, QueryRow } from "@shared/schemas";

export interface CoachAnalysisRequest {
  question: {
    id: string;
    module: string;
    title: string;
    difficulty: PublicQuestion["difficulty"];
    prompt: string;
    schemaTables: string[];
    requiredColumns: string[];
    orderSensitive: boolean;
  };
  learnerSql: string;
  outcome: {
    verdict: "passed" | "failed" | "error";
    reason: string;
    differences: {
      missingRows: QueryRow[];
      unexpectedRows: QueryRow[];
      positionalDiffs: unknown[];
    } | null;
    executionError: {
      code: string;
      message: string;
    } | null;
  };
  attempt: {
    failedAttempts: number;
    errorAttempts: number;
    weakPoints: string[];
  };
  includeStageSummary: boolean;
}

export interface CoachMessage {
  role: "system" | "user";
  content: string;
}

export function buildCoachMessages(
  request: CoachAnalysisRequest
): CoachMessage[] {
  const safePayload: CoachAnalysisRequest = {
    question: {
      id: request.question.id,
      module: request.question.module,
      title: request.question.title,
      difficulty: request.question.difficulty,
      prompt: request.question.prompt,
      schemaTables: [...request.question.schemaTables],
      requiredColumns: [...request.question.requiredColumns],
      orderSensitive: request.question.orderSensitive
    },
    learnerSql: request.learnerSql,
    outcome: {
      verdict: request.outcome.verdict,
      reason: request.outcome.reason,
      differences: request.outcome.differences
        ? {
            missingRows: request.outcome.differences.missingRows.slice(0, 10),
            unexpectedRows:
              request.outcome.differences.unexpectedRows.slice(0, 10),
            positionalDiffs:
              request.outcome.differences.positionalDiffs.slice(0, 10)
          }
        : null,
      executionError: request.outcome.executionError
        ? {
            code: request.outcome.executionError.code,
            message: request.outcome.executionError.message
          }
        : null
    },
    attempt: {
      failedAttempts: request.attempt.failedAttempts,
      errorAttempts: request.attempt.errorAttempts,
      weakPoints: request.attempt.weakPoints.slice(0, 20)
    },
    includeStageSummary: request.includeStageSummary
  };

  return [
    {
      role: "system",
      content:
        "你是 SQL 面试教练。使用中文，只返回 JSON。先定位思维或语法错误，" +
        "再解释原因，并给一个可执行的下一步提示。题目未通过时不得提供完整替代 SQL。"
    },
    {
      role: "user",
      content: JSON.stringify(safePayload)
    }
  ];
}
