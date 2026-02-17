import * as vscode from "vscode";
import type { PromptContext } from "./prompt-loader";
import { buildPrompt, loadPromptTemplate } from "./prompt-loader";

/**
 * Agent Persona
 *
 * Default coaching persona used outside strict interview/teaching flows.
 */
export class AgentPersona {
  constructor(private readonly extensionUri: vscode.Uri) {}

  async buildSystemPrompt(context: PromptContext = {}): Promise<string> {
    const template = await loadPromptTemplate(this.extensionUri, "agent-system.md");
    return buildPrompt(template, context);
  }
}
