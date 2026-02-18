import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProblemBank } from "../../src/core/problem-bank";
import type { Repository } from "../../src/db/repository";
import type { LeetCodeClient } from "../../src/leetcode/client";
import type { Problem } from "../../src/db/schema";
import * as vscode from "vscode";

function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 1,
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "Easy",
    category: "Arrays & Hashing",
    tags: ["array", "hash-table"],
    description: "Given an array of integers...",
    examples: [{ input: "[2,7,11,15], 9", output: "[0,1]" }],
    constraints: "2 <= nums.length <= 10^4",
    testCases: [],
    hints: ["Try a hash map"],
    solutionCode: null,
    sourceList: "neetcode150",
    leetcodeId: 1,
    pattern: "Arrays & Hashing",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createMockRepository(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    getProblemBySlug: vi.fn().mockReturnValue(null),
    getProblemById: vi.fn().mockReturnValue(null),
    insertProblem: vi.fn().mockResolvedValue(1),
    updateProblem: vi.fn().mockResolvedValue(undefined),
    getUnseenProblem: vi.fn().mockReturnValue(null),
    getProblemCount: vi.fn().mockReturnValue(0),
    getCategories: vi.fn().mockReturnValue([]),
    getProblemsWithoutDescription: vi.fn().mockReturnValue([]),
  };
}

function createMockLeetCodeClient(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    fetchProblem: vi.fn().mockResolvedValue(null),
  };
}

describe("ProblemBank", () => {
  let bank: ProblemBank;
  let repo: ReturnType<typeof createMockRepository>;
  let leetcode: ReturnType<typeof createMockLeetCodeClient>;
  let extensionUri: ReturnType<typeof vscode.Uri.file>;

  beforeEach(() => {
    repo = createMockRepository();
    leetcode = createMockLeetCodeClient();
    extensionUri = vscode.Uri.file("/mock/extension");
    bank = new ProblemBank(
      repo as unknown as Repository,
      leetcode as unknown as LeetCodeClient,
      extensionUri as unknown as vscode.Uri,
    );
  });

  describe("getNewProblem", () => {
    it("returns null when no unseen problem exists", async () => {
      repo.getUnseenProblem.mockReturnValue(null);
      const result = await bank.getNewProblem();
      expect(result).toBeNull();
    });

    it("returns the problem directly if it already has a description", async () => {
      const problem = makeProblem({ description: "Has a description" });
      repo.getUnseenProblem.mockReturnValue(problem);
      const result = await bank.getNewProblem();
      expect(result).toEqual(problem);
      expect(leetcode.fetchProblem).not.toHaveBeenCalled();
    });

    it("fetches from LeetCode when description is empty", async () => {
      const noDesc = makeProblem({ description: "" });
      repo.getUnseenProblem.mockReturnValue(noDesc);
      leetcode.fetchProblem.mockResolvedValue({
        questionId: "1",
        questionFrontendId: "1",
        title: "Two Sum",
        titleSlug: "two-sum",
        content: "<p>Given an array...</p>",
        difficulty: "Easy",
        topicTags: [{ name: "Array", slug: "array" }],
        hints: ["Use a hash map"],
        exampleTestcases: "2,7,11,15\n9",
        codeSnippets: [],
        sampleTestCase: "",
      });
      const updated = makeProblem({ description: "Given an array..." });
      repo.getProblemBySlug.mockReturnValue(updated);

      const result = await bank.getNewProblem();

      expect(leetcode.fetchProblem).toHaveBeenCalledWith("two-sum");
      expect(repo.updateProblem).toHaveBeenCalled();
      expect(result?.description).toBe("Given an array...");
    });

    it("returns original problem when LeetCode fetch fails", async () => {
      const noDesc = makeProblem({ description: "" });
      repo.getUnseenProblem.mockReturnValue(noDesc);
      leetcode.fetchProblem.mockResolvedValue(null);

      const result = await bank.getNewProblem();

      expect(result?.slug).toBe("two-sum");
      expect(repo.updateProblem).not.toHaveBeenCalled();
    });

    it("passes excludeCategories and difficulty to repository", async () => {
      repo.getUnseenProblem.mockReturnValue(null);
      await bank.getNewProblem(["Trees"], "Medium");
      expect(repo.getUnseenProblem).toHaveBeenCalledWith(["Trees"], "Medium");
    });
  });

  describe("getProblemBySlug", () => {
    it("returns null when slug not found", async () => {
      repo.getProblemBySlug.mockReturnValue(null);
      const result = await bank.getProblemBySlug("nonexistent");
      expect(result).toBeNull();
    });

    it("returns problem directly if description exists", async () => {
      const problem = makeProblem();
      repo.getProblemBySlug.mockReturnValue(problem);
      const result = await bank.getProblemBySlug("two-sum");
      expect(result).toEqual(problem);
      expect(leetcode.fetchProblem).not.toHaveBeenCalled();
    });
  });

  describe("getProblemById", () => {
    it("returns null when id not found", async () => {
      repo.getProblemById.mockReturnValue(null);
      const result = await bank.getProblemById(999);
      expect(result).toBeNull();
    });

    it("returns problem directly if description exists", async () => {
      const problem = makeProblem();
      repo.getProblemById.mockReturnValue(problem);
      const result = await bank.getProblemById(1);
      expect(result).toEqual(problem);
    });
  });

  describe("getCategories", () => {
    it("delegates to repository", () => {
      repo.getCategories.mockReturnValue(["Arrays", "Trees"]);
      const result = bank.getCategories();
      expect(result).toEqual(["Arrays", "Trees"]);
    });
  });

  describe("downloadAllDescriptions", () => {
    it("returns 0 when no problems are missing descriptions", async () => {
      repo.getProblemsWithoutDescription.mockReturnValue([]);
      const count = await bank.downloadAllDescriptions();
      expect(count).toBe(0);
    });

    it("respects cancellation token", async () => {
      const problems = [
        makeProblem({ id: 1, slug: "a", description: "" }),
        makeProblem({ id: 2, slug: "b", description: "" }),
        makeProblem({ id: 3, slug: "c", description: "" }),
      ];
      repo.getProblemsWithoutDescription.mockReturnValue(problems);
      leetcode.fetchProblem.mockResolvedValue(null);

      const token = { isCancellationRequested: false };
      // Cancel after first problem
      leetcode.fetchProblem.mockImplementation(async () => {
        token.isCancellationRequested = true;
        return null;
      });

      const count = await bank.downloadAllDescriptions(undefined, token);
      // Should have processed at most 1 problem before seeing cancellation
      expect(count).toBeLessThanOrEqual(1);
    });

    it("calls onProgress callback", async () => {
      const problems = [
        makeProblem({ id: 1, slug: "a", title: "Problem A", description: "" }),
      ];
      repo.getProblemsWithoutDescription.mockReturnValue(problems);
      leetcode.fetchProblem.mockResolvedValue(null);

      const onProgress = vi.fn();
      await bank.downloadAllDescriptions(onProgress);

      expect(onProgress).toHaveBeenCalledWith(0, 1, "Problem A");
    });
  });
});
