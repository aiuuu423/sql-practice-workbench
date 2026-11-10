import { Check, Circle, History, Target } from "lucide-react";
import type { ProgressData, PublicQuestion } from "../types";
import type {
  CoachFeedbackRecord,
  CoachJobView
} from "../types";
import { AiCoachPane } from "./AiCoachPane";

interface ProgressPaneProps {
  questions: PublicQuestion[];
  progress: ProgressData | null;
  selectedId: string;
  coachConfigured: boolean | null;
  coachJob: CoachJobView | null;
  latestCoachFeedback: CoachFeedbackRecord | null;
}

export function ProgressPane({
  questions,
  progress,
  selectedId,
  coachConfigured,
  coachJob,
  latestCoachFeedback
}: ProgressPaneProps) {
  const completed = questions.filter(({ status }) => status === "passed").length;
  const current = progress?.questions[selectedId];
  const percentage = questions.length
    ? Math.round((completed / questions.length) * 100)
    : 0;
  const errors = Object.entries(current?.recurringErrors ?? {});

  return (
    <div className="progress-pane">
      <div className="region-heading">
        <span>学习进度</span>
        <span>{percentage}%</span>
      </div>
      <div className="progress-overview">
        <div className="progress-number">
          <strong>{completed}</strong>
          <span>/ {questions.length} 已通过</span>
        </div>
        <div className="progress-track" aria-label={`总体进度 ${percentage}%`}>
          <span style={{ width: `${percentage}%` }} />
        </div>
      </div>

      <section className="inspector-section">
        <h2>
          <Target size={15} />
          当前题目
        </h2>
        <dl>
          <div>
            <dt>提交次数</dt>
            <dd>{current?.attempts ?? 0}</dd>
          </div>
          <div>
            <dt>最近结果</dt>
            <dd>
              {current?.latestVerdict === "passed"
                ? "通过"
                : current?.latestVerdict === "failed"
                  ? "未通过"
                  : current?.latestVerdict === "error"
                    ? "执行错误"
                    : "尚未提交"}
            </dd>
          </div>
        </dl>
      </section>

      <AiCoachPane
        configured={coachConfigured}
        job={coachJob}
        latestFeedback={latestCoachFeedback}
      />

      <section className="inspector-section">
        <h2>
          <History size={15} />
          高频错误
        </h2>
        {errors.length ? (
          <ul className="error-list">
            {errors.map(([category, count]) => (
              <li key={category}>
                <span>{category.replaceAll("_", " ")}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">当前题目暂无已记录错误</p>
        )}
      </section>

      <section className="inspector-section path-section">
        <h2>题目路径</h2>
        <ol>
          {questions.map((question) => (
            <li
              key={question.id}
              className={question.id === selectedId ? "current" : ""}
            >
              <span className="path-marker">
                {question.status === "passed" ? (
                  <Check size={12} />
                ) : (
                  <Circle size={9} />
                )}
              </span>
              <span>{question.id}</span>
              <small>{question.title}</small>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
