# CodeDrill - Spaced Repetition Interview Practice VSCode Extension

## Vision

A VSCode extension that transforms technical interview preparation into a scientifically-optimized learning system. It combines **FSRS spaced repetition scheduling**, **Socratic AI tutoring** (interviewer + teacher personas), **timed practice sessions**, and **progressive problem mutation** to build deep, long-term understanding of DSA patterns and system design concepts.

---

## Core Learning Science Principles

The extension is built on four evidence-based learning strategies:

1. **Spaced Repetition (FSRS)** -- Review problems at scientifically optimal intervals based on the DSR (Difficulty, Stability, Retrievability) memory model. Uses the open-source [FSRS TypeScript implementation](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler).
2. **Active Recall / Testing Effect** -- Users must attempt to solve problems from scratch rather than passively reading solutions. The timer enforces genuine effort before any help is offered.
3. **Interleaved Practice** -- Each session mixes one NEW problem with one REVISION problem from different categories, forcing the brain to discriminate between patterns rather than relying on blocked repetition.
4. **Progressive Elaboration (Problem Mutation)** -- First 2 attempts use the original problem. From attempt 3+, the problem statement is mutated by an LLM (changed constraints, different input types, follow-up variations) so the user learns the underlying pattern, not just memorizes one solution.

---

## Architecture Overview

```
                          +---------------------------+
                          |    VSCode Extension        |
                          |                           |
                          |  +---------------------+  |
                          |  | Bottom Panel (React) |  |
                          |  | - Problem View       |  |
                          |  | - Chat Panel         |  |
                          |  | - Timer              |  |
                          |  | - Model Selector     |  |
                          |  | - @-Mention Input    |  |
                          |  +---------------------+  |
                          |           |               |
                          |  +---------------------+  |
                          |  | Extension Host (TS)  |  |
                          |  | - Context Engine     |  |
                          |  | - Session Manager    |  |
                          |  | - FSRS Scheduler     |  |
                          |  | - Problem Bank       |  |
                          |  +---------------------+  |
                          +----------|----------------+
                                     |
                  +------------------+------------------+
                  |                  |                  |
         +--------+------+  +-------+-------+  +------+--------+
         | AI Layer       |  | Storage       |  | External      |
         | - LLM Router   |  | - SQLite (WASM)|  | - LeetCode API|
         | - Personas     |  | - Config File |  | - Problem Lists|
         | - Mutator      |  +---------------+  +---------------+
         +--------+-------+
                  |
    +-------------+-------------+------------------+
    |             |             |                  |
+---+---+  +-----+-----+  +---+----+  +----------+--+
|OpenRouter| |  Ollama   |  |Direct  |  |Custom       |
|300+ cloud| |  (local)  |  |APIs    |  |OAI-compat   |
|models    | |           |  |OAI/Ant |  |endpoint     |
+----------+ +-----------+  |/Google |  +-------------+
                             +--------+
```

---

## Project Structure

```
codedrill/
  .vscode/                    # VSCode launch configs for debugging
  src/
    extension.ts              # Extension entry point, activation
    core/
      scheduler.ts            # FSRS algorithm integration
      session-manager.ts      # Session orchestration (new + revision)
      problem-bank.ts         # Problem fetching, caching, selection
      problem-mutator.ts      # LLM-based problem variation generator
      timer.ts                # Countdown timer logic
    ai/
      llm-router.ts           # Unified LLM routing layer
      model-registry.ts       # Available models, provider resolution
      providers/
        openrouter.ts         # OpenRouter provider (300+ cloud models)
        ollama.ts             # Ollama provider (local models)
        openai-compat.ts      # OpenAI-compatible endpoint provider
        types.ts              # Shared provider interfaces
      personas/
        interviewer.ts        # Interviewer persona (Socratic, hints only)
        teacher.ts            # Teacher persona (full explanation mode)
        persona-router.ts     # Routes to correct persona based on session state
        prompts/
          interviewer-system.md
          teacher-system.md
    context/
      context-engine.ts       # Gathers IDE context for LLM calls
      mention-parser.ts       # Parses @file, @symbol, @selection mentions
      context-providers/
        file-provider.ts      # Read file contents from workspace
        symbol-provider.ts    # Resolve symbols via VSCode language services
        selection-provider.ts # Get current editor selection
        problem-provider.ts   # Current problem statement + test cases
    db/
      schema.ts               # SQLite schema definitions
      schema.sql              # Raw SQL schema
      migrations/             # DB migration files
      repository.ts           # Data access layer
    providers/
      bottom-panel.ts         # Main bottom panel webview provider
      problem-panel.ts        # Problem display (split view in panel)
    leetcode/
      client.ts               # LeetCode GraphQL client (leetcode-query)
      parser.ts               # Problem statement parser/formatter
      lists/
        neetcode150.json      # Curated: NeetCode 150
        blind75.json          # Curated: Blind 75
        grind75.json          # Curated: Grind 75
        system-design.json    # System design topics
    utils/
      config.ts               # Extension settings + config file management
      secrets.ts              # VSCode SecretStorage wrapper for API keys
      logger.ts               # Logging utility
  webview/
    src/
      App.tsx                 # React root
      components/
        BottomPanel.tsx       # Main panel layout (problem | chat | timer)
        Timer.tsx             # Visual countdown timer
        ProblemView.tsx       # Problem statement renderer (markdown)
        Chat.tsx              # AI conversation interface with streaming
        ChatInput.tsx         # Input with @-mention autocomplete
        ModelSelector.tsx     # Bottom-bar model picker dropdown
        ProviderSetup.tsx     # First-run provider configuration wizard
        Dashboard.tsx         # Progress stats and calendar
        SessionPicker.tsx     # Start new session UI
        CodeBlock.tsx         # Syntax-highlighted code in chat (read-only)
      hooks/
        useTimer.ts
        useSession.ts
        useChat.ts
        useModels.ts          # Available models from configured providers
        useContext.ts         # Context mention resolution
      styles/
        theme.css             # VSCode-compatible theming
  codedrill.config.json       # User model configuration file (gitignored)
  codedrill.config.example.json  # Example config (committed)
  codedrill.config.schema.json   # JSON schema for config validation
  test/
    unit/
    integration/
  package.json
  tsconfig.json
  esbuild.config.js
  README.md
  PLAN.md
```

---

## Database Schema (SQLite)

```sql
-- Core problem storage
CREATE TABLE problems (
  id            INTEGER PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  difficulty    TEXT CHECK(difficulty IN ('Easy','Medium','Hard')),
  category      TEXT NOT NULL,
  tags          TEXT,                          -- JSON array of tags
  description   TEXT NOT NULL,                 -- Original problem statement (markdown)
  examples      TEXT,                          -- JSON array of examples
  constraints   TEXT,                          -- Problem constraints
  test_cases    TEXT,                          -- JSON array of test cases
  hints         TEXT,                          -- JSON array of official hints
  solution_code TEXT,                          -- Reference solution
  source_list   TEXT,                          -- "neetcode150", "blind75", etc.
  leetcode_id   INTEGER,
  fetched_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FSRS review state per problem
CREATE TABLE review_cards (
  id            INTEGER PRIMARY KEY,
  problem_id    INTEGER NOT NULL REFERENCES problems(id),
  card_type     TEXT CHECK(card_type IN ('dsa','system_design')),
  stability     REAL DEFAULT 0,
  difficulty    REAL DEFAULT 0,
  due           DATETIME NOT NULL,
  last_review   DATETIME,
  reps          INTEGER DEFAULT 0,
  lapses        INTEGER DEFAULT 0,
  state         TEXT DEFAULT 'New',            -- New, Learning, Review, Relearning
  scheduled_days INTEGER DEFAULT 0,
  elapsed_days   INTEGER DEFAULT 0,
  UNIQUE(problem_id, card_type)
);

-- Every attempt/session log
CREATE TABLE attempts (
  id            INTEGER PRIMARY KEY,
  problem_id    INTEGER NOT NULL REFERENCES problems(id),
  card_id       INTEGER NOT NULL REFERENCES review_cards(id),
  started_at    DATETIME NOT NULL,
  finished_at   DATETIME,
  time_spent_ms INTEGER,
  timer_limit_ms INTEGER,
  rating        INTEGER CHECK(rating BETWEEN 1 AND 4),
  was_mutation  BOOLEAN DEFAULT FALSE,
  mutation_desc TEXT,
  user_code     TEXT,
  ai_hints_used INTEGER DEFAULT 0,
  gave_up       BOOLEAN DEFAULT FALSE,
  notes         TEXT
);

-- Session grouping (pairs of problems)
CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY,
  started_at    DATETIME NOT NULL,
  new_problem_id    INTEGER REFERENCES problems(id),
  review_problem_id INTEGER REFERENCES problems(id),
  completed     BOOLEAN DEFAULT FALSE
);

-- System design topics (separate track)
CREATE TABLE system_design_topics (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  description   TEXT NOT NULL,
  key_concepts  TEXT,                          -- JSON array
  follow_ups    TEXT,                          -- JSON array
  source        TEXT
);

-- User preferences and state
CREATE TABLE user_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

---

## Model Provider Architecture

### Design Philosophy: Cline/Codex-style Provider System

The extension uses a unified LLM router that abstracts over multiple provider backends. Users configure providers via a single config file and select their active model from a dropdown at the bottom of the panel -- identical to how Cline and Codex handle model selection.

### Supported Provider Types

**1. OpenRouter (Recommended for cloud models)**
- Single API key gives access to 300+ models from 60+ providers
- Uses official `@openrouter/sdk` TypeScript SDK
- Auto-discovers available models from the API
- Built-in fallback routing, rate limiting, cost tracking

**2. Ollama (Local models)**
- Zero-cost, fully private, no API key needed
- Auto-discovers models from local Ollama instance
- Supports any model Ollama can run

**3. Direct API Providers**
- OpenAI, Anthropic, Google AI directly
- Each uses its native SDK for best compatibility

**4. Custom OpenAI-Compatible Endpoint**
- For LM Studio, vLLM, text-generation-inference, or any OpenAI-compatible server
- User specifies base URL + optional API key

### LLM Router Interface

All providers implement the same `LLMProvider` interface. The router:
- Aggregates models from all configured providers into a single dropdown list
- Routes `chat()` calls to the correct provider based on the selected model
- Handles streaming responses uniformly across providers
- Falls back gracefully if a provider is unavailable

---

## Configuration File (`codedrill.config.json`)

A single JSON config file in the workspace root (gitignored) controls all provider and model settings:

```json
{
  "$schema": "./codedrill.config.schema.json",
  "providers": {
    "openrouter": { "enabled": true, "apiKey": "${OPENROUTER_API_KEY}" },
    "ollama": { "enabled": true, "baseUrl": "http://localhost:11434" },
    "openai": { "enabled": false, "apiKey": "${OPENAI_API_KEY}" },
    "anthropic": { "enabled": false, "apiKey": "${ANTHROPIC_API_KEY}" },
    "google": { "enabled": false, "apiKey": "${GOOGLE_AI_API_KEY}" },
    "custom": { "enabled": false, "name": "My LM Studio", "baseUrl": "http://localhost:1234/v1" }
  },
  "defaultModel": "anthropic/claude-sonnet-4",
  "preferences": { ... }
}
```

API Key Security:
- Config supports `${ENV_VAR}` syntax -- resolved at runtime
- Keys can also be stored in VSCode's SecretStorage (encrypted, OS keychain-backed)
- Config file is gitignored; only `.example` is committed
- NEVER store raw API keys if the repo is shared

---

## AI Persona Design

### Persona 1: Interviewer (Socratic Mode)

**When active:** During the timer and immediately after timer expires (if user hasn't given up).

**Behavior:**
- Acts as a real technical interviewer at a top company
- Never gives the answer directly
- Uses a hint escalation ladder:
  1. Clarifying questions -- "What data structure would help with O(1) lookups?"
  2. Pattern nudges -- "This has similarities to sliding window. Can you think why?"
  3. Subproblem decomposition -- "Can you first solve it for a sorted array?"
  4. Pseudocode guidance -- "What if you maintained a left and right pointer?"
  5. Edge case probing -- "What happens when the array is empty?"
- Tracks hint level per session; escalates only when user is stuck
- Asks follow-up questions about time/space complexity

### Persona 2: Teacher (Explanation Mode)

**When active:** After the user gives up, or explicitly requests full explanation.

**Behavior:**
- Follows a structured teaching flow:
  1. Problem restatement in simpler terms
  2. Brute force approach and its complexity
  3. Intuition building -- why brute force is insufficient
  4. Optimal approach -- step-by-step reasoning
  5. Dry run / trace through examples showing state changes
  6. Base case to general case (for recursive/DP problems)
  7. Annotated code walkthrough
  8. Complexity analysis
  9. Pattern recognition -- what signals identify this pattern
  10. Related problems using the same pattern
- Uses analogies and visual descriptions
- Asks comprehension check questions

### Context Provided to Both Personas

- The problem statement
- The user's current code (if any)
- How many times the user has seen this problem
- Previous attempt history (time spent, rating)
- The hint level reached so far (interviewer only)

---

## UI Layout: Bottom Panel (Cline/Codex-style)

The extension lives in a bottom panel (like the terminal area), not a sidebar.

```
+-------------------------------------------------------------------+
|                      CodeDrill Panel                               |
+---------------------------+---------------------------------------+
|  PROBLEM VIEW (40%)       |  CHAT (60%)                           |
|                           |                                       |
|  [Easy] Two Sum           |  [Interviewer]                        |
|  #arrays #hash-table      |  Have you considered what data        |
|                           |  structure gives O(1) lookups?        |
|  Given an array of        |                                       |
|  integers nums and an     |  [You]                                |
|  integer target, return   |  A hashmap? I can store values        |
|  indices of the two       |  as I iterate...                      |
|  numbers that add up to   |                                       |
|  target.                  |  [Interviewer]                        |
|                           |  Good thinking. What would you        |
|  Example 1:               |  store as key vs value?               |
|  Input: [2,7,11,15], 9   |                                       |
|  Output: [0,1]            |  +----------------------------------+ |
|                           |  | @problem @solution               | |
|  +---------+--------+     |  +----------------------------------+ |
|  | 12:45   | Pause  |     |  | Type your message... @    Send  | |
|  +---------+--------+     |  +----------------------------------+ |
+---------------------------+---------------------------------------+
| [OpenRouter] Claude Sonnet 4  |  1.2k tokens  |  Session 1 of 2  |
+-------------------------------------------------------------------+
```

### Key UI Components

**Model Selector (bottom-left):** Dropdown grouped by provider with metadata on hover.

**Chat Panel (right):** Streaming markdown, read-only code blocks, persona indicators, context badges.

**Chat Input (bottom):** @-mention autocomplete for @file, @selection, @symbol, @problem, @solution, @terminal.

### Code Stays in Chat, Not the IDE

All AI-generated code is read-only in the chat. This is intentional:
- Interview practice means YOU write the code
- The Teacher shows solutions for learning, not auto-applying
- No risk of AI accidentally modifying workspace files

---

## Context Engine

The context engine gathers IDE context and injects it into LLM calls (like Cursor/Windsurf/Codex).

**Default Context (auto-included):**
- Current problem statement and test cases
- User's solution code
- Attempt number and previous ratings

**Selective Context (@-mentions):**
- @file -- attach any workspace file
- @selection -- current editor selection
- @symbol -- function/class by symbol search
- @problem -- current problem statement
- @solution -- current solution code
- @terminal -- recent terminal output

Token budget management truncates context to fit `maxContextTokens`.

---

## Session Flow

1. User clicks "Start Session"
2. Session Manager asks FSRS Scheduler for due review cards
3. Session Manager picks a new problem from a different category
4. UI shows the pair; user selects one to attempt
5. Timer starts (configurable by difficulty)
6. User codes in their editor; Interviewer available via chat
7. Hints escalate through 5 levels as user requests them
8. Timer expires: user can continue or give up
9. If gave up: Teacher provides full structured explanation
10. User rates difficulty: Again (1) / Hard (2) / Good (3) / Easy (4)
11. FSRS updates card parameters and schedules next review

---

## Problem Mutation Strategy (Attempt 3+)

- **Constraint changes:** "Now solve with O(1) extra space"
- **Input type changes:** Array to linked list, integers to strings
- **Problem inversion:** "Find shortest instead of longest"
- **Follow-up extensions:** "Handle duplicate elements"
- **Combination:** Merge two known patterns into one problem

---

## Timer Configuration

- Default: Easy 20m, Medium 35m, Hard 50m, System Design 45m
- Visual countdown with color transitions (green -> yellow -> red)
- Notification alerts at 5 minutes remaining and at expiry
- Pause available but tracked (paused time excluded from stats)

---

## Curated Problem Lists

- **Blind 75** -- 75 essential problems
- **NeetCode 150** -- 150 problems with full category coverage
- **Grind 75** -- Customizable 75-169 problem set
- **System Design** -- 30+ topics (fundamentals, components, full designs)
- Custom lists can be added by slug

---

## Dashboard / Progress Tracking

- Today's session status (new + review)
- Streak calendar (GitHub-style heatmap)
- Category progress (radar chart by DSA category)
- Upcoming reviews (next 1/3/7 days)
- Stats: total solved, average time, success rate by difficulty
- Weak areas: categories with highest lapse rates

---

## Tech Stack

- **Extension runtime:** TypeScript, VSCode Extension API
- **UI:** React 19 + Webview API (bottom panel)
- **Bundler:** esbuild
- **Database:** sql.js (SQLite via WASM, cross-platform)
- **Scheduling:** ts-fsrs
- **LeetCode data:** leetcode-query (GraphQL)
- **LLM providers:** @openrouter/sdk, ollama, openai SDK
- **Markdown:** marked + highlight.js
- **Testing:** Vitest + VSCode Extension Test Runner

---

## Development Phases

### Phase 1: Foundation + Provider System (MVP)
- VSCode extension scaffold with TypeScript + esbuild
- Bottom panel webview with React 19
- Config system (codedrill.config.json + schema + example)
- LLM Router with OpenRouter + Ollama providers
- Model selector dropdown (Cline-style)
- First-run provider setup wizard
- SQLite setup with sql.js
- Problem bank from bundled JSON lists
- FSRS scheduler integration
- Session manager (1 new + 1 review)
- Problem display + countdown timer
- Manual rating (Again/Hard/Good/Easy)

### Phase 2: AI Personas + Context Engine
- Chat panel with streaming markdown + read-only code blocks
- Context engine with @-mentions
- Interviewer persona (Socratic hints)
- Teacher persona (structured explanations)
- Persona routing based on session state
- Default context injection
- Token budget management

### Phase 3: LeetCode Integration + Direct Providers
- LeetCode GraphQL integration
- Problem mutation engine
- Direct API providers (OpenAI, Anthropic, Google)
- Custom OpenAI-compatible endpoint
- Dashboard with progress stats and streak calendar

### Phase 4: Polish and Distribution
- System design topic support
- Custom problem list import
- Export/import progress data
- VS Code Marketplace publishing
- Test suite
- Documentation
- GitHub Actions CI

---

## Key Dependencies

```json
{
  "dependencies": {
    "ts-fsrs": "^4.x",
    "sql.js": "^1.x",
    "leetcode-query": "^3.x",
    "marked": "^15.x",
    "highlight.js": "^11.x",
    "@openrouter/sdk": "latest",
    "ollama": "^0.5.x",
    "openai": "^4.x"
  },
  "devDependencies": {
    "@types/vscode": "^1.96.0",
    "typescript": "^5.7",
    "esbuild": "^0.24",
    "react": "^19.x",
    "react-dom": "^19.x",
    "@types/react": "^19.x",
    "vitest": "^3.x",
    "@vscode/test-electron": "^2.x"
  }
}
```

---

## Repository Setup

- **Repo name:** `codedrill` (on GitHub under `afzalmukhtar`)
- **License:** MIT
- **Branch strategy:** `main` (stable) + `develop` (active) + feature branches
- **.gitignore:** Node, VSCode extension, SQLite DB files, .env, codedrill.config.json
- **CI:** GitHub Actions for lint, test, and package (.vsix) on PR
