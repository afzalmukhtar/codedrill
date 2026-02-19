import React, { useState, useRef, useCallback, useEffect } from "react";
import { ModelSelector } from "./ModelSelector";
import type { ModelInfo, DrillMode, ContextBadge } from "../App";
import { IconSend, IconStop } from "./Icons";

const MODE_LABELS: Record<DrillMode, string> = {
  teach: "Teach",
  interview: "Interview",
};

const MODE_ORDER: DrillMode[] = ["interview", "teach"];

interface MentionSuggestion {
  type: string;
  label: string;
  insertText: string;
  description: string;
}

const MENTION_SUGGESTIONS: MentionSuggestion[] = [
  { type: "file", label: "file", insertText: "@file:", description: "Reference a file by path" },
  { type: "selection", label: "selection", insertText: "@selection", description: "Current editor selection" },
  { type: "symbol", label: "symbol", insertText: "@symbol:", description: "Workspace symbol" },
  { type: "problem", label: "problem", insertText: "@problem", description: "Current problem statement" },
  { type: "solution", label: "solution", insertText: "@solution", description: "Current solution code" },
  { type: "terminal", label: "terminal", insertText: "@terminal", description: "Recent terminal output" },
  { type: "resume", label: "resume", insertText: "@resume ", description: "Paste resume text after this" },
];

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
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);
  const [mentionAtIndex, setMentionAtIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const closeSuggestions = useCallback(() => {
    setSuggestions([]);
    setSelectedSuggestionIdx(0);
    setMentionAtIndex(-1);
  }, []);

  const insertMention = useCallback((suggestion: MentionSuggestion) => {
    if (mentionAtIndex < 0) return;
    const cursorPos = textareaRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, mentionAtIndex);
    const after = text.slice(cursorPos);
    const inserted = suggestion.insertText;
    const newText = before + inserted + (inserted.endsWith(":") ? "" : " ") + after;
    setText(newText);
    closeSuggestions();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        const pos = mentionAtIndex + inserted.length + (inserted.endsWith(":") ? 0 : 1);
        el.selectionStart = pos;
        el.selectionEnd = pos;
        el.focus();
      }
    });
  }, [mentionAtIndex, text, closeSuggestions]);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;

    if (isLoading) {
      onInterrupt();
    }

    onSend(text);
    setText("");
    closeSuggestions();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [isLoading, onInterrupt, onSend, text, closeSuggestions]);

  const handleStop = useCallback(() => {
    onInterrupt();
  }, [onInterrupt]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (suggestions.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedSuggestionIdx((i) => (i + 1) % suggestions.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedSuggestionIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (event.key === "Tab" || event.key === "Enter") {
          event.preventDefault();
          insertMention(suggestions[selectedSuggestionIdx]);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeSuggestions();
          return;
        }
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend, suggestions, selectedSuggestionIdx, insertMention, closeSuggestions]
  );

  const updateSuggestions = useCallback((value: string, cursorPos: number) => {
    let atIdx = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (value[i] === " " || value[i] === "\n") break;
      if (value[i] === "@") { atIdx = i; break; }
    }
    if (atIdx === -1) { closeSuggestions(); return; }

    const prefix = value.slice(atIdx, cursorPos).toLowerCase();
    const filtered = prefix === "@"
      ? MENTION_SUGGESTIONS
      : MENTION_SUGGESTIONS.filter((s) =>
          s.insertText.toLowerCase().startsWith(prefix)
        );

    if (filtered.length > 0) {
      setSuggestions(filtered);
      setSelectedSuggestionIdx(0);
      setMentionAtIndex(atIdx);
    } else {
      closeSuggestions();
    }
  }, [closeSuggestions]);

  const handleInput = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setText(value);
    const textarea = event.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    updateSuggestions(value, textarea.selectionStart);
  }, [updateSuggestions]);

  useEffect(() => {
    if (suggestions.length === 0) return;
    const handleClickOutside = () => closeSuggestions();
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [suggestions.length, closeSuggestions]);

  return (
    <footer className="chat-input-container">
      <div className="chat-input-wrapper">
        {suggestions.length > 0 && (
          <ul className="mention-suggestions" role="listbox" aria-label="Mention suggestions">
            {suggestions.map((s, i) => (
              <li
                key={s.type}
                role="option"
                aria-selected={i === selectedSuggestionIdx}
                className={`mention-suggestion${i === selectedSuggestionIdx ? " mention-suggestion--active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); insertMention(s); }}
                onMouseEnter={() => setSelectedSuggestionIdx(i)}
              >
                <span className="mention-suggestion-label">@{s.label}</span>
                <span className="mention-suggestion-desc">{s.description}</span>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          placeholder={isLoading ? "Type to interrupt..." : "Ask CodeDrill anything... (type @ for mentions)"}
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
            <IconStop size={14} />
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
            <IconSend size={16} />
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
