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
  pattern?: string;
  companies?: string[];
  leetcodeId?: number | null;
  sources?: string[];
}

interface BundledList {
  name: string;
  description: string;
  source: string;
  totalProblems?: number;
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
    // Prefer the unified codedrill.json; fall back to individual lists
    const unifiedExists = await this._fileExists("codedrill.json");
    const listFiles = unifiedExists
      ? ["codedrill.json"]
      : ["neetcode150.json", "blind75.json", "grind75.json"];

    let totalImported = 0;
    for (const file of listFiles) {
      const count = await this.importFromList(file);
      totalImported += count;
    }

    await this.initializeSystemDesign();

    const total = this._repository.getProblemCount();
    console.log(`[ProblemBank] Initialized with ${total} problems (${totalImported} newly imported) from ${listFiles.join(", ")}`);
    return totalImported;
  }

  /**
   * Import system design topics from bundled system-design.json.
   * Inserts each topic if it doesn't already exist (checked by title).
   */
  async initializeSystemDesign(): Promise<number> {
    const listUri = vscode.Uri.joinPath(
      this._extensionUri, "dist", "lists", "system-design.json",
    );

    let list: { name: string; topics: Array<{ title: string; category: string; description: string; keyConcepts?: string[]; followUps?: string[]; source?: string }> };
    try {
      const bytes = await vscode.workspace.fs.readFile(listUri);
      list = JSON.parse(Buffer.from(bytes).toString("utf-8")) as typeof list;
    } catch (err) {
      console.warn(`[ProblemBank] Could not load system-design.json:`, err);
      return 0;
    }

    const existing = this._repository.getSystemDesignTopics();
    const existingTitles = new Set(existing.map((t) => t.title));
    let imported = 0;

    this._repository.beginBatch();
    try {
      for (const topic of list.topics) {
        if (existingTitles.has(topic.title)) { continue; }

        await this._repository.insertSystemDesignTopic({
          title: topic.title,
          category: topic.category,
          description: topic.description,
          keyConcepts: topic.keyConcepts ?? [],
          followUps: topic.followUps ?? [],
          source: topic.source ?? list.name ?? null,
        });
        existingTitles.add(topic.title);
        imported++;
      }
    } finally {
      await this._repository.endBatch();
    }

    if (imported > 0) {
      console.log(`[ProblemBank] Imported ${imported} system design topics from system-design.json`);
    }
    return imported;
  }

  private async _fileExists(filename: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.joinPath(this._extensionUri, "dist", "lists", filename);
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Import a specific bundled list. Returns count of new problems added.
   */
  async importFromList(filename: string): Promise<number> {
    const listUri = vscode.Uri.joinPath(
      this._extensionUri, "dist", "lists", filename,
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

    this._repository.beginBatch();
    try {
      for (const entry of list.problems) {
        const existing = this._repository.getProblemBySlug(entry.slug);
        if (existing) {
          const updates: Partial<Problem> = {};
          if (!existing.pattern && (entry.pattern || entry.category)) {
            updates.pattern = entry.pattern || entry.category;
          }
          if (entry.companies?.length && (!existing.companies || existing.companies.length === 0)) {
            updates.companies = entry.companies;
          } else if (entry.companies?.length && existing.companies?.length) {
            const merged = Array.from(new Set([...existing.companies, ...entry.companies])).sort();
            if (merged.length > existing.companies.length) {
              updates.companies = merged;
            }
          }
          if (!existing.leetcodeId && entry.leetcodeId) {
            updates.leetcodeId = entry.leetcodeId;
          }
          if (Object.keys(updates).length > 0) {
            await this._repository.updateProblem(entry.slug, updates);
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
          sourceList: entry.sources?.join(",") || listName,
          leetcodeId: entry.leetcodeId ?? null,
          pattern: entry.pattern || entry.category,
          companies: entry.companies ?? [],
        });
        imported++;
      }
    } finally {
      await this._repository.endBatch();
    }

    console.log(`[ProblemBank] Imported ${imported} problems from ${filename} (${list.problems.length} total entries)`);
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
