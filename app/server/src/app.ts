import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { loadConfig, type AppConfig } from "./config";
import { createMysqlRunner, type MysqlRunner } from "./mysql";
import { createArkClient } from "./arkClient";
import { createCoachService, type CoachService } from "./coachService";
import { createCoachStore } from "./coachStore";
import {
  createQuestionStore,
  type QuestionStore
} from "./questionStore";
import {
  createProgressStore,
  type ProgressStore
} from "./progressStore";
import { UnsafeSqlError } from "./sqlGuard";
import { registerExecuteRoutes } from "./routes/execute";
import { registerCoachRoutes } from "./routes/coach";
import { registerHealthRoutes } from "./routes/health";
import { registerQuestionRoutes } from "./routes/questions";
import { registerResetRoutes } from "./routes/reset";
import { registerSubmitRoutes } from "./routes/submit";

interface AppDependencies {
  config?: AppConfig;
  runner?: MysqlRunner;
  questions?: QuestionStore;
  progress?: ProgressStore;
  coach?: CoachService;
  serveStatic?: boolean;
}

interface MysqlLikeError extends Error {
  code?: string;
  errno?: number;
}

export async function createApp(dependencies: AppDependencies = {}) {
  const config = dependencies.config ?? loadConfig();
  const runner = dependencies.runner ?? createMysqlRunner(config);
  const manifestPath = fileURLToPath(
    new URL("../../data/questions.json", import.meta.url)
  );
  const questions =
    dependencies.questions ?? (await createQuestionStore(manifestPath));
  const dataDirectory = fileURLToPath(new URL("../../data/", import.meta.url));
  const learningRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const progress =
    dependencies.progress ??
    (await createProgressStore(
      {
        progressPath: `${dataDirectory}progress.json`,
        submissionsPath: `${dataDirectory}submissions.jsonl`,
        learningPlanPath: `${learningRoot}00_学习计划.md`,
        exerciseBankPath: `${learningRoot}02_练习题库.md`,
        errorLogPath: `${learningRoot}03_错题记录.md`
      },
      questions.listQuestions().map(({ id }) => id)
    ));
  const coachStore = dependencies.coach
    ? null
    : await createCoachStore({
        feedbackPath: `${dataDirectory}coach_feedback.jsonl`,
        profilePath: `${dataDirectory}coach_profile.json`,
        knowledgeNotesPath: `${learningRoot}01_知识点笔记.md`,
        errorLogPath: `${learningRoot}03_错题记录.md`
      });
  const coach =
    dependencies.coach ??
    createCoachService({
      configured: config.ark.configured,
      client: config.ark.configured
        ? createArkClient({
            apiKey: config.ark.apiKey!,
            model: config.ark.model!,
            baseUrl: config.ark.baseUrl,
            timeoutMs: config.ark.timeoutMs
          })
        : undefined,
      store: coachStore!
    });
  const app = Fastify({ logger: false });

  registerHealthRoutes(app, runner);
  registerCoachRoutes(
    app,
    coach,
    questions.listQuestions().map(({ id }) => id)
  );
  registerQuestionRoutes(app, questions, progress);
  registerExecuteRoutes(app, runner);
  registerSubmitRoutes(app, runner, questions, progress, coach);
  registerResetRoutes(app, config, runner);

  if (dependencies.serveStatic) {
    const clientRoot = fileURLToPath(new URL("../../dist/client/", import.meta.url));
    await access(`${clientRoot}index.html`);
    await app.register(fastifyStatic, {
      root: clientRoot,
      wildcard: false
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    const coachContext =
      error && typeof error === "object"
        ? {
            ...("coachJob" in error ? { coachJob: error.coachJob } : {}),
            ...("progress" in error ? { progress: error.progress } : {})
          }
        : {};
    if (error instanceof UnsafeSqlError) {
      return reply.code(400).send({
        error: { code: error.code, message: error.message },
        ...coachContext
      });
    }

    const mysqlError = error as MysqlLikeError;
    if (mysqlError.code?.startsWith("ER_")) {
      const timeout = mysqlError.code === "ER_QUERY_TIMEOUT";
      return reply.code(timeout ? 408 : 422).send({
        error: {
          code: mysqlError.code,
          message: mysqlError.message
        },
        ...coachContext
      });
    }

    if (
      ["ECONNREFUSED", "PROTOCOL_CONNECTION_LOST"].includes(
        mysqlError.code ?? ""
      )
    ) {
      return reply.code(503).send({
        error: {
          code: "MYSQL_UNAVAILABLE",
          message: "MySQL is unavailable on the configured local connection"
        }
      });
    }

    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" }
    });
  });

  app.addHook("onClose", async () => {
    if (!dependencies.runner) await runner.close();
  });

  return app;
}
