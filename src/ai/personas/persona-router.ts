/**
 * Persona Router
 *
 * Routes user messages to the appropriate AI persona based on
 * the current session state (timer active, gave up, etc.).
 *
 * Routing Rules:
 * - Timer running + user asks for hint -> Interviewer
 * - Timer expired + user still trying -> Interviewer (escalated)
 * - User gives up -> Teacher
 * - User explicitly requests explanation -> Teacher
 * - Between sessions -> Teacher (for review/discussion)
 */

import * as vscode from "vscode";
import { AgentPersona } from "./agent";
import { InterviewerPersona } from "./interviewer";
import type { PromptContext } from "./prompt-loader";
import { TeacherPersona } from "./teacher";

export type PersonaMode = "agent" | "teach" | "interview";

export class PersonaRouter {
  private readonly agent: AgentPersona;
  private readonly interviewer: InterviewerPersona;
  private readonly teacher: TeacherPersona;

  constructor(extensionUri: vscode.Uri) {
    this.agent = new AgentPersona(extensionUri);
    this.interviewer = new InterviewerPersona(extensionUri);
    this.teacher = new TeacherPersona(extensionUri);
  }

  async getPromptForMode(mode: string, context: PromptContext = {}): Promise<string> {
    switch (mode) {
      case "teach":
        return this.teacher.buildSystemPrompt(context);
      case "interview":
        return this.interviewer.buildSystemPrompt(context);
      case "agent":
      default:
        return this.agent.buildSystemPrompt(context);
    }
  }

  getActivePersona(mode: string): PersonaMode {
    switch (mode) {
      case "teach":
        return "teach";
      case "interview":
        return "interview";
      case "agent":
      default:
        return "agent";
    }
  }
}
