import React, { useEffect, useRef } from "react";
import type { ChatMessage } from "../App";
import { CodeBlock } from "./CodeBlock";

interface ChatProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return <code key={`code-${index}`}>{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={`txt-${index}`}>{part}</React.Fragment>;
  });
}

function renderStructuredContent(content: string): React.ReactNode {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraphBuffer: string[] = [];
  let bulletBuffer: string[] = [];
  let codeBuffer: string[] | null = null;
  let codeLang = "";
  let key = 0;

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      blocks.push(
        <p key={`p-${key++}`} className="chat-paragraph">
          {renderInlineFormatting(paragraphBuffer.join(" "))}
        </p>
      );
      paragraphBuffer = [];
    }
  };

  const flushBullets = () => {
    if (bulletBuffer.length > 0) {
      blocks.push(
        <ul key={`ul-${key++}`} className="chat-list">
          {bulletBuffer.map((bullet, index) => (
            <li key={`li-${key}-${index}`}>{renderInlineFormatting(bullet)}</li>
          ))}
        </ul>
      );
      bulletBuffer = [];
    }
  };

  const flushCode = () => {
    if (codeBuffer !== null) {
      const code = codeBuffer.join("\n");
      blocks.push(
        <CodeBlock key={`cb-${key++}`} code={code} language={codeLang || undefined} />
      );
      codeBuffer = null;
      codeLang = "";
    }
  };

  for (const rawLine of lines) {
    if (codeBuffer !== null) {
      if (rawLine.trimEnd() === "```") {
        flushCode();
      } else {
        codeBuffer.push(rawLine);
      }
      continue;
    }

    if (rawLine.trimStart().startsWith("```")) {
      flushParagraph();
      flushBullets();
      codeLang = rawLine.trimStart().slice(3).trim();
      codeBuffer = [];
      continue;
    }

    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushBullets();
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      bulletBuffer.push(line.slice(2).trim());
    } else {
      flushBullets();
      paragraphBuffer.push(line);
    }
  }

  if (codeBuffer !== null) {
    const code = codeBuffer.join("\n");
    blocks.push(
      <CodeBlock key={`cb-${key++}`} code={code} language={codeLang || undefined} />
    );
  }

  flushParagraph();
  flushBullets();

  return blocks.length > 0 ? blocks : <p className="chat-paragraph">{renderInlineFormatting(content)}</p>;
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
          <div className="chat-welcome-glyph">◎</div>
          <h3>Welcome to CodeDrill</h3>
          <p>Ask a question to get started with your interview practice.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {messages.map((message, index) => (
        <article key={`${message.role}-${message.timestamp}-${index}`} className={`chat-message chat-message--${message.role}`}>
          {message.role === "assistant" && (
            <div className="chat-message-meta">
              <span className="chat-message-role">CodeDrill</span>
              <span className="chat-message-time">{formatTime(message.timestamp)}</span>
            </div>
          )}
          <div className="chat-message-content">
            {renderStructuredContent(message.content)}
            {message.isStreaming && <span className="chat-cursor">▎</span>}
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
                  <span className="chat-status-text">Thinking…</span>
                </div>
              </article>
            ) : (
              <div className="chat-generating-label">Generating…</div>
            )}
          </div>
        );
      })()}

      <div ref={bottomRef} />
    </div>
  );
}
