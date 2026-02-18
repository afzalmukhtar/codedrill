/**
 * Persona Router
 *
 * Routes user messages to the appropriate AI persona.
 *
 * Hard override rules (cannot be bypassed by user mode selection):
 * - Timer running -> Interviewer (ALWAYS, no exceptions)
 * - User gave up  -> Teacher    (ALWAYS, no exceptions)
 * - Otherwise     -> user's selected mode (Interview or Teach)
 */

import * as vscode from "vscode";
import { InterviewerPersona } from "./interviewer";
import type { PromptContext } from "./prompt-loader";
import { TeacherPersona } from "./teacher";

export interface SessionState {
  isActive: boolean;
  timerRunning: boolean;
  gaveUp: boolean;
}

export class PersonaRouter {
  private readonly interviewer: InterviewerPersona;
  private readonly teacher: TeacherPersona;

  constructor(extensionUri: vscode.Uri) {
    this.interviewer = new InterviewerPersona(extensionUri);
    this.teacher = new TeacherPersona(extensionUri);
  }

  /**
   * Resolve the effective persona and return the system prompt.
   *
   * Timer running is the ABSOLUTE override -- even if the user somehow
   * selects a different mode, the LLM always gets the interviewer prompt
   * while the clock is ticking.
   */
  async getPromptForMode(
    mode: string,
    context: PromptContext = {},
    sessionState?: SessionState,
  ): Promise<string> {
    const effectiveMode = this._resolveMode(mode, sessionState);

    switch (effectiveMode) {
      case "teach":
        return this.teacher.buildSystemPrompt(context);
      case "interview":
      default:
        return this.interviewer.buildSystemPrompt(context);
    }
  }

  /**
   * Hard override logic. Timer running and gaveUp take absolute precedence.
   */
  private _resolveMode(selectedMode: string, sessionState?: SessionState): string {
    // Gave up overrides everything -- teacher must explain
    if (sessionState?.gaveUp) {
      return "teach";
    }

    // Timer running overrides everything -- interviewer only
    if (sessionState?.timerRunning) {
      return "interview";
    }

    // No active constraints -- respect user selection
    return selectedMode === "teach" ? "teach" : "interview";
  }
}
