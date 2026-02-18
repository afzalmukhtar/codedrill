import * as vscode from "vscode";
import type { ContextAttachment } from "../../ai/providers/types";

const CURSOR_CONTEXT_LINES = 15;

/**
 * File Context Provider
 *
 * Provides "active file context" which includes metadata
 * and the 30 lines surrounding the cursor (not the entire file).
 */
export class FileContextProvider {
  /**
   * Get context from the active editor: file metadata + the lines
   * surrounding the cursor (15 above, 15 below = 30 total).
   *
   * Accepts an optional editor to avoid relying on activeTextEditor
   * (which may be undefined when the webview has focus).
   */
  getActiveFileContext(editor?: vscode.TextEditor): ContextAttachment | null {
    const target = editor ?? vscode.window.activeTextEditor;
    if (!target) { return null; }

    const document = target.document;
    const relativePath = vscode.workspace.asRelativePath(document.uri, false);
    const language = document.languageId;
    const lineCount = document.lineCount;

    if (lineCount === 0) {
      const header = `[${relativePath}] (${language}, empty file)`;
      return {
        type: "file",
        label: relativePath,
        content: header,
        tokenEstimate: Math.ceil(header.length / 4),
        metadata: { filePath: relativePath, language },
      };
    }

    const cursorLine = target.selection.active.line;
    const startLine = Math.max(0, cursorLine - CURSOR_CONTEXT_LINES);
    const endLine = Math.min(lineCount - 1, cursorLine + CURSOR_CONTEXT_LINES);

    const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
    const cursorContext = document.getText(range);

    const header = `[${relativePath}] (${language}, ${lineCount} lines, cursor at line ${cursorLine + 1})`;
    const content = `${header}\n${cursorContext}`;

    return {
      type: "file",
      label: relativePath,
      content,
      tokenEstimate: Math.ceil(content.length / 4),
      metadata: {
        filePath: relativePath,
        lineRange: { start: startLine + 1, end: endLine + 1 },
        language,
      },
    };
  }
}
