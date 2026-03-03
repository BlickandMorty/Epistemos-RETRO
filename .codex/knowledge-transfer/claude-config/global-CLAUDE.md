# Global Engineering Rules — All Projects

## Golden Rules (non-negotiable, every repo)

1. **Zero copy-paste.** If code exists, call it. Extract shared functions ruthlessly. Three similar lines is tolerable, four is not.
2. **Direct communication.** No wrappers around wrappers. Shortest path from intent to execution. Say what you mean in code and in conversation.
3. **Performance is architecture.** Pre-allocate. Debounce. Cache. Zero unnecessary allocations in hot paths. Measure before and after.
4. **Minimal changes.** Don't refactor adjacent code. Don't add features beyond scope. Don't add comments to code you didn't change. A bug fix is just a bug fix.
5. **Test-first.** Write a failing test that proves the bug before writing the fix. Cover edge cases: empty, nil, max, unicode, concurrent, rapid toggle, boundary values.
6. **Read before writing.** Never modify a file you haven't read first. Understand existing patterns before introducing new ones.
7. **No over-engineering.** Don't add error handling for scenarios that can't happen. Don't design for hypothetical futures. Don't create abstractions for one-time operations.

## Code Quality Standards

- **DRY ruthlessly.** If you see duplication, eliminate it. If a pattern repeats across files, extract it.
- **Names are documentation.** Function and variable names should make comments unnecessary. Only comment non-obvious WHY, never WHAT.
- **Lean code.** Every line should earn its place. Delete dead code, don't comment it out. Remove unused imports, variables, parameters.
- **Error handling at boundaries.** Validate user input and external APIs. Trust internal code and framework guarantees.
- **Async over sync.** Use async/await, not completion handlers or GCD. Cancellable tasks, not fire-and-forget.

## Decision Making

- When multiple approaches exist, pick the simplest one that meets requirements.
- When unsure between two patterns, follow what the existing codebase already does.
- When a fix requires touching 5+ files, stop and think if there's a simpler approach.
- When debugging, trace the actual execution path — don't guess. Read the code.
- When tests fail, understand WHY before changing the test or the code.

## Communication Style

- Be direct. No filler words, no hedging, no unnecessary preamble.
- Show the work. Explain trade-offs when they matter.
- If something is wrong, say it's wrong. Don't sugarcoat.
- If you don't know something, say so. Don't guess.

## Project-Specific Rules

Each repo has its own `CLAUDE.md` at the root with project-specific patterns.
Always read the repo-level `CLAUDE.md` before doing any work.

### Active Projects
- `~/Epistemos/` — macOS Opulent Edition (Swift + Metal + Rust). See its CLAUDE.md.
- `~/Epistemos-RETRO/` — Windows Retro Edition (Tauri + Rust). Separate project, separate rules.
- `~/meta-analytical-pfc/brainiacv2/` — Web frontend (Next.js). Reference only for Retro translation.
