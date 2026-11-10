import type { FastifyInstance } from "fastify";
import type { MysqlRunner } from "../mysql";

export function registerHealthRoutes(
  app: FastifyInstance,
  runner: MysqlRunner
) {
  app.get("/api/health", async () => {
    const health = await runner.health();
    return { connected: true, ...health };
  });
}
