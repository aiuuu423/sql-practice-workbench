import type { FastifyInstance } from "fastify";
import { ExecuteRequestSchema } from "@shared/schemas";
import type { MysqlRunner } from "../mysql";
import { assertSafeReadOnlySql } from "../sqlGuard";

export function registerExecuteRoutes(
  app: FastifyInstance,
  runner: MysqlRunner
) {
  app.post("/api/execute", async (request, reply) => {
    const payload = ExecuteRequestSchema.safeParse(request.body);
    if (!payload.success) {
      return reply.code(400).send({
        error: { code: "INVALID_REQUEST", message: "A SQL string is required" }
      });
    }

    const { normalizedSql } = assertSafeReadOnlySql(payload.data.sql);
    return runner.execute(normalizedSql);
  });
}
