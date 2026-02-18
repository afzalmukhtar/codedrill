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

export interface MentionSuggestion {
  type: Mention["type"];
  label: string;
  insertText: string;
  description: string;
}

const MENTION_TYPES = [
  "file",
  "selection",
  "symbol",
  "problem",
  "solution",
  "terminal",
] as const;

const MENTION_SUGGESTIONS: MentionSuggestion[] = [
  { type: "file", label: "file", insertText: "@file:", description: "Reference a file by path" },
  { type: "selection", label: "selection", insertText: "@selection", description: "Current editor selection" },
  { type: "symbol", label: "symbol", insertText: "@symbol:", description: "Workspace symbol (function, class, etc.)" },
  { type: "problem", label: "problem", insertText: "@problem", description: "Current problem statement" },
  { type: "solution", label: "solution", insertText: "@solution", description: "Current solution code" },
  { type: "terminal", label: "terminal", insertText: "@terminal", description: "Recent terminal output" },
];

/** Regex for @file:path - path is non-whitespace */
const FILE_RE = /@file:(\S+)/g;
/** Regex for @selection - exact match */
const SELECTION_RE = /@selection\b/g;
/** Regex for @symbol:identifier - identifier is non-whitespace */
const SYMBOL_RE = /@symbol:(\S+)/g;
/** Regex for @problem - exact match */
const PROBLEM_RE = /@problem\b/g;
/** Regex for @solution - exact match */
const SOLUTION_RE = /@solution\b/g;
/** Regex for @terminal - exact match */
const TERMINAL_RE = /@terminal\b/g;

function* matchAll(
  re: RegExp,
  input: string,
  type: Mention["type"],
  valueIndex?: number
): Generator<Mention> {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const regex = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = regex.exec(input)) !== null) {
    const raw = m[0];
    const value = valueIndex !== undefined && m[valueIndex] ? m[valueIndex] : undefined;
    yield {
      type,
      value,
      raw,
      startIndex: m.index,
      endIndex: m.index + raw.length,
    };
  }
}

function displayForm(mention: Mention): string {
  switch (mention.type) {
    case "file":
      return `[file: ${mention.value ?? ""}]`;
    case "selection":
      return "[selection]";
    case "symbol":
      return `[symbol: ${mention.value ?? ""}]`;
    case "problem":
      return "[problem]";
    case "solution":
      return "[solution]";
    case "terminal":
      return "[terminal]";
    default:
      return `[${mention.type}]`;
  }
}

export class MentionParser {
  /**
   * Parse input text for all @-mention patterns.
   * Returns cleaned text (mentions replaced with display form) and
   * the array of Mention objects with positions in the ORIGINAL input.
   */
  parse(input: string): { text: string; mentions: Mention[] } {
    const mentions: Mention[] = [];

    mentions.push(...matchAll(FILE_RE, input, "file", 1));
    mentions.push(...matchAll(SELECTION_RE, input, "selection"));
    mentions.push(...matchAll(SYMBOL_RE, input, "symbol", 1));
    mentions.push(...matchAll(PROBLEM_RE, input, "problem"));
    mentions.push(...matchAll(SOLUTION_RE, input, "solution"));
    mentions.push(...matchAll(TERMINAL_RE, input, "terminal"));

    // Sort by start index so we can replace in order
    mentions.sort((a, b) => a.startIndex - b.startIndex);

    // Build cleaned text by replacing mentions with display form
    let text = input;
    // Replace from end to start to preserve indices
    for (let i = mentions.length - 1; i >= 0; i--) {
      const m = mentions[i];
      text =
        text.slice(0, m.startIndex) + displayForm(m) + text.slice(m.endIndex);
    }

    return { text, mentions };
  }

  /**
   * Get suggestions for the current cursor position.
   * Returns suggestions if the user is typing a mention (e.g. @ or @fi).
   */
  getSuggestions(partial: string, cursorPos: number): MentionSuggestion[] {
    // Find the last @ before cursor with no space between
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (partial[i] === " ") break;
      if (partial[i] === "@") {
        atIndex = i;
        break;
      }
    }
    if (atIndex === -1) return [];

    const prefix = partial.slice(atIndex, cursorPos);
    if (prefix === "@") {
      return [...MENTION_SUGGESTIONS];
    }

    // Filter by prefix - e.g. @fi matches @file:
    const lower = prefix.toLowerCase();
    return MENTION_SUGGESTIONS.filter((s) => {
      const insert = s.insertText.toLowerCase();
      return insert.startsWith(lower) || insert.slice(1).startsWith(lower.slice(1));
    });
  }
}
