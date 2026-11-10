import type { FastifyInstance } from "fastify";
import type { CoachService } from "../coachService";

export function registerCoachRoutes(
  app: FastifyInstance,
  coach: CoachService,
  questionIds: string[]
) {
  app.get<{ Params: { id: string } }>(
    "/api/coach/jobs/:id",
    async (request, reply) => {
      const job = coach.getJob(request.params.id);
      if (!job) {
        return reply.code(404).send({
          error: {
            code: "COACH_JOB_NOT_FOUND",
            message: "Coach job was not found or has expired"
          }
        });
      }
      return { job };
    }
  );

  app.get("/api/coach/profile", async () => {
    const feedbackEntries = await Promise.all(
      questionIds.map(async (questionId) => [
        questionId,
        await coach.getLatestFeedback(questionId)
      ] as const)
    );
    return {
      configured: coach.configured,
      profile: await coach.getProfile(),
      latestFeedback: Object.fromEntries(
        feedbackEntries.filter(([, feedback]) => feedback !== null)
      )
    };
  });
}
