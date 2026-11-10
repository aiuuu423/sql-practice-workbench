import { describe, expect, test } from "vitest";
import { judgeResults, type JudgeRules } from "@server/judge";
import type { QueryResult, QueryRow } from "@shared/schemas";

const rules: JudgeRules = {
  requiredColumns: ["id", "value"],
  orderSensitive: true,
  numericTolerance: 0.001
};

function result(columns: string[], rows: QueryRow[]): QueryResult {
  return { columns, rows, durationMs: 1, truncated: false };
}

describe("judgeResults", () => {
  test("accepts an exact ordered match", () => {
    const expected = result(["id", "value"], [{ id: 1, value: "10.00" }]);
    expect(judgeResults(expected, expected, rules).passed).toBe(true);
  });

  test("accepts reordered rows when order is not significant", () => {
    const expected = result(["id", "value"], [
      { id: 1, value: 10 },
      { id: 2, value: 20 }
    ]);
    const actual = result(["id", "value"], [...expected.rows].reverse());

    expect(
      judgeResults(actual, expected, { ...rules, orderSensitive: false }).passed
    ).toBe(true);
  });

  test("preserves duplicate row counts", () => {
    const row = { id: 1, value: 10 };
    const expected = result(["id", "value"], [row, row]);
    const actual = result(["id", "value"], [row]);
    const verdict = judgeResults(actual, expected, {
      ...rules,
      orderSensitive: false
    });

    expect(verdict.passed).toBe(false);
    expect(verdict.missingRows).toHaveLength(1);
  });

  test("rejects incorrect output column names", () => {
    const expected = result(["id", "value"], []);
    const actual = result(["id", "amount"], []);
    const verdict = judgeResults(actual, expected, rules);

    expect(verdict.passed).toBe(false);
    expect(verdict.columnDiff).toEqual({
      expected: ["id", "value"],
      actual: ["id", "amount"]
    });
  });

  test("keeps NULL distinct from empty strings", () => {
    const expected = result(["id", "value"], [{ id: 1, value: null }]);
    const actual = result(["id", "value"], [{ id: 1, value: "" }]);
    expect(judgeResults(actual, expected, rules).passed).toBe(false);
  });

  test("compares decimals within tolerance", () => {
    const expected = result(["id", "value"], [{ id: 1, value: "10.0000" }]);
    const actual = result(["id", "value"], [{ id: 1, value: 10.0005 }]);
    expect(judgeResults(actual, expected, rules).passed).toBe(true);
  });

  test("normalizes Date objects and MySQL datetime strings", () => {
    const expected = result(["id", "value"], [
      { id: 1, value: "2026-10-01 00:00:00" }
    ]);
    const actual = result(["id", "value"], [
      { id: 1, value: new Date("2026-10-01T00:00:00.000Z") }
    ]);
    expect(judgeResults(actual, expected, rules).passed).toBe(true);
  });

  test("bounds missing and unexpected row samples to ten", () => {
    const expected = result(
      ["id", "value"],
      Array.from({ length: 12 }, (_, id) => ({ id, value: "expected" }))
    );
    const actual = result(
      ["id", "value"],
      Array.from({ length: 12 }, (_, id) => ({ id: id + 20, value: "actual" }))
    );
    const verdict = judgeResults(actual, expected, {
      ...rules,
      orderSensitive: false
    });

    expect(verdict.missingRows).toHaveLength(10);
    expect(verdict.unexpectedRows).toHaveLength(10);
  });
});
