/**
 * Interviewer Persona
 *
 * Socratic AI interviewer that guides users through problem-solving
 * without giving direct answers. Uses a 5-level hint escalation ladder.
 *
 * Active during: timer countdown and immediately after expiry.
 *
 * Hint Escalation Levels:
 * 1. Clarifying questions
 * 2. Pattern nudges
 * 3. Subproblem decomposition
 * 4. Pseudocode guidance
 * 5. Edge case probing
 */

import * as vscode from "vscode";
import type { PromptContext } from "./prompt-loader";
import { buildPrompt, loadPromptTemplate } from "./prompt-loader";

export class InterviewerPersona {
  constructor(private readonly extensionUri: vscode.Uri) {}

  async buildSystemPrompt(context: PromptContext = {}): Promise<string> {
    const template = await loadPromptTemplate(this.extensionUri, "interviewer-system.md");
    return buildPrompt(template, context);
  }
}
