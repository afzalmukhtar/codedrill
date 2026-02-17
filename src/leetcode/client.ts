import { LeetCode } from "leetcode-query";

const RATE_LIMIT_MS = 500;

export interface LeetCodeProblem {
  questionId: string;
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  content: string;
  difficulty: string;
  topicTags: Array<{ name: string; slug: string }>;
  hints: string[];
  exampleTestcases: string;
  codeSnippets: Array<{ lang: string; langSlug: string; code: string }>;
  sampleTestCase: string;
}

/**
 * LeetCode GraphQL Client
 *
 * Fetches problem details from LeetCode using the leetcode-query
 * npm package. No authentication needed for public problems.
 */
export class LeetCodeClient {
  private _lc: LeetCode;
  private _lastFetchTime = 0;

  constructor() {
    this._lc = new LeetCode();
  }

  /**
   * Fetch full problem details by slug.
   * Includes title, description HTML, difficulty, tags, hints, code snippets.
   */
  async fetchProblem(slug: string): Promise<LeetCodeProblem | null> {
    await this._rateLimit();
    try {
      const raw = await this._lc.problem(slug);
      if (!raw) { return null; }
      return {
        questionId: raw.questionId ?? "",
        questionFrontendId: raw.questionFrontendId ?? "",
        title: raw.title ?? slug,
        titleSlug: raw.titleSlug ?? slug,
        content: raw.content ?? "",
        difficulty: raw.difficulty ?? "Medium",
        topicTags: (raw.topicTags ?? []).map((t) => ({ name: t.name, slug: t.slug })),
        hints: raw.hints ?? [],
        exampleTestcases: raw.exampleTestcases ?? "",
        codeSnippets: (raw.codeSnippets ?? []).map((s) => ({
          lang: s.lang,
          langSlug: s.langSlug,
          code: s.code,
        })),
        sampleTestCase: raw.sampleTestCase ?? "",
      };
    } catch (err) {
      console.error(`[LeetCodeClient] Failed to fetch problem "${slug}":`, err);
      return null;
    }
  }

  private async _rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this._lastFetchTime;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }
    this._lastFetchTime = Date.now();
  }
}
