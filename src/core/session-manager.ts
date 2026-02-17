import type { Repository } from "../db/repository";
import type { Scheduler } from "./scheduler";
import type { ProblemBank } from "./problem-bank";
import type { Session, Attempt, ReviewCard } from "../db/schema";

/**
 * Active session state tracked in memory.
 */
export interface ActiveSession {
  /** Database session row ID. */
  id: number;
  /** New problem DB ID (if any). */
  newProblemId: number | null;
  /** Review problem DB ID (if any). */
  reviewProblemId: number | null;
  /** ISO timestamp when the session started. */
  startedAt: string;
  /** Which problem the user is currently working on ("new" or "review"). */
  currentSlot: "new" | "review";
  /** FSRS card ID for the current problem (created on demand). */
  currentCardId: number | null;
  /** ISO timestamp when the current attempt started. */
  attemptStartedAt: string | null;
  /** Number of AI hints used in the current attempt. */
  hintsUsed: number;
}

/**
 * Session Manager
 *
 * Orchestrates practice sessions by coordinating:
 *   - Problem selection (new + review via FSRS)
 *   - Attempt tracking (start, timer, rating)
 *   - FSRS card updates after rating
 *   - Session lifecycle (start -> attempt -> rate -> complete)
 */
export class SessionManager {
  private _activeSession: ActiveSession | null = null;

  constructor(
    private readonly _repository: Repository,
    private readonly _scheduler: Scheduler,
    private readonly _problemBank: ProblemBank,
  ) {}

  /**
   * Start a new practice session.
   *
   * @param newProblemId  Optional pre-selected new problem DB ID
   *                      (from "Get Today's Problem" flow).
   * @returns The active session or null if DB is not ready.
   */
  async startSession(newProblemId?: number): Promise<ActiveSession | null> {
    const now = new Date().toISOString();

    // Check for a due review card
    let reviewProblemId: number | null = null;
    const dueCards = this._scheduler.getDueCards(1);
    if (dueCards.length > 0) {
      reviewProblemId = dueCards[0].problemId;
    }

    // Create DB session record
    const sessionId = await this._repository.insertSession({
      startedAt: now,
      newProblemId: newProblemId ?? null,
      reviewProblemId,
      completed: false,
    });

    this._activeSession = {
      id: sessionId,
      newProblemId: newProblemId ?? null,
      reviewProblemId,
      startedAt: now,
      currentSlot: "new",
      currentCardId: null,
      attemptStartedAt: null,
      hintsUsed: 0,
    };

    return this._activeSession;
  }

  /**
   * Begin an attempt on the current problem.
   * Creates or fetches the FSRS review card.
   */
  async beginAttempt(slot: "new" | "review" = "new"): Promise<void> {
    if (!this._activeSession) { return; }

    this._activeSession.currentSlot = slot;
    this._activeSession.attemptStartedAt = new Date().toISOString();
    this._activeSession.hintsUsed = 0;

    const problemId = slot === "new"
      ? this._activeSession.newProblemId
      : this._activeSession.reviewProblemId;

    if (problemId) {
      const card = await this._repository.getOrCreateCard(problemId, "dsa");
      this._activeSession.currentCardId = card.id;
    }
  }

  /**
   * Record a hint used in the current attempt.
   */
  recordHint(): void {
    if (this._activeSession) {
      this._activeSession.hintsUsed++;
    }
  }

  /**
   * Complete the current attempt with a rating.
   *
   * Records the attempt in the DB, updates the FSRS card,
   * and returns the updated review card.
   *
   * @param rating    1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
   * @param timeSpentMs  Actual time spent (from timer)
   * @param timerLimitMs Timer limit that was set
   * @param userCode  The code the user wrote (optional)
   * @param gaveUp    Whether the user gave up
   */
  async completeAttempt(
    rating: 1 | 2 | 3 | 4,
    timeSpentMs: number,
    timerLimitMs: number,
    userCode?: string,
    gaveUp: boolean = false,
  ): Promise<ReviewCard | null> {
    if (!this._activeSession) { return null; }

    const session = this._activeSession;
    const problemId = session.currentSlot === "new"
      ? session.newProblemId
      : session.reviewProblemId;

    if (!problemId || !session.currentCardId) { return null; }

    // Record the attempt
    await this._repository.insertAttempt({
      problemId,
      cardId: session.currentCardId,
      startedAt: session.attemptStartedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      timeSpentMs,
      timerLimitMs,
      rating,
      wasMutation: false,
      mutationDesc: null,
      userCode: userCode ?? null,
      aiHintsUsed: session.hintsUsed,
      gaveUp,
      notes: null,
    });

    // Update FSRS card
    const updatedCard = await this._scheduler.recordReview(
      session.currentCardId,
      rating,
    );

    return updatedCard;
  }

  /**
   * End the current session, marking it as completed in the DB.
   */
  async endSession(): Promise<void> {
    if (!this._activeSession) { return; }

    const session = this._activeSession;
    await this._repository.updateSession({
      id: session.id,
      startedAt: session.startedAt,
      newProblemId: session.newProblemId,
      reviewProblemId: session.reviewProblemId,
      completed: true,
    });

    this._activeSession = null;
  }

  /**
   * Get the current active session (if any).
   */
  getCurrentSession(): ActiveSession | null {
    return this._activeSession;
  }

  /**
   * Check if there's an active session.
   */
  get hasActiveSession(): boolean {
    return this._activeSession !== null;
  }
}
