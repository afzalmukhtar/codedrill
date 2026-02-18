import * as vscode from "vscode";
import type { ProblemBank } from "./problem-bank";
import type { Repository } from "../db/repository";

const PREFETCH_LAST_RUN_KEY = "prefetch.lastRun";
const MAX_PER_ACTIVATION = 20;
const DEFAULT_DELAY_MS = 30_000;
const RATE_LIMIT_MS = 500;

/**
 * Background prefetch pipeline for LeetCode problem descriptions.
 *
 * After extension activation and problem list import, slowly fetches descriptions
 * for problems that don't have them yet. Caps per activation, respects same-day
 * cooldown, and reports progress via the status bar.
 */
export class PrefetchPipeline {
  private _timeoutId: ReturnType<typeof setTimeout> | null = null;
  private _cancellationToken: { isCancellationRequested: boolean } | null = null;
  private _statusBarItem: vscode.StatusBarItem | null = null;

  constructor(
    private readonly _problemBank: ProblemBank,
    private readonly _repository: Repository,
  ) {}

  /**
   * Begins background fetching after a configurable delay.
   * Waits for the caller to ensure repo/problem bank are ready.
   */
  start(delayMs: number = DEFAULT_DELAY_MS): void {
    this._timeoutId = setTimeout(() => {
      this._timeoutId = null;
      this._run();
    }, delayMs);
    console.log(`[PrefetchPipeline] Scheduled to run in ${delayMs / 1000}s`);
  }

  /**
   * Cancels the background fetch. Call when a session starts or extension deactivates.
   */
  stop(): void {
    if (this._timeoutId !== null) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
      console.log("[PrefetchPipeline] Cancelled (before run)");
    }
    if (this._cancellationToken) {
      this._cancellationToken.isCancellationRequested = true;
      console.log("[PrefetchPipeline] Cancellation requested");
    }
  }

  private _getStatusBarItem(): vscode.StatusBarItem {
    if (!this._statusBarItem) {
      this._statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        50,
      );
    }
    return this._statusBarItem;
  }

  private _hideStatusBar(): void {
    if (this._statusBarItem) {
      this._statusBarItem.hide();
      this._statusBarItem.dispose();
      this._statusBarItem = null;
    }
  }

  private _isSameDay(isoTimestamp: string): boolean {
    try {
      const stored = new Date(isoTimestamp);
      const now = new Date();
      return (
        stored.getFullYear() === now.getFullYear() &&
        stored.getMonth() === now.getMonth() &&
        stored.getDate() === now.getDate()
      );
    } catch {
      return false;
    }
  }

  private async _run(): Promise<void> {
    const lastRun = this._repository.getUserConfig(PREFETCH_LAST_RUN_KEY);
    if (lastRun && this._isSameDay(lastRun)) {
      console.log("[PrefetchPipeline] Already ran today, skipping");
      return;
    }

    const missing = this._repository.getProblemsWithoutDescription();
    if (missing.length === 0) {
      console.log("[PrefetchPipeline] No problems need prefetching");
      return;
    }

    const toFetch = missing.slice(0, MAX_PER_ACTIVATION);
    this._cancellationToken = { isCancellationRequested: false };

    const statusBar = this._getStatusBarItem();
    statusBar.text = `$(sync~spin) CodeDrill: Prefetching 0/${toFetch.length}`;
    statusBar.show();

    let downloaded = 0;

    try {
      for (let i = 0; i < toFetch.length; i++) {
        if (this._cancellationToken.isCancellationRequested) {
          console.log(`[PrefetchPipeline] Cancelled after ${downloaded} problems`);
          break;
        }

        const problem = toFetch[i];
        statusBar.text = `$(sync~spin) CodeDrill: Prefetching ${i}/${toFetch.length} - ${problem.title}`;

        try {
          await this._problemBank.getProblemBySlug(problem.slug);
          downloaded++;
          console.log(`[PrefetchPipeline] Fetched ${problem.slug} (${downloaded}/${toFetch.length})`);
        } catch (err) {
          console.warn(`[PrefetchPipeline] Failed to fetch "${problem.slug}":`, err);
        }

        if (i < toFetch.length - 1) {
          await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
        }
      }

      await this._repository.setUserConfig(
        PREFETCH_LAST_RUN_KEY,
        new Date().toISOString(),
      );
      console.log(`[PrefetchPipeline] Complete: ${downloaded}/${toFetch.length} fetched`);
    } finally {
      this._cancellationToken = null;
      statusBar.text = `$(check) CodeDrill: Prefetched ${downloaded} problems`;
      statusBar.show();
      setTimeout(() => this._hideStatusBar(), 3000);
    }
  }
}
