import type {
  JudgeVerdict,
  QueryResult,
  QueryRow
} from "@shared/schemas";

const MAX_DIFFERENCES = 10;
const mysqlDatePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const numericPattern = /^-?(?:\d+\.?\d*|\.\d+)$/;

export interface JudgeRules {
  requiredColumns: string[];
  orderSensitive: boolean;
  numericTolerance: number;
}

function normalizeDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && mysqlDatePattern.test(value)) {
    return new Date(`${value.replace(" ", "T")}Z`).toISOString();
  }
  return null;
}

function valuesEqual(
  actual: unknown,
  expected: unknown,
  tolerance: number
): boolean {
  if (actual === null || expected === null) return actual === expected;

  const actualDate = normalizeDate(actual);
  const expectedDate = normalizeDate(expected);
  if (actualDate || expectedDate) return actualDate === expectedDate;

  const actualNumeric =
    typeof actual === "number" ||
    (typeof actual === "string" && numericPattern.test(actual));
  const expectedNumeric =
    typeof expected === "number" ||
    (typeof expected === "string" && numericPattern.test(expected));

  if (actualNumeric && expectedNumeric) {
    return Math.abs(Number(actual) - Number(expected)) <= tolerance;
  }

  return actual === expected;
}

function rowsEqual(
  actual: QueryRow,
  expected: QueryRow,
  columns: string[],
  tolerance: number
): boolean {
  return columns.every((column) =>
    valuesEqual(actual[column], expected[column], tolerance)
  );
}

function emptyVerdict(reason: string): JudgeVerdict {
  return {
    passed: false,
    reason,
    columnDiff: null,
    missingRows: [],
    unexpectedRows: [],
    positionalDiffs: []
  };
}

export function judgeResults(
  actual: QueryResult,
  expected: QueryResult,
  rules: JudgeRules
): JudgeVerdict {
  const expectedColumns = expected.columns;
  const columnsMatch =
    actual.columns.length === expectedColumns.length &&
    actual.columns.every((column, index) => column === expectedColumns[index]) &&
    rules.requiredColumns.every(
      (column, index) => actual.columns[index] === column
    );

  if (!columnsMatch) {
    return {
      ...emptyVerdict("Output columns do not match the required aliases"),
      columnDiff: { expected: rules.requiredColumns, actual: actual.columns }
    };
  }

  if (rules.orderSensitive) {
    const positionalDiffs: JudgeVerdict["positionalDiffs"] = [];
    const rowCount = Math.max(actual.rows.length, expected.rows.length);

    for (let index = 0; index < rowCount; index += 1) {
      const actualRow = actual.rows[index] ?? null;
      const expectedRow = expected.rows[index] ?? null;
      if (
        !actualRow ||
        !expectedRow ||
        !rowsEqual(
          actualRow,
          expectedRow,
          expectedColumns,
          rules.numericTolerance
        )
      ) {
        positionalDiffs.push({ index, actual: actualRow, expected: expectedRow });
        if (positionalDiffs.length === MAX_DIFFERENCES) break;
      }
    }

    if (positionalDiffs.length > 0) {
      return {
        ...emptyVerdict("Rows or row order do not match"),
        positionalDiffs
      };
    }
  } else {
    const unmatchedActual = [...actual.rows];
    const missingRows: QueryRow[] = [];

    for (const expectedRow of expected.rows) {
      const matchIndex = unmatchedActual.findIndex((actualRow) =>
        rowsEqual(
          actualRow,
          expectedRow,
          expectedColumns,
          rules.numericTolerance
        )
      );
      if (matchIndex >= 0) {
        unmatchedActual.splice(matchIndex, 1);
      } else if (missingRows.length < MAX_DIFFERENCES) {
        missingRows.push(expectedRow);
      }
    }

    if (missingRows.length > 0 || unmatchedActual.length > 0) {
      return {
        ...emptyVerdict("Result rows do not match"),
        missingRows,
        unexpectedRows: unmatchedActual.slice(0, MAX_DIFFERENCES)
      };
    }
  }

  return {
    passed: true,
    reason: "Result matches the expected output",
    columnDiff: null,
    missingRows: [],
    unexpectedRows: [],
    positionalDiffs: []
  };
}
