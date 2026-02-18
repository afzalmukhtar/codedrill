/**
 * Problem Context Provider
 *
 * Provides the current problem statement and test cases
 * for @problem mentions and as default context.
 */

import type { ContextAttachment } from "../../ai/providers/types";
import type { Problem, Example } from "../../db/schema";

function formatExamples(examples: Example[]): string {
  if (!examples?.length) return "";
  return examples
    .map((ex, i) => {
      let block = `**Example ${i + 1}:**\n\`\`\`\nInput: ${ex.input}\nOutput: ${ex.output}`;
      if (ex.explanation) block += `\nExplanation: ${ex.explanation}`;
      block += "\n```";
      return block;
    })
    .join("\n\n");
}

export class ProblemContextProvider {
  /**
   * Resolve a Problem into a ContextAttachment with formatted
   * problem statement (title, difficulty, description, examples, constraints).
   */
  resolve(problem: Problem): ContextAttachment {
    const parts: string[] = [];

    parts.push(`# ${problem.title}`);
    parts.push(`**Difficulty:** ${problem.difficulty}`);
    parts.push(`**Category:** ${problem.category}`);
    if (problem.tags?.length) {
      parts.push(`**Tags:** ${problem.tags.join(", ")}`);
    }
    parts.push("");
    parts.push("## Description");
    parts.push(problem.description);

    const examplesStr = formatExamples(problem.examples ?? []);
    if (examplesStr) {
      parts.push("");
      parts.push("## Examples");
      parts.push(examplesStr);
    }

    if (problem.constraints?.trim()) {
      parts.push("");
      parts.push("## Constraints");
      parts.push(problem.constraints);
    }

    const content = parts.join("\n");
    const tokenEstimate = Math.ceil(content.length / 4);

    return {
      type: "problem",
      label: problem.title,
      content,
      tokenEstimate,
    };
  }

  /**
   * Resolve user's solution code into a ContextAttachment.
   */
  resolveSolution(userCode: string, language: string): ContextAttachment {
    const content = `\`\`\`${language}\n${userCode}\n\`\`\``;
    const tokenEstimate = Math.ceil(content.length / 4);

    return {
      type: "solution",
      label: "Solution",
      content,
      tokenEstimate,
      metadata: { language },
    };
  }
}
