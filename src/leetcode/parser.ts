import type { LeetCodeProblem } from "./client";
import type { Problem, Example } from "../db/schema";

/**
 * Problem Statement Parser
 *
 * Converts raw LeetCode API responses into our internal Problem format.
 * Handles HTML-to-Markdown conversion, example extraction, and
 * constraint parsing.
 */
export class ProblemParser {
  /**
   * Convert a raw LeetCode problem into our Problem schema.
   */
  parse(raw: LeetCodeProblem, sourceList?: string): Omit<Problem, "id" | "fetchedAt"> {
    const markdown = this.htmlToMarkdown(raw.content);
    const examples = this.extractExamples(markdown);
    const constraints = this.extractConstraints(markdown);
    const difficulty = this._normalizeDifficulty(raw.difficulty);

    return {
      slug: raw.titleSlug,
      title: raw.title,
      difficulty,
      category: raw.topicTags.length > 0 ? raw.topicTags[0].name : "Uncategorized",
      tags: raw.topicTags.map((t) => t.name),
      description: markdown,
      examples,
      constraints,
      testCases: raw.exampleTestcases
        ? raw.exampleTestcases.split("\n").filter(Boolean).map((tc) => ({
            input: tc,
            expectedOutput: "",
          }))
        : [],
      hints: raw.hints ?? [],
      solutionCode: null,
      codeStub: this.extractCodeStub(raw.codeSnippets, "python3"),
      sourceList: sourceList ?? "",
      leetcodeId: raw.questionFrontendId ? parseInt(raw.questionFrontendId, 10) : null,
      pattern: raw.topicTags.length > 0 ? raw.topicTags[0].name : null,
      companies: [],
    };
  }

  /**
   * Convert LeetCode's HTML description to clean Markdown.
   * Handles the limited set of HTML tags LeetCode uses.
   */
  htmlToMarkdown(html: string): string {
    if (!html) { return ""; }

    let md = html;

    // Block-level elements first
    md = md.replace(/<\/p>/gi, "\n\n");
    md = md.replace(/<p[^>]*>/gi, "");
    md = md.replace(/<br\s*\/?>/gi, "\n");
    md = md.replace(/<hr\s*\/?>/gi, "\n---\n");

    // Headers
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n");
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n");
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n");

    // Lists
    md = md.replace(/<ul[^>]*>/gi, "");
    md = md.replace(/<\/ul>/gi, "\n");
    md = md.replace(/<ol[^>]*>/gi, "");
    md = md.replace(/<\/ol>/gi, "\n");
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");

    // Code blocks and inline code
    md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, content) => {
      const cleaned = content.replace(/<[^>]+>/g, "").trim();
      return "\n```\n" + cleaned + "\n```\n";
    });
    md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");

    // Formatting
    md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
    md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
    md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
    md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
    md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, "$1");

    // Images (used for diagrams in some problems)
    md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");

    // Superscript (e.g., 10^4)
    md = md.replace(/<sup[^>]*>(.*?)<\/sup>/gi, "^$1");
    md = md.replace(/<sub[^>]*>(.*?)<\/sub>/gi, "_$1");

    // Strip remaining tags
    md = md.replace(/<[^>]+>/g, "");

    // Decode HTML entities
    md = md.replace(/&lt;/g, "<");
    md = md.replace(/&gt;/g, ">");
    md = md.replace(/&amp;/g, "&");
    md = md.replace(/&quot;/g, '"');
    md = md.replace(/&#39;/g, "'");
    md = md.replace(/&nbsp;/g, " ");
    md = md.replace(/&le;/g, "<=");
    md = md.replace(/&ge;/g, ">=");

    // Clean up whitespace
    md = md.replace(/\n{3,}/g, "\n\n");
    md = md.trim();

    return md;
  }

  /**
   * Extract Example blocks from the markdown description.
   */
  extractExamples(markdown: string): Example[] {
    const examples: Example[] = [];
    const pattern = /\*\*Example\s*\d+\s*:?\*\*([\s\S]*?)(?=\*\*Example|\*\*Constraints|$)/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(markdown)) !== null) {
      const block = match[1].trim();
      const input = this._extractField(block, "Input");
      const output = this._extractField(block, "Output");
      const explanation = this._extractField(block, "Explanation");

      if (input || output) {
        examples.push({
          input: input || "",
          output: output || "",
          ...(explanation ? { explanation } : {}),
        });
      }
    }

    return examples;
  }

  /**
   * Extract the Constraints section from the markdown description.
   */
  extractConstraints(markdown: string): string {
    const match = markdown.match(/\*\*Constraints\s*:?\*\*([\s\S]*?)(?=\n\n##|\n\n\*\*Follow|$)/i);
    if (!match) { return ""; }
    return match[1].trim();
  }

  private _extractField(block: string, field: string): string {
    const pattern = new RegExp(`\\*\\*${field}\\s*:?\\*\\*\\s*(.+?)(?=\\*\\*|$)`, "is");
    const match = pattern.exec(block);
    if (!match) { return ""; }
    return match[1].trim();
  }

  extractCodeStub(
    codeSnippets: Array<{ lang: string; langSlug: string; code: string }>,
    langSlug: string,
  ): string | null {
    const snippet = codeSnippets.find((s) => s.langSlug === langSlug);
    return snippet?.code ?? null;
  }

  private _normalizeDifficulty(raw: string): "Easy" | "Medium" | "Hard" {
    const lower = raw.toLowerCase();
    if (lower === "easy") { return "Easy"; }
    if (lower === "hard") { return "Hard"; }
    return "Medium";
  }
}
