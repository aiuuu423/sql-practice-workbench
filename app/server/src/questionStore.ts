import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  QuestionManifestSchema,
  type ProgressData,
  type PublicQuestion,
  type Question
} from "@shared/schemas";

export function validateQuestionManifest(input: unknown): Question[] {
  const questions = QuestionManifestSchema.parse(input);
  const ids = new Set<string>();
  const answerFiles = new Set<string>();

  for (const question of questions) {
    if (ids.has(question.id)) {
      throw new Error(`Duplicate question ID ${question.id}`);
    }
    if (answerFiles.has(question.answerFile)) {
      throw new Error(`Duplicate answer file ${question.answerFile}`);
    }
    ids.add(question.id);
    answerFiles.add(question.answerFile);
  }

  for (const question of questions) {
    for (const prerequisite of question.prerequisites) {
      if (!ids.has(prerequisite)) {
        throw new Error(
          `Question ${question.id} has unknown prerequisite ${prerequisite}`
        );
      }
    }
  }

  return questions;
}

function toPublicQuestion(
  question: Question,
  progress?: ProgressData
): PublicQuestion {
  const { answerFile: _answerFile, ...publicFields } = question;
  const locked = question.prerequisites.some(
    (id) => progress?.questions[id]?.status !== "passed"
  );
  const status =
    progress?.questions[question.id]?.status === "passed"
      ? "passed"
      : "available";

  return { ...publicFields, locked, status };
}

export async function createQuestionStore(manifestPath: string) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const questions = validateQuestionManifest(manifest);
  const answersDirectory = resolve(dirname(manifestPath), "answers");

  await Promise.all(
    questions.map(({ answerFile }) =>
      access(resolve(answersDirectory, answerFile))
    )
  );

  const byId = new Map(questions.map((question) => [question.id, question]));

  return {
    getQuestion(id: string, progress?: ProgressData) {
      const question = byId.get(id);
      return question ? toPublicQuestion(question, progress) : undefined;
    },
    getInternalQuestion(id: string) {
      return byId.get(id);
    },
    listQuestions(progress?: ProgressData) {
      return questions.map((question) => toPublicQuestion(question, progress));
    },
    answersDirectory
  };
}

export type QuestionStore = Awaited<ReturnType<typeof createQuestionStore>>;
