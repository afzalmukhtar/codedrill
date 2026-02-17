# CodeDrill

**Master DSA and System Design with Science-Backed Interview Practice**

CodeDrill is a VSCode extension that transforms technical interview preparation into a scientifically-optimized learning system. It combines FSRS spaced repetition scheduling, Socratic AI tutoring, timed practice sessions, and progressive problem mutation to build deep, long-term understanding of DSA patterns and system design concepts.

## Features

- **Spaced Repetition (FSRS)** -- Review problems at scientifically optimal intervals. The algorithm adapts to your personal memory patterns.
- **Dual AI Personas** -- An Interviewer persona guides you with Socratic hints during practice. A Teacher persona provides full explanations when you need them.
- **Timed Practice** -- Configurable countdown timers by difficulty (Easy 20m, Medium 35m, Hard 50m) simulate real interview pressure.
- **Interleaved Sessions** -- Each session pairs one new problem with one review problem from different categories.
- **Problem Mutation** -- After your 2nd attempt, problems are mutated (changed constraints, different inputs) so you learn the pattern, not memorize the solution.
- **Multi-Provider AI** -- Use OpenRouter (300+ cloud models), Ollama (local models), or direct APIs (OpenAI, Anthropic, Google).
- **IDE Context** -- Attach files, selections, and symbols from your workspace using @-mentions in the chat.
- **Progress Dashboard** -- Track streaks, category mastery, upcoming reviews, and weak areas.

## Curated Problem Lists

- **Blind 75** -- 75 essential problems for quick foundational prep
- **NeetCode 150** -- 150 problems with full category coverage
- **Grind 75** -- Customizable 75-169 problem set
- **System Design** -- 30+ topics from fundamentals to full system designs

## Getting Started

### Prerequisites

- [VSCode](https://code.visualstudio.com/) 1.96.0 or later
- [Node.js](https://nodejs.org/) 18+
- (Optional) [Ollama](https://ollama.com/) for local AI models

### Installation (Development)

```bash
git clone git@github.com:afzalmukhtar/codedrill.git
cd codedrill
npm install
npm run watch
```

Press `F5` in VSCode to launch the Extension Development Host.

### Configuration

1. Copy the example config:
   ```bash
   cp codedrill.config.example.json codedrill.config.json
   ```

2. Configure your preferred model provider(s) in `codedrill.config.json`.

3. For API keys, either:
   - Set environment variables (e.g., `OPENROUTER_API_KEY`) and reference them with `${ENV_VAR}` syntax in the config
   - Or use the first-run setup wizard which stores keys securely in VSCode's SecretStorage

### Model Providers

| Provider | Setup | Cost |
|----------|-------|------|
| **OpenRouter** | Single API key, 300+ models | Pay per token |
| **Ollama** | Install locally, no key needed | Free |
| **OpenAI** | Direct API key | Pay per token |
| **Anthropic** | Direct API key | Pay per token |
| **Google AI** | Direct API key | Free tier + pay |
| **Custom** | Any OpenAI-compatible endpoint | Varies |

## How It Works

1. **Start a session** -- CodeDrill picks one new problem and one review problem.
2. **Timer starts** -- Solve the problem under timed pressure.
3. **Ask for hints** -- The Interviewer persona gives Socratic hints, escalating gradually.
4. **Timer expires** -- Choose to keep going or switch to the Teacher for a full explanation.
5. **Rate yourself** -- Again / Hard / Good / Easy. The FSRS algorithm schedules your next review.
6. **Problem evolves** -- On your 3rd+ attempt, the problem mutates to test the underlying pattern.

## Tech Stack

- **Extension:** TypeScript, VSCode Extension API
- **UI:** React 19, Webview API (bottom panel)
- **Database:** sql.js (SQLite via WASM)
- **Scheduling:** ts-fsrs (FSRS spaced repetition)
- **LLM:** @openrouter/sdk, ollama, openai SDK
- **Build:** esbuild

## Project Structure

See [PLAN.md](PLAN.md) for the full architecture, database schema, AI persona design, and development roadmap.

## Contributing

Contributions are welcome! Please read the plan document first to understand the architecture, then open an issue or PR.

## License

MIT -- see [LICENSE](LICENSE) for details.
