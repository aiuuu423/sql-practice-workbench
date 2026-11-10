import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Rows3
} from "lucide-react";
import type { JudgeVerdict, QueryResult } from "../types";

export type ResultState =
  | { kind: "idle" }
  | { kind: "running"; action: "run" | "submit" }
  | { kind: "result"; result: QueryResult }
  | {
      kind: "verdict";
      result: QueryResult;
      verdict: JudgeVerdict;
      syncWarning?: string;
    }
  | { kind: "error"; message: string };

function ResultTable({ result }: { result: QueryResult }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {result.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, index) => (
            <tr key={`${index}-${JSON.stringify(row)}`}>
              {result.columns.map((column) => (
                <td key={column}>
                  {row[column] === null ? (
                    <span className="null-value">NULL</span>
                  ) : (
                    String(row[column])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultPane({ state }: { state: ResultState }) {
  const result =
    state.kind === "result" || state.kind === "verdict" ? state.result : null;

  return (
    <section className="result-pane" aria-live="polite">
      <div className="result-header">
        <span>执行结果</span>
        {result ? (
          <div className="result-metrics">
            <span>
              <Clock3 size={13} /> {result.durationMs} ms
            </span>
            <span>
              <Rows3 size={13} /> {result.rows.length}
              {result.truncated ? "+" : ""} 行
            </span>
          </div>
        ) : null}
      </div>

      <div className="result-body">
        {state.kind === "idle" ? (
          <div className="empty-result">
            <Rows3 size={22} />
            <p>运行查询后在此查看结果</p>
          </div>
        ) : null}
        {state.kind === "running" ? (
          <div className="empty-result">
            <LoaderCircle className="spin" size={22} />
            <p>{state.action === "submit" ? "正在判题" : "正在执行查询"}</p>
          </div>
        ) : null}
        {state.kind === "error" ? (
          <div className="error-state">
            <AlertCircle size={18} />
            <div>
              <strong>查询未执行</strong>
              <p>{state.message}</p>
            </div>
          </div>
        ) : null}
        {state.kind === "verdict" ? (
          <div
            className={`verdict-banner ${
              state.verdict.passed ? "passed" : "mismatch"
            }`}
          >
            {state.verdict.passed ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertCircle size={18} />
            )}
            <div>
              <strong>{state.verdict.passed ? "答案通过" : "结果不匹配"}</strong>
              <span>{state.verdict.reason}</span>
              {state.syncWarning ? <span>{state.syncWarning}</span> : null}
            </div>
          </div>
        ) : null}
        {result ? <ResultTable result={result} /> : null}
      </div>
    </section>
  );
}
