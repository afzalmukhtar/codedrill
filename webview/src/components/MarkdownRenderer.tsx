import React, { useEffect, useRef, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import csharp from "highlight.js/lib/languages/csharp";
import sql from "highlight.js/lib/languages/sql";
import bash from "highlight.js/lib/languages/bash";
import jsonLang from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";

hljs.registerLanguage("python", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c", cpp);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("cs", csharp);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("json", jsonLang);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);

function highlight(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch { /* fall through */ }
  }
  try {
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string | undefined }) {
      const displayLang = lang || "text";
      const highlighted = highlight(text, displayLang);
      const dataCode = escapeHtml(text);
      return `<div class="codeblock"><div class="codeblock-header"><span class="codeblock-lang">${displayLang}</span><button class="codeblock-copy" data-code="${dataCode}" title="Copy code">Copy</button></div><pre class="codeblock-pre"><code class="language-${displayLang}">${highlighted}</code></pre></div>`;
    },
  },
});

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    try {
      const result = marked.parse(content);
      const raw = typeof result === "string" ? result : String(content);
      return DOMPurify.sanitize(raw, {
        ADD_TAGS: ["code", "pre", "div", "span", "button"],
        ADD_ATTR: ["class", "data-code", "title", "nonce"],
      });
    } catch {
      return DOMPurify.sanitize(escapeHtml(content));
    }
  }, [content]);

  useEffect(() => {
    if (!containerRef.current) return;

    const buttons = containerRef.current.querySelectorAll<HTMLButtonElement>(".codeblock-copy");
    const handlers: Array<[HTMLButtonElement, () => void]> = [];

    for (const btn of buttons) {
      const raw = btn.getAttribute("data-code");
      if (!raw) continue;
      const code = raw
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');

      const handler = () => {
        navigator.clipboard.writeText(code).then(() => {
          btn.textContent = "Copied";
          setTimeout(() => { btn.textContent = "Copy"; }, 2000);
        });
      };
      btn.addEventListener("click", handler);
      handlers.push([btn, handler]);
    }

    return () => {
      for (const [btn, handler] of handlers) {
        btn.removeEventListener("click", handler);
      }
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
