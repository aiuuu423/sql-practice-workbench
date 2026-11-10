import {
  appendFile,
  open,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import { z } from "zod";
import {
  CoachFeedbackSchema,
  CoachProfileSchema,
  type CoachFeedback,
  type CoachProfile
} from "@shared/schemas";

const START_MARKER = "<!-- sql-coach:start -->";
const END_MARKER = "<!-- sql-coach:end -->";

const CoachFeedbackRecordSchema = z.object({
  timestamp: z.string(),
  questionId: z.string().min(1),
  verdict: z.enum(["passed", "failed", "error"]),
  feedback: CoachFeedbackSchema,
  providerCategory: z.string().nullable()
});

export type CoachFeedbackRecord = z.infer<typeof CoachFeedbackRecordSchema>;

export interface CoachStorePaths {
  feedbackPath: string;
  profilePath: string;
  knowledgeNotesPath: string;
  errorLogPath: string;
}

function createEmptyProfile(): CoachProfile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    weakPoints: {},
    reviewTopics: {},
    questionSummaries: {},
    latestSummary: null
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

  await writeFile(
    path,
    source.slice(0, start) +
      block +
      source.slice(end + END_MARKER.length)
  );
}

function knowledgeSummary(profile: CoachProfile) {
  const weakPoints = Object.entries(profile.weakPoints)
    .sort(([, left], [, right]) => right.count - left.count)
    .map(([tag, value]) => `- ${tag}：${value.count} 次`);
  const questionSummaries = Object.entries(profile.questionSummaries).map(
    ([questionId, summary]) => `- ${questionId}：${summary}`
  );

  return [
    "## AI 教练阶段总结",
    "",
    "### 当前薄弱点",
    ...(weakPoints.length > 0 ? weakPoints : ["- 暂无"]),
    "",
    "### 分题总结",
    ...(questionSummaries.length > 0 ? questionSummaries : ["- 暂无"])
  ].join("\n");
}

function errorSummary(profile: CoachProfile) {
  const rows = Object.entries(profile.weakPoints)
    .sort(([, left], [, right]) => right.count - left.count)
    .map(
      ([tag, value]) =>
        `| ${tag} | ${value.count} | ${value.lastSeenAt} |`
    );

  return [
    "## AI 教练错误聚合",
    "",
    "| 错误标签 | 次数 | 最近出现 |",
    "|---|---:|---|",
    ...(rows.length > 0 ? rows : ["| 暂无 | 0 | - |"])
  ].join("\n");
}

async function readFeedbackHistory(path: string) {
  try {
    const content = await readFile(path, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => CoachFeedbackRecordSchema.parse(JSON.parse(line)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function createCoachStore(paths: CoachStorePaths) {
  let profile: CoachProfile;
  try {
    profile = CoachProfileSchema.parse(
      JSON.parse(await readFile(paths.profilePath, "utf8"))
    );
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(error instanceof SyntaxError)
    ) {
      throw error;
    }
    profile = createEmptyProfile();
    await writeAtomic(paths.profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  }

  const latestByQuestion = new Map<string, CoachFeedbackRecord>();
  for (const record of await readFeedbackHistory(paths.feedbackPath)) {
    latestByQuestion.set(record.questionId, record);
  }

  let writeQueue: Promise<unknown> = Promise.resolve();

  async function synchronizeMarkdown() {
    await Promise.all([
      replaceMarkedSection(
        paths.knowledgeNotesPath,
        knowledgeSummary(profile)
      ),
      replaceMarkedSection(paths.errorLogPath, errorSummary(profile))
    ]);
  }

  async function recordFeedback(input: CoachFeedbackRecord) {
    const record = CoachFeedbackRecordSchema.parse(input);
    const operation = writeQueue.then(async () => {
      await appendFile(
        paths.feedbackPath,
        `${JSON.stringify(record)}\n`,
        { mode: 0o600 }
      );

      for (const tag of record.feedback.mistakeTags) {
        const current = profile.weakPoints[tag];
        profile.weakPoints[tag] = {
          count: (current?.count ?? 0) + 1,
          lastSeenAt: record.timestamp
        };
      }
      for (const topic of record.feedback.reviewTopics) {
        profile.reviewTopics[topic] =
          (profile.reviewTopics[topic] ?? 0) + 1;
      }
      if (record.feedback.stageSummary) {
        profile.questionSummaries[record.questionId] =
          record.feedback.stageSummary;
        profile.latestSummary = record.feedback.stageSummary;
      }
      profile.updatedAt = record.timestamp;

      await writeAtomic(
        paths.profilePath,
        `${JSON.stringify(profile, null, 2)}\n`
      );
      latestByQuestion.set(record.questionId, structuredClone(record));

      let syncWarning: string | undefined;
      try {
        await synchronizeMarkdown();
      } catch {
        syncWarning =
          "Coach feedback was saved, but Markdown synchronization failed";
      }

      return { profile: structuredClone(profile), syncWarning };
    });

    writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async function getProfile() {
    await writeQueue;
    return structuredClone(profile);
  }

  async function getLatestFeedback(questionId: string) {
    await writeQueue;
    const record = latestByQuestion.get(questionId);
    return record ? structuredClone(record) : null;
  }

  return {
    getProfile,
    getLatestFeedback,
    recordFeedback,
    synchronizeMarkdown
  };
}

export type CoachStore = Awaited<ReturnType<typeof createCoachStore>>;
