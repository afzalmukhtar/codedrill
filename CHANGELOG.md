# Changelog

All notable changes to the CodeDrill extension will be documented in this file.

## [1.0.0] - 2026-02-19

### Added

- **Unified Problem Library**: 3,200+ problems aggregated from 8 GitHub repositories plus Blind 75, NeetCode 150, and Grind 75. Every problem tagged with category, algorithm pattern, and company data.
- **Company-wise Filtering**: Filter problems by company (660+ companies), algorithm pattern (19 families), difficulty, and category in the Problem Browser.
- **Resume-Driven System Design**: Paste your resume to auto-generate personalized system design topics calibrated to your experience. Promote topics to full practice sessions.
- **Git Workspace Integration**: Optionally track practice progress in a git repo. Auto-scaffolds `solution.py`, `test_solution.py`, and `problem.md` per problem with auto-commit.
- **Code Stub & Test Runner**: One-click code stub creation for any active problem. Run pytest directly from the sidebar.
- **Welcome Onboarding**: Guided setup card for new users with step-by-step model configuration instructions.
- **Dashboard Company Coverage**: Top-20 company progress visualization in the Stats dashboard.
- **Chat Export**: Export any chat as Markdown via native Save As dialog with toast notification.
- **Copy & Regenerate**: Copy any message to clipboard or regenerate the last AI response.
- **Profile Panel**: Dedicated tab for resume submission, preferred language selection, and profile insights.
- **Mermaid Diagram Support**: Problem markdown previews render Mermaid diagrams (trees, graphs, flowcharts).
- **GitHub-style Markdown Preview**: Bundled CSS for VS Code's built-in markdown previewer.

### Changed

- **SVG Icon System**: Replaced all HTML entity icons with consistent, properly sized SVG icons across the entire UI.
- **Debounced Interactions**: Send messages and search chat history with debouncing to prevent accidental duplicates.
- **CSP Hardening**: Replaced `unsafe-inline` with nonce-based Content Security Policy for webview styles.

### Fixed

- **XSS Sanitization**: All markdown HTML is now sanitized with DOMPurify before rendering.
- **Deactivation Cleanup**: Extension properly closes database, aborts streams, stops timer, and clears intervals on deactivation.
- **DB Corruption Recovery**: Shows a user notification when the database is corrupted instead of silently resetting.
- **Heartbeat Interval Leak**: Interviewer heartbeat interval is properly cleared on deactivation.
- **API Key Safety**: Config file is auto-added to `.gitignore` with a warning not to commit API keys.
- **HTML Entity Rendering**: Extended parser to correctly decode `&lfloor;`, `&rfloor;`, `&times;`, and 20+ other HTML entities in problem descriptions.
- **Silent Failures**: Repository-not-ready errors now surface as chat messages instead of silently returning.
- **New Chat State Reset**: Starting a new chat properly clears active problem, assessment, and exchange count.

### Security

- DOMPurify sanitization on all rendered markdown content
- Nonce-based CSP (no more `unsafe-inline`)
- API key gitignore protection with config file warning

## [0.1.0] - 2026-02-18

### Added

- **Core Practice Loop**: Start timed practice sessions with problems from Blind 75, NeetCode 150, and Grind 75 curated lists.
- **Dual AI Persona System**: Interviewer mode (Socratic hints, never gives answers) and Teacher mode (structured 3-phase explanation with comprehension checks).
- **Auto Mode Switching**: Timer start locks to Interviewer; timer expiry or "Give Up" switches to Teacher automatically.
- **FSRS Spaced Repetition**: Rate yourself Again/Hard/Good/Easy after each attempt. The FSRS algorithm schedules your next review at the optimal interval.
- **Problem Mutation**: After 2+ attempts on the same problem, constraints, inputs, or objectives are mutated so you learn the pattern, not the solution.
- **Pattern Tagging**: Every problem is tagged with its algorithm pattern family (Sliding Window, Two Pointers, BFS/DFS, etc.) for targeted learning.
- **Multi-Provider AI**: Ollama (local/free), OpenRouter (300+ cloud models), OpenAI, Anthropic, Google, Azure OpenAI, and any OpenAI-compatible endpoint.
- **Rich Markdown Chat**: Full markdown rendering with syntax-highlighted code blocks, copy buttons, tables, and lists.
- **Code Context Engine**: Automatic injection of active file, selection, and cursor context into every AI conversation.
- **User Profile System**: Auto-generated learner profile that adapts AI teaching style to your strengths and weaknesses.
- **Progress Dashboard**: Streak tracking, category mastery bars, pattern mastery, due review counts, and difficulty distribution.
- **Problem Browser**: Browse all problems by category with difficulty badges and pattern tags.
- **Chat History**: Persistent chat history with load, delete, and new chat support.
- **LeetCode Integration**: Fetch real problem descriptions from LeetCode via GraphQL. Batch download support for offline use.
- **Session Cancellation**: Cancel in-progress problem generation from both the sidebar and the VS Code notification.
- **Timer**: Manual start, pause/resume, configurable durations per difficulty, role badge showing active persona.
