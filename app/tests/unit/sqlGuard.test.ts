import { describe, expect, test } from "vitest";
import { assertSafeReadOnlySql } from "@server/sqlGuard";

describe("assertSafeReadOnlySql", () => {
  test.each([
    "INSERT INTO users VALUES (9, '北京', NOW(), 'active', NULL)",
    "uPdAtE users SET status = 'inactive'",
    "DELETE /* remove */ FROM users",
    "DROP TABLE users",
    "ALTER TABLE users ADD COLUMN note TEXT",
    "CREATE TABLE unsafe (id INT)",
    "TRUNCATE TABLE users",
    "GRANT ALL ON *.* TO 'someone'@'localhost'",
    "CALL rebuild_data()",
    "LOAD DATA LOCAL INFILE '/tmp/users.csv' INTO TABLE users",
    "SELECT * FROM users INTO OUTFILE '/tmp/users.csv'",
    "SELECT 1; SELECT 2"
  ])("rejects unsafe SQL: %s", (sql) => {
    expect(() => assertSafeReadOnlySql(sql)).toThrow();
  });

  test.each([
    ["SELECT * FROM users", "query"],
    [
      "WITH paid AS (SELECT * FROM orders WHERE status = 'paid') SELECT * FROM paid",
      "query"
    ],
    ["EXPLAIN SELECT * FROM orders WHERE user_id = 1", "explain"],
    ["-- inspect users\nSELECT user_id FROM users;", "query"]
  ] as const)("accepts one read-only statement", (sql, kind) => {
    expect(assertSafeReadOnlySql(sql)).toMatchObject({ kind });
  });

  test("rejects empty and oversized input", () => {
    expect(() => assertSafeReadOnlySql("   ")).toThrow(/empty/i);
    expect(() => assertSafeReadOnlySql(`SELECT '${"x".repeat(20_001)}'`)).toThrow(
      /20,000/
    );
  });

  test("rejects malformed SQL", () => {
    expect(() => assertSafeReadOnlySql("SELECT FROM")).toThrow(/parse/i);
  });
});
