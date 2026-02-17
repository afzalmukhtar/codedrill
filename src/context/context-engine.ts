import * as vscode from "vscode";
import type { ContextAttachment } from "../ai/providers/types";
import { SelectionContextProvider } from "./context-providers/selection-provider";
import { FileContextProvider } from "./context-providers/file-provider";

const DEFAULT_MAX_TOKENS = 8000;

/**
 * Context Engine
 *
 * Gathers IDE context (active file, selection, cursor surroundings)
 * and formats it for injection into LLM system prompts.
 *
 * Priority order for truncation:
 *   selection (highest) > cursor context > active file info (lowest)
 */
export class ContextEngine {
  private readonly _maxTokens: number;
  private readonly _selectionProvider: SelectionContextProvider;
  private readonly _fileProvider: FileContextProvider;

  constructor(maxTokens: number = DEFAULT_MAX_TOKENS) {
    this._maxTokens = maxTokens;
    this._selectionProvider = new SelectionContextProvider();
    this._fileProvider = new FileContextProvider();
  }

  /**
   * Main entry point -- called on every user message.
   *
   * Accepts an optional editor so the caller can pass the last active
   * text editor (webview focus causes activeTextEditor to be undefined).
   *
   * Collects:
   * 1. Active file info (path, language, line count) + cursor context
   * 2. Selected text (if any)
   *
   * Returns attachments within the token budget.
   */
  gatherAutoContext(editor?: vscode.TextEditor): ContextAttachment[] {
    const attachments: ContextAttachment[] = [];

    const selection = this._selectionProvider.resolve(editor);
    if (selection) {
      attachments.push(selection);
    }

    const fileContext = this._fileProvider.getActiveFileContext(editor);
    if (fileContext) {
      attachments.push(fileContext);
    }

    return this.truncateToFit(attachments, this._maxTokens);
  }

  /**
   * Simple token estimation heuristic: ~4 chars per token.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Drop lowest-priority attachments until total fits within budget.
   *
   * Priority (highest kept first):
   *   1. selection
   *   2. file (cursor context)
   *
   * If a single attachment exceeds the budget it is still included
   * (the LLM provider will handle any hard limits).
   */
  truncateToFit(
    attachments: ContextAttachment[],
    budget: number,
  ): ContextAttachment[] {
    const priorityOrder: Record<string, number> = {
      selection: 2,
      file: 1,
    };

    const sorted = [...attachments].sort(
      (a, b) => (priorityOrder[b.type] ?? 0) - (priorityOrder[a.type] ?? 0),
    );

    const result: ContextAttachment[] = [];
    let usedTokens = 0;

    for (const attachment of sorted) {
      if (usedTokens + attachment.tokenEstimate <= budget) {
        result.push(attachment);
        usedTokens += attachment.tokenEstimate;
      } else if (result.length === 0) {
        result.push(attachment);
        break;
      }
    }

    return result;
  }
}
