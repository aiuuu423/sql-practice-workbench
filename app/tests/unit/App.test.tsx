// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "@client/App";

vi.mock("@client/components/SqlEditor", () => ({
  SqlEditor: () => <div aria-label="SQL 编辑器" />
}));

describe("App workspace", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/health")) {
          return new Response(
            JSON.stringify({
              connected: true,
              version: "8.0.46",
              database: "sql_practice"
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            questions: [
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
            ],
            progress: {
              version: 1,
              updatedAt: "2026-11-10T00:00:00.000Z",
              questions: {
                W03: {
                  status: "available",
                  attempts: 0,
                  passedAt: null,
                  latestVerdict: null,
                  recurringErrors: {}
                }
              }
            }
          }),
          { status: 200 }
        );
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
});
