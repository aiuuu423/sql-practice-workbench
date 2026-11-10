// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "@client/App";

vi.mock("@client/components/SqlEditor", () => ({
  SqlEditor: ({ value }: { value: string }) => (
    <div aria-label="SQL 编辑器">{value}</div>
  )
}));

const progress = {
  version: 1,
  updatedAt: "2026-11-10T00:00:00.000Z",
  questions: {
    W03: {
      status: "available",
      attempts: 0,
      failedAttempts: 0,
      errorAttempts: 0,
      passedAt: null,
      latestVerdict: null,
      recurringErrors: {}
    }
  }
};

const questions = [
  {
    id: "W03",
    module: "窗口函数",
    title: "每个用户最近一笔订单",
    difficulty: "L3",
    prompt: "查询每个用户最近一笔订单。",
    schemaTables: ["orders"],
    requiredColumns: ["user_id", "order_id"],
    orderSensitive: true,
    numericTolerance: 0,
    prerequisites: [],
    starterSql: "SELECT * FROM orders",
    locked: false,
    status: "available"
  }
];

const feedback = {
  diagnosis: "筛选条件缺失",
  explanation: "查询没有满足题目要求。",
  nextHint: "检查窗口排序条件。",
  reviewTopics: ["ROW_NUMBER"],
  mistakeTags: ["missing_order"],
  stageSummary: "窗口排序仍需巩固。"
};

describe("App workspace", () => {
  let configured: boolean;
  let jobStatus: "completed" | "failed";
  let submitError: boolean;
  let draftSql: string | null;

  beforeEach(() => {
    configured = true;
    jobStatus = "completed";
    submitError = false;
    draftSql = null;
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => draftSql),
      setItem: vi.fn()
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/health")) {
          return Response.json({
            connected: true,
            version: "8.0.46",
            database: "sql_practice"
          });
        }
        if (url.endsWith("/api/questions")) {
          return Response.json({ questions, progress });
        }
        if (url.endsWith("/api/coach/profile")) {
          return Response.json({
            configured,
            profile: {
              version: 1,
              updatedAt: "2026-11-10T00:00:00.000Z",
              weakPoints: {},
              reviewTopics: {},
              questionSummaries: {},
              latestSummary: null
            },
            latestFeedback: {}
          });
        }
        if (url.includes("/api/coach/jobs/")) {
          return Response.json({
            job: {
              id: "00000000-0000-4000-8000-000000000001",
              questionId: "W03",
              status: jobStatus,
              createdAt: "2026-11-10T00:00:00.000Z",
              updatedAt: "2026-11-10T00:00:01.000Z",
              feedback: jobStatus === "completed" ? feedback : null,
              error:
                jobStatus === "failed"
                  ? "AI 分析暂不可用，下次提交将自动重试。"
                  : null
            }
          });
        }
        if (url.endsWith("/api/submit")) {
          if (submitError) {
            return Response.json(
              {
                error: {
                  code: "UNSAFE_SQL",
                  message: "Statement type DELETE is not allowed"
                },
                progress,
                coachJob: {
                  id: "00000000-0000-4000-8000-000000000001",
                  status: "queued"
                }
              },
              { status: 400 }
            );
          }
          return Response.json({
            result: {
              columns: ["user_id"],
              rows: [],
              durationMs: 1,
              truncated: false
            },
            verdict: {
              passed: false,
              reason: "Rows do not match",
              columnDiff: null,
              missingRows: [],
              unexpectedRows: [],
              positionalDiffs: []
            },
            progress,
            coachJob: {
              id: "00000000-0000-4000-8000-000000000001",
              status: "queued"
            }
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("renders the connected practice workspace", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "每个用户最近一笔订单" })
    ).toBeInTheDocument();
    expect(screen.getByText("MySQL 8.0.46")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行 SQL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交答案" })).toBeInTheDocument();
  });

  test("polls a queued job and renders structured coaching feedback", async () => {
    render(<App />);
    await screen.findByText("SELECT * FROM orders");
    fireEvent.click(
      await screen.findByRole("button", { name: "提交答案" })
    );

    expect(await screen.findByText("筛选条件缺失")).toBeInTheDocument();
    expect(screen.getByText("检查窗口排序条件。")).toBeInTheDocument();
    expect(screen.getByText("窗口排序仍需巩固。")).toBeInTheDocument();
  });

  test("shows local configuration guidance when Ark is unavailable", async () => {
    configured = false;
    render(<App />);

    expect(
      await screen.findByText("AI 教练尚未配置")
    ).toBeInTheDocument();
  });

  test("shows a stable retry message for failed coach jobs", async () => {
    jobStatus = "failed";
    render(<App />);
    await screen.findByText("SELECT * FROM orders");
    fireEvent.click(
      await screen.findByRole("button", { name: "提交答案" })
    );

    expect(
      await screen.findByText("AI 分析暂不可用，下次提交将自动重试。")
    ).toBeInTheDocument();
  });

  test("continues coach polling when submit returns an execution error", async () => {
    submitError = true;
    draftSql = "DELETE FROM users";
    render(<App />);
    await screen.findByText("DELETE FROM users");
    fireEvent.click(
      await screen.findByRole("button", { name: "提交答案" })
    );

    expect(
      await screen.findByText("Statement type DELETE is not allowed")
    ).toBeInTheDocument();
    expect(await screen.findByText("筛选条件缺失")).toBeInTheDocument();
  });
});
