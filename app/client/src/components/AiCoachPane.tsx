import {
  AlertCircle,
  BookOpenCheck,
  BrainCircuit,
  Lightbulb,
  LoaderCircle
} from "lucide-react";
import type {
  CoachFeedbackRecord,
  CoachJobView
} from "../types";

interface AiCoachPaneProps {
  configured: boolean | null;
  job: CoachJobView | null;
  latestFeedback: CoachFeedbackRecord | null;
}

export function AiCoachPane({
  configured,
  job,
  latestFeedback
}: AiCoachPaneProps) {
  const feedback =
    job?.status === "completed" && job.feedback
      ? job.feedback
      : latestFeedback?.feedback ?? null;

  if (configured === false || job?.status === "unavailable") {
    return (
      <section className="inspector-section coach-section">
        <h2>
          <BrainCircuit size={15} />
          AI 教练
        </h2>
        <div className="coach-state muted">
          <strong>AI 教练尚未配置</strong>
          <span>在本地 .env 中设置 ARK_API_KEY 与 ARK_MODEL。</span>
        </div>
      </section>
    );
  }

  if (job?.status === "queued" || job?.status === "running") {
    return (
      <section className="inspector-section coach-section" aria-live="polite">
        <h2>
          <BrainCircuit size={15} />
          AI 教练
        </h2>
        <div className="coach-state analyzing">
          <LoaderCircle className="spin" size={16} />
          <div>
            <strong>AI 正在分析</strong>
            <span>判题已完成，正在归纳本次思路。</span>
          </div>
        </div>
      </section>
    );
  }

  if (job?.status === "failed") {
    return (
      <section className="inspector-section coach-section" aria-live="polite">
        <h2>
          <BrainCircuit size={15} />
          AI 教练
        </h2>
        <div className="coach-state failed">
          <AlertCircle size={16} />
          <span>
            {job.error ?? "AI 分析暂不可用，下次提交将自动重试。"}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="inspector-section coach-section" aria-live="polite">
      <h2>
        <BrainCircuit size={15} />
        AI 教练
      </h2>
      {feedback ? (
        <div className="coach-feedback">
          <div className="coach-diagnosis">
            <strong>{feedback.diagnosis}</strong>
            <p>{feedback.explanation}</p>
          </div>
          <div className="coach-hint">
            <Lightbulb size={14} />
            <span>{feedback.nextHint}</span>
          </div>
          {feedback.reviewTopics.length > 0 ? (
            <div className="coach-topics">
              {feedback.reviewTopics.map((topic) => (
                <span key={topic}>{topic}</span>
              ))}
            </div>
          ) : null}
          {feedback.stageSummary ? (
            <div className="coach-summary">
              <BookOpenCheck size={14} />
              <div>
                <strong>阶段总结</strong>
                <p>{feedback.stageSummary}</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="muted-copy">
          提交答案后，这里会解释错误并持续归纳薄弱点。
        </p>
      )}
    </section>
  );
}
