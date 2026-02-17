/**
 * Teacher Persona
 *
 * Full pedagogical explanation mode that provides structured,
 * step-by-step teaching when the user gives up or requests help.
 *
 * Active after: user gives up or explicitly requests explanation.
 *
 * Teaching Flow:
 * 1. Problem restatement
 * 2. Brute force approach
 * 3. Intuition building
 * 4. Optimal approach
 * 5. Dry run / trace
 * 6. Base case to general case (recursive/DP)
 * 7. Annotated code walkthrough
 * 8. Complexity analysis
 * 9. Pattern recognition
 * 10. Related problems
 */

import * as vscode from "vscode";
import type { PromptContext } from "./prompt-loader";
import { buildPrompt, loadPromptTemplate } from "./prompt-loader";

export class TeacherPersona {
  constructor(private readonly extensionUri: vscode.Uri) {}

  async buildSystemPrompt(context: PromptContext = {}): Promise<string> {
    const template = await loadPromptTemplate(this.extensionUri, "teacher-system.md");
    return buildPrompt(template, context);
  }
}
