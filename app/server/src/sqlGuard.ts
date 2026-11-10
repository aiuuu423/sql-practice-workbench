import sqlParser from "node-sql-parser";

const { Parser } = sqlParser;
const parser = new Parser();
const MAX_SQL_LENGTH = 20_000;

const disallowedNodeTypes = new Set([
  "alter",
  "call",
  "create",
  "delete",
  "drop",
  "grant",
  "insert",
  "load",
  "replace",
  "revoke",
  "truncate",
  "update",
  "use"
]);

export class UnsafeSqlError extends Error {
  readonly code = "UNSAFE_SQL";

  constructor(message: string) {
    super(message);
    this.name = "UnsafeSqlError";
  }
}

function inspectNode(value: unknown, key?: string): void {
  if (Array.isArray(value)) {
    for (const item of value) inspectNode(item, key);
    return;
  }

  if (!value || typeof value !== "object") return;

  const node = value as Record<string, unknown>;
  const type = typeof node.type === "string" ? node.type.toLowerCase() : null;

  if (type && disallowedNodeTypes.has(type)) {
    throw new UnsafeSqlError(`Statement type ${type.toUpperCase()} is not allowed`);
  }

  if (
    key === "into" &&
    (node.keyword != null || node.position != null || node.expr != null)
  ) {
    throw new UnsafeSqlError("SELECT INTO and file output are not allowed");
  }

  if (
    type === "function" &&
    JSON.stringify(node.name).toLowerCase().includes("load_file")
  ) {
    throw new UnsafeSqlError("File access functions are not allowed");
  }

  for (const [childKey, child] of Object.entries(node)) {
    inspectNode(child, childKey);
  }
}

export function assertSafeReadOnlySql(sql: string): {
  normalizedSql: string;
  kind: "query" | "explain";
} {
  const trimmed = sql.trim();

  if (!trimmed) {
    throw new UnsafeSqlError("SQL input is empty");
  }
  if (trimmed.length > MAX_SQL_LENGTH) {
    throw new UnsafeSqlError("SQL input exceeds the 20,000 character limit");
  }

  const normalizedSql = trimmed.replace(/;\s*$/, "").trimEnd();
  let parsed: unknown;

  try {
    parsed = parser.astify(normalizedSql, { database: "MySQL" });
  } catch {
    throw new UnsafeSqlError("SQL could not be parsed safely");
  }

  if (Array.isArray(parsed)) {
    throw new UnsafeSqlError("Only one SQL statement is allowed");
  }

  const root = parsed as Record<string, unknown>;
  const rootType =
    typeof root.type === "string" ? root.type.toLowerCase() : "unknown";

  if (rootType === "select") {
    inspectNode(root);
    return { normalizedSql, kind: "query" };
  }

  if (rootType === "explain") {
    const target = root.expr as Record<string, unknown> | undefined;
    if (!target || target.type !== "select") {
      throw new UnsafeSqlError("EXPLAIN is allowed only for SELECT queries");
    }
    inspectNode(target);
    return { normalizedSql, kind: "explain" };
  }

  throw new UnsafeSqlError(
    `Statement type ${rootType.toUpperCase()} is not allowed`
  );
}
