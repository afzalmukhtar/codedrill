import { FSRS, fsrs, createEmptyCard, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { Repository } from "../db/repository";
import type { ReviewCard } from "../db/schema";

export interface SchedulerStats {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  relearningCount: number;
  dueToday: number;
}

const STATE_TO_ENUM: Record<ReviewCard["state"], State> = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning,
};

const ENUM_TO_STATE: Record<State, ReviewCard["state"]> = {
  [State.New]: "New",
  [State.Learning]: "Learning",
  [State.Review]: "Review",
  [State.Relearning]: "Relearning",
};

const RATING_MAP: Record<1 | 2 | 3 | 4, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

/**
 * FSRS Scheduler Integration
 *
 * Wraps the ts-fsrs library to manage spaced repetition scheduling.
 * Maps between our ReviewCard schema and ts-fsrs Card objects.
 */
export class Scheduler {
  private readonly _fsrs: FSRS;
  private readonly _repository: Repository;

  constructor(repository: Repository) {
    this._repository = repository;
    this._fsrs = fsrs();
  }

  /**
   * Get review cards that are due now.
   */
  getDueCards(limit: number = 10): ReviewCard[] {
    return this._repository.getDueCards(limit);
  }

  /**
   * Record a review for a card, updating its FSRS parameters.
   *
   * @param cardId  - The review_cards.id
   * @param rating  - 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
   * @returns The updated ReviewCard
   */
  async recordReview(cardId: number, rating: 1 | 2 | 3 | 4): Promise<ReviewCard> {
    const existing = this._repository.getCardById(cardId);
    if (!existing) {
      throw new Error(`Card ${cardId} not found`);
    }

    const fsrsCard = this._toFsrsCard(existing);
    const now = new Date();
    const grade = RATING_MAP[rating];

    const scheduling = this._fsrs.repeat(fsrsCard, now);
    const result = scheduling[grade];
    const updatedCard = result.card;

    const updated: ReviewCard = {
      ...existing,
      stability: updatedCard.stability,
      difficulty: updatedCard.difficulty,
      due: updatedCard.due.toISOString(),
      lastReview: updatedCard.last_review?.toISOString() ?? now.toISOString(),
      reps: updatedCard.reps,
      lapses: updatedCard.lapses,
      state: ENUM_TO_STATE[updatedCard.state],
      scheduledDays: updatedCard.scheduled_days,
      elapsedDays: updatedCard.elapsed_days,
    };

    await this._repository.updateCard(updated);
    return updated;
  }

  /**
   * Get the next review date for a card.
   */
  getNextReviewDate(cardId: number): Date | null {
    const card = this._repository.getCardById(cardId);
    if (!card) { return null; }
    return new Date(card.due);
  }

  /**
   * Get aggregate stats about card states.
   */
  getCardStats(): SchedulerStats {
    const allDue = this._repository.getDueCards(10000);
    const stats: SchedulerStats = {
      newCount: 0,
      learningCount: 0,
      reviewCount: 0,
      relearningCount: 0,
      dueToday: allDue.length,
    };

    for (const card of allDue) {
      switch (card.state) {
        case "New": stats.newCount++; break;
        case "Learning": stats.learningCount++; break;
        case "Review": stats.reviewCount++; break;
        case "Relearning": stats.relearningCount++; break;
      }
    }

    return stats;
  }

  /**
   * Convert our ReviewCard schema to a ts-fsrs Card.
   */
  private _toFsrsCard(card: ReviewCard): Card {
    const fsrsCard = createEmptyCard(new Date(card.due));
    fsrsCard.stability = card.stability;
    fsrsCard.difficulty = card.difficulty;
    fsrsCard.reps = card.reps;
    fsrsCard.lapses = card.lapses;
    fsrsCard.state = STATE_TO_ENUM[card.state];
    fsrsCard.elapsed_days = card.elapsedDays;
    fsrsCard.scheduled_days = card.scheduledDays;
    if (card.lastReview) {
      fsrsCard.last_review = new Date(card.lastReview);
    }
    return fsrsCard;
  }
}
