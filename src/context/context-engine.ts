/**
 * Context Engine
 *
 * Gathers IDE context and injects it into LLM calls.
 * Supports both default (auto-included) context and
 * selective @-mention context from the chat input.
 *
 * Default context (auto-included unless disabled):
 * - Current problem statement and test cases
 * - User's solution code (current editor contents)
 * - Attempt number and previous ratings
 *
 * Selective context (@-mentions):
 * - @file -- workspace file contents
 * - @selection -- current editor selection
 * - @symbol -- function/class by symbol search
 * - @problem -- current problem statement
 * - @solution -- current solution code
 * - @terminal -- recent terminal output
 */

// import { ContextAttachment } from "../ai/providers/types";
// import { MentionParser, Mention } from "./mention-parser";

export class ContextEngine {
  // TODO: constructor(maxTokens: number)
  // TODO: resolveDefaultContext(session): Promise<ContextAttachment[]>
  // TODO: resolveMentions(mentions: Mention[]): Promise<ContextAttachment[]>
  // TODO: buildContextMessages(attachments: ContextAttachment[]): ChatMessage[]
  // TODO: estimateTokens(text: string): number
  // TODO: truncateToFit(attachments: ContextAttachment[], budget: number): ContextAttachment[]
}
