# Changelog

All notable changes to the CodeDrill extension will be documented in this file.

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
