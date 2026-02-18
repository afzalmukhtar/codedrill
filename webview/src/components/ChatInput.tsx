import React, { useState, useRef, useCallback } from "react";
import { ModelSelector } from "./ModelSelector";
import type { ModelInfo, DrillMode, ContextBadge } from "../App";

const MODE_LABELS: Record<DrillMode, string> = {
  agent: "Agent",
  teach: "Teach",
  interview: "Interview",
};

const MODE_ORDER: DrillMode[] = ["agent", "teach", "interview"];

interface ChatInputProps {
  onSend: (text: string) => void;
  onInterrupt: () => void;
  isLoading: boolean;
  models: ModelInfo[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  onConfigureModels: () => void;
  mode: DrillMode;
  onModeChange: (mode: DrillMode) => void;
  contextBadges: ContextBadge[];
  isSessionActive?: boolean;
}

export function ChatInput({
  onSend,
  onInterrupt,
  isLoading,
  models,
  selectedModel,
  onModelChange,
  onConfigureModels,
  mode,
  onModeChange,
  contextBadges,
  isSessionActive = false,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;

    if (isLoading) {
      onInterrupt();
    }

    onSend(text);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [isLoading, onInterrupt, onSend, text]);

  const handleStop = useCallback(() => {
    onInterrupt();
  }, [onInterrupt]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    const textarea = event.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  return (
    <footer className="chat-input-container">
      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          placeholder={isLoading ? "Type to interrupt..." : "Ask CodeDrill anything..."}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        {isLoading && !text.trim() ? (
          <button
            className="chat-input-send chat-input-send--stop"
            type="button"
            onClick={handleStop}
            title="Stop generating"
            aria-label="Stop generating"
          >
            ■
          </button>
        ) : (
          <button
            className="chat-input-send"
            type="button"
            onClick={handleSend}
            disabled={!text.trim()}
            title={isLoading ? "Interrupt and send" : "Send message"}
            aria-label={isLoading ? "Interrupt and send" : "Send message"}
          >
            ↑
          </button>
        )}
      </div>
      {contextBadges.length > 0 && (
        <div className="context-badges" aria-label="Attached context">
          {contextBadges.map((badge) => (
            <span key={`${badge.type}-${badge.label}`} className={`context-badge context-badge--${badge.type}`} title={`${badge.label} (~${badge.tokenEstimate} tokens)`}>
              {{ selection: "sel", file: "file", symbol: "sym", problem: "prob", solution: "sol", terminal: "term" }[badge.type] ?? badge.type}: {badge.label}
            </span>
          ))}
        </div>
      )}
      <div className="chat-input-meta">
        <ModelSelector
          models={models}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          onConfigure={onConfigureModels}
          compact
        />
        <div className="mode-selector" role="radiogroup" aria-label="Mode">
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-chip${m === mode ? " mode-chip--active" : ""}${isSessionActive ? " mode-chip--locked" : ""}`}
              onClick={() => { if (!isSessionActive) onModeChange(m); }}
              role="radio"
              aria-checked={m === mode}
              disabled={isSessionActive}
              title={isSessionActive ? "Mode is controlled by the session" : MODE_LABELS[m]}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}
