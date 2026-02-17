-- CodeDrill Database Schema
-- SQLite via sql.js (WASM)
--
-- This schema is executed on first run to initialize the database.
-- Subsequent changes should be handled via migrations in db/migrations/.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- PROBLEMS: Core problem storage
-- Stores LeetCode problems fetched from the API or loaded from
-- bundled curated lists. Description is stored as markdown.
-- ============================================================
CREATE TABLE IF NOT EXISTS problems (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  difficulty    TEXT NOT NULL CHECK(difficulty IN ('Easy', 'Medium', 'Hard')),
  category      TEXT NOT NULL,
  tags          TEXT DEFAULT '[]',               -- JSON array of string tags
  description   TEXT NOT NULL,                   -- Problem statement in markdown
  examples      TEXT DEFAULT '[]',               -- JSON array: [{input, output, explanation?}]
  constraints   TEXT DEFAULT '',                 -- Constraints text
  test_cases    TEXT DEFAULT '[]',               -- JSON array: [{input, expectedOutput}]
  hints         TEXT DEFAULT '[]',               -- JSON array of hint strings
  solution_code TEXT,                            -- Reference solution (optional)
  source_list   TEXT,                            -- Origin list: "neetcode150", "blind75", "grind75"
  leetcode_id   INTEGER,                         -- LeetCode problem number (nullable)
  fetched_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Indexes for common queries
  UNIQUE(slug)
);

CREATE INDEX IF NOT EXISTS idx_problems_category ON problems(category);
CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty);
CREATE INDEX IF NOT EXISTS idx_problems_source_list ON problems(source_list);

-- ============================================================
-- REVIEW_CARDS: FSRS spaced repetition state per problem
-- Each problem has one card per type (dsa or system_design).
-- FSRS fields track memory model parameters.
-- ============================================================
CREATE TABLE IF NOT EXISTS review_cards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id      INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  card_type       TEXT NOT NULL CHECK(card_type IN ('dsa', 'system_design')),

  -- FSRS memory model fields
  stability       REAL DEFAULT 0.0,
  difficulty      REAL DEFAULT 0.0,
  due             DATETIME NOT NULL,
  last_review     DATETIME,
  reps            INTEGER DEFAULT 0,             -- Total successful reviews
  lapses          INTEGER DEFAULT 0,             -- Times user forgot (rated Again)
  state           TEXT DEFAULT 'New'
                  CHECK(state IN ('New', 'Learning', 'Review', 'Relearning')),

  -- Scheduling metadata
  scheduled_days  INTEGER DEFAULT 0,
  elapsed_days    INTEGER DEFAULT 0,

  UNIQUE(problem_id, card_type)
);

CREATE INDEX IF NOT EXISTS idx_review_cards_due ON review_cards(due);
CREATE INDEX IF NOT EXISTS idx_review_cards_state ON review_cards(state);

-- ============================================================
-- ATTEMPTS: Every practice attempt log
-- Records the full history of every time a user attempts a problem.
-- Used for analytics, mutation decisions, and progress tracking.
-- ============================================================
CREATE TABLE IF NOT EXISTS attempts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id      INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  card_id         INTEGER NOT NULL REFERENCES review_cards(id) ON DELETE CASCADE,
  started_at      DATETIME NOT NULL,
  finished_at     DATETIME,
  time_spent_ms   INTEGER,                       -- Actual coding time (excludes pauses)
  timer_limit_ms  INTEGER,                       -- Timer setting that was used
  rating          INTEGER CHECK(rating IS NULL OR (rating BETWEEN 1 AND 4)),
                                                 -- FSRS: Again(1), Hard(2), Good(3), Easy(4)
  was_mutation    BOOLEAN DEFAULT FALSE,          -- Was this a mutated version?
  mutation_desc   TEXT,                           -- Description of what was changed
  user_code       TEXT,                           -- The code the user wrote
  ai_hints_used   INTEGER DEFAULT 0,             -- Number of hints requested
  gave_up         BOOLEAN DEFAULT FALSE,          -- Did the user give up?
  notes           TEXT                            -- User's personal notes
);

CREATE INDEX IF NOT EXISTS idx_attempts_problem ON attempts(problem_id);
CREATE INDEX IF NOT EXISTS idx_attempts_started ON attempts(started_at);

-- ============================================================
-- SESSIONS: Groups of problems attempted together
-- Each session contains one new problem and one review problem.
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  new_problem_id      INTEGER REFERENCES problems(id),
  review_problem_id   INTEGER REFERENCES problems(id),
  completed           BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);

-- ============================================================
-- SYSTEM_DESIGN_TOPICS: Separate track for system design
-- Stores topics (not LeetCode problems) for system design practice.
-- ============================================================
CREATE TABLE IF NOT EXISTS system_design_topics (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL,                  -- "Fundamentals", "Building Blocks", "Full System Design"
  description     TEXT NOT NULL,
  key_concepts    TEXT DEFAULT '[]',              -- JSON array of concept strings
  follow_ups      TEXT DEFAULT '[]',              -- JSON array of follow-up questions
  source          TEXT                            -- Where this topic came from
);

CREATE INDEX IF NOT EXISTS idx_sd_topics_category ON system_design_topics(category);

-- ============================================================
-- USER_CONFIG: Key-value store for user preferences and state
-- Stores runtime state that doesn't belong in the config file.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ============================================================
-- CHAT_HISTORY: Conversation logs for AI interactions
-- Stores chat messages for reference and context.
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  problem_id      INTEGER REFERENCES problems(id) ON DELETE SET NULL,
  role            TEXT NOT NULL CHECK(role IN ('user', 'interviewer', 'teacher', 'system')),
  content         TEXT NOT NULL,
  context_refs    TEXT DEFAULT '[]',              -- JSON array of context attachment references
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_problem ON chat_history(problem_id);
