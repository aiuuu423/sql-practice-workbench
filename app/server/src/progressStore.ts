import {
  appendFile,
  open,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import {
  ProgressDataSchema,
  SubmissionRecordSchema,
  type ProgressData,
  type SubmissionRecord
} from "@shared/schemas";

const START_MARKER = "<!-- sql-workbench:start -->";
const END_MARKER = "<!-- sql-workbench:end -->";

export interface ProgressStorePaths {
  progressPath: string;
  submissionsPath: string;
  learningPlanPath: string;
  exerciseBankPath: string;
  errorLogPath: string;
}

function createInitialProgress(questionIds: string[]): ProgressData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    questions: Object.fromEntries(
      questionIds.map((id) => [
        id,
        {
          status: "available" as const,
          attempts: 0,
          failedAttempts: 0,
          errorAttempts: 0,
          passedAt: null,
          latestVerdict: null,
          recurringErrors: {}
        }
      ])
    )
  };
}

async function writeAtomic(path: string, value: string) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, value, { mode: 0o600 });
  const handle = await open(temporaryPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, path);
}

async function replaceMarkedSection(path: string, generated: string) {
  const source = await readFile(path, "utf8");
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  const block = `${START_MARKER}\n${generated.trim()}\n${END_MARKER}`;

  if (start === -1 || end === -1 || end < start) {
    await writeFile(path, `${source.trimEnd()}\n\n${block}\n`);
    return;
  }

  const updated =
    source.slice(0, start) +
    block +
    source.slice(end + END_MARKER.length);
  await writeFile(path, updated);
}

function learningPlanSummary(progress: ProgressData): string {
  const entries = Object.entries(progress.questions);
  const completed = entries.filter(
    ([, question]) => question.status === "passed"
  ).length;
  const current =
    entries.find(([, question]) => question.status !== "passed")?.[0] ?? "全部完成";

  return [
    "## SQL Workbench 自动进度",
    "",
    `- 已完成：${completed} / ${entries.length}`,
    `- 当前题目：${current}`,
    `- 最近同步：${progress.updatedAt}`
  ].join("\n");
}

function exerciseSummary(progress: ProgressData): string {
  const rows = Object.entries(progress.questions).map(([id, question]) => {
    const status = question.status === "passed" ? "已通过" : "待通过";
    return `| ${id} | ${status} | ${question.attempts} |`;
  });

  return [
    "## SQL Workbench 题目状态",
    "",
    "| 题目 | 状态 | 提交次数 |",
    "|---|---|---:|",
    ...rows
  ].join("\n");
}

function errorSummary(progress: ProgressData): string {
  const errors = new Map<string, number>();
  for (const question of Object.values(progress.questions)) {
    for (const [category, count] of Object.entries(question.recurringErrors)) {
      errors.set(category, (errors.get(category) ?? 0) + count);
    }
  }

  const rows =
    errors.size === 0
      ? ["| 暂无 | 0 |"]
      : [...errors.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([category, count]) => `| ${category} | ${count} |`);

  return [
    "## SQL Workbench 错误聚合",
    "",
    "| 错误类别 | 次数 |",
    "|---|---:|",
    ...rows
  ].join("\n");
}

export async function createProgressStore(
  paths: ProgressStorePaths,
  questionIds: string[]
) {
  let progress: ProgressData;

  try {
    progress = ProgressDataSchema.parse(
      JSON.parse(await readFile(paths.progressPath, "utf8"))
    );
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(error instanceof SyntaxError)
    ) {
      throw error;
    }
    progress = createInitialProgress(questionIds);
    await writeAtomic(paths.progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  }

  for (const id of questionIds) {
    progress.questions[id] ??= createInitialProgress([id]).questions[id];
  }

  let writeQueue: Promise<unknown> = Promise.resolve();

  async function synchronizeMarkdown() {
    await Promise.all([
      replaceMarkedSection(paths.learningPlanPath, learningPlanSummary(progress)),
      replaceMarkedSection(paths.exerciseBankPath, exerciseSummary(progress)),
      replaceMarkedSection(paths.errorLogPath, errorSummary(progress))
    ]);
  }

  async function recordSubmission(input: SubmissionRecord) {
    const submission = SubmissionRecordSchema.parse(input);
    const operation = writeQueue.then(async () => {
      const question = progress.questions[submission.questionId];
      if (!question) {
        throw new Error(`Unknown question ${submission.questionId}`);
      }

      await appendFile(
        paths.submissionsPath,
        `${JSON.stringify(submission)}\n`,
        { mode: 0o600 }
      );

      question.attempts += 1;
      question.latestVerdict = submission.verdict;
      if (submission.verdict === "failed") {
        question.failedAttempts += 1;
      }
      if (submission.verdict === "error") {
        question.errorAttempts += 1;
      }
      if (submission.verdict === "passed") {
        question.status = "passed";
        question.passedAt ??= submission.timestamp;
      }
      if (submission.errorCategory) {
        question.recurringErrors[submission.errorCategory] =
          (question.recurringErrors[submission.errorCategory] ?? 0) + 1;
      }
      progress.updatedAt = submission.timestamp;

      await writeAtomic(
        paths.progressPath,
        `${JSON.stringify(progress, null, 2)}\n`
      );

      let syncWarning: string | undefined;
      try {
        await synchronizeMarkdown();
      } catch {
        syncWarning = "Progress was saved, but Markdown synchronization failed";
      }

      return { progress: structuredClone(progress), syncWarning };
    });

    writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async function getProgress() {
    await writeQueue;
    return structuredClone(progress);
  }

  return { getProgress, recordSubmission, synchronizeMarkdown };
}

export type ProgressStore = Awaited<ReturnType<typeof createProgressStore>>;
