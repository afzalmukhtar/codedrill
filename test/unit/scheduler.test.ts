import { describe, it, expect, vi, beforeEach } from "vitest";
import { Scheduler } from "../../src/core/scheduler";
import type { Repository } from "../../src/db/repository";
import type { ReviewCard } from "../../src/db/schema";

function makeCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  const now = new Date().toISOString();
  return {
    id: 1,
    problemId: 100,
    cardType: "dsa",
    stability: 0,
    difficulty: 0,
    due: now,
    lastReview: null,
    reps: 0,
    lapses: 0,
    state: "New",
    scheduledDays: 0,
    elapsedDays: 0,
    ...overrides,
  };
}

describe("Scheduler", () => {
  let mockRepo: {
    getDueCards: ReturnType<typeof vi.fn>;
    getCardById: ReturnType<typeof vi.fn>;
    updateCard: ReturnType<typeof vi.fn>;
  };
  let scheduler: Scheduler;

  beforeEach(() => {
    mockRepo = {
      getDueCards: vi.fn(),
      getCardById: vi.fn(),
      updateCard: vi.fn().mockResolvedValue(undefined),
    };
    scheduler = new Scheduler(mockRepo as unknown as Repository);
  });

  describe("getDueCards", () => {
    it("delegates to repository", () => {
      const cards = [makeCard({ id: 1 }), makeCard({ id: 2 })];
      mockRepo.getDueCards.mockReturnValue(cards);

      const result = scheduler.getDueCards(5);

      expect(mockRepo.getDueCards).toHaveBeenCalledWith(5);
      expect(result).toEqual(cards);
    });
  });

  describe("recordReview", () => {
    it("with rating 3 (Good) on a new card -> updates state from New to Learning, sets stability > 0, updates reps", async () => {
      const newCard = makeCard({ id: 1, state: "New", reps: 0, stability: 0 });
      mockRepo.getCardById.mockReturnValue(newCard);

      const updated = await scheduler.recordReview(1, 3);

      expect(updated.state).toBe("Learning");
      expect(updated.stability).toBeGreaterThan(0);
      expect(updated.reps).toBeGreaterThan(0);
    });

    it("with rating 1 (Again) on a new card -> card stays in Learning/New with low stability", async () => {
      const newCard = makeCard({ id: 1, state: "New", reps: 0, stability: 0 });
      mockRepo.getCardById.mockReturnValue(newCard);

      const updated = await scheduler.recordReview(1, 1);

      expect(["New", "Learning"]).toContain(updated.state);
      expect(updated.stability).toBeLessThanOrEqual(1);
    });

    it("throws for non-existent card", async () => {
      mockRepo.getCardById.mockReturnValue(null);

      await expect(scheduler.recordReview(999, 3)).rejects.toThrow("Card 999 not found");
      expect(mockRepo.updateCard).not.toHaveBeenCalled();
    });

    it("calls repository.updateCard with the updated card", async () => {
      const newCard = makeCard({ id: 1, state: "New" });
      mockRepo.getCardById.mockReturnValue(newCard);

      const updated = await scheduler.recordReview(1, 3);

      expect(mockRepo.updateCard).toHaveBeenCalledTimes(1);
      expect(mockRepo.updateCard).toHaveBeenCalledWith(updated);
      expect(updated.id).toBe(1);
      expect(updated.problemId).toBe(newCard.problemId);
    });
  });

  describe("getNextReviewDate", () => {
    it("returns Date for existing card", () => {
      const due = "2025-02-20T12:00:00.000Z";
      const card = makeCard({ id: 1, due });
      mockRepo.getCardById.mockReturnValue(card);

      const result = scheduler.getNextReviewDate(1);

      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe(due);
    });

    it("returns null for non-existent card", () => {
      mockRepo.getCardById.mockReturnValue(null);

      const result = scheduler.getNextReviewDate(999);

      expect(result).toBeNull();
    });
  });

  describe("getCardStats", () => {
    it("aggregates counts by state correctly", () => {
      const cards: ReviewCard[] = [
        makeCard({ id: 1, state: "New" }),
        makeCard({ id: 2, state: "New" }),
        makeCard({ id: 3, state: "Learning" }),
        makeCard({ id: 4, state: "Review" }),
        makeCard({ id: 5, state: "Relearning" }),
      ];
      mockRepo.getDueCards.mockReturnValue(cards);

      const stats = scheduler.getCardStats();

      expect(mockRepo.getDueCards).toHaveBeenCalledWith(10000);
      expect(stats.newCount).toBe(2);
      expect(stats.learningCount).toBe(1);
      expect(stats.reviewCount).toBe(1);
      expect(stats.relearningCount).toBe(1);
      expect(stats.dueToday).toBe(5);
    });
  });
});
