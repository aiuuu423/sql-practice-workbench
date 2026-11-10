import { Check, ChevronRight, LockKeyhole } from "lucide-react";
import type { PublicQuestion } from "../types";

interface QuestionPaneProps {
  questions: PublicQuestion[];
  selectedQuestion: PublicQuestion | null;
  onSelect: (id: string) => void;
}

export function QuestionPane({
  questions,
  selectedQuestion,
  onSelect
}: QuestionPaneProps) {
  const modules = questions.reduce<Map<string, PublicQuestion[]>>(
    (groups, question) => {
      const existing = groups.get(question.module) ?? [];
      existing.push(question);
      groups.set(question.module, existing);
      return groups;
    },
    new Map()
  );

  return (
    <aside className="question-region">
      <nav className="question-nav" aria-label="练习题目">
        <div className="region-heading">
          <span>学习路径</span>
          <span>{questions.length} 题</span>
        </div>
        {[...modules].map(([module, moduleQuestions]) => (
          <div className="question-group" key={module}>
            <div className="module-label">{module}</div>
            {moduleQuestions.map((question) => (
              <button
                type="button"
                className={`question-row ${
                  question.id === selectedQuestion?.id ? "selected" : ""
                }`}
                key={question.id}
                onClick={() => onSelect(question.id)}
                disabled={question.locked}
              >
                <span className="question-state" aria-hidden="true">
                  {question.locked ? (
                    <LockKeyhole size={13} />
                  ) : question.status === "passed" ? (
                    <Check size={14} />
                  ) : (
                    <span className="question-index">{question.id}</span>
                  )}
                </span>
                <span>{question.title}</span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        ))}
      </nav>

      <article className="question-detail">
        {selectedQuestion ? (
          <>
            <div className="question-meta">
              <span>{selectedQuestion.id}</span>
              <span>{selectedQuestion.difficulty}</span>
            </div>
            <h1>{selectedQuestion.title}</h1>
            <p>{selectedQuestion.prompt}</p>
            <section className="detail-section">
              <h2>输出字段</h2>
              <div className="code-list">
                {selectedQuestion.requiredColumns.map((column) => (
                  <code key={column}>{column}</code>
                ))}
              </div>
            </section>
            <section className="detail-section">
              <h2>可用数据表</h2>
              <div className="schema-list">
                {selectedQuestion.schemaTables.map((table) => (
                  <div key={table}>
                    <span className="table-icon" aria-hidden="true" />
                    <code>{table}</code>
                  </div>
                ))}
              </div>
            </section>
            <section className="detail-section rule-line">
              <span>结果顺序</span>
              <strong>
                {selectedQuestion.orderSensitive ? "需要一致" : "不限制"}
              </strong>
            </section>
          </>
        ) : (
          <div className="pane-loading">正在读取题目…</div>
        )}
      </article>
    </aside>
  );
}
