/**
 * Persona Router
 *
 * Routes user messages to the appropriate AI persona based on
 * the current mode AND the live session state.
 *
 * Auto-switching rules (override user-selected mode):
 * - Timer running + active session -> Interviewer
 * - User gave up during active session -> Teacher
 * - No active session -> use selected mode
 */

import * as vscode from "vscode";
import { AgentPersona } from "./agent";
import { InterviewerPersona } from "./interviewer";
import type { PromptContext } from "./prompt-loader";
import { TeacherPersona } from "./teacher";

export interface SessionState {
  isActive: boolean;
  timerRunning: boolean;
  gaveUp: boolean;
}

export class PersonaRouter {
  private readonly agent: AgentPersona;
  private readonly interviewer: InterviewerPersona;
  private readonly teacher: TeacherPersona;

  constructor(extensionUri: vscode.Uri) {
    this.agent = new AgentPersona(extensionUri);
    this.interviewer = new InterviewerPersona(extensionUri);
    this.teacher = new TeacherPersona(extensionUri);
  }

  /**
   * Resolve the effective persona and return the system prompt.
   *
   * When a session is active, the router overrides the user-selected
   * mode to enforce the interview flow:
   *   - Timer running -> Interviewer (Socratic hints only)
   *   - User gave up -> Teacher (full explanation)
   *   - Otherwise -> selected mode
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
        return this.interviewer.buildSystemPrompt(context);
      case "agent":
      default:
        return this.agent.buildSystemPrompt(context);
    }
  }

  /**
   * Determine the effective mode after applying session-state overrides.
   */
  private _resolveMode(selectedMode: string, sessionState?: SessionState): string {
    if (!sessionState?.isActive) {
      return selectedMode;
    }

    if (sessionState.gaveUp) {
      return "teach";
    }

    if (sessionState.timerRunning) {
      return "interview";
    }

    return selectedMode;
  }
}
