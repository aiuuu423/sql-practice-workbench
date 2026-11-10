# Asynchronous AI SQL Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Volcengine Ark-powered asynchronous SQL coach that analyzes every submission, produces milestone summaries, persists a local learning profile, and synchronizes AI-owned Markdown sections without delaying deterministic grading.

**Architecture:** Fastify keeps grading synchronous and queues sanitized coaching requests in a one-worker in-process service. A provider-isolated Ark client returns Zod-validated JSON; completed feedback is appended locally, merged into an atomic profile, exposed through polling APIs, and rendered in the existing right inspector. Personal coach state and credentials remain local and Git-ignored.

**Tech Stack:** TypeScript, Fastify, native `fetch`, Zod, React 19, Vitest, Playwright, Volcengine Ark OpenAI-compatible API.

---

## Locked File Map

```text
app/
├── .env.example                         # add Ark variable names and safe defaults
├── data/
│   ├── coach_feedback.jsonl             # local-only, append-only
│   └── coach_profile.json               # local-only, atomic current profile
├── shared/
│   └── schemas.ts                       # coach contracts and progress counters
├── server/src/
│   ├── config.ts                        # optional Ark configuration
│   ├── arkClient.ts                     # provider request/response boundary
│   ├── coachPrompt.ts                   # sanitized prompt construction
│   ├── coachStore.ts                    # feedback/profile/Markdown persistence
│   ├── coachService.ts                  # queue and bounded job registry
│   ├── app.ts                           # dependency composition
│   ├── progressStore.ts                 # failed/error counters
│   └── routes/
│       ├── submit.ts                    # queue after success or execution error
│       └── coach.ts                     # job and profile reads
├── client/src/
│   ├── api.ts                           # coach polling API
│   ├── types.ts                         # client response types
│   ├── App.tsx                          # poll lifecycle and selected feedback
│   ├── styles.css                       # stable inspector states
│   └── components/
│       ├── AiCoachPane.tsx              # coach state renderer
│       └── ProgressPane.tsx              # compose AI coach into inspector
└── tests/
    ├── unit/
    │   ├── coachTrigger.test.ts
    │   ├── coachPrompt.test.ts
    │   ├── arkClient.test.ts
    │   ├── coachStore.test.ts
    │   └── coachService.test.ts
    ├── integration/
    │   └── coachApi.test.ts
    └── e2e/
        ├── fakeArkServer.ts
        └── practice.spec.ts
```

## Task 1: Define Coach Contracts, Configuration, and Trigger Counters

**Files:**
- Modify: `app/shared/schemas.ts`
- Modify: `app/server/src/config.ts`
- Modify: `app/server/src/progressStore.ts`
- Modify: `app/.env.example`
- Modify: `.gitignore`
- Test: `app/tests/unit/coachTrigger.test.ts`
- Test: `app/tests/unit/progressStore.test.ts`

- [ ] **Step 1: Write failing trigger and migration tests**

Create `app/tests/unit/coachTrigger.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { shouldGenerateStageSummary } from "@server/coachService";

describe("shouldGenerateStageSummary", () => {
  test("triggers for a passed submission", () => {
    expect(
      shouldGenerateStageSummary({
        verdict: "passed",
        failedAttempts: 0,
        errorAttempts: 0
      })
    ).toBe(true);
  });

  test.each([
    [2, 0, false],
    [3, 0, true],
    [4, 1, false],
    [3, 3, true]
  ])("uses every third failed/error attempt", (failed, errors, expected) => {
    expect(
      shouldGenerateStageSummary({
        verdict: "failed",
        failedAttempts: failed,
        errorAttempts: errors
      })
    ).toBe(expected);
  });
});
```

Extend `progressStore.test.ts` to parse an old progress fixture without
`failedAttempts`/`errorAttempts`, assert both migrate to zero, then record one
failed and one error submission and assert independent counters equal one.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/unit/coachTrigger.test.ts tests/unit/progressStore.test.ts
```

Expected: failure because `shouldGenerateStageSummary` and counter fields do
not exist.

- [ ] **Step 3: Add shared schemas**

Add these schemas and inferred types to `app/shared/schemas.ts`:

```ts
export const CoachFeedbackSchema = z.object({
  diagnosis: z.string().min(1).max(800),
  explanation: z.string().min(1).max(1600),
  nextHint: z.string().min(1).max(800),
  reviewTopics: z.array(z.string().min(1).max(80)).max(8),
  mistakeTags: z.array(z.string().min(1).max(80)).max(8),
  stageSummary: z.string().min(1).max(1600).nullable()
});

export const CoachJobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed"
]);

export const CoachJobSchema = z.object({
  id: z.string().uuid(),
  questionId: z.string(),
  status: CoachJobStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  feedback: CoachFeedbackSchema.nullable(),
  error: z.string().nullable(),
  syncWarning: z.string().optional()
});

export const CoachProfileSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  weakPoints: z.record(
    z.string(),
    z.object({
      count: z.number().int().nonnegative(),
      lastSeenAt: z.string()
    })
  ),
  reviewTopics: z.record(z.string(), z.number().int().nonnegative()),
  questionSummaries: z.record(z.string(), z.string()),
  latestSummary: z.string().nullable()
});
```

Extend `QuestionProgressSchema` with defaulted nonnegative integer
`failedAttempts` and `errorAttempts` fields. Export all new inferred types.

- [ ] **Step 4: Add optional Ark configuration**

Extend `EnvironmentSchema` in `config.ts`:

```ts
ARK_API_KEY: z.string().optional(),
ARK_MODEL: z.string().optional(),
ARK_BASE_URL: z
  .string()
  .url()
  .default("https://ark.cn-beijing.volces.com/api/v3"),
ARK_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000)
```

Add:

```ts
ark: {
  configured: boolean;
  apiKey?: string;
  model?: string;
  baseUrl: string;
  timeoutMs: number;
}
```

Throw `ARK_MODEL is required when ARK_API_KEY is set` without echoing any
secret value. Add the four Ark variables to `.env.example`.

- [ ] **Step 5: Implement progress counters and trigger helper**

In `progressStore.ts`, increment:

```ts
if (submission.verdict === "failed") question.failedAttempts += 1;
if (submission.verdict === "error") question.errorAttempts += 1;
```

In the initial object include zero defaults. In the migration path rely on the
Zod defaults and write the migrated object on the next submission.

Create the pure helper in `coachService.ts`:

```ts
export function shouldGenerateStageSummary(input: {
  verdict: "passed" | "failed" | "error";
  failedAttempts: number;
  errorAttempts: number;
}) {
  if (input.verdict === "passed") return true;
  const totalErrors = input.failedAttempts + input.errorAttempts;
  return totalErrors > 0 && totalErrors % 3 === 0;
}
```

- [ ] **Step 6: Ignore local coach state**

Add:

```gitignore
app/data/coach_feedback.jsonl
app/data/coach_profile.json
```

- [ ] **Step 7: Verify GREEN**

Run:

```bash
npm test -- tests/unit/coachTrigger.test.ts tests/unit/progressStore.test.ts
npm run build
```

Expected: trigger, migration, counters, and TypeScript build pass.

- [ ] **Step 8: Commit**

```bash
git add .gitignore app/.env.example app/shared/schemas.ts \
  app/server/src/config.ts app/server/src/progressStore.ts \
  app/server/src/coachService.ts app/tests/unit/coachTrigger.test.ts \
  app/tests/unit/progressStore.test.ts
git commit -m "feat: define AI coach contracts and triggers"
```

## Task 2: Build the Sanitized Prompt and Ark Client

**Files:**
- Create: `app/server/src/coachPrompt.ts`
- Create: `app/server/src/arkClient.ts`
- Create: `app/tests/unit/coachPrompt.test.ts`
- Create: `app/tests/unit/arkClient.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Use a fixture containing a fake reference SQL, API key, and answer path outside
the allowed request object. Assert `buildCoachMessages()` output includes the
public question, learner SQL, verdict/error, prior weak points, and summary flag,
but does not contain `answerFile`, `SELECT secret_answer`, or `ARK_API_KEY`.
Assert the system message says not to provide a complete replacement query
before a pass.

- [ ] **Step 2: Write failing Ark client tests**

Inject a fake `fetch` function and cover:

```ts
const client = createArkClient({
  apiKey: "test-key",
  model: "test-model",
  baseUrl: "http://ark.test/api/v3",
  timeoutMs: 100,
  fetchImpl
});
```

Assert:

- request URL ends in `/chat/completions`;
- authorization is `Bearer test-key`;
- body requests JSON output;
- valid JSON content parses as `CoachFeedback`;
- HTTP 401 throws `ArkClientError` category `authentication`;
- aborted request throws category `timeout`;
- malformed content throws category `invalid_model_response`.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npm test -- tests/unit/coachPrompt.test.ts tests/unit/arkClient.test.ts
```

Expected: imports fail because both modules are missing.

- [ ] **Step 4: Implement `buildCoachMessages`**

Define an explicit `CoachAnalysisRequest` containing only public question
fields, learner SQL, verdict/error, bounded diffs, attempt counters, weak-point
summary, and `includeStageSummary`.

Return:

```ts
[
  {
    role: "system",
    content:
      "你是 SQL 面试教练。只返回 JSON。先定位思维或语法错误，再解释原因，" +
      "给一个可执行的下一步提示。题目未通过时不得提供完整替代 SQL。"
  },
  {
    role: "user",
    content: JSON.stringify(sanitizedRequest)
  }
]
```

Do not accept a full internal `Question` object; require a public shape so
`answerFile` cannot cross the function boundary.

- [ ] **Step 5: Implement `createArkClient`**

Use `AbortController`, native `fetch`, and:

```ts
body: JSON.stringify({
  model,
  messages,
  response_format: { type: "json_object" },
  temperature: 0.2
})
```

Read `choices[0].message.content`, JSON-parse it, and validate with
`CoachFeedbackSchema`. Map provider failures to stable categories without
including response headers, API keys, or raw provider bodies in public errors.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
npm test -- tests/unit/coachPrompt.test.ts tests/unit/arkClient.test.ts
```

Expected: all sanitization, request, timeout, auth, and response tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/server/src/coachPrompt.ts app/server/src/arkClient.ts \
  app/tests/unit/coachPrompt.test.ts app/tests/unit/arkClient.test.ts
git commit -m "feat: add sanitized Ark coaching client"
```

## Task 3: Persist Feedback, Profile, and AI-Owned Markdown

**Files:**
- Create: `app/server/src/coachStore.ts`
- Create: `app/tests/unit/coachStore.test.ts`
- Modify: `docs/learning-archive/01_知识点笔记.template.md`
- Modify: `docs/learning-archive/03_错题记录.template.md`

- [ ] **Step 1: Write failing store tests**

Use a temporary directory and test:

- missing profile creates version 1 with empty maps;
- feedback appends exactly one JSONL line;
- repeated `mistakeTags` increment weak-point counts;
- repeated topics increment review-topic counts;
- stage summary updates the question and latest summaries;
- profile write leaves no `.tmp` file;
- only text between `sql-coach` markers changes;
- prose and existing `sql-workbench` markers remain unchanged;
- missing Markdown files return `syncWarning` while structured persistence passes.

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm test -- tests/unit/coachStore.test.ts
```

Expected: missing `coachStore` module.

- [ ] **Step 3: Implement store boundaries**

Export:

```ts
export interface CoachStorePaths {
  feedbackPath: string;
  profilePath: string;
  knowledgeNotesPath: string;
  errorLogPath: string;
}

export async function createCoachStore(paths: CoachStorePaths) {
  return {
    getProfile,
    getLatestFeedback,
    recordFeedback
  };
}
```

Use a serialized promise queue, append JSONL with mode `0o600`, and write the
profile through sibling `.tmp`, `fsync`, and rename. Reuse the established
atomic-write pattern rather than importing private functions from
`progressStore.ts`.

- [ ] **Step 4: Generate Markdown summaries**

Knowledge notes content:

```markdown
<!-- sql-coach:start -->
## AI 教练阶段总结

### 当前薄弱点
- ...

### 分题总结
- D01：...
<!-- sql-coach:end -->
```

Error log content lists mistake tags, counts, and last-seen times. Replace only
the coach markers; append a new coach block when markers are absent.

- [ ] **Step 5: Add sanitized templates**

Add `sql-coach` blocks to the knowledge and error templates. Create
`01_知识点笔记.template.md` because the repository currently excludes the
learner's local file.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
npm test -- tests/unit/coachStore.test.ts
```

Expected: persistence, aggregation, marker isolation, and warning tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/server/src/coachStore.ts app/tests/unit/coachStore.test.ts \
  docs/learning-archive/01_知识点笔记.template.md \
  docs/learning-archive/03_错题记录.template.md
git commit -m "feat: persist AI coach learning profile"
```

## Task 4: Implement the Asynchronous Coach Queue

**Files:**
- Modify: `app/server/src/coachService.ts`
- Create: `app/tests/unit/coachService.test.ts`

- [ ] **Step 1: Write failing queue tests**

Inject fake client/store dependencies. Assert:

- `enqueue()` returns a queued UUID before the fake model promise resolves;
- status becomes running, then completed;
- jobs execute in insertion order with maximum concurrency one;
- a client failure becomes failed with a stable message;
- completed feedback is written once;
- only the 100 newest jobs remain queryable;
- stage-summary flag follows the Task 1 helper.

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm test -- tests/unit/coachService.test.ts
```

Expected: `createCoachService` is missing.

- [ ] **Step 3: Implement service interfaces**

```ts
export interface CoachClient {
  analyze(request: CoachAnalysisRequest): Promise<CoachFeedback>;
}

export function createCoachService(dependencies: {
  configured: boolean;
  client?: CoachClient;
  store: CoachStore;
  now?: () => Date;
  createId?: () => string;
}) {
  return {
    enqueue,
    getJob,
    getProfile,
    getLatestFeedback,
    configured: dependencies.configured
  };
}
```

`enqueue()` returns `{ id, status: "queued" }` or
`{ id: "", status: "unavailable" }`. Push work onto one serialized queue and
never await provider work in `enqueue()`.

- [ ] **Step 4: Implement bounded registry and failures**

Clone job values on reads. After insertion, delete oldest entries until map
size is at most 100. Public failed jobs contain:

```text
AI 分析暂不可用，下次提交将自动重试。
```

Provider category may be stored locally but raw provider messages stay private.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/unit/coachService.test.ts
```

Expected: queue timing, ordering, state transitions, bounds, and failures pass.

- [ ] **Step 6: Commit**

```bash
git add app/server/src/coachService.ts app/tests/unit/coachService.test.ts
git commit -m "feat: add asynchronous coach queue"
```

## Task 5: Wire Submit, Coach APIs, and Application Composition

**Files:**
- Create: `app/server/src/routes/coach.ts`
- Modify: `app/server/src/routes/submit.ts`
- Modify: `app/server/src/app.ts`
- Modify: `app/tests/integration/api.test.ts`
- Create: `app/tests/integration/coachApi.test.ts`

- [ ] **Step 1: Write failing API tests**

Use a fake coach service with deferred completion. Cover:

- successful submit returns SQL verdict plus queued job immediately;
- mismatch queues `includeStageSummary = false` before the third error;
- third failed/error attempt queues `includeStageSummary = true`;
- passed attempt queues summary;
- unsafe SQL and MySQL errors retain status/error but include `progress` and
  `coachJob`;
- unconfigured coach returns unavailable;
- `GET /api/coach/jobs/:id` returns states and `404` for unknown ID;
- `GET /api/coach/profile` returns configured state/profile without secrets or
  answer SQL.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/integration/api.test.ts tests/integration/coachApi.test.ts
```

Expected: coach routes and response fields are absent.

- [ ] **Step 3: Register application dependencies**

Extend `createApp` dependencies with optional `coach`. By default:

1. load Ark config;
2. create `coachStore` from `app/data` and learning archive paths;
3. create Ark client only when configured;
4. create coach service;
5. register coach routes.

Tests inject fake services and never call Ark.

- [ ] **Step 4: Build sanitized coaching requests in submit route**

After `recordSubmission`, read the updated question progress and profile.
Create a request from public question fields, learner SQL, verdict/error,
bounded diffs, counters, and existing weak-point keys. Use:

```ts
includeStageSummary: shouldGenerateStageSummary({
  verdict,
  failedAttempts: questionProgress.failedAttempts,
  errorAttempts: questionProgress.errorAttempts
})
```

Queue without awaiting.

- [ ] **Step 5: Preserve error semantics**

For execution errors, persist and queue first, then attach to the error object:

```ts
Object.assign(error, {
  coachJob,
  progress: persistence.progress
});
```

Update the central error handler to include only these safe fields in its
existing 400/408/422 response. Invalid body and unknown question errors remain
unchanged and do not queue.

- [ ] **Step 6: Implement read routes**

```ts
app.get("/api/coach/jobs/:id", ...)
app.get("/api/coach/profile", ...)
```

Return `404 COACH_JOB_NOT_FOUND` for expired/unknown jobs. The profile response
includes `configured`, `profile`, and latest feedback by question.

- [ ] **Step 7: Verify GREEN**

Run:

```bash
npm test -- tests/integration/api.test.ts tests/integration/coachApi.test.ts
npm run build
```

Expected: success, mismatch, execution error, unavailable, job, and profile
contracts pass.

- [ ] **Step 8: Commit**

```bash
git add app/server/src/app.ts app/server/src/routes/coach.ts \
  app/server/src/routes/submit.ts app/tests/integration/api.test.ts \
  app/tests/integration/coachApi.test.ts
git commit -m "feat: connect coaching to SQL submissions"
```

## Task 6: Add the AI Coach Inspector and Polling Lifecycle

**Files:**
- Create: `app/client/src/components/AiCoachPane.tsx`
- Modify: `app/client/src/components/ProgressPane.tsx`
- Modify: `app/client/src/App.tsx`
- Modify: `app/client/src/api.ts`
- Modify: `app/client/src/types.ts`
- Modify: `app/client/src/styles.css`
- Modify: `app/tests/unit/App.test.tsx`

- [ ] **Step 1: Write failing component tests**

Mock health/questions/profile/submit/job endpoints. Test:

- unavailable Ark renders local configuration guidance;
- submit queued renders `AI 正在分析`;
- polling completion renders diagnosis, explanation, hint, and topics;
- failed job renders the retry-on-next-submit message;
- switching questions stops showing the previous question's feedback;
- execution error carrying a coach job still starts polling.

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm test -- tests/unit/App.test.tsx
```

Expected: coach content and polling calls are absent.

- [ ] **Step 3: Add client contracts and API methods**

Add typed methods:

```ts
coachProfile: () => request<CoachProfileResponse>("/api/coach/profile"),
coachJob: (id: string) =>
  request<CoachJobResponse>(`/api/coach/jobs/${encodeURIComponent(id)}`)
```

Extend `SubmitResponse` and API error handling so a thrown `ApiClientError`
retains safe `coachJob` and `progress` fields.

- [ ] **Step 4: Implement bounded polling**

In `App.tsx`, poll every second with `setTimeout`, not overlapping
`setInterval`. Stop after 45 attempts or terminal state. Use an effect cleanup
flag so question changes and unmounts cannot update stale state.

Initial load fetches questions, health, and coach profile in parallel.

- [ ] **Step 5: Render coach states**

`AiCoachPane` receives configuration, job, and latest feedback. Render fixed
states without changing inspector width:

- unavailable;
- queued/running;
- completed structured fields;
- failed.

Compose it inside `ProgressPane` above recurring deterministic errors. Use
existing neutral surfaces, green success accent, warning color, Lucide icons,
and no nested cards.

- [ ] **Step 6: Verify GREEN and build**

Run:

```bash
npm test -- tests/unit/App.test.tsx
npm run build
```

Expected: state rendering, polling cleanup, error-job behavior, and build pass.

- [ ] **Step 7: Commit**

```bash
git add app/client/src/App.tsx app/client/src/api.ts app/client/src/types.ts \
  app/client/src/styles.css app/client/src/components/AiCoachPane.tsx \
  app/client/src/components/ProgressPane.tsx app/tests/unit/App.test.tsx
git commit -m "feat: show asynchronous AI coach feedback"
```

## Task 7: End-to-End Verification, Documentation, and Delivery

**Files:**
- Create: `app/tests/e2e/fakeArkServer.ts`
- Modify: `app/playwright.config.ts`
- Modify: `app/tests/e2e/practice.spec.ts`
- Modify: `README.md`
- Modify: `app/.env.example`

- [ ] **Step 1: Add fake-Ark E2E support**

Create `fakeArkServer.ts` with `node:http`. Listen on `127.0.0.1:3999`, accept
`POST /api/v3/chat/completions`, and return:

```json
{
  "choices": [
    {
      "message": {
        "content": "{\"diagnosis\":\"筛选条件不完整\",\"explanation\":\"当前结果与题目口径不一致\",\"nextHint\":\"逐项核对时间、状态和城市条件\",\"reviewTopics\":[\"WHERE\",\"日期边界\"],\"mistakeTags\":[\"missing_filter\"],\"stageSummary\":\"需要继续巩固多条件筛选\"}"
      }
    }
  ]
}
```

In `playwright.config.ts`, replace the E2E web-server command with:

```ts
command:
  "concurrently -k \"tsx tests/e2e/fakeArkServer.ts\" \"npm run dev\"",
env: {
  ...process.env,
  ARK_API_KEY: "e2e-placeholder",
  ARK_MODEL: "e2e-model",
  ARK_BASE_URL: "http://127.0.0.1:3999/api/v3",
  ARK_TIMEOUT_MS: "3000"
}
```

Wait for the frontend URL as before. The placeholder key never leaves the local
test process and is not a real credential.

- [ ] **Step 2: Extend browser workflow**

Verify:

```text
load app
→ coach configured
→ submit wrong SQL
→ deterministic mismatch appears first
→ analyzing state appears
→ feedback appears automatically
→ repeat until third error
→ stage summary appears
→ submit correct SQL
→ pass verdict remains usable
→ narrow inspector has no clipping or page overflow
```

Retain the existing unsafe SQL and reset checks. Back up and restore all local
progress, coach, submissions, and Markdown files around the E2E run.

- [ ] **Step 3: Document secure Ark setup**

Document:

```env
ARK_API_KEY=your_local_key
ARK_MODEL=your_endpoint_or_model_id
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_TIMEOUT_MS=30000
```

State explicitly that `.env` is local-only, the browser never sees the key,
automated tests use a fake provider, `Run` does not call AI, and `Submit` does.

- [ ] **Step 4: Run the complete verification**

Run:

```bash
npm audit --omit=dev
npm test
npm run build
npm run test:e2e
```

Expected: zero production vulnerabilities, all unit/integration tests pass,
build succeeds without type errors, and Chrome E2E passes.

- [ ] **Step 5: Perform visual QA**

Inspect fresh 1440×900 and 1024×768 screenshots. Confirm:

- deterministic verdict appears independently from AI status;
- coach text does not clip or overflow;
- long explanation and topic lists scroll within the inspector;
- drawer closes and page has no horizontal overflow;
- unavailable, analyzing, completed, failed, and stage-summary states remain
  visually stable;
- no relevant console errors.

- [ ] **Step 6: Run final secret scan**

Run against staged/tracked files:

```bash
git grep -n -E 'ARK_API_KEY=.+|Bearer [A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]+' \
  -- ':!app/.env.example'
```

Expected: no matches. Confirm coach state files and personal Markdown remain
ignored with `git check-ignore -v`.

- [ ] **Step 7: Commit delivery changes**

```bash
git add README.md app/.env.example app/playwright.config.ts \
  app/tests/e2e/fakeArkServer.ts app/tests/e2e/practice.spec.ts
git commit -m "docs: document AI coach setup and verification"
```

- [ ] **Step 8: Push and start**

```bash
git push origin main
npm run dev
```

Verify:

```bash
curl -sS http://127.0.0.1:3001/api/health
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/
```

Expected: API reports MySQL connected and frontend returns `200`.
