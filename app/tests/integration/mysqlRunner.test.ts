import { loadEnvFile } from "node:process";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

loadEnvFile();

describe("sql practice runner account", () => {
  let connection: mysql.Connection;

  beforeAll(async () => {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT),
      database: process.env.MYSQL_DATABASE,
      user: process.env.MYSQL_RUNNER_USER,
      password: process.env.MYSQL_RUNNER_PASSWORD,
      multipleStatements: false
    });
  });

  afterAll(async () => {
    await connection?.end();
  });

  async function scalar(sql: string): Promise<number> {
    const [rows] = await connection.query<RowDataPacket[]>(sql);
    return Number(Object.values(rows[0])[0]);
  }

  test("reads deterministic fixture counts", async () => {
    expect(await scalar("SELECT COUNT(*) FROM users")).toBe(8);
    expect(await scalar("SELECT COUNT(*) FROM orders")).toBeGreaterThan(8);
  });

  test("cannot mutate practice data", async () => {
    await expect(connection.query("DELETE FROM users")).rejects.toThrow();
  });
});
