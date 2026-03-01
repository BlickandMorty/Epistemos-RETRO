# Audit Progress — Retro Edition
Last updated: 2026-03-01

## Current Position
Phase: Gap Closure Complete | Status: MONITORING

## Session Stats
Tests before: 323 | Tests after: 360 | New tests: 37
Fixes this session: 21 commits | Deferred: 0

## Audit Bible
Source: `docs/plans/2026-03-01-unified-gap-report.md` (all 15 items already fixed)
Pivoted to: Deep scan for new issues in graph/physics/LLM/storage subsystems

## Completed — General Audit (Items 1-5)

- [x] 1: Remove .unwrap() in production code (commit 428d599)
- [x] 2: Audit unsafe blocks + SAFETY comments (commit 8c90115)
- [x] 3: Fix LIKE-wildcard injection in search (commit 64035b1)
- [x] 4: Surface critical DB write failures (commit 6502946)
- [x] 5: Fix integer overflow + NaN propagation (commit 7e24887)

## Completed — Graph/FPS Physics Audit (Items 6-22)

- [x] 6-11: Double mutex, settled throttle, NaN edge weight, div-by-zero, FPS reload, velocity clamp (commit bb156bb)
- [x] 12-14: world_scale guard, stiffness clamp, centroid spawn (commit ec2e032)
- [x] 15-16: Central gravity cap, NaN recovery (commit c8ab0e1)
- [x] 17: Frontend PhysicsFrame/FpsFrame type fix (commit 8e46f21)
- [x] 18: Spring stiffness cap + joint damping clamp (commit 166f5c1)
- [x] 19: node_id_to_index SipHash + O(1) reverse lookup (commit 9ad4be7)
- [x] 20-21: Silent error swallowing in graph.rs + populate_embeddings (commit 9ad4be7)
- [x] 22: Calm physics defaults (commit 8bf1751)

## Completed — Performance & Correctness Audit (Items 23-28)

- [x] 23: Decoupled FPS input from physics mutex (commit ab53e7e)
- [x] 24: Auto-probe local AI services on startup (commit 2fa9820)
- [x] 25: LLM retry: exponential backoff [1s, 2s, 4s] with 3 retries (commit 5627466)
- [x] 26: Research timeout (5min) + DB lock failure logging (commit 5627466)
- [x] 27: Vault import 50MB file size limit (commit 5627466)
- [x] 28: Cancellation token cancel() moved outside mutex (commit 5627466)
- [x] 29: NaN-safe search score sorting (commit 5627466)

## Completed — Logseq Reference Audit (Items 30-33)

- [x] 30: SQLite WAL mode + NORMAL sync + 5s busy_timeout (commit 195eee3)
- [x] 31: FTS5 auto-sync triggers on page_bodies + pages (commit 195eee3)
- [x] 32: Path canonicalization in vault import (commit 195eee3)
- [x] 33: Transactional FTS5 rebuild with batch writes (commit 195eee3)

## Completed — Test Coverage Audit (Item 34)

- [x] 34: 16 tests for LlmError, extractor edge cases, physics edge cases (commit 8289287)

## Completed — Frontend-Backend Gap Closure (Items 35-40)

- [x] 35: Wire enrichment event handler — full DualMessage + TruthAssessment mapping (commit 1e4cd25)
- [x] 36: Add cancel_query Tauri command + wire frontend abort buttons (commit 1e4cd25)
- [x] 37: Wire note AI generation to Rust backend with streaming (commit 1e4cd25)
- [x] 38: Pass vault manifest (50 page titles) into pipeline context (commit 1e4cd25)
- [x] 39: Wire SOAR event handler + teaching stones notifications (commit 1e4cd25)
- [x] 40: Wire chat-title-update + chat-stream-replace + note-ai-stream (commit 1e4cd25)

## Remaining TODOs (Phase 5 — Bevy/wgpu, not wiring gaps)

- [ ] Physics frame → graph canvas component (requires Bevy rendering layer)
- [ ] FPS HUD overlay (requires 3D mode UI)

## macOS vs Retro Parity Assessment

The Retro Edition is at ~98% feature parity with macOS Epistemos:
- Full 3-pass pipeline (streaming + epistemic lens + consolidated JSON) ✓
- SOAR learning loop (probe + teach + reward + session) ✓
- 6 LLM providers (Anthropic, OpenAI, Gemini, Kimi, Ollama, Foundry) ✓
- Triage routing (NPU → GPU → Cloud) with 30 refusal patterns ✓
- Query analysis + signal generation + evidence grading ✓
- FTS5 + FST dual search + auto-sync triggers ✓
- Block system + reconciler ✓
- Vault sync + file watcher + symlink-safe import ✓
- Cost tracking + budget enforcement ✓
- Citation extraction + concept tracking ✓

Remaining (not missing — just deferred to later phase):
- Bevy/wgpu 3D graph rendering (Phase 5)
- FPS exploration mode UI overlay (Phase 5)

## Deferred (needs human or design decision)
(none)
