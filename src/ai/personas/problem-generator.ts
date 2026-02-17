import * as vscode from "vscode";
import type { PromptContext } from "./prompt-loader";
import { buildPrompt, loadPromptTemplate } from "./prompt-loader";
import type { LLMRouter } from "../llm-router";
import type { ProblemEntry } from "../../core/problem-bank";

/**
 * Problem Generator Persona
 *
 * Generates complete, self-contained problem statements in Markdown format
 * by sending a curated prompt to the configured LLM. Used by the
 * "Get Today's Problem" command.
 */
export class ProblemGeneratorPersona {
  constructor(private readonly extensionUri: vscode.Uri) {}

  /**
   * Build the system prompt for problem generation.
   */
  async buildSystemPrompt(context: PromptContext = {}): Promise<string> {
    const template = await loadPromptTemplate(this.extensionUri, "problem-generator.md");
    return buildPrompt(template, context);
  }

  /**
   * Generate a full Markdown problem file for the given entry.
   *
   * Sends the problem-generator prompt to the LLM and collects
   * the complete streamed response into a single string.
   *
   * @param entry     Problem entry from ProblemBank (slug, title, difficulty, category).
   * @param language  Preferred programming language for starter code.
   * @param router    Initialised LLM router.
   * @param model     Model ID to use for generation.
   * @param signal    Optional AbortSignal for cancellation.
   * @returns The generated Markdown content, or null on failure.
   */
  async generateProblem(
    entry: ProblemEntry,
    language: string,
    router: LLMRouter,
    model: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const promptContext: PromptContext = {
      problemTitle: entry.title,
      difficulty: entry.difficulty,
      category: entry.category,
      preferredLanguage: language,
    };

    const systemPrompt = await this.buildSystemPrompt(promptContext);

    const userMessage = [
      `Generate the coding problem "${entry.title}".`,
      `Difficulty: ${entry.difficulty}`,
      `Category: ${entry.category}`,
      `Preferred language for starter code: ${language}`,
    ].join("\n");

    const chunks: string[] = [];

    for await (const chunk of router.chat({
      model,
      messages: [{ role: "user", content: userMessage }],
      systemPrompt,
      temperature: 0.7,
      stream: true,
    })) {
      if (signal?.aborted) {
        return null;
      }

      if (chunk.type === "content" && chunk.content) {
        chunks.push(chunk.content);
      } else if (chunk.type === "error") {
        console.error("[ProblemGenerator] LLM error:", chunk.error);
        return null;
      }
    }

    const result = chunks.join("");
    return result.trim() || null;
  }
}
