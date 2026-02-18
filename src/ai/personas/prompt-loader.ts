import * as vscode from "vscode";

/**
 * Context values used to populate persona prompt templates.
 */
export interface PromptContext {
  userProfile?: string;
  filePath?: string;
  language?: string;
  fileContent?: string;
  selection?: string;
  problemStatement?: string;
  attemptNumber?: number;
  hintLevel?: number;
  timeRemaining?: string;
  previousRatings?: string;
  problemTitle?: string;
  difficulty?: string;
  category?: string;
  preferredLanguage?: string;
  date?: string;
  existingProfile?: string;
  recentMessages?: string;
}

const templateCache = new Map<string, string>();

const TEMPLATE_VARIABLES: Record<keyof PromptContext, string> = {
  userProfile: "USER_PROFILE",
  filePath: "FILE_PATH",
  language: "LANGUAGE",
  fileContent: "FILE_CONTENT",
  selection: "SELECTION",
  problemStatement: "PROBLEM_STATEMENT",
  attemptNumber: "ATTEMPT_NUMBER",
  hintLevel: "HINT_LEVEL",
  timeRemaining: "TIME_REMAINING",
  previousRatings: "PREVIOUS_RATINGS",
  problemTitle: "PROBLEM_TITLE",
  difficulty: "DIFFICULTY",
  category: "CATEGORY",
  preferredLanguage: "PREFERRED_LANGUAGE",
  date: "DATE",
  existingProfile: "EXISTING_PROFILE",
  recentMessages: "RECENT_MESSAGES",
};

/**
 * Clear the template cache. Useful during development when editing
 * prompt files -- call via the `codedrill.reloadPrompts` command.
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}

/**
 * Read a markdown prompt template from src/ai/personas/prompts and cache it.
 */
export async function loadPromptTemplate(
  extensionUri: vscode.Uri,
  filename: string,
): Promise<string> {
  const cacheKey = `${extensionUri.toString()}::${filename}`;
  const cached = templateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const uri = vscode.Uri.joinPath(extensionUri, "src", "ai", "personas", "prompts", filename);
  const bytes = await vscode.workspace.fs.readFile(uri);
  const template = new TextDecoder("utf-8").decode(bytes);

  templateCache.set(cacheKey, template);
  return template;
}

/**
 * Fill {{VARIABLE}} placeholders and remove unresolved XML-like blocks.
 */
export function buildPrompt(template: string, context: PromptContext): string {
  let output = template;

  for (const [key, variable] of Object.entries(TEMPLATE_VARIABLES) as [keyof PromptContext, string][]) {
    const value = context[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      continue;
    }
    output = output.replaceAll(`{{${variable}}}`, String(value));
  }

  // Remove XML-like blocks that still contain unresolved placeholders.
  output = output.replace(
    /<([a-zA-Z_][\w-]*)(?:\s+[^>]*)?>[\s\S]*?\{\{[A-Z0-9_]+\}\}[\s\S]*?<\/\1>/g,
    "",
  );

  // Remove any remaining unresolved placeholders.
  output = output.replace(/\{\{[A-Z0-9_]+\}\}/g, "");

  // Keep formatting readable after removals.
  output = output.replace(/\n{3,}/g, "\n\n").trim();

  return output;
}
