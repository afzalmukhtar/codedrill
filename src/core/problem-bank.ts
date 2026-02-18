import * as vscode from "vscode";
import type { Repository } from "../db/repository";
import type { Problem } from "../db/schema";
import type { LeetCodeClient } from "../leetcode/client";
import { ProblemParser } from "../leetcode/parser";

/**
 * Shape of a single problem entry in the bundled JSON lists.
 * Kept as a named export so the ProblemGenerator can reference it.
 */
export interface ProblemEntry {
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
}

interface BundledList {
  name: string;
  description: string;
  source: string;
  problems: ProblemEntry[];
}

/**
 * Problem Bank Manager
 *
 * Manages the collection of problems from curated lists and LeetCode.
 *
 * Initialization imports bundled lists (NeetCode 150, Blind 75) with
 * metadata only (slug, title, difficulty, category). Full problem
 * descriptions are fetched on-demand from LeetCode when a user
 * actually needs a specific problem.
 */
export class ProblemBank {
  private readonly _parser: ProblemParser;

  constructor(
    private readonly _repository: Repository,
    private readonly _leetcodeClient: LeetCodeClient,
    private readonly _extensionUri: vscode.Uri,
  ) {
    this._parser = new ProblemParser();
  }

  /**
   * Import all bundled problem lists into the database.
   * De-duplicates by slug (INSERT OR IGNORE).
   * Only stores metadata -- full descriptions are fetched on demand.
   */
  async initialize(): Promise<number> {
    const listFiles = ["neetcode150.json", "blind75.json"];
    let totalImported = 0;

    for (const file of listFiles) {
      const count = await this.importFromList(file);
      totalImported += count;
    }

    const total = this._repository.getProblemCount();
    console.log(`[ProblemBank] Initialized with ${total} problems (${totalImported} newly imported)`);
    return totalImported;
  }

  /**
   * Import a specific bundled list. Returns count of new problems added.
   */
  async importFromList(filename: string): Promise<number> {
    const listUri = vscode.Uri.joinPath(
      this._extensionUri, "src", "leetcode", "lists", filename,
    );

    let list: BundledList;
    try {
      const bytes = await vscode.workspace.fs.readFile(listUri);
      list = JSON.parse(Buffer.from(bytes).toString("utf-8")) as BundledList;
    } catch (err) {
      console.warn(`[ProblemBank] Could not load list ${filename}:`, err);
      return 0;
    }

    const listName = filename.replace(".json", "");
    let imported = 0;

    for (const entry of list.problems) {
      const existing = this._repository.getProblemBySlug(entry.slug);
      if (existing) {
        // Backfill pattern for problems imported before Sprint 7
        if (!existing.pattern && entry.category) {
          await this._repository.updateProblem(entry.slug, { pattern: entry.category });
        }
        continue;
      }

      await this._repository.insertProblem({
        slug: entry.slug,
        title: entry.title,
        difficulty: entry.difficulty,
        category: entry.category,
        tags: [],
        description: "",
        examples: [],
        constraints: "",
        testCases: [],
        hints: [],
        solutionCode: null,
        sourceList: listName,
        leetcodeId: null,
        pattern: entry.category,
      });
      imported++;
    }

    console.log(`[ProblemBank] Imported ${imported} problems from ${filename}`);
    return imported;
  }

  /**
   * Get a new (unseen) problem, optionally excluding categories and filtering by difficulty.
   * If the problem lacks a full description, fetches it from LeetCode on demand.
   */
  async getNewProblem(
    excludeCategories?: string[],
    difficulty?: string,
  ): Promise<Problem | null> {
    const problem = this._repository.getUnseenProblem(excludeCategories, difficulty);
    if (!problem) { return null; }

    if (!problem.description) {
      return this._fetchAndUpdate(problem);
    }

    return problem;
  }

  /**
   * Get a problem by slug. Fetches from LeetCode if description is missing.
   */
  async getProblemBySlug(slug: string): Promise<Problem | null> {
    const problem = this._repository.getProblemBySlug(slug);
    if (!problem) { return null; }

    if (!problem.description) {
      return this._fetchAndUpdate(problem);
    }

    return problem;
  }

  /**
   * Get a problem by ID. Fetches from LeetCode if description is missing.
   */
  async getProblemById(id: number): Promise<Problem | null> {
    const problem = this._repository.getProblemById(id);
    if (!problem) { return null; }

    if (!problem.description) {
      return this._fetchAndUpdate(problem);
    }

    return problem;
  }

  /**
   * Get all distinct categories from the problem bank.
   */
  getCategories(): string[] {
    return this._repository.getCategories();
  }

  /**
   * Batch-download descriptions for all problems that don't have one yet.
   * Rate-limited via LeetCodeClient. Reports progress via callback.
   * Returns the number of successfully downloaded problems.
   */
  async downloadAllDescriptions(
    onProgress?: (downloaded: number, total: number, current: string) => void,
    cancellationToken?: { isCancellationRequested: boolean },
  ): Promise<number> {
    const missing = this._repository.getProblemsWithoutDescription();
    if (missing.length === 0) { return 0; }

    let downloaded = 0;

    for (const problem of missing) {
      if (cancellationToken?.isCancellationRequested) { break; }

      onProgress?.(downloaded, missing.length, problem.title);

      try {
        await this._fetchAndUpdate(problem);
        downloaded++;
      } catch (err) {
        console.warn(`[ProblemBank] Failed to download "${problem.slug}":`, err);
      }

      // Small delay to avoid hammering LeetCode
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`[ProblemBank] Batch download complete: ${downloaded}/${missing.length}`);
    return downloaded;
  }

  /**
   * Fetch full problem details from LeetCode and update the DB record.
   */
  private async _fetchAndUpdate(problem: Problem): Promise<Problem> {
    console.log(`[ProblemBank] Fetching full details for "${problem.slug}" from LeetCode...`);
    const raw = await this._leetcodeClient.fetchProblem(problem.slug);
    if (!raw) {
      console.warn(`[ProblemBank] Could not fetch "${problem.slug}" from LeetCode`);
      return problem;
    }

    const parsed = this._parser.parse(raw, problem.sourceList);

    await this._repository.updateProblem(problem.slug, {
      description: parsed.description,
      examples: parsed.examples,
      constraints: parsed.constraints,
      testCases: parsed.testCases,
      hints: parsed.hints,
      tags: parsed.tags,
      leetcodeId: parsed.leetcodeId,
    });

    return this._repository.getProblemBySlug(problem.slug) ?? problem;
  }
}
