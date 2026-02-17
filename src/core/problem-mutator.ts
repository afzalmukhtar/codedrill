import * as vscode from "vscode";
import type { Problem, Attempt } from "../db/schema";
import type { LLMRouter } from "../ai/llm-router";
import { buildPrompt, loadPromptTemplate, type PromptContext } from "../ai/personas/prompt-loader";

export enum MutationStrategy {
  ConstraintChange = "Constraint Change",
  InputTypeChange = "Input Type Change",
  Inversion = "Inversion",
  FollowUp = "Follow-up Extension",
  Combination = "Combination",
}

const ALL_STRATEGIES = Object.values(MutationStrategy);
const MUTATION_THRESHOLD = 3;

/**
 * Problem Mutator
 *
 * Uses an LLM to generate variations of problems for repeat attempts (3+).
 * Forces the user to learn the underlying pattern rather than memorizing
 * a specific solution.
 */
export class ProblemMutator {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  /**
   * Returns true if the attempt count meets the mutation threshold.
   */
  shouldMutate(attemptCount: number): boolean {
    return attemptCount >= MUTATION_THRESHOLD;
  }

  /**
   * Pick a mutation strategy based on what hasn't been tried recently.
   * Cycles through strategies so the student sees variety.
   */
  selectStrategy(attemptCount: number, previousAttempts: Attempt[]): MutationStrategy {
    const mutatedAttempts = previousAttempts.filter((a) => a.wasMutation && a.mutationDesc);
    const usedStrategies = new Set(mutatedAttempts.map((a) => a.mutationDesc));

    for (const strategy of ALL_STRATEGIES) {
      if (!usedStrategies.has(strategy)) {
        return strategy;
      }
    }

    // All strategies used; cycle based on attempt count
    const idx = (attemptCount - MUTATION_THRESHOLD) % ALL_STRATEGIES.length;
    return ALL_STRATEGIES[idx];
  }

  /**
   * Generate a mutated problem statement via LLM.
   */
  async generateMutation(
    problem: Problem,
    previousAttempts: Attempt[],
    router: LLMRouter,
    model: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const attemptCount = previousAttempts.length;
    const strategy = this.selectStrategy(attemptCount, previousAttempts);

    const promptContext: PromptContext = {
      problemStatement: problem.description || problem.title,
      attemptNumber: attemptCount,
    };

    let template: string;
    try {
      template = await loadPromptTemplate(this._extensionUri, "mutator-system.md");
    } catch {
      console.error("[ProblemMutator] Could not load mutator prompt template");
      return null;
    }

    // The mutator template uses custom placeholders beyond standard PromptContext
    let systemPrompt = buildPrompt(template, promptContext);
    systemPrompt = systemPrompt.replaceAll("{{MUTATION_STRATEGY}}", strategy);

    const userMessage = [
      `Mutate the problem "${problem.title}" using the "${strategy}" strategy.`,
      `This is the student's attempt #${attemptCount + 1}.`,
      `Difficulty: ${problem.difficulty}`,
      `Category: ${problem.category}`,
    ].join("\n");

    const chunks: string[] = [];

    try {
      for await (const chunk of router.chat({
        model,
        messages: [{ role: "user", content: userMessage }],
        systemPrompt,
        temperature: 0.8,
        stream: true,
      })) {
        if (signal?.aborted) { return null; }

        if (chunk.type === "content" && chunk.content) {
          chunks.push(chunk.content);
        } else if (chunk.type === "error") {
          console.error("[ProblemMutator] LLM error:", chunk.error);
          return null;
        }
      }
    } catch (err) {
      console.error("[ProblemMutator] Generation failed:", err);
      return null;
    }

    const result = chunks.join("").trim();
    return result || null;
  }
}
