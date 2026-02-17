import React, { useState, useRef, useCallback } from "react";
import { ModelSelector } from "./ModelSelector";
import type { ModelInfo, DrillMode } from "../App";

const MODE_LABELS: Record<DrillMode, string> = {
  agent: "Agent",
  teach: "Teach",
  interview: "Interview",
};

const MODE_ORDER: DrillMode[] = ["agent", "teach", "interview"];

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  models: ModelInfo[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  onConfigureModels: () => void;
  mode: DrillMode;
  onModeChange: (mode: DrillMode) => void;
}

export function ChatInput({
  onSend,
  isLoading,
  models,
  selectedModel,
  onModelChange,
  onConfigureModels,
  mode,
  onModeChange,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!text.trim() || isLoading) return;

    onSend(text);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [isLoading, onSend, text]);

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
          placeholder="Ask CodeDrill anything..."
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
        />
        <button
          className="chat-input-send"
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || isLoading}
          title="Send message"
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
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
              className={`mode-chip${m === mode ? " mode-chip--active" : ""}`}
              onClick={() => onModeChange(m)}
              role="radio"
              aria-checked={m === mode}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}
