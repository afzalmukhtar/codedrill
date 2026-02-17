import * as vscode from "vscode";
import type { ContextAttachment } from "../../ai/providers/types";

/**
 * Selection Context Provider
 *
 * Captures the current editor selection for context injection.
 * Returns null if nothing is selected.
 */
export class SelectionContextProvider {
  /**
   * Resolve the current editor selection into a ContextAttachment.
   * Accepts an optional editor to avoid relying on activeTextEditor
   * (which may be undefined when the webview has focus).
   */
  resolve(editor?: vscode.TextEditor): ContextAttachment | null {
    const target = editor ?? vscode.window.activeTextEditor;
    if (!target) { return null; }

    const selection = target.selection;
    if (selection.isEmpty) { return null; }

    const document = target.document;
    const selectedText = document.getText(selection);

    if (!selectedText.trim()) { return null; }

    const relativePath = vscode.workspace.asRelativePath(document.uri, false);
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;

    return {
      type: "selection",
      label: `${relativePath}:L${startLine}-L${endLine}`,
      content: selectedText,
      tokenEstimate: Math.ceil(selectedText.length / 4),
      metadata: {
        filePath: relativePath,
        lineRange: { start: startLine, end: endLine },
        language: document.languageId,
      },
    };
  }

  /**
   * Check if there is a non-empty selection in the active editor.
   */
  hasActiveSelection(): boolean {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return false; }
    return !editor.selection.isEmpty;
  }
}
