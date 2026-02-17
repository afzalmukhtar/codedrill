# CodeDrill Problem Pipeline Skill

Use this skill when working on CodeDrill's problem creation, fetching, or management features. This documents the full pipeline from LeetCode GraphQL to the user's screen.

## Architecture Overview

```
LeetCode GraphQL API
       │
       ▼
  LeetCodeClient (src/leetcode/client.ts)
  - Uses `leetcode-query` npm package
  - Rate-limited (500ms between calls)
  - Returns LeetCodeProblem interface
       │
       ▼
  ProblemParser (src/leetcode/parser.ts)
  - Converts HTML → Markdown
  - Extracts examples, constraints, test cases
  - Normalizes difficulty and tags
       │
       ▼
  Repository (src/db/repository.ts)
  - SQLite via sql.js (WASM, in-memory + persist)
  - Tables: problems, review_cards, attempts, sessions
  - Methods: insertProblem, updateProblem, getProblemBySlug, listProblems, etc.
       │
       ▼
  ProblemBank (src/core/problem-bank.ts)
  - Imports bundled lists (neetcode150.json, blind75.json) into DB
  - On-demand fetching: if problem.description is empty, fetches from LeetCode
  - getNewProblem() returns an unseen problem
       │
       ▼
  ProblemGeneratorPersona (src/ai/personas/problem-generator.ts)
  - Sends problem metadata to LLM with problem-generator.md prompt
  - Streams the response (with onChunk callback for live preview)
  - Returns full Markdown problem statement
       │
       ▼
  ProblemMutator (src/core/problem-mutator.ts)
  - Activated on attempt 3+ for the same problem
  - Strategies: Constraint Change, Input Type Change, Inversion, Follow-up, Combination
  - Uses mutator-system.md prompt template
       │
       ▼
  .codedrill/problems/YYYY-MM-DD/{slug}.md
  - Written to user's workspace
  - Opened in VS Code editor
```

## Key Files

| File | Purpose |
|---|---|
| `src/leetcode/client.ts` | LeetCode GraphQL client (uses `leetcode-query`) |
| `src/leetcode/parser.ts` | HTML-to-Markdown converter + example extractor |
| `src/leetcode/lists/neetcode150.json` | Bundled NeetCode 150 problem list |
| `src/leetcode/lists/blind75.json` | Bundled Blind 75 problem list |
| `src/db/schema.ts` | TypeScript interfaces for all DB tables |
| `src/db/schema.sql` | Raw SQL CREATE TABLE statements |
| `src/db/repository.ts` | All database CRUD operations |
| `src/core/problem-bank.ts` | Problem selection + on-demand fetch orchestration |
| `src/core/problem-mutator.ts` | LLM-based problem variation generator |
| `src/ai/personas/problem-generator.ts` | LLM-based problem statement generator |
| `src/ai/personas/prompts/problem-generator.md` | Prompt template for generation |
| `src/ai/personas/prompts/mutator-system.md` | Prompt template for mutations |

## Database Schema (key tables)

```sql
-- Problems table
CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('Easy','Medium','Hard')),
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  tags TEXT NOT NULL DEFAULT '[]',           -- JSON array
  description TEXT NOT NULL DEFAULT '',
  examples TEXT NOT NULL DEFAULT '[]',       -- JSON array
  constraints TEXT NOT NULL DEFAULT '',
  test_cases TEXT NOT NULL DEFAULT '[]',     -- JSON array
  hints TEXT NOT NULL DEFAULT '[]',          -- JSON array
  solution_code TEXT,
  source_list TEXT NOT NULL DEFAULT 'unknown',
  leetcode_id INTEGER,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Attempts table (tracks each user attempt at a problem)
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id),
  card_id INTEGER NOT NULL REFERENCES review_cards(id),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  time_spent_ms INTEGER,
  timer_limit_ms INTEGER,
  rating INTEGER CHECK(rating IN (1,2,3,4)),
  was_mutation INTEGER NOT NULL DEFAULT 0,
  mutation_desc TEXT,
  user_code TEXT,
  ai_hints_used INTEGER NOT NULL DEFAULT 0,
  gave_up INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
```

## How to Add a New Problem Source

1. Create a JSON file in `src/leetcode/lists/` following the format:
   ```json
   {
     "name": "my-list",
     "description": "Description",
     "source": "https://example.com",
     "problems": [
       { "slug": "two-sum", "title": "Two Sum", "difficulty": "Easy", "category": "Arrays" }
     ]
   }
   ```
2. Add the filename to `ProblemBank.initialize()` in `src/core/problem-bank.ts`
3. The bank will import new problems on next activation

## How to Fetch a Problem from LeetCode

```typescript
const client = new LeetCodeClient();
const raw = await client.fetchProblem("two-sum"); // uses slug
if (raw) {
  const parser = new ProblemParser();
  const problem = parser.parse(raw, "neetcode150");
  // problem has: description (Markdown), examples, constraints, tags, etc.
}
```

## How Problem Selection Works

1. `ProblemBank.getNewProblem()` calls `Repository.getUnseenProblem()`
2. SQL query excludes problems that already have attempts
3. If the selected problem has no description, it auto-fetches from LeetCode
4. If attempt count >= 3, `ProblemMutator` generates a variation instead

## LeetCode MCP Server (Planned)

A future MCP server would expose:
- `leetcode.search(query)` -- search problems by keyword
- `leetcode.getProblem(slug)` -- get full problem details
- `leetcode.getRandomProblem(difficulty, category)` -- random selection
- `leetcode.getCompanySolutions(company)` -- company-tagged problems

This would allow the AI chat to directly query LeetCode based on user questions like "give me a hard graph problem" or "what problems does Google ask about trees?".
