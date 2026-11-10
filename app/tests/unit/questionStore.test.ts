import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  createQuestionStore,
  validateQuestionManifest
} from "@server/questionStore";

const manifestPath = fileURLToPath(
  new URL("../../data/questions.json", import.meta.url)
);

describe("question manifest", () => {
  test("loads seven valid questions with unique IDs and answers", async () => {
    const raw = JSON.parse(await readFile(manifestPath, "utf8"));
    const questions = validateQuestionManifest(raw);

    expect(questions).toHaveLength(7);
    expect(new Set(questions.map(({ id }) => id)).size).toBe(questions.length);
    expect(new Set(questions.map(({ answerFile }) => answerFile)).size).toBe(
      questions.length
    );
  });

  test("rejects a prerequisite that does not exist", () => {
    const invalid = [
      {
        id: "T01",
        module: "test",
        title: "Invalid dependency",
        difficulty: "L1",
        prompt: "Test",
        schemaTables: ["users"],
        requiredColumns: ["user_id"],
        orderSensitive: false,
        numericTolerance: 0,
        prerequisites: ["MISSING"],
        starterSql: "SELECT user_id FROM users",
        answerFile: "t01.sql"
      }
    ];

    expect(() => validateQuestionManifest(invalid)).toThrow(
      /unknown prerequisite MISSING/i
    );
  });

  test("public questions never expose the answer file", async () => {
    const store = await createQuestionStore(manifestPath);
    const publicQuestion = store.getQuestion("D01");

    expect(publicQuestion).toBeDefined();
    expect(publicQuestion).not.toHaveProperty("answerFile");
  });
});
