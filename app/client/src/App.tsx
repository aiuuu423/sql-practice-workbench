import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Database,
  PanelRight,
  Play,
  RotateCcw,
  Send,
  TerminalSquare,
  X
} from "lucide-react";
import { api } from "./api";
import type {
  HealthResponse,
  ProgressData,
  PublicQuestion,
  QueryResult,
  SubmitResponse
} from "./types";
import { ProgressPane } from "./components/ProgressPane";
import { QuestionPane } from "./components/QuestionPane";
import { ResultPane, type ResultState } from "./components/ResultPane";
import "./styles.css";

const SqlEditor = lazy(() =>
  import("./components/SqlEditor").then((module) => ({
    default: module.SqlEditor
  }))
);

function draftKey(questionId: string) {
  return `sql-workbench:draft:${questionId}`;
}

function readDraft(questionId: string) {
  try {
    return globalThis.localStorage?.getItem(draftKey(questionId)) ?? null;
  } catch {
    return null;
  }
}

function writeDraft(questionId: string, sql: string) {
  try {
    globalThis.localStorage?.setItem(draftKey(questionId), sql);
  } catch {
    // Draft persistence is optional when browser storage is unavailable.
  }
}

export function App() {
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [sql, setSql] = useState("");
  const [resultState, setResultState] = useState<ResultState>({ kind: "idle" });
  const [loadingError, setLoadingError] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.health(), api.questions()])
      .then(([nextHealth, questionResponse]) => {
        if (cancelled) return;
        setHealth(nextHealth);
        setQuestions(questionResponse.questions);
        setProgress(questionResponse.progress);
        const nextQuestion =
          questionResponse.questions.find(
            (question) => !question.locked && question.status !== "passed"
          ) ??
          questionResponse.questions.find((question) => !question.locked) ??
          questionResponse.questions[0];
        setSelectedId(nextQuestion?.id ?? "");
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadingError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedQuestion = useMemo(
    () => questions.find(({ id }) => id === selectedId) ?? null,
    [questions, selectedId]
  );

  useEffect(() => {
    if (!selectedQuestion) return;
    setSql(readDraft(selectedQuestion.id) ?? selectedQuestion.starterSql);
    setResultState({ kind: "idle" });
  }, [selectedId]);

  const updateSql = useCallback(
    (nextSql: string) => {
      setSql(nextSql);
      if (selectedId) writeDraft(selectedId, nextSql);
    },
    [selectedId]
  );

  const runSql = useCallback(async () => {
    if (!sql.trim()) return;
    setResultState({ kind: "running", action: "run" });
    try {
      const result = await api.execute(sql);
      setResultState({ kind: "result", result });
    } catch (error) {
      setResultState({ kind: "error", message: (error as Error).message });
    }
  }, [sql]);

  const applySubmission = useCallback((response: SubmitResponse) => {
    setProgress(response.progress);
    setQuestions((current) =>
      current.map((question) => ({
        ...question,
        status:
          response.progress.questions[question.id]?.status ?? question.status,
        locked: question.prerequisites.some(
          (id) => response.progress.questions[id]?.status !== "passed"
        )
      }))
    );
    setResultState({
      kind: "verdict",
      result: response.result,
      verdict: response.verdict,
      syncWarning: response.syncWarning
    });
  }, []);

  const submitSql = useCallback(async () => {
    if (!selectedQuestion || !sql.trim()) return;
    setResultState({ kind: "running", action: "submit" });
    try {
      applySubmission(await api.submit(selectedQuestion.id, sql));
    } catch (error) {
      setResultState({ kind: "error", message: (error as Error).message });
    }
  }, [applySubmission, selectedQuestion, sql]);

  async function resetDatabase() {
    setResetting(true);
    setResetMessage("");
    try {
      const response = await api.reset();
      setResetMessage(
        `已恢复 ${response.counts.users} 个用户和 ${response.counts.orders} 笔订单`
      );
      setTimeout(() => setResetOpen(false), 900);
    } catch (error) {
      setResetMessage((error as Error).message);
    } finally {
      setResetting(false);
    }
  }

  if (loadingError) {
    return (
      <main className="fatal-state">
        <TerminalSquare size={28} />
        <h1>SQL Practice Workbench</h1>
        <p>{loadingError}</p>
        <code>brew services start mysql@8.0</code>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <TerminalSquare size={19} aria-hidden="true" />
          <strong>SQL Practice</strong>
        </div>
        <div className="header-status" aria-live="polite">
          <span className={`status-dot ${health?.connected ? "online" : ""}`} />
          <span>{health ? `MySQL ${health.version}` : "正在连接 MySQL"}</span>
          <span className="header-divider" />
          <Database size={14} aria-hidden="true" />
          <span>{health?.database ?? "sql_practice"}</span>
        </div>
        <div className="header-actions">
          <button
            className="icon-button inspector-toggle"
            type="button"
            title="打开学习进度"
            aria-label="打开学习进度"
            onClick={() => setInspectorOpen(true)}
          >
            <PanelRight size={17} />
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setResetMessage("");
              setResetOpen(true);
            }}
          >
            <RotateCcw size={15} />
            重置数据
          </button>
        </div>
      </header>

      <main className="workspace">
        <QuestionPane
          questions={questions}
          selectedQuestion={selectedQuestion}
          onSelect={setSelectedId}
        />

        <section className="workbench" aria-label="SQL 编辑与结果">
          <div className="editor-toolbar">
            <div>
              <span className="toolbar-title">查询编辑器</span>
              <span className="toolbar-hint">MySQL 8.0</span>
            </div>
            <div className="editor-actions">
              <button
                type="button"
                className="secondary-button"
                aria-label="运行 SQL"
                onClick={runSql}
                disabled={resultState.kind === "running"}
              >
                <Play size={15} />
                运行
              </button>
              <button
                type="button"
                className="primary-button"
                aria-label="提交答案"
                onClick={submitSql}
                disabled={!selectedQuestion || resultState.kind === "running"}
              >
                <Send size={15} />
                提交
              </button>
            </div>
          </div>
          <Suspense
            fallback={<div className="editor-loading">正在加载 SQL 编辑器…</div>}
          >
            <SqlEditor
              questionId={selectedId}
              value={sql}
              onChange={updateSql}
              onRun={runSql}
              onSubmit={submitSql}
            />
          </Suspense>
          <ResultPane state={resultState} />
        </section>

        <aside className={`progress-region ${inspectorOpen ? "open" : ""}`}>
          <button
            className="icon-button drawer-close"
            type="button"
            aria-label="关闭学习进度"
            onClick={() => setInspectorOpen(false)}
          >
            <X size={18} />
          </button>
          <ProgressPane
            questions={questions}
            progress={progress}
            selectedId={selectedId}
          />
        </aside>
        {inspectorOpen ? (
          <button
            className="drawer-scrim"
            type="button"
            aria-label="关闭学习进度"
            onClick={() => setInspectorOpen(false)}
          />
        ) : null}
      </main>

      {resetOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="reset-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <div className="dialog-icon">
              <RotateCcw size={20} />
            </div>
            <h2 id="reset-title">重置练习数据库？</h2>
            <p>恢复固定测试数据。学习进度、提交记录和本地草稿不会被删除。</p>
            {resetMessage ? (
              <div className="reset-message" role="status">
                {resetMessage}
              </div>
            ) : null}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setResetOpen(false)}
                disabled={resetting}
              >
                取消
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={resetDatabase}
                disabled={resetting}
              >
                {resetting ? "正在重置" : "确认重置"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
