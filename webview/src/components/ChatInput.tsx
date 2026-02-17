import React, { useState, useRef, useCallback } from "react";
import { ModelSelector } from "./ModelSelector";
import type { ModelInfo } from "../App";

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  models: ModelInfo[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

export function ChatInput({
  onSend,
  isLoading,
  models,
  selectedModel,
  onModelChange,
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
        <button className="chat-chip chat-chip--button" type="button" title="Add context">
          +
        </button>
        <ModelSelector
          models={models}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          compact
        />
        <span className="chat-chip">Extra High</span>
        <span className="chat-chip">IDE context</span>
      </div>
    </footer>
  );
}
