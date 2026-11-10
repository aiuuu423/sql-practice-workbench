import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import mysql from "mysql2/promise";
import { z } from "zod";
import type { AppConfig } from "../config";
import type { MysqlRunner } from "../mysql";

const ResetRequestSchema = z.object({
  confirmation: z.literal("RESET sql_practice")
});

const initPath = fileURLToPath(
  new URL("../../../../sql/init_database.sql", import.meta.url)
);
const seedPath = fileURLToPath(
  new URL("../../../../sql/seed_database.sql", import.meta.url)
);

export function registerResetRoutes(
  app: FastifyInstance,
  config: AppConfig,
  runner: MysqlRunner
) {
  app.post("/api/reset", async (request, reply) => {
    const payload = ResetRequestSchema.safeParse(request.body);
    if (!payload.success) {
      return reply.code(400).send({
        error: {
          code: "RESET_CONFIRMATION_REQUIRED",
          message: "Confirmation must be exactly RESET sql_practice"
        }
      });
    }

    const [initSql, seedSql] = await Promise.all([
      readFile(initPath, "utf8"),
      readFile(seedPath, "utf8")
    ]);
    const connection = await mysql.createConnection({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.resetUser,
      password: config.mysql.resetPassword,
      multipleStatements: true
    });

    try {
      await connection.query(initSql);
      await connection.query(seedSql);
    } finally {
      await connection.end();
    }

    await runner.refresh();
    const countsResult = await runner.execute(
      "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM orders) AS orders"
    );
    const counts = countsResult.rows[0];

    return {
      reset: true,
      counts: {
        users: Number(counts.users),
        orders: Number(counts.orders)
      }
    };
  });
}
