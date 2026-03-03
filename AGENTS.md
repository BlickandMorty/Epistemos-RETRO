# Epistemos-RETRO Codex Operating Instructions

These instructions are for all Codex sessions in this repository.

## Mandatory Bootstrap (Every Session)

Before making code changes, read these files in order:

1. `.codex/knowledge-transfer/RETRO-ENGINEERING-BIBLE.md`
2. `.codex/knowledge-transfer/memory/MEMORY.md`
3. `.codex/knowledge-transfer/memory/epistemos.md`
4. `.codex/knowledge-transfer/docs/audit-progress.md`
5. `.codex/knowledge-transfer/plans/2026-03-01-unified-gap-report.md`
6. `.codex/knowledge-transfer/plans/2026-03-01-phase-implementation-plans.md`

If the task is graph/FPS-specific, also read:
- `.codex/knowledge-transfer/plans/2026-03-01-fps-explore-mode-design.md`
- `.codex/knowledge-transfer/plans/2026-03-01-fps-explore-mode-plan.md`

## Source of Truth

- Epistemos Retro is a parity port.
- Behavioral source of truth for logic is the macOS app at `/Users/jojo/Epistemos/`.
- Do not invent alternative architecture when parity behavior already exists.

## Enforced Engineering Rules

- Frontend/backend integration uses Tauri `invoke()` and Tauri events.
- Do not use mock/stub data for production paths unless explicitly requested.
- Keep graph/physics architecture aligned with the transfer docs.
- Prefer batch operations over per-item IPC loops.
- Keep Rust quality gates clean:
  - `cargo check`
  - `cargo clippy -- -D warnings`
  - `cargo test`

## Planning and Execution

- Match work to the plan docs in `.codex/knowledge-transfer/plans/`.
- Keep updates grounded in current audit state from `.codex/knowledge-transfer/docs/audit-progress.md`.
- When unsure, prefer the stricter interpretation of the transfer docs.

## Knowledge Pack Integrity

- Do not delete or rename `.codex/knowledge-transfer/` content.
- Treat the knowledge-transfer pack as persistent context for this repo.
