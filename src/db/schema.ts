/**
 * SQLite Schema Definitions
 *
 * TypeScript representations of the database tables.
 * The raw SQL is in schema.sql; this file provides
 * typed interfaces and the initialization logic.
 */

export interface Problem {
  id: number;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
  tags: string[];
  description: string;
  examples: Example[];
  constraints: string;
  testCases: TestCase[];
  hints: string[];
  solutionCode: string | null;
  sourceList: string;
  leetcodeId: number | null;
  pattern: string | null;
  companies: string[];
  fetchedAt: string;
}

export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export interface ReviewCard {
  id: number;
  problemId: number;
  cardType: "dsa" | "system_design";
  stability: number;
  difficulty: number;
  due: string;
  lastReview: string | null;
  reps: number;
  lapses: number;
  state: "New" | "Learning" | "Review" | "Relearning";
  scheduledDays: number;
  elapsedDays: number;
}

export interface Attempt {
  id: number;
  problemId: number;
  cardId: number;
  startedAt: string;
  finishedAt: string | null;
  timeSpentMs: number | null;
  timerLimitMs: number | null;
  rating: 1 | 2 | 3 | 4 | null;
  wasMutation: boolean;
  mutationDesc: string | null;
  userCode: string | null;
  aiHintsUsed: number;
  gaveUp: boolean;
  notes: string | null;
}

export interface Session {
  id: number;
  startedAt: string;
  newProblemId: number | null;
  reviewProblemId: number | null;
  completed: boolean;
}

export interface SystemDesignTopic {
  id: number;
  title: string;
  category: string;
  description: string;
  keyConcepts: string[];
  followUps: string[];
  source: string | null;
}
