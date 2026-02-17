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
   * Collects:
   * 1. Active file info (path, language, line count) + cursor context
   * 2. Selected text (if any)
   *
   * Returns attachments within the token budget.
   */
  gatherAutoContext(): ContextAttachment[] {
    const attachments: ContextAttachment[] = [];

    const selection = this._selectionProvider.resolve();
    if (selection) {
      attachments.push(selection);
    }

    const fileContext = this._fileProvider.getActiveFileContext();
    if (fileContext) {
      attachments.push(fileContext);
    }

    return this.truncateToFit(attachments, this._maxTokens);
  }

  /**
   * Format context attachments into an XML-style block for injection
   * into the system prompt.
   *
   * Returns an empty string if there are no attachments.
   */
  formatContextForPrompt(attachments: ContextAttachment[]): string {
    if (attachments.length === 0) { return ""; }

    const blocks: string[] = [];

    const fileAttachment = attachments.find(
      (a) => a.type === "file" && a.metadata?.filePath,
    );
    const selectionAttachment = attachments.find(
      (a) => a.type === "selection",
    );

    if (fileAttachment) {
      const path = fileAttachment.metadata?.filePath ?? "unknown";
      const lang = fileAttachment.metadata?.language ?? "unknown";
      blocks.push(
        `<active_file path="${path}" language="${lang}">\n${fileAttachment.content}\n</active_file>`,
      );
    }

    if (selectionAttachment) {
      const range = selectionAttachment.metadata?.lineRange;
      const rangeStr = range ? ` lines="${range.start}-${range.end}"` : "";
      blocks.push(
        `<selected_code${rangeStr}>\n${selectionAttachment.content}\n</selected_code>`,
      );
    }

    return "\n\n--- IDE Context ---\n" + blocks.join("\n\n");
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
