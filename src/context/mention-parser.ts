/**
 * Mention Parser
 *
 * Parses @-mention syntax from the chat input into structured
 * Mention objects that the ContextEngine can resolve.
 *
 * Supported mention types:
 * - @file:path/to/file.ts -- specific file
 * - @selection -- current editor selection
 * - @symbol:functionName -- symbol from workspace
 * - @problem -- current problem statement
 * - @solution -- current solution code
 * - @terminal -- recent terminal output
 */

export interface Mention {
  type: "file" | "selection" | "symbol" | "problem" | "solution" | "terminal";
  value?: string;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export class MentionParser {
  // TODO: parse(input: string): { text: string; mentions: Mention[] }
  // TODO: getSuggestions(partial: string, cursorPos: number): MentionSuggestion[]
}
