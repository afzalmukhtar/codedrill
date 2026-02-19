# CodeDrill

**Master DSA and System Design with Science-Backed Interview Practice**

CodeDrill is an IDE extension that transforms technical interview preparation into a scientifically-optimized learning system. It combines FSRS spaced repetition, dual AI personas (Interviewer + Teacher), timed practice, 3,200+ problems with company tags, and progressive problem mutation -- all inside your editor.

Works with **VS Code**, **Cursor**, and **Windsurf**.

---

## Installation

### Option A: Install from `.vsix` file

Download `codedrill-1.0.0.vsix` from the releases page, then install it in your IDE:

**VS Code:**

```bash
code --install-extension codedrill-1.0.0.vsix
```

**Cursor:**

```bash
cursor --install-extension codedrill-1.0.0.vsix
```

**Windsurf:**

```bash
windsurf --install-extension codedrill-1.0.0.vsix
```

Or in any of the three IDEs: open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`), type `Extensions: Install from VSIX...`, and select the file.

### Option B: Install from Marketplace

Search for **CodeDrill** in the Extensions tab of your IDE.

---

## Setup (First Run)

### Step 1: Open the CodeDrill sidebar

Click the CodeDrill icon in the Activity Bar (left sidebar). You'll see a welcome screen with setup instructions.

### Step 2: Configure an AI model

CodeDrill needs an LLM to power the Interviewer, Teacher, and test generation. Click the `+` button at the bottom of the sidebar, or run the command `CodeDrill: Configure Model Providers`.

This creates a `codedrill.config.json` file in your workspace. Edit it to enable your preferred provider:

**Ollama (Free, Local -- Recommended for getting started):**

1. Install Ollama from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull qwen2.5:14b` (or any model you prefer)
3. Your config should have:

```json
{
  "providers": {
    "ollama": {
      "enabled": true,
      "baseUrl": "http://localhost:11434"
    }
  },
  "defaultModel": "qwen2.5:14b"
}
```

**OpenAI:**

```json
{
  "providers": {
    "openai": {
      "enabled": true,
      "apiKey": "sk-..."
    }
  },
  "defaultModel": "gpt-4o"
}
```

**OpenRouter (300+ models with one key):**

```json
{
  "providers": {
    "openrouter": {
      "enabled": true,
      "apiKey": "sk-or-v1-..."
    }
  },
  "defaultModel": "anthropic/claude-sonnet-4"
}
```

**Azure OpenAI:**

```json
{
  "providers": {
    "azureOpenai": {
      "enabled": true,
      "endpoint": "https://your-resource.openai.azure.com",
      "apiKey": "...",
      "apiVersion": "2024-08-01-preview",
      "deployment": "gpt-4o"
    }
  }
}
```

See `codedrill.config.example.json` for the full template with all providers.

> **Security:** Never commit `codedrill.config.json` to git. CodeDrill automatically adds it to `.gitignore`.

### Step 3: Start practicing

Click the **Practice** button in the sidebar toolbar. CodeDrill will:
1. Pick a problem (new or due for review)
2. Fetch its full description from LeetCode
3. Scaffold a solution file (`{problem_name}.py`) and test file (`test_{problem_name}.py`) with 20+ test cases
4. Open both in your editor

---

## How to Use

### Practice Session Flow

1. **Start a session** -- Click **Practice**. A problem is selected and opened.
2. **Set the timer** -- Use the `+15`, `+10`, `+5`, `+1` buttons to adjust, then click **Start**.
3. **Code your solution** -- The Interviewer persona watches silently. If you're stuck, it nudges you with Socratic hints.
4. **Run Tests** -- Click **Run Tests** to run pytest against 20+ test cases.
5. **Give Up or finish** -- Click **Give Up** to switch to Teacher mode. The Teacher walks you through the solution step by step.
6. **Rate yourself** -- Again / Hard / Good / Easy. FSRS schedules your next review.

### Sidebar Buttons

| Button | What it does |
|--------|-------------|
| **Practice** | Start a new practice session (random problem) |
| **Problems** | Browse all 3,200+ problems with filters (difficulty, category, pattern, company) |
| **History** | View and resume past chat sessions |
| **Stats** | Dashboard with streaks, category progress, company coverage |
| **Profile** | Paste your resume to generate personalized system design topics |
| **View Problem** | Open the problem markdown in a split pane |
| **Code Stub** | Create solution + test files for the current problem |
| **Run Tests** | Execute pytest in a terminal |
| **Regen Tests** | Re-generate 20+ test cases using AI |
| **Give Up** | Stop timer, switch to Teacher mode |

### Browsing Problems

Click **Problems** to browse without starting a session. You can:
- Filter by difficulty, category, algorithm pattern, or company
- Search by title
- Click any problem to set it as active
- Click **Code Stub** to scaffold files and start coding

### System Design (Resume-Driven)

1. Click **Profile** in the toolbar
2. Paste your resume text and click **Analyze Resume**
3. CodeDrill extracts your seniority, tech stack, and domains
4. It generates 5-10 personalized system design topics
5. Find them in the **Problems** tab under "System Design"
6. Click **Practice** on any topic to start a timed session

### AI Modes

| Mode | When | Behavior |
|------|------|----------|
| **Interviewer** | Timer is running | Concise, Socratic hints only. Never gives solutions. Auto-nudges if you're stuck. |
| **Teacher** | After Give Up or timer expires | Warm, structured explanations. Problem restatement, brute force, optimal approach, code walkthrough, complexity, related problems. |

Modes switch automatically based on the timer. You can also switch manually.

---

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

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Alt+P` / `Ctrl+Alt+P` | Start Practice Session |
| `Cmd+Alt+D` / `Ctrl+Alt+D` | Open Dashboard |

---

## Problem Lists

- **Blind 75** -- 75 essential problems
- **NeetCode 150** -- 150 problems with full category coverage
- **Grind 75** -- Customizable problem set
- **Company-tagged** -- 3,200+ problems from MAANG interview repos (660+ companies)
- **System Design** -- 30+ bundled topics + resume-generated personalized topics

---

## Configuration Reference

All settings live in `codedrill.config.json` at the workspace root.

```json
{
  "providers": { ... },
  "defaultModel": "qwen2.5:14b",
  "preferences": {
    "timerEasy": 20,
    "timerMedium": 35,
    "timerHard": 50,
    "timerSystemDesign": 45,
    "preferredLanguage": "python",
    "dailyNewProblems": 1,
    "dailyReviewProblems": 1,
    "mutationStartsAtAttempt": 3
  }
}
```

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [VS Code](https://code.visualstudio.com/), [Cursor](https://cursor.com/), or [Windsurf](https://windsurf.com/) 1.96.0+

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

---

## Contributing

Contributions are welcome! Please read the [CHANGELOG](CHANGELOG.md) and open an issue or PR.

## License

MIT -- see [LICENSE](LICENSE) for details.
