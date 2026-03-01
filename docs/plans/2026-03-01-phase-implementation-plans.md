# Phase Implementation Plans — Epistemos Retro Edition

**Date:** 2026-03-01
**Context:** Post-P0 fixes, FPS mode implemented. 323 tests, 53 commands, zero clippy warnings.

---

## Status After P0

| Item | Status | Notes |
|------|--------|-------|
| P0.1 Lock panics | DONE | 54 `.expect("poisoned")` → `lock_X()?` across 8 files |
| P0.2 Deadlock ordering | DONE | `semantic_neighbors` fixed: graph (2) → embeddings (3) |
| P0.3 spawn_blocking | DONE | `import_vault`, `rebuild_graph`, `rebuild_search_index` |
| P0.4 Mutex across await | N/A | Already correct (clone-and-drop pattern) |
| Physics reload gap | DONE | `rebuild_graph` + `extract_entities` now reload physics |
| FPS exploration mode | DONE | `fps_mode.rs`, `fps_player.rs`, 3 new commands, 7 new tests |

---

## P1 — Missing Features

### P1.1 — Wire CostTracker into Pipeline (2h)

**Already done:** `crates/engine/src/cost.rs` — 325 lines, 8 tests, pricing for 15+ models.
**Missing:** Not in AppState, not called, not exposed.

**Implementation:**

1. **Add to AppState** (`src-tauri/src/state.rs`):
   ```rust
   pub cost_tracker: Arc<Mutex<engine::cost::CostTracker>>,
   ```
   Initialize in `AppState::new()` — load from `db.get_setting("cost_tracker")` if exists, else `CostTracker::new()`.

2. **Record costs in chat pipeline** (`src-tauri/src/commands/chat.rs`):
   Inside the spawned event forwarder, on `PipelineEvent::Completed`:
   ```rust
   if let (Ok(mut ct), Ok(db)) = (db_state.lock_cost_tracker(), db_state.lock_db()) {
       ct.record(&provider_name, &model_name, data.input_tokens, data.output_tokens);
       let _ = db.set_setting("cost_tracker", &ct.to_json());
   }
   ```
   **Nuance:** Lock ordering: cost_tracker should be position 6 (after watcher).
   **Nuance:** Local models (Ollama, Foundry) return `None` from cost estimation — this is correct behavior.
   **Nuance:** Daily rollover uses `today_key()` — ensure timezone consistency.

3. **Add 3 Tauri commands** (`src-tauri/src/commands/system.rs`):
   - `get_cost_summary()` → returns `CostSummary` (daily, total, per-provider breakdown)
   - `set_daily_budget(budget_usd: f64)` → updates tracker budget
   - `reset_cost_tracker()` → clears all history

4. **Register** in `lib.rs` invoke_handler.

---

### P1.2 — Chat Title Generation — ALREADY DONE ✓

Verified: `generate_chat_title()` exists at `chat.rs:416-445`, wired into `submit_query()` at lines 305-313. Emits `chat-title-update` event. No work needed.

---

### P1.3 — Triage Routing Service (4h)

**Already done:** `check_local_services()` probes Foundry + Ollama availability.
**Missing:** No complexity classifier, no routing decision, no refusal detection.

**Implementation:**

1. **Create `crates/engine/src/triage.rs`** (~200 lines):

   ```rust
   pub enum TaskComplexity { Simple, Medium, Complex }
   pub enum ProviderTier { Npu, Gpu, Cloud }

   pub struct TriageService {
       foundry_available: bool,
       ollama_available: bool,
       refusal_patterns: Vec<&'static str>,
   }
   ```

   **Port from macOS TriageService.swift:**
   - 25+ refusal patterns (check first 500 chars of response)
   - Truncation detection: response < 20 chars OR ends without terminal punctuation
   - Combined fallback: `should_fallback() = is_refusal() || is_truncated()`

   **Complexity classification** (from macOS reference):

   | Indicator | Effect |
   |-----------|--------|
   | word_count < 20 | Simple |
   | word_count < 100, no entities | Simple |
   | superlative/comparative words present | +Medium |
   | Multi-sentence question | +Complex |
   | Entity extraction needed | +Complex |

   **Nuance:** Complexity threshold = 0.25 (macOS hardcoded). Operations ≤ 0.25 always go on-device.
   **Nuance:** Content length factor: `min(0.20, content_length / 60_000)` added to effective complexity.
   **Nuance:** Apple Intelligence context budget ≈ 9,000 chars → Foundry Local budget similar (~4096 tokens).

2. **Routing logic** (`route(complexity, availability) → ProviderTier`):
   - If complexity ≤ Simple && foundry_available → Npu
   - If complexity ≤ Medium && ollama_available → Gpu
   - Else → Cloud

3. **Wire into `submit_query()`** (`commands/chat.rs`):
   After `query_analyzer::analyze()`, call triage to select provider. Falls back to configured cloud provider if local unavailable.

4. **Refusal detection post-response:**
   After streaming completes, check response for refusal. If detected, auto-retry with next tier. Emit `pipeline://fallback` event.

5. **Add to AppState** + refresh availability when `check_local_services()` is called.

---

### P1.4 — Pipeline Cancellation (2h)

**Missing:** No way to cancel in-flight enrichment when a new query arrives.

**Implementation:**

1. **Add to AppState** (`state.rs`):
   ```rust
   pub enrichment_cancel: Arc<Mutex<Option<tokio_util::sync::CancellationToken>>>,
   ```

2. **Add `tokio-util` dependency** to `src-tauri/Cargo.toml`:
   ```toml
   tokio-util = { version = "0.7", features = ["rt"] }
   ```

3. **Wire in `submit_query()`** (`commands/chat.rs`):
   ```rust
   // Cancel any previous enrichment
   if let Ok(mut guard) = state.enrichment_cancel.lock() {
       if let Some(old_token) = guard.take() {
           old_token.cancel();
       }
   }
   let token = CancellationToken::new();
   *state.enrichment_cancel.lock()? = Some(token.clone());
   ```

4. **Use `tokio::select!`** in the spawned pipeline orchestrator:
   ```rust
   tokio::select! {
       _ = orchestrator::run_with_context(...) => { /* normal completion */ }
       _ = token.cancelled() => { /* cancelled — emit pipeline://cancelled event */ }
   }
   ```

   **Nuance (from macOS):** Pipeline task and enrichment task have DIFFERENT lifecycles:
   - `pipelineTask` (Pass 1 streaming) → cancelled on new query
   - `enrichmentTask` (Pass 2+3) → only cancelled on explicit `cancelAllEnrichment()`
   - Consider two separate tokens for this.

5. **Add `cancel_enrichment` command** to stop background enrichment explicitly.

---

### P1.5 — Graph Diff-Based Persist (3h)

**Missing:** `rebuild_graph` reprocesses ALL pages every time.

**Implementation:**

1. **Add `entity_hash` column** to pages table (`crates/storage/src/db.rs`):
   ```sql
   ALTER TABLE pages ADD COLUMN entity_hash TEXT;
   ```
   Run as migration in `ensure_schema()`.

2. **Compute hash** in `GraphBuilder::build()`:
   For each page's extracted entities JSON, compute SHA-256 hash.
   Compare against stored `entity_hash` — skip if unchanged.

3. **Incremental mode** (default):
   ```rust
   pub fn build_incremental(db: &Database) -> Result<GraphBuildResult> {
       let pages = db.list_pages()?;
       let mut changed_pages = Vec::new();
       for page in &pages {
           let current_hash = compute_entity_hash(&page.body);
           if page.entity_hash.as_deref() != Some(&current_hash) {
               changed_pages.push(page);
           }
       }
       // Only extract entities for changed pages
       // ...
   }
   ```

4. **Keep `force_rebuild` parameter** for manual full reprocessing.

   **Nuance:** Manual/user-created graph nodes should NEVER be auto-deleted.
   **Nuance:** Hash must be deterministic — sort entities before hashing.

---

### P1.6 — Research Mode Commands (3h)

**Already done:** `research_stage: i32` field exists on Page schema.
**Missing:** No commands, no workflow, no LLM integration.

**Key insight from macOS:** ResearchService is NOT a sequential state machine. It's a toolkit of independent operations: novelty check, paper review, citation search, idea generation. Each is fire-and-forget.

**Implementation:**

1. **Create `src-tauri/src/commands/research.rs`** with 4 commands:
   - `start_research(page_id, topic)` — sets stage to 1 (gathering), spawns background task
   - `advance_research(page_id)` — moves to next stage with LLM processing
   - `get_research_status(page_id)` — returns stage + any gathered data
   - `cancel_research(page_id)` — stops background work, resets to stage 0

2. **Research stages** (mapped to i32):
   - 0 = idle (not researching)
   - 1 = gathering (searching Semantic Scholar, extracting claims)
   - 2 = analyzing (novelty check, paper review)
   - 3 = synthesizing (final report generation)
   - 4 = complete

3. **Each stage is an LLM-driven operation:**
   - Gathering: Extract claims from note body, search S2 API per claim
   - Analyzing: Send papers + claims to LLM for synthesis
   - Synthesizing: Generate final research brief

   **Nuance (from macOS):** Novelty check has up to 3 search rounds.
   **Nuance:** S2 API rate-limited (429 status) — implement exponential backoff.
   **Nuance:** Max 10 claims per citation search, 200ms delay between S2 calls.

4. **Register** commands in `lib.rs`.

---

### P1.7 — Incremental Search Sync — ALREADY DONE ✓

Verified: `save_body()` at `notes.rs:76` already calls `db.upsert_search_index()`.
`update_page()` at `notes.rs:37-41` also syncs FTS5 on title/tag changes. No work needed.

---

## P2 — Dead Code Cleanup (5 min)

### P2.1 — Remove `count_blocks_for_page()`

Delete unused function from `crates/storage/src/db.rs` (lines ~254-261).
Verify zero callers first: `grep -rn "count_blocks_for_page" crates/`.

### P2.2 — Graph-Render Crate

Intentional Phase 5 stub. Leave as-is.

---

## P3 — Frontend Parity (brainiac-2.0 → Tauri)

This is Phase 3+ scope — backend is ready, frontend adaptation needed.

### P3.1 — Tauri Bridge Module
Replace all `fetch('/api/...')` calls with `invoke()`. 53 commands ready.

### P3.2 — Replace SSE with Tauri Events
3 event channels:
- `chat-stream` — streaming LLM chunks
- `enrichment-update` → use existing `pipeline://enriched`
- `signal-update` → use existing `pipeline://signals`
- NEW: `fps-frame` — FPS mode player state
- NEW: `physics-frame` — graph layout positions

### P3.3–P3.7 — UI Polish
Copy from brainiac-2.0: animations (Framer Motion), 6 themes, glass morphism, GreetingTypewriter, wallpapers (StarField/Sunny/Sunset).

### P3.8 — Zustand Store Adaptation
13 slices: `fetch()` → `invoke()`, SSE → Tauri `listen()`.

---

## P4 — Performance (1h)

### P4.1 — Parallel Entity Extraction
Change `for batch in notes.chunks(BATCH_SIZE)` to `futures::stream::iter().buffer_unordered(3)`.
File: `commands/graph.rs:202-238`.

### P4.2 — Parallel Vault Import
Wrap individual file reads in `spawn_blocking` tasks, join all handles.

### P4.3 — Increase Broadcast Buffer
Find `tokio::broadcast::channel(64)` → change to `channel(256)`.

---

## Implementation Priority Order

```
P1.1  CostTracker wiring     (2h)  — lowest-hanging fruit, 100% implemented module
P1.4  Pipeline cancellation   (2h)  — prevents resource waste
P2.1  Dead code cleanup       (5m)  — trivial
P1.3  Triage routing          (4h)  — biggest missing feature
P1.5  Graph diff persist      (3h)  — performance + UX improvement
P1.6  Research mode            (3h)  — new feature surface area
P4.*  Performance              (1h)  — parallelization quick wins
P3.*  Frontend parity          (-)   — Phase 3, separate sprint
```

## Verification After Each Phase

```bash
cd /Users/jojo/Epistemos-RETRO
cargo build --release
cargo clippy -- -D warnings
cargo test
grep -rn '.expect(".*poisoned")' src-tauri/src/  # Must remain 0
```
