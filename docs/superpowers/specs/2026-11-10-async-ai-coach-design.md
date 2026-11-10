# Asynchronous AI SQL Coach Design

## Context

The SQL Practice Workbench already executes safe MySQL 8.0 queries, grades
submissions, records attempts, aggregates coarse error categories, and updates
marked sections in the local learning archive. It does not currently explain
why a query is wrong, identify recurring reasoning mistakes, or produce
conversation-style learning summaries.

TRAE can inspect the site while an agent session is active, but it is not an
embeddable, persistent runtime for the website. Real-time coaching therefore
belongs in the local Fastify service and uses the Volcengine Ark
OpenAI-compatible API.

## Goals

- Trigger AI correction after every `Submit` without delaying the SQL verdict.
- Generate a stage summary when a question is passed or failed/error attempts
  reach 3, 6, 9, and later multiples of 3.
- Explain the learner's mistake without exposing hidden reference SQL.
- Keep Ark credentials in the local `.env` file only.
- Persist feedback and an accumulated learning profile locally.
- Synchronize AI-owned summaries into marked Markdown sections while preserving
  all learner-authored text.
- Degrade cleanly when Ark is unconfigured, slow, or unavailable.

## Non-goals

- Calling the current TRAE conversation agent from the website.
- Watching editor keystrokes or invoking the model on `Run`.
- Sending hidden answer SQL, database credentials, or arbitrary learning files
  to Ark.
- Building a general chat interface, vector memory, or cloud account system.
- Retrying failed Ark requests in a background daemon after the app exits.

## Trigger Rules

1. `Run` continues to execute SQL only.
2. Every well-formed `Submit` for a known question persists the attempt and
   queues one correction job, including unsafe SQL and MySQL execution errors.
3. A job requests a stage summary when:
   - the verdict is `passed`; or
   - the question's cumulative `failed` plus `error` attempt count is a
     positive multiple of 3.
4. Rapid submissions are processed by a single local queue in submission order.
5. A failed coach job is visible as failed. The next submission creates a new
   job and therefore acts as the retry.

## Architecture

### Ark client

`arkClient.ts` owns the provider boundary. It uses native `fetch` against the
OpenAI-compatible `/chat/completions` endpoint and has no access to MySQL
credentials or answer files.

Environment variables:

```text
ARK_API_KEY=
ARK_MODEL=
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_TIMEOUT_MS=30000
```

The application remains runnable when Ark is not configured. Configuration is
reported as a capability state rather than a startup error. If `ARK_API_KEY` is
present, `ARK_MODEL` is required.

### Coach service

`coachService.ts` accepts a sanitized coaching request, creates a job ID, and
returns immediately. It owns:

- one-concurrent-job execution;
- an in-memory registry bounded to the 100 most recent jobs;
- status transitions: `queued`, `running`, `completed`, `failed`;
- structured response validation;
- feedback/profile persistence;
- Markdown synchronization.

Pending jobs are not durable across a server restart. Completed feedback is
durable. This is deliberate for the local MVP: the learner can resubmit to
retry, and no process manager is required.

### Structured stores

Local-only files:

```text
app/data/coach_feedback.jsonl
app/data/coach_profile.json
```

`coach_feedback.jsonl` is append-only and records the question, verdict,
sanitized model input metadata, structured feedback, timestamps, and provider
failure category. It does not record the API key or hidden answer.

`coach_profile.json` is atomically replaced and contains:

- recurring reasoning mistakes with counts and last-seen timestamps;
- topics to reinforce;
- latest stage summary per question;
- overall latest summary;
- last successful coach update.

Question progress adds separate `failedAttempts` and `errorAttempts` counters so
stage-summary triggers do not depend on reparsing the append-only submission
history. Existing progress files are migrated with zero-valued defaults.

Both files remain excluded from Git.

## Model Input

The prompt includes only:

- public question ID, title, prompt, module, difficulty, table names, required
  output columns, and ordering requirement;
- learner SQL;
- verdict reason and bounded result differences;
- MySQL error code/message when applicable;
- attempt count and existing structured weak-point summary;
- whether a stage summary is required.

The prompt never includes:

- reference SQL or answer file paths;
- Ark or MySQL credentials;
- complete Markdown learning files;
- unrelated submission history;
- real user data. The practice database contains deterministic synthetic data.

The system instruction requires Chinese, concise, Socratic feedback. Before a
question passes, the model must not provide a complete replacement query.

## Model Output

Ark must return a JSON object validated with Zod:

```ts
{
  diagnosis: string;
  explanation: string;
  nextHint: string;
  reviewTopics: string[];
  mistakeTags: string[];
  stageSummary: string | null;
}
```

Invalid JSON or schema mismatch fails the coach job and never affects the SQL
verdict or attempt persistence.

## API Changes

### Submit response

For successfully executed learner SQL, `POST /api/submit` retains the existing
result and verdict fields and adds:

```ts
coachJob: {
  id: string;
  status: "queued" | "unavailable";
}
```

`unavailable` is returned when Ark is not configured.

For unsafe SQL or a MySQL execution error, the endpoint preserves its existing
HTTP error status and error payload, then adds `progress` and `coachJob`. The
client API error type retains these fields so the UI can show the deterministic
error and still poll for coaching. Invalid request bodies and unknown question
IDs do not create jobs.

### Job status

`GET /api/coach/jobs/:id` returns the current job state and, when complete, the
structured feedback. Unknown or expired jobs return `404`.

### Learning profile

`GET /api/coach/profile` returns the local accumulated profile and Ark
configuration state. It never returns provider credentials.

## Frontend Behavior

The right inspector gains an `AI 教练` section:

- unavailable: explains that local Ark configuration is missing;
- queued/running: shows a stable analysis indicator;
- completed: shows diagnosis, explanation, one next hint, review topics, and
  stage summary when present;
- failed: preserves the SQL verdict and offers “下次提交自动重试”.

After `Submit`, the client polls the returned job every second for at most
45 seconds. Polling stops on completion, failure, question change, or component
unmount. The latest completed feedback remains visible when the learner returns
to the question.

No model call occurs from the browser. The API key never enters client state,
network responses, logs, or local storage.

## Markdown Synchronization

The coach owns separate markers:

```markdown
<!-- sql-coach:start -->
Generated AI coach content.
<!-- sql-coach:end -->
```

It updates:

- `01_知识点笔记.md`: reinforced topics and current stage summaries;
- `03_错题记录.md`: recurring reasoning mistakes and counts.

The existing `sql-workbench` sections remain independently managed. Missing
Markdown files produce a sync warning but do not fail the coach job or corrupt
the structured profile.

## Error Handling

- Ark unconfigured: submit succeeds with `coachJob.status = unavailable`.
- Ark timeout/network error: job becomes `failed` with a stable local message.
- Ark authentication error: job becomes `failed`; secret values are never
  included in logs or responses.
- Invalid model JSON: job becomes `failed` with category
  `invalid_model_response`.
- Store write failure: job becomes `failed`; the existing profile remains
  intact through atomic writes.
- Markdown sync failure: feedback remains completed with `syncWarning`.
- Server restart: queued/running jobs disappear; completed feedback/profile
  remains available.

## Privacy and Repository Rules

- `.env`, coach feedback, coach profile, progress, submissions, and personal
  Markdown files stay ignored by Git.
- `.env.example` contains variable names and safe defaults only.
- Tests use a fake local Ark endpoint and never call the real provider.
- Secret scans must cover staged files before any GitHub push.

## Testing

### Unit tests

- trigger rules for pass and every third failed/error attempt;
- prompt sanitization and absence of reference SQL/credentials;
- Ark response schema validation;
- queue ordering and status transitions;
- profile aggregation and atomic persistence;
- `sql-coach` marker replacement preserving surrounding prose.

### Integration tests

- submit returns immediately with a queued job;
- fake Ark responses complete a job and update the profile;
- missing Ark configuration returns unavailable without failing grading;
- timeout, authentication failure, and malformed JSON become failed jobs;
- public APIs never expose secrets or reference SQL.

### Browser tests

- submit mismatch shows the deterministic verdict first;
- coach state transitions from analyzing to structured feedback;
- third failed submission shows a stage summary;
- passed submission shows pass feedback and refreshed progress;
- Ark failure leaves run/submit workflows usable;
- desktop and narrow inspector layouts remain unclipped.

## Acceptance Criteria

- SQL grading response is not blocked by Ark latency.
- Every submit queues coaching when Ark is configured.
- Passed questions and each third cumulative failed/error attempt request a
  stage summary.
- Feedback appears automatically without page reload.
- Hidden reference SQL and credentials are absent from model input and all
  client responses.
- Completed feedback survives application restart.
- AI-generated weak points and summaries update structured local files and only
  the `sql-coach` Markdown regions.
- The existing SQL safety, grading, reset, progress, and E2E tests remain green.
