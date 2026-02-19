import React, { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage } from "../App";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface ChatProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onRegenerate?: () => void;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [text]);

  return (
    <button
      type="button"
      className="chat-message-copy"
      onClick={handleCopy}
      title="Copy message"
      aria-label="Copy message to clipboard"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function Chat({ messages, isLoading, onRegenerate }: ChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="chat-container chat-container--empty">
        <div className="chat-welcome">
          <div className="chat-welcome-glyph">&#x25CE;</div>
          <h3>Welcome to CodeDrill</h3>
          <p>Ask a question to get started with your interview practice.</p>
        </div>
      </div>
    );
  }

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && !messages[i].isStreaming) return i;
    }
    return -1;
  })();

  return (
    <div className="chat-container" role="log" aria-live="polite" aria-busy={isLoading}>
      {messages.map((message, index) => (
        <article key={`${message.role}-${message.timestamp}-${index}`} className={`chat-message chat-message--${message.role}`}>
          {message.role === "assistant" && (
            <div className="chat-message-meta">
              <span className="chat-message-role">CodeDrill</span>
              <span className="chat-message-time">{formatTime(message.timestamp)}</span>
            </div>
          )}
          <div className="chat-message-content">
            <MarkdownRenderer content={message.content} />
            {message.isStreaming && <span className="chat-cursor">&#x258E;</span>}
            {message.interrupted && (
              <span className="chat-interrupted-label">Generation stopped</span>
            )}
          </div>
          {!message.isStreaming && (
            <div className="chat-message-actions">
              <CopyButton text={message.content} />
              {index === lastAssistantIdx && message.role === "assistant" && !isLoading && onRegenerate && (
                <button
                  type="button"
                  className="chat-message-regenerate"
                  onClick={onRegenerate}
                  title="Regenerate response"
                  aria-label="Regenerate response"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </article>
      ))}

      {isLoading && (() => {
        const lastMsg = messages[messages.length - 1];
        const isStreaming = lastMsg?.role === "assistant" && lastMsg.isStreaming;
        const isThinking = !isStreaming;

        return (
          <div className="chat-status-indicator" aria-live="polite">
            {isThinking ? (
              <article className="chat-message chat-message--assistant">
                <div className="chat-message-meta">
                  <span className="chat-message-role">CodeDrill</span>
                </div>
                <div className="chat-typing" aria-label="CodeDrill is thinking">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span className="chat-status-text">Thinking&hellip;</span>
                </div>
              </article>
            ) : (
              <div className="chat-generating-label">Generating&hellip;</div>
            )}
          </div>
        );
      })()}

      <div ref={bottomRef} />
    </div>
  );
}
