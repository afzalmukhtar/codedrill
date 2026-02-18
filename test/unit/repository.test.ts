import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import fs from "fs";
import path from "path";
import { Repository } from "../../src/db/repository";
import type { Problem, ReviewCard, Attempt, Session } from "../../src/db/schema";

async function createTestDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const schemaPath = path.join(__dirname, "../../src/db/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.run(schema);
  return db;
}

function injectTestDb(repo: Repository, db: Database): void {
  (repo as unknown as { _db: Database | null })._db = db;
  (repo as unknown as { _dbUri: unknown })._dbUri = null;
}

function makeProblem(overrides: Partial<Omit<Problem, "id" | "fetchedAt">> = {}): Omit<Problem, "id" | "fetchedAt"> {
  return {
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "Easy",
    category: "Arrays",
    tags: ["array", "hash-table"],
    description: "Find two numbers that add up to target.",
    examples: [],
    constraints: "",
    testCases: [],
    hints: [],
    solutionCode: null,
    sourceList: "neetcode150",
    leetcodeId: 1,
    pattern: "Two Pointers",
    ...overrides,
  };
}

describe("Repository", () => {
  let repo: Repository;
  let db: Database;

  beforeEach(async () => {
    db = await createTestDb();
    repo = new Repository();
    injectTestDb(repo, db);
  });

  describe("Problem CRUD", () => {
    it("inserts a problem and returns id", async () => {
      const id = await repo.insertProblem(makeProblem());
      expect(id).toBeGreaterThan(0);
    });

    it("gets problem by slug", async () => {
      await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const p = repo.getProblemBySlug("two-sum");
      expect(p).not.toBeNull();
      expect(p!.slug).toBe("two-sum");
      expect(p!.title).toBe("Two Sum");
      expect(p!.difficulty).toBe("Easy");
      expect(p!.category).toBe("Arrays");
    });

    it("gets problem by id", async () => {
      const id = await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const p = repo.getProblemById(id);
      expect(p).not.toBeNull();
      expect(p!.id).toBe(id);
      expect(p!.slug).toBe("two-sum");
    });

    it("returns null for non-existent slug", () => {
      expect(repo.getProblemBySlug("non-existent")).toBeNull();
    });

    it("returns null for non-existent id", () => {
      expect(repo.getProblemById(999)).toBeNull();
    });

    it("updates problem by slug", async () => {
      await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      await repo.updateProblem("two-sum", {
        description: "Updated description",
        tags: ["array", "hash-table", "updated"],
      });
      const p = repo.getProblemBySlug("two-sum");
      expect(p!.description).toBe("Updated description");
      expect(p!.tags).toContain("updated");
    });

    it("getProblemCount returns correct count", async () => {
      expect(repo.getProblemCount()).toBe(0);
      await repo.insertProblem(makeProblem({ slug: "p1" }));
      expect(repo.getProblemCount()).toBe(1);
      await repo.insertProblem(makeProblem({ slug: "p2", category: "Strings" }));
      expect(repo.getProblemCount()).toBe(2);
    });

    it("getCategories returns distinct categories", async () => {
      await repo.insertProblem(makeProblem({ slug: "p1", category: "Arrays" }));
      await repo.insertProblem(makeProblem({ slug: "p2", category: "Strings" }));
      await repo.insertProblem(makeProblem({ slug: "p3", category: "Arrays" }));
      const cats = repo.getCategories();
      expect(cats).toEqual(["Arrays", "Strings"]);
    });

    it("listProblems returns all problems optionally filtered by category", async () => {
      await repo.insertProblem(makeProblem({ slug: "p1", category: "Arrays" }));
      await repo.insertProblem(makeProblem({ slug: "p2", category: "Strings" }));
      await repo.insertProblem(makeProblem({ slug: "p3", category: "Arrays" }));

      const all = repo.listProblems();
      expect(all).toHaveLength(3);

      const arrays = repo.listProblems("Arrays");
      expect(arrays).toHaveLength(2);
      expect(arrays.every((p) => p.category === "Arrays")).toBe(true);
    });

    it("getProblemsForList returns problems by source_list", async () => {
      await repo.insertProblem(makeProblem({ slug: "p1", sourceList: "neetcode150" }));
      await repo.insertProblem(makeProblem({ slug: "p2", sourceList: "blind75" }));
      await repo.insertProblem(makeProblem({ slug: "p3", sourceList: "neetcode150" }));

      const neet = repo.getProblemsForList("neetcode150");
      expect(neet).toHaveLength(2);
      expect(neet.map((p) => p.slug).sort()).toEqual(["p1", "p3"]);
    });

    it("getProblemsWithoutDescription returns problems with empty description", async () => {
      await repo.insertProblem(makeProblem({ slug: "p1", description: "" }));
      await repo.insertProblem(makeProblem({ slug: "p2", description: "Has content" }));

      const empty = repo.getProblemsWithoutDescription();
      expect(empty).toHaveLength(1);
      expect(empty[0].slug).toBe("p1");
    });

    it("getPatternStats returns pattern totals and solved counts", async () => {
      await repo.insertProblem(makeProblem({ slug: "p1", pattern: "Two Pointers" }));
      await repo.insertProblem(makeProblem({ slug: "p2", pattern: "Two Pointers" }));
      await repo.insertProblem(makeProblem({ slug: "p3", pattern: "Sliding Window" }));

      const stats = repo.getPatternStats();
      expect(stats).toHaveLength(2);
      const twoPtr = stats.find((s) => s.pattern === "Two Pointers");
      expect(twoPtr!.total).toBe(2);
      expect(twoPtr!.solved).toBe(0);
    });
  });

  describe("INSERT OR IGNORE dedup on slug", () => {
    it("ignores duplicate slug and does not throw", async () => {
      await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const id2 = await repo.insertProblem(makeProblem({ slug: "two-sum", title: "Duplicate" }));
      expect(repo.getProblemCount()).toBe(1);
      const p = repo.getProblemBySlug("two-sum");
      expect(p!.title).toBe("Two Sum");
      expect(id2).toBeDefined();
    });
  });

  describe("Review cards", () => {
    it("getOrCreateCard creates card when none exists", async () => {
      const id = await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const card = await repo.getOrCreateCard(id, "dsa");
      expect(card).not.toBeNull();
      expect(card.problemId).toBe(id);
      expect(card.cardType).toBe("dsa");
      expect(card.state).toBe("New");
    });

    it("getOrCreateCard returns existing card when one exists", async () => {
      const id = await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const card1 = await repo.getOrCreateCard(id, "dsa");
      const card2 = await repo.getOrCreateCard(id, "dsa");
      expect(card1.id).toBe(card2.id);
    });

    it("getOrCreateCard creates separate cards for dsa and system_design", async () => {
      const id = await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const dsa = await repo.getOrCreateCard(id, "dsa");
      const sd = await repo.getOrCreateCard(id, "system_design");
      expect(dsa.id).not.toBe(sd.id);
      expect(dsa.cardType).toBe("dsa");
      expect(sd.cardType).toBe("system_design");
    });

    it("updateCard persists changes", async () => {
      const id = await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const card = await repo.getOrCreateCard(id, "dsa");
      card.stability = 2.5;
      card.reps = 3;
      card.state = "Review";
      await repo.updateCard(card);

      const loaded = repo.getCardById(card.id);
      expect(loaded!.stability).toBe(2.5);
      expect(loaded!.reps).toBe(3);
      expect(loaded!.state).toBe("Review");
    });

    it("getCardById returns null for non-existent id", () => {
      expect(repo.getCardById(999)).toBeNull();
    });

    it("getDueCards returns cards due now or in the past", async () => {
      const id = await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const card = await repo.getOrCreateCard(id, "dsa");
      const pastDate = new Date(Date.now() - 86400000);
      const pastDue = pastDate.toISOString().slice(0, 19).replace("T", " ");
      card.due = pastDue;
      await repo.updateCard(card);

      const dueCards = repo.getDueCards(10);
      expect(dueCards.length).toBeGreaterThanOrEqual(1);
      expect(dueCards.some((c) => c.id === card.id)).toBe(true);
    });
  });

  describe("Attempts", () => {
    it("insertAttempt and getAttemptsForProblem", async () => {
      const problemId = await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const card = await repo.getOrCreateCard(problemId, "dsa");

      const attempt: Omit<Attempt, "id"> = {
        problemId,
        cardId: card.id,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        timeSpentMs: 120000,
        timerLimitMs: 1800000,
        rating: 3,
        wasMutation: false,
        mutationDesc: null,
        userCode: "function twoSum() {}",
        aiHintsUsed: 0,
        gaveUp: false,
        notes: null,
      };

      const attemptId = await repo.insertAttempt(attempt);
      expect(attemptId).toBeGreaterThan(0);

      const attempts = repo.getAttemptsForProblem(problemId);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].id).toBe(attemptId);
      expect(attempts[0].rating).toBe(3);
      expect(attempts[0].timeSpentMs).toBe(120000);
    });

    it("getAttemptCount returns correct count", async () => {
      const problemId = await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const card = await repo.getOrCreateCard(problemId, "dsa");

      expect(repo.getAttemptCount(problemId)).toBe(0);

      await repo.insertAttempt({
        problemId,
        cardId: card.id,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        timeSpentMs: null,
        timerLimitMs: null,
        rating: null,
        wasMutation: false,
        mutationDesc: null,
        userCode: null,
        aiHintsUsed: 0,
        gaveUp: false,
        notes: null,
      });
      expect(repo.getAttemptCount(problemId)).toBe(1);

      await repo.insertAttempt({
        problemId,
        cardId: card.id,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        timeSpentMs: null,
        timerLimitMs: null,
        rating: null,
        wasMutation: false,
        mutationDesc: null,
        userCode: null,
        aiHintsUsed: 0,
        gaveUp: false,
        notes: null,
      });
      expect(repo.getAttemptCount(problemId)).toBe(2);
    });
  });

  describe("Sessions", () => {
    it("insertSession and getRecentSessions", async () => {
      const problemId = await repo.insertProblem(makeProblem({ slug: "two-sum" }));

      const session: Omit<Session, "id"> = {
        startedAt: new Date().toISOString(),
        newProblemId: problemId,
        reviewProblemId: null,
        completed: false,
      };

      const id = await repo.insertSession(session);
      expect(id).toBeGreaterThan(0);

      const sessions = repo.getRecentSessions(10);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(id);
      expect(sessions[0].newProblemId).toBe(problemId);
      expect(sessions[0].completed).toBe(false);
    });

    it("updateSession persists changes", async () => {
      const problemId = await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const id = await repo.insertSession({
        startedAt: new Date().toISOString(),
        newProblemId: problemId,
        reviewProblemId: null,
        completed: false,
      });

      await repo.updateSession({
        id,
        startedAt: new Date().toISOString(),
        newProblemId: problemId,
        reviewProblemId: problemId,
        completed: true,
      });

      const sessions = repo.getRecentSessions(10);
      expect(sessions[0].completed).toBe(true);
      expect(sessions[0].reviewProblemId).toBe(problemId);
    });
  });

  describe("User config", () => {
    it("setUserConfig and getUserConfig", async () => {
      expect(repo.getUserConfig("theme")).toBeNull();
      await repo.setUserConfig("theme", "dark");
      expect(repo.getUserConfig("theme")).toBe("dark");
    });

    it("deleteUserConfig removes key", async () => {
      await repo.setUserConfig("theme", "dark");
      expect(repo.getUserConfig("theme")).toBe("dark");
      await repo.deleteUserConfig("theme");
      expect(repo.getUserConfig("theme")).toBeNull();
    });

    it("setUserConfig overwrites existing value", async () => {
      await repo.setUserConfig("theme", "dark");
      await repo.setUserConfig("theme", "light");
      expect(repo.getUserConfig("theme")).toBe("light");
    });
  });

  describe("Stats", () => {
    it("getTotalSolved counts problems with rating >= 2", async () => {
      const problemId = await repo.insertProblem(makeProblem({ slug: "two-sum" }));
      const card = await repo.getOrCreateCard(problemId, "dsa");

      expect(repo.getTotalSolved()).toBe(0);

      await repo.insertAttempt({
        problemId,
        cardId: card.id,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        timeSpentMs: 60000,
        timerLimitMs: null,
        rating: 3,
        wasMutation: false,
        mutationDesc: null,
        userCode: null,
        aiHintsUsed: 0,
        gaveUp: false,
        notes: null,
      });

      expect(repo.getTotalSolved()).toBe(1);
    });

    it("getCategoryStats returns category breakdown", async () => {
      const p1 = await repo.insertProblem(makeProblem({ slug: "p1", category: "Arrays" }));
      const p2 = await repo.insertProblem(makeProblem({ slug: "p2", category: "Arrays" }));
      const p3 = await repo.insertProblem(makeProblem({ slug: "p3", category: "Strings" }));

      const card1 = await repo.getOrCreateCard(p1, "dsa");
      const card3 = await repo.getOrCreateCard(p3, "dsa");

      await repo.insertAttempt({
        problemId: p1,
        cardId: card1.id,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        timeSpentMs: 60000,
        timerLimitMs: null,
        rating: 3,
        wasMutation: false,
        mutationDesc: null,
        userCode: null,
        aiHintsUsed: 0,
        gaveUp: false,
        notes: null,
      });

      await repo.insertAttempt({
        problemId: p3,
        cardId: card3.id,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        timeSpentMs: 60000,
        timerLimitMs: null,
        rating: 2,
        wasMutation: false,
        mutationDesc: null,
        userCode: null,
        aiHintsUsed: 0,
        gaveUp: false,
        notes: null,
      });

      const stats = repo.getCategoryStats();
      expect(stats).toHaveLength(2);

      const arrays = stats.find((s) => s.category === "Arrays");
      expect(arrays!.total).toBe(2);
      expect(arrays!.attempted).toBe(1);
      expect(arrays!.solved).toBe(1);

      const strings = stats.find((s) => s.category === "Strings");
      expect(strings!.total).toBe(1);
      expect(strings!.attempted).toBe(1);
      expect(strings!.solved).toBe(0);
    });
  });
});
