import React, { useEffect, useRef } from "react";
import type { ChatMessage } from "../App";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface ChatProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Chat({ messages, isLoading }: ChatProps) {
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
