/* Mermaid diagram rendering for VS Code markdown preview.
 * Loaded via contributes.markdown.previewScripts.
 * Dynamically loads Mermaid from CDN on first use. */

(function () {
  "use strict";

  let mermaidLoaded = false;

  function renderDiagrams() {
    const blocks = document.querySelectorAll("pre > code.language-mermaid");
    if (blocks.length === 0) return;

    if (!mermaidLoaded) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
      script.onload = function () {
        mermaidLoaded = true;
        window.mermaid.initialize({
          startOnLoad: false,
          theme: document.body.classList.contains("vscode-light") ? "default" : "dark",
        });
        convert(blocks);
      };
      document.head.appendChild(script);
    } else {
      convert(blocks);
    }
  }

  function convert(blocks) {
    blocks.forEach(function (code, i) {
      const pre = code.parentElement;
      if (!pre || pre._mermaidProcessed) return;
      pre._mermaidProcessed = true;

      const container = document.createElement("div");
      container.className = "mermaid";
      container.textContent = code.textContent;
      pre.replaceWith(container);

      window.mermaid.run({ nodes: [container] }).catch(function () {
        container.textContent = "Mermaid rendering failed";
        container.style.color = "var(--vscode-errorForeground, #f14c4c)";
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderDiagrams);
  } else {
    renderDiagrams();
  }

  var observer = new MutationObserver(function () { renderDiagrams(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();
