import type { FastifyInstance } from "fastify";
import type { ProgressStore } from "../progressStore";
import type { QuestionStore } from "../questionStore";

export function registerQuestionRoutes(
  app: FastifyInstance,
  questions: QuestionStore,
  progress: ProgressStore
) {
  app.get("/api/questions", async () => {
    const currentProgress = await progress.getProgress();
    return {
      questions: questions.listQuestions(currentProgress),
      progress: currentProgress
    };
  });

  app.get<{ Params: { id: string } }>("/api/questions/:id", async (request, reply) => {
    const question = questions.getQuestion(
      request.params.id,
      await progress.getProgress()
    );
    if (!question) {
      return reply.code(404).send({
        error: { code: "QUESTION_NOT_FOUND", message: "Question was not found" }
      });
    }
    return { question };
  });
}
