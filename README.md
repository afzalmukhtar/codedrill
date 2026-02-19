# CodeDrill

**Master DSA and System Design with Science-Backed Interview Practice**

CodeDrill is a VS Code / Cursor extension that transforms technical interview preparation into a scientifically-optimized learning system. It combines FSRS spaced repetition, dual AI personas (Interviewer + Teacher), timed practice, 3,200+ problems with company tags, and progressive problem mutation -- all inside your IDE.

## Features

- **3,200+ Problems** from Blind 75, NeetCode 150, Grind 75, and 8 curated GitHub repositories. Every problem tagged with difficulty, algorithm pattern, and company data (660+ companies).
- **Dual AI Personas** -- An Interviewer guides you with Socratic hints during timed practice. A Teacher provides structured explanations when you're done.
- **Auto Mode Switching** -- Timer start locks to Interviewer mode; Give Up or timer expiry switches to Teacher automatically.
- **FSRS Spaced Repetition** -- Rate yourself Again / Hard / Good / Easy after each attempt. The FSRS algorithm schedules your next review at the optimal interval.
- **Problem Mutation** -- After 2+ attempts, constraints and inputs are mutated so you learn the pattern, not memorize the answer.
- **Resume-Driven System Design** -- Paste your resume to generate personalized system design topics calibrated to your seniority and tech stack.
- **Code Context** -- Your active file, selection, and cursor position are automatically injected into every AI conversation.
- **Git Progress Tracking** -- Optionally track your practice in a git repo with auto-scaffolded `solution.py` and `test_solution.py` per problem.
- **Rich Markdown Chat** -- Syntax-highlighted code blocks, copy buttons, tables, and lists in the sidebar.
- **Progress Dashboard** -- Streak tracking, category mastery, pattern progress, company coverage, and review schedule.

## Supported AI Providers

| Provider | Setup | Cost |
|----------|-------|------|
| **Ollama** | Install locally, no key needed | Free |
| **OpenRouter** | Single API key, 300+ models | Pay per token |
| **OpenAI** | Direct API key | Pay per token |
| **Azure OpenAI** | Endpoint + key + deployment | Pay per token |
| **Anthropic** | Direct API key | Pay per token |
| **Google AI** | Direct API key | Free tier + pay |
| **Custom** | Any OpenAI-compatible endpoint | Varies |

## Quick Start

1. **Install** -- Search for "CodeDrill" in the VS Code / Cursor extensions marketplace, or install from a `.vsix` file.
2. **Configure a model** -- Click the `+` button at the bottom of the sidebar (or run `CodeDrill: Configure Model Providers`). Add at least one provider.
3. **Practice** -- Click the **Practice** button to start a session. A problem will be selected, scaffolded, and opened in your editor.

## How It Works

1. **Start a session** -- CodeDrill picks a problem from the bank (new or review, based on spaced repetition).
2. **Set the timer** -- Adjust the countdown and click Start when ready.
3. **Code your solution** -- The Interviewer persona watches silently, nudging you with hints if you're stuck.
4. **Give Up or finish** -- The Teacher persona takes over with a structured explanation: problem restatement, brute force, optimal approach, code walkthrough, complexity analysis, and related problems.
5. **Rate yourself** -- Again / Hard / Good / Easy. The FSRS algorithm schedules your next review.
6. **Problem evolves** -- On your 3rd+ attempt, the problem mutates to test the underlying pattern.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Alt+P` / `Ctrl+Alt+P` | Start Practice Session |
| `Cmd+Alt+D` / `Ctrl+Alt+D` | Open Dashboard |

## Configuration

All settings live in `codedrill.config.json` at the workspace root. Run `CodeDrill: Configure Model Providers` to create or edit it. See `codedrill.config.example.json` for the full template.

**Important:** Do not commit `codedrill.config.json` to version control -- it may contain API keys. CodeDrill automatically adds it to `.gitignore`.

## Problem Lists

- **Blind 75** -- 75 essential problems for quick foundational prep
- **NeetCode 150** -- 150 problems with full category coverage
- **Grind 75** -- Customizable 75-169 problem set
- **Company-tagged problems** -- 3,200+ problems from MAANG interview repos with 660+ company tags
- **System Design** -- 30+ bundled topics + resume-generated personalized topics

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [VS Code](https://code.visualstudio.com/) or [Cursor](https://cursor.com/) 1.96.0+

### Setup

```bash
git clone https://github.com/afzalmukhtar/codedrill.git
cd codedrill
npm install
npm run watch
```

Press `F5` to launch the Extension Development Host.

### Build & Package

```bash
npm run build          # Production build
npm run package        # Create .vsix file
```

### Tech Stack

- **Extension:** TypeScript, VS Code Extension API
- **UI:** React 19, Webview API
- **Database:** sql.js (SQLite via WASM)
- **Scheduling:** ts-fsrs (FSRS spaced repetition)
- **LLM:** openai SDK, ollama, @openrouter/sdk
- **Markdown:** marked + DOMPurify + highlight.js
- **Build:** esbuild

## Contributing

Contributions are welcome! Please read the [CHANGELOG](CHANGELOG.md) and open an issue or PR.

## License

MIT -- see [LICENSE](LICENSE) for details.
