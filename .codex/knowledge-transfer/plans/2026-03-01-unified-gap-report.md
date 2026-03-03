# Unified Gap Report — Epistemos Retro Edition
**Date:** 2026-03-01
**Sources:** 4 parallel deep audits + verification pass
**Scope:** Rust backend wiring, macOS parity, brainiac-2.0 frontend, multi-threading

---

## Executive Summary

| Domain | Status |
|--------|--------|
| Rust backend (50 Tauri commands) | **All real** — no stubs. 1 dead function, 1 stub crate (intentional). |
| macOS feature parity | **77 Full / 18 Partial / 1 Missing** across 12 domains |
| Frontend parity (brainiac-2.0) | **Catalog complete** — 165+ animations, 6 themes, typewriter, glass morphism |
| Multi-threading | **54 lock assertions** (crash risk), 3 deadlock vectors, blocking I/O in async |
| Bridge contract | **50 commands registered** — exceeds design doc's 28 (growth validated) |

---

## P0 — Crash / Deadlock / Data Loss

### P0.1 — Lock Poison Panic (54 instances)

**Risk:** Every `.expect("db lock poisoned")` call panics the Tauri process if ANY thread panics while holding the mutex. One crash cascades to kill the app.

**Locations:** 41 db locks, 8 graph locks, 4 embeddings locks, 1 physics lock across `commands/notes.rs`, `commands/chat.rs`, `commands/graph.rs`, `commands/search.rs`, `commands/vault.rs`, `commands/folders.rs`, `commands/physics.rs`, `state.rs`.

**Fix:** Replace all `.expect("X lock poisoned")` with:
```rust
fn lock_db(state: &AppState) -> Result<std::sync::MutexGuard<'_, Database>, AppError> {
    state.db.lock().map_err(|e| AppError::Internal(format!("db lock poisoned: {e}")))
}
```
Create helper functions in `state.rs`, use `lock_db(&state)?` everywhere.

**Effort:** ~1 hour (mechanical replacement)

---

### P0.2 — Nested Mutex Deadlock (graph.rs)

**Risk:** `set_node_embedding` acquires embeddings lock, then graph lock. If another path acquires them in reverse order → deadlock.

**Location:** `src-tauri/src/commands/graph.rs` — `set_node_embedding()` and `semantic_neighbors()`

**Fix:** Always acquire locks in canonical order: `db → graph → embeddings`. Or use `tokio::Mutex` with ordered acquisition. Document lock ordering in `state.rs`.

**Effort:** ~30 min

---

### P0.3 — Blocking I/O in Async Runtime

**Risk:** `vault::import_vault` does synchronous file I/O (reading every .md file) inside an async Tauri command. Blocks the tokio runtime thread — can starve other tasks.

**Locations:**
- `commands/vault.rs` — `import_vault()` (sync file reads)
- `commands/graph.rs` — `rebuild_graph()` (reads all pages + bodies)
- `commands/search.rs` — `rebuild_search_index()` (reads all pages)

**Fix:** Wrap blocking work in `tokio::task::spawn_blocking()`:
```rust
let result = tokio::task::spawn_blocking(move || {
    // sync file I/O here
}).await.map_err(|e| AppError::Internal(format!("{e}")))?;
```

**Effort:** ~1 hour (3 commands)

---

### P0.4 — Mutex Held Across Await (chat.rs)

**Risk:** Chat pipeline acquires db lock, then awaits LLM streaming. If stream stalls, db is locked for duration — blocks all other commands.

**Location:** `commands/chat.rs` — `submit_query()` event loop

**Fix:** Clone needed data from db lock, drop lock, then stream:
```rust
let (chat, messages) = {
    let db = lock_db(&state)?;
    let chat = db.get_chat(id.clone())?;
    let msgs = db.get_messages_for_chat(&chat_id)?;
    (chat, msgs)
}; // lock dropped here
// now stream without holding lock
```

**Effort:** ~30 min

---

## P1 — Missing Features / Logic Gaps

### P1.1 — CostTracker Not Integrated

**Status:** 325-line module with 8 unit tests. Complete implementation. ZERO integration.

**What exists:** `crates/engine/src/cost.rs` — pricing table for 15+ models, daily budget tracking, per-provider breakdown, JSON persistence format.

**What's missing:**
- Not wrapped in `Arc<Mutex<CostTracker>>` in AppState
- Not loaded/saved from `settings` KV table
- Not called from `submit_query()` to record token usage
- No Tauri commands to read/set budget

**Fix:**
1. Add `cost_tracker: Arc<Mutex<CostTracker>>` to AppState
2. Load from settings KV on startup, save on each record
3. Call `cost_tracker.record(provider, model, in_tokens, out_tokens)` in chat pipeline
4. Add `get_cost_summary` + `set_daily_budget` Tauri commands

**macOS equivalent:** `PipelineService.swift` tracks cost per query

**Effort:** ~2 hours

---

### P1.2 — Chat Title Generation Missing

**Status:** Chats default to "New Chat". No auto-title from first message.

**macOS equivalent:** `PipelineService.swift` generates title after first response using LLM.

**Fix:**
1. After first streaming response completes in `submit_query()`, spawn background task:
```rust
tokio::spawn(async move {
    let title = llm.generate_title(&first_message, &first_response).await;
    let db = state.db.lock()...;
    db.update_chat_title(&chat_id, &title);
    // emit event to frontend: "chat-title-updated"
});
```
2. Add prompt template in `crates/pipeline/src/prompts.rs`

**Effort:** ~1 hour

---

### P1.3 — Triage Routing Not Implemented

**Status:** `check_local_services()` probes Foundry Local + Ollama availability. No actual routing logic.

**macOS equivalent:** `TriageService.swift` — routes by complexity: simple→on-device (Apple Intelligence), medium→local GPU (Ollama), complex→cloud (Claude/GPT).

**What's needed:**
1. Complexity classifier (input length, task type, required capability)
2. Provider availability cache (from `check_local_services`)
3. Fallback chain: NPU (Foundry, ~50ms) → GPU (Ollama, ~500ms) → Cloud (~3-8s)
4. Refusal detection (25+ patterns) — if local model refuses, escalate

**Fix:** Create `crates/engine/src/triage.rs`:
```rust
pub struct TriageService {
    providers: Vec<ProviderConfig>,
    availability: Arc<Mutex<HashMap<String, bool>>>,
}

impl TriageService {
    pub async fn route(&self, query: &str, task: TaskType) -> ProviderConfig { ... }
    pub async fn refresh_availability(&self) { ... }
}
```

**Effort:** ~4 hours (logic port from Swift + testing)

---

### P1.4 — Pipeline Cancellation Missing

**Status:** Starting a new query while enrichment (Pass 2/3) is running leaves the old tasks as zombies. No cancellation token.

**macOS equivalent:** `EnrichmentController.swift` uses `Task.cancel()` + cooperative checking.

**Fix:** Use `tokio_util::sync::CancellationToken`:
```rust
// In AppState:
enrichment_cancel: Arc<Mutex<Option<CancellationToken>>>,

// In submit_query:
if let Some(old) = state.enrichment_cancel.lock()?.take() {
    old.cancel(); // cancel previous enrichment
}
let token = CancellationToken::new();
*state.enrichment_cancel.lock()? = Some(token.clone());
tokio::spawn(async move {
    tokio::select! {
        _ = token.cancelled() => { /* cleanup */ }
        result = run_enrichment() => { /* normal completion */ }
    }
});
```

**Effort:** ~2 hours

---

### P1.5 — Graph Diff-Based Persist Missing

**Status:** Graph rebuild reprocesses ALL pages. No incremental update.

**macOS equivalent:** `GraphBuilder.swift` diffs current entities against stored, only writes changes.

**Fix:** Add `graph_version` or `last_entity_hash` to pages table. On save, compare hash of extracted entities vs stored hash. Skip if unchanged.

**Effort:** ~3 hours

---

### P1.6 — Research Mode Not Exposed

**Status:** Research stages exist in page schema (`research_stage` field) but no command to drive the research workflow.

**macOS equivalent:** `ResearchCoordinator.swift` manages multi-step research (gather → analyze → synthesize).

**Fix:** Add research commands:
- `start_research(page_id, topic)` — sets stage to "gathering"
- `advance_research(page_id)` — moves to next stage
- `get_research_status(page_id)` — returns current stage + progress

**Effort:** ~3 hours

---

### P1.7 — Incremental Search Sync Missing

**Status:** `rebuild_search_index()` reindexes ALL pages. No incremental update on single-page save.

**macOS equivalent:** `SearchIndexService.swift` indexes individual pages on save via notification.

**Fix:** Add `index_page(page_id)` to search commands. Call it from `save_body()`:
```rust
pub async fn save_body(...) -> Result<(), AppError> {
    // ... existing save logic ...
    // After body saved, update FTS5 index for this page
    db.index_single_page(id, &content)?;
    Ok(())
}
```

**Effort:** ~1 hour

---

## P2 — Dead Code / Cleanup

### P2.1 — Dead Function: `count_blocks_for_page()`

**Location:** `crates/storage/src/db.rs:254-261`
**Status:** Declared, never called. `get_blocks_for_page()` is used instead.
**Fix:** Delete it.
**Effort:** 1 min

---

### P2.2 — Graph-Render Crate (Stub)

**Location:** `crates/graph-render/src/lib.rs` — 1-line comment only
**Status:** Intentional Phase 5 placeholder. Bevy + wgpu rendering not started.
**Action:** Leave as-is. Phase 5 scope.

---

## P3 — Frontend Parity (brainiac-2.0 → Retro Edition)

### P3.1 — Animation System

**brainiac-2.0 has:**
- 165+ Framer Motion instances (spring, tween, stagger)
- M3 Material Design easing curves
- Spring physics config: `{ stiffness: 260, damping: 20, mass: 1 }`
- Stagger children: 0.03s delay between siblings
- Page transitions: slide + fade + scale
- List item animations: staggered entrance, exit with layout shift

**Engineering standards mandate:** Rust WASM spring solver (not JS physics). But Framer Motion's `motion.div` is the practical approach for web surfaces.

**Recommended approach:**
1. Keep Framer Motion for web UI layer (it's React components, not graph physics)
2. The "no D3/JS" rule applies to **graph rendering** (Bevy handles that)
3. Port the exact motion configs from brainiac-2.0's `lib/motion.ts`
4. Create shared animation presets in `lib/animations.ts`

**Key configs to port:**
```typescript
// From brainiac-2.0
export const springConfig = { stiffness: 260, damping: 20, mass: 1 };
export const microSpring = { stiffness: 400, damping: 30 };
export const easeEmphasized = [0.2, 0, 0, 1];
export const easeEmphasizedDecelerate = [0.05, 0.7, 0.1, 1];
```

---

### P3.2 — GreetingTypewriter Effect

**brainiac-2.0 has:** `GreetingTypewriter.tsx`
- Per-character reveal: 45-75ms random delay per character
- Hesitation pauses: 100-200ms at random intervals (1 in 8 chars)
- Punctuation pauses: 150-300ms after `.`, `,`, `!`, `?`
- Cursor blink animation during typing
- Spring-based final settle

**Port requirement:** Exact same component with Tauri-compatible imports.

---

### P3.3 — Theme System (6 Themes)

**brainiac-2.0 has 6 complete themes:**

| Theme | Key Colors | Background |
|-------|-----------|------------|
| Dark | `#0a0a0a` bg, `#6366f1` accent | Flat dark |
| Light | `#fafafa` bg, `#4f46e5` accent | Flat light |
| OLED | `#000000` bg, pure blacks | True black |
| Cosmic | `#020617` bg, star particles | Animated StarField |
| Sunny | `#fef3c7` bg, warm tones | Animated cloud wallpaper |
| Sunset | `#1e1b4b` bg, warm gradients | Animated mountain wallpaper |

Each theme defines 40+ CSS custom properties in `globals.css`.

**Port requirement:** Copy `globals.css` theme blocks + animated wallpaper components.

---

### P3.4 — Glass Morphism System

**brainiac-2.0 has:**
- `backdrop-filter: blur(12px) saturate(180%)`
- Semi-transparent backgrounds: `rgba(var(--glass-bg), 0.7)`
- Noise texture overlay (SVG filter)
- Border: `1px solid rgba(255,255,255,0.1)`
- Applied to: sidebar, modals, floating nav, search palette

**Port requirement:** CSS utilities — direct copy.

---

### P3.5 — Retro/Pixel Fonts (8 Fonts)

**brainiac-2.0 has:**
- Press Start 2P, VT323, Silkscreen, Space Mono, IBM Plex Mono, JetBrains Mono, Fira Code, Berkeley Mono
- Font selection stored in Zustand UI slice
- Applied to headings, code blocks, decorative elements

**Port requirement:** Copy font imports + font-family CSS.

---

### P3.6 — Animated Wallpapers (3)

**brainiac-2.0 has:**
1. **StarField** — Canvas-based particle system, parallax layers, shooting stars
2. **SunnyWallpaper** — Animated clouds, sun rays, gentle drift
3. **SunsetWallpaper** — Layered mountains, gradient sky, parallax scroll

**Port requirement:** Copy components. These use Canvas (appropriate for background decoration, NOT graph rendering — the Golden Rule distinction applies).

---

### P3.7 — Zustand Store (13 Slices)

**brainiac-2.0 slices to port:**

| Slice | Purpose | Port Notes |
|-------|---------|------------|
| `messageSlice` | Chat messages, streaming state | invoke() + Tauri events |
| `pipelineSlice` | Pass 2/3 enrichment state | Tauri events (not SSE) |
| `inferenceSlice` | Provider config, model selection | invoke() for get/set |
| `controlsSlice` | Sidebar, panels, view mode | Local state (no backend) |
| `cortexSlice` | Graph data, node positions | Tauri events from physics |
| `conceptsSlice` | Entity extraction results | invoke() for graph queries |
| `researchSlice` | Research mode state | invoke() for research commands |
| `portalSlice` | Page navigation, breadcrumbs | Local state |
| `uiSlice` | Theme, font, animations | Local state + invoke() for persist |
| `notesSlice` | Page CRUD, body content | invoke() for all CRUD |
| `learningSlice` | SOAR learning state | invoke() for SOAR stone |
| `soarSlice` | Signal metrics (confidence, etc.) | Tauri events from pipeline |
| `toastSlice` | Notification toasts | Local state |

**Key mapping:** Every `fetch('/api/...')` → `invoke('command_name', { args })`. Every SSE stream → `listen('event-name', callback)`.

---

### P3.8 — API → Tauri Bridge Mapping

**Complete mapping needed:**

| brainiac-2.0 API Route | Tauri Command | Status |
|------------------------|---------------|--------|
| `POST /api/notes` | `create_page` | ✅ Ready |
| `GET /api/notes` | `list_pages` | ✅ Ready |
| `GET /api/notes/[id]` | `get_page` | ✅ Ready |
| `PUT /api/notes/[id]` | `update_page` | ✅ Ready |
| `DELETE /api/notes/[id]` | `delete_page` | ✅ Ready |
| `GET /api/notes/[id]/body` | `load_body` | ✅ Ready |
| `PUT /api/notes/[id]/body` | `save_body` | ✅ Ready |
| `GET /api/notes/[id]/blocks` | `get_blocks` | ✅ Ready |
| `POST /api/chats` | `create_chat` | ✅ Ready |
| `GET /api/chats` | `list_chats` | ✅ Ready |
| `GET /api/chats/[id]/messages` | `get_messages` | ✅ Ready |
| `DELETE /api/chats/[id]` | `delete_chat` | ✅ Ready |
| `POST /api/chats/[id]/query` | `submit_query` | ✅ Ready |
| `POST /api/chats/[id]/soar` | `run_soar_stone` | ✅ Ready |
| `GET /api/graph` | `get_graph` | ✅ Ready |
| `POST /api/graph/rebuild` | `rebuild_graph` | ✅ Ready |
| `POST /api/graph/search` | `search_graph` | ✅ Ready |
| `POST /api/graph/extract` | `extract_entities` | ✅ Ready |
| `GET /api/graph/node/[id]` | `get_node_details` | ✅ Ready |
| `POST /api/graph/summarize` | `summarize_node` | ✅ Ready |
| `POST /api/graph/embedding` | `set_node_embedding` | ✅ Ready |
| `POST /api/graph/semantic-neighbors` | `semantic_neighbors` | ✅ Ready |
| `POST /api/graph/semantic-similarity` | `semantic_similarity` | ✅ Ready |
| `POST /api/search` | `search_pages` | ✅ Ready |
| `POST /api/search/rebuild` | `rebuild_search_index` | ✅ Ready |
| `POST /api/search/hybrid` | `search_hybrid` | ✅ Ready |
| `POST /api/folders` | `create_folder` | ✅ Ready |
| `GET /api/folders` | `list_folders` | ✅ Ready |
| `GET /api/folders/[id]` | `get_folder` | ✅ Ready |
| `PUT /api/folders/[id]` | `update_folder` | ✅ Ready |
| `DELETE /api/folders/[id]` | `delete_folder` | ✅ Ready |
| `GET /api/vault/path` | `get_vault_path` | ✅ Ready |
| `PUT /api/vault/path` | `set_vault_path` | ✅ Ready |
| `POST /api/vault/import` | `import_vault` | ✅ Ready |
| `POST /api/vault/export` | `export_page` | ✅ Ready |
| `POST /api/vault/export-all` | `export_all` | ✅ Ready |
| `POST /api/vault/watch/start` | `start_vault_watcher` | ✅ Ready |
| `POST /api/vault/watch/stop` | `stop_vault_watcher` | ✅ Ready |
| `GET /api/vault/watch/status` | `is_vault_watching` | ✅ Ready |
| `GET /api/system/config` | `get_inference_config` | ✅ Ready |
| `PUT /api/system/config` | `set_inference_config` | ✅ Ready |
| `POST /api/system/test` | `test_connection` | ✅ Ready |
| `GET /api/system/info` | `get_app_info` | ✅ Ready |
| `POST /api/system/local-services` | `check_local_services` | ✅ Ready |
| `POST /api/physics/start` | `start_physics` | ✅ Ready |
| `POST /api/physics/stop` | `stop_physics` | ✅ Ready |
| `POST /api/physics/pin` | `pin_node` | ✅ Ready |
| `POST /api/physics/unpin` | `unpin_node` | ✅ Ready |
| `POST /api/physics/move` | `move_node` | ✅ Ready |
| `GET /api/physics/status` | `is_physics_running` | ✅ Ready |
| SSE `/api/chats/[id]/stream` | `listen("chat-stream")` | ✅ Tauri event |
| SSE `/api/pipeline/enrichment` | `listen("enrichment-update")` | ✅ Tauri event |
| SSE `/api/pipeline/signals` | `listen("signal-update")` | ✅ Tauri event |

**All 50 commands + 3 event channels ready. Bridge is complete.**

---

## P4 — Performance / Quality-of-Life

### P4.1 — Sequential Entity Extraction

**Status:** Batches of 5 notes extracted sequentially.
**Fix:** Use `futures::stream::iter(...).buffer_unordered(3)` for parallel extraction.
**Effort:** ~30 min

### P4.2 — Sequential Vault Import

**Status:** Files imported one at a time.
**Fix:** Read files in parallel with `tokio::task::spawn_blocking` + join handles.
**Effort:** ~30 min

### P4.3 — Broadcast Channel Buffer

**Status:** Pipeline events use `tokio::broadcast` with capacity 64. If frontend lags, events dropped.
**Fix:** Increase to 256, or use `tokio::sync::watch` for latest-value semantics where appropriate.
**Effort:** ~15 min

---

## Priority Matrix

| ID | Priority | Category | Effort | Impact |
|----|----------|----------|--------|--------|
| P0.1 | **CRITICAL** | Lock poison panic | 1h | Prevents app crash on any thread panic |
| P0.2 | **CRITICAL** | Nested mutex deadlock | 30m | Prevents hard deadlock |
| P0.3 | **CRITICAL** | Blocking I/O in async | 1h | Prevents runtime starvation |
| P0.4 | **CRITICAL** | Mutex held across await | 30m | Prevents db lock starvation |
| P1.1 | HIGH | CostTracker integration | 2h | Enables usage tracking + budget limits |
| P1.2 | HIGH | Chat title generation | 1h | UX parity with macOS |
| P1.3 | HIGH | Triage routing | 4h | NPU→GPU→Cloud fallback chain |
| P1.4 | HIGH | Pipeline cancellation | 2h | Prevents zombie tasks |
| P1.5 | MEDIUM | Graph diff persist | 3h | Performance: skip unchanged pages |
| P1.6 | MEDIUM | Research mode | 3h | Feature parity with macOS |
| P1.7 | MEDIUM | Incremental search sync | 1h | Performance: index on save |
| P2.1 | LOW | Dead function cleanup | 1m | Code hygiene |
| P3.* | DEFERRED | Frontend parity | Phase 3 | Entire brainiac-2.0 port |
| P4.* | LOW | Parallel processing | 1h | Performance improvement |

**Total critical fixes: ~3 hours of work.**
**Total P1 fixes: ~13 hours of work.**
**Total through P2: ~16 hours of work.**

---

## Verification Checklist

After applying fixes, verify:

- [ ] `cargo build --release` — clean compile
- [ ] `cargo clippy -- -D warnings` — zero warnings
- [ ] `cargo test` — all 371+ tests pass
- [ ] No `.expect("poisoned")` in commands/ or state.rs
- [ ] `count_blocks_for_page` removed
- [ ] CostTracker integrated in submit_query pipeline
- [ ] Chat title auto-generated after first response
- [ ] `save_body` triggers incremental FTS5 index
- [ ] Pipeline cancellation works (start new query while enrichment running)
- [ ] Vault import wrapped in spawn_blocking
- [ ] Nested lock ordering documented in state.rs
