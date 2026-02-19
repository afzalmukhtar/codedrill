import * as vscode from "vscode";
import type { LLMRouter } from "../ai/llm-router";

export interface GeneratedTestCase {
  input: string;
  expected_output: string;
  description: string;
}

interface TestGenInput {
  problemDescription: string;
  constraints: string;
  examples: string;
  functionSignature: string;
}

/**
 * Call the LLM with the test-generator prompt and return parsed test cases.
 * Falls back to an empty array if the LLM call fails or returns unparseable output.
 */
export async function generateTestCases(
  extensionUri: vscode.Uri,
  router: LLMRouter,
  model: string,
  input: TestGenInput,
  signal?: AbortSignal,
): Promise<GeneratedTestCase[]> {
  const templateUri = vscode.Uri.joinPath(extensionUri, "dist", "prompts", "test-generator.md");
  let template: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(templateUri);
    template = new TextDecoder("utf-8").decode(bytes);
  } catch {
    console.warn("[TestGenerator] Could not load test-generator.md template");
    return [];
  }

  const systemPrompt = template
    .replace("{{PROBLEM_DESCRIPTION}}", input.problemDescription)
    .replace("{{CONSTRAINTS}}", input.constraints)
    .replace("{{EXAMPLES}}", input.examples)
    .replace("{{FUNCTION_SIGNATURE}}", input.functionSignature);

  let raw = "";
  try {
    const stream = router.chat({
      model,
      messages: [{ role: "user", content: "Generate the test cases now." }],
      systemPrompt,
      temperature: 0.2,
      maxTokens: 4096,
      stream: true,
      signal,
    });

    for await (const chunk of stream) {
      if (chunk.type === "content" && chunk.content) {
        raw += chunk.content;
      } else if (chunk.type === "error") {
        console.warn("[TestGenerator] LLM error:", chunk.error);
        return [];
      }
    }
  } catch (err) {
    console.warn("[TestGenerator] LLM call failed:", err);
    return [];
  }

  return parseTestCaseJson(raw);
}

/**
 * Extract a JSON array of test cases from raw LLM output.
 * Tolerant of markdown fences and surrounding text.
 */
function parseTestCaseJson(raw: string): GeneratedTestCase[] {
  let cleaned = raw.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const bracketStart = cleaned.indexOf("[");
  const bracketEnd = cleaned.lastIndexOf("]");
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    cleaned = cleaned.slice(bracketStart, bracketEnd + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) { return []; }
    return parsed
      .filter(
        (tc: unknown): tc is GeneratedTestCase =>
          typeof tc === "object" &&
          tc !== null &&
          "input" in tc &&
          "expected_output" in tc,
      )
      .map((tc) => ({
        input: String(tc.input),
        expected_output: String(tc.expected_output),
        description: String(tc.description ?? ""),
      }));
  } catch {
    console.warn("[TestGenerator] Failed to parse LLM output as JSON");
    return [];
  }
}

/**
 * Extract problem metadata from a markdown problem description
 * to feed into the test generator prompt.
 */
export function extractTestGenInput(
  problemMd: string,
  codeStub?: string | null,
): TestGenInput {
  const constraintsMatch = problemMd.match(
    /##\s*Constraints\s*\n([\s\S]*?)(?=\n##|\n---|\Z)/i,
  );
  const examplesMatch = problemMd.match(
    /##\s*Examples?\s*\n([\s\S]*?)(?=\n##\s*Constraints|\n---|\Z)/i,
  );

  return {
    problemDescription: problemMd,
    constraints: constraintsMatch?.[1]?.trim() ?? "See problem statement.",
    examples: examplesMatch?.[1]?.trim() ?? "See problem statement.",
    functionSignature: codeStub ?? "class Solution: ...",
  };
}
