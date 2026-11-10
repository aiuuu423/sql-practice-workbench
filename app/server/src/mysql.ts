import mysql, {
  type FieldPacket,
  type Pool,
  type RowDataPacket
} from "mysql2/promise";
import type { QueryResult, QueryRow } from "@shared/schemas";
import type { AppConfig } from "./config";

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return value;
}

function normalizeRows(rows: RowDataPacket[]): QueryRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, toJsonValue(value)])
    )
  );
}

export function createMysqlRunner(config: AppConfig) {
  let pool: Pool = createPool();

  function createPool() {
    return mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      database: config.mysql.database,
      user: config.mysql.runnerUser,
      password: config.mysql.runnerPassword,
      waitForConnections: true,
      connectionLimit: 4,
      queueLimit: 8,
      multipleStatements: false,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      decimalNumbers: false
    });
  }

  async function execute(sql: string): Promise<QueryResult> {
    const connection = await pool.getConnection();
    const startedAt = performance.now();

    try {
      await connection.query(
        `SET SESSION MAX_EXECUTION_TIME = ${config.maxExecutionMs}`
      );
      const [rawRows, fields] = await connection.query<
        RowDataPacket[] & RowDataPacket
      >(sql);
      const rows = normalizeRows(rawRows);
      const columns = (fields as FieldPacket[]).map(({ name }) => name);
      const truncated = rows.length > config.maxResultRows;

      return {
        columns,
        rows: rows.slice(0, config.maxResultRows),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        truncated
      };
    } finally {
      connection.release();
    }
  }

  async function health() {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT VERSION() AS version, DATABASE() AS database_name"
    );
    return {
      version: String(rows[0].version),
      database: String(rows[0].database_name)
    };
  }

  async function refresh() {
    const previous = pool;
    pool = createPool();
    await previous.end();
  }

  async function close() {
    await pool.end();
  }

  return { execute, health, refresh, close };
}

export type MysqlRunner = ReturnType<typeof createMysqlRunner>;
