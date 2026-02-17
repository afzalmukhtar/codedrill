import React from "react";

export interface SessionProgress {
  step: string;
  detail: string;
  problemPreview?: {
    title: string;
    difficulty: string;
    category: string;
    timerMins: number;
  };
}

interface SessionLoaderProps {
  progress: SessionProgress | null;
  streamedContent: string;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

const STEPS = [
  { key: "config", label: "Loading config" },
  { key: "selecting", label: "Selecting problem" },
  { key: "generating", label: "Generating problem" },
  { key: "saving", label: "Saving file" },
  { key: "session", label: "Starting session" },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "#22c55e",
  Medium: "#eab308",
  Hard: "#ef4444",
};

export function SessionLoader({ progress, streamedContent, error, onRetry, onCancel }: SessionLoaderProps) {
  const currentStepIdx = STEPS.findIndex((s) => s.key === progress?.step);
  const preview = progress?.problemPreview;

  if (error) {
    return (
      <div className="session-loader">
        <div className="session-loader-error">
          <span className="session-loader-error-icon">!</span>
          <span>{error}</span>
        </div>
        <div className="session-loader-actions">
          <button type="button" className="session-loader-btn" onClick={onRetry}>
            Try Again
          </button>
          <button type="button" className="session-loader-btn session-loader-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="session-loader">
      {/* Problem preview card */}
      {preview && (
        <div className="session-loader-card">
          <div className="session-loader-card-header">
            <span
              className="session-loader-difficulty"
              style={{ color: DIFFICULTY_COLORS[preview.difficulty] ?? "#9ca3af" }}
            >
              {preview.difficulty}
            </span>
            <span className="session-loader-category">{preview.category}</span>
            <span className="session-loader-timer">{preview.timerMins} min</span>
          </div>
          <div className="session-loader-title">{preview.title}</div>
        </div>
      )}

      {/* Progress steps */}
      <div className="session-loader-steps">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentStepIdx;
          const isActive = idx === currentStepIdx;
          const cls = isDone ? "done" : isActive ? "active" : "pending";
          return (
            <div key={step.key} className={`session-loader-step session-loader-step--${cls}`}>
              <span className="session-loader-step-dot" />
              <span className="session-loader-step-label">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Streaming markdown preview */}
      {streamedContent && (
        <div className="session-loader-preview">
          <div className="session-loader-preview-header">
            <span>Preview</span>
            <span className="session-loader-preview-streaming">streaming...</span>
          </div>
          <div className="session-loader-preview-content">
            {streamedContent}
            <span className="chat-cursor">|</span>
          </div>
        </div>
      )}

      {/* Cancel button */}
      {!streamedContent && !preview && (
        <div className="session-loader-spinner">
          <span className="session-loader-spinner-dot" />
          <span className="session-loader-spinner-dot" />
          <span className="session-loader-spinner-dot" />
        </div>
      )}
    </div>
  );
}
