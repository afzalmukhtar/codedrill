import * as vscode from "vscode";
import type { ContextAttachment } from "../../ai/providers/types";

const CURSOR_CONTEXT_LINES = 15;

/**
 * File Context Provider
 *
 * Reads file contents from the workspace.
 * Also provides "active file context" which includes metadata
 * and the 30 lines surrounding the cursor (not the entire file).
 */
export class FileContextProvider {
  /**
   * Read a workspace file by path and return it as a ContextAttachment.
   * Truncates content if it exceeds the token budget.
   */
  async resolve(filePath: string, maxTokens?: number): Promise<ContextAttachment | null> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) { return null; }

      const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
      const raw = await vscode.workspace.fs.readFile(fileUri);
      let content = Buffer.from(raw).toString("utf-8");

      const tokenEstimate = Math.ceil(content.length / 4);
      if (maxTokens && tokenEstimate > maxTokens) {
        const charLimit = maxTokens * 4;
        content = content.slice(0, charLimit) + "\n\n... [truncated]";
      }

      const document = await vscode.workspace.openTextDocument(fileUri);

      return {
        type: "file",
        label: filePath,
        content,
        tokenEstimate: Math.ceil(content.length / 4),
        metadata: {
          filePath,
          language: document.languageId,
        },
      };
    } catch {
      return null;
    }
  }

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
