# Epistemos Retro Edition — Implementation Plan

> **Approach: Parallel Tracks** — Copy the Brainiac 2.0 frontend into Vite on
> Day 1 with typed stub commands. Build the real Rust backend behind those stubs,
> flipping each stub to real one command at a time.

---

## Prerequisites

Before Phase 1, read these documents:
- `docs/plans/2026-02-28-retro-edition-engineering-standards.md` — THE LAW
- `docs/plans/2026-02-28-retro-edition-design.md` — Full architecture

---

## Phase 1: Scaffold + UI Copy

**Goal:** Tauri window opens with Brainiac 2.0 UI visible. All invoke() calls
return mock data from Rust stubs. Zero fetch(), zero Next.js.

### Tasks

1. **Create Tauri 2.x project** with Vite + React template
   - `npm create tauri-app@latest` → select Vite + React + TypeScript
   - [NEW]

2. **Set up Cargo workspace** with all crate stubs
   ```toml
   # Cargo.toml (workspace root)
   [workspace]
   members = [
       "src-tauri",
       "crates/storage",
       "crates/engine",
       "crates/graph",
       "crates/sync",
       "crates/embeddings",
       "crates/graph-render",
       "crates/ui-physics",
   ]
   ```
   - Each crate starts as `lib.rs` with `pub fn placeholder() {}` — compiles but
     does nothing
   - [NEW]

3. **Install frontend dependencies**
   - React 19, React Router, Tailwind 4, Radix UI, Zustand, CodeMirror 6
   - `@tauri-apps/api`, `@tauri-apps/plugin-*`
   - `tauri-specta` Rust + `@specta/typescript` TS
   - [NEW]

4. **Copy Brainiac 2.0 UI into `src/`**
   - Copy `components/` → `src/components/`
   - Copy `lib/store/` → `src/lib/store/`
   - Copy `lib/constants.ts`, `lib/branded.ts`, `lib/utils.ts` → `src/lib/`
   - Copy `app/globals.css` → `src/styles/globals.css`
   - Copy font files → `src/assets/fonts/`
   - [WEB]

5. **Create Vite route structure** (replaces Next.js file-based routing)
   - `src/routes.tsx` — React Router route definitions
   - `src/pages/` — port each `app/(shell)/*/page.tsx` to a standalone component
   - Replace `next/link` → React Router `<Link>`
   - Replace `next/navigation` → React Router hooks
   - Replace `next/dynamic` → `React.lazy` + `Suspense`
   - [WEB → NEW]

6. **Create custom ThemeProvider** (replaces next-themes)
   - `src/lib/theme.tsx` — context with 6 themes (light/sunny/dark/cosmic/sunset/oled)
   - Reads/writes to localStorage
   - Applies `.dark`, `.cosmic`, etc. class to `<html>`
   - [WEB → NEW]

7. **Define Rust command stubs with tauri-specta**
   - `src-tauri/src/commands/*.rs` — all commands from bridge contract
   - Each returns mock data: `Ok(Page::mock(page_id))`, `Ok(vec![])`, etc.
   - Generate TypeScript bindings: `src/lib/bindings.ts`
   - [NEW]

8. **Delete all server-side code**
   - No `app/api/` routes
   - No `lib/db/`, `lib/engine/`, `daemon/`
   - No `better-sqlite3`, `drizzle-orm`, `@ai-sdk/*`
   - No `next.config.ts`, `next-env.d.ts`
   - [NEW]

9. **Rewrite hooks**
   - `use-chat-stream.ts` → `commands.submitQuery()` + `listen('pipeline://*')`
   - `use-assistant-stream.ts` → `commands.submitAssistantQuery()` + `listen('assistant://*')`
   - [WEB → NEW]

### Checkpoint
- [ ] `cargo build` succeeds (all crates compile)
- [ ] `npm run dev` starts Vite
- [ ] `cargo tauri dev` opens a window with the Brainiac UI visible
- [ ] All pages navigate correctly (React Router)
- [ ] 6 themes toggle correctly
- [ ] Mock data appears in the UI (pages, chats, messages)
- [ ] No fetch() calls in the codebase
- [ ] No Next.js imports in the codebase

---

## Phase 2: Storage Foundation

**Goal:** All data persists in SQLite via rusqlite. Note bodies stored as files.
`cargo test -p storage` passes for all CRUD operations.

### Tasks

1. **Define newtype IDs** with `define_id!` macro
   - `crates/storage/src/ids.rs` — PageId, BlockId, ChatId, MessageId, etc.
   - [NEW — improvement over both source repos]

2. **Create SQLite schema** (hand-written SQL migrations)
   - Tables: pages, blocks, chats, messages, graph_nodes, graph_edges,
     page_versions, folders
   - Matching SDPage/SDBlock/SDChat/SDMessage/SDGraphNode/SDGraphEdge from Mac
   - [MAC]

3. **Implement Storage struct** with connection management
   - `crates/storage/src/lib.rs` — `Storage::open(path)`, prepared statement cache
   - [NEW]

4. **Implement CRUD queries** (one module per entity)
   - `crates/storage/src/queries/pages.rs` — create, get, update, delete, list
   - `crates/storage/src/queries/blocks.rs`
   - `crates/storage/src/queries/chats.rs`
   - `crates/storage/src/queries/messages.rs`
   - `crates/storage/src/queries/graph.rs`
   - [MAC + WEB — merge both schemas]

5. **Implement note body file storage**
   - `crates/storage/src/note_body.rs` — read, write (atomic), delete
   - Location: `<app_data>/note-bodies/<pageId>.md`
   - [MAC — port NoteFileStorage.swift]

6. **Implement StorageError** with thiserror
   - `crates/storage/src/error.rs` — PageNotFound, Database, BodyIo
   - [NEW — improvement]

7. **Write comprehensive tests**
   - CRUD round-trip for every entity
   - Edge cases: duplicate IDs, missing pages, concurrent access
   - [NEW]

### Checkpoint
- [ ] `cargo test -p storage` — all pass
- [ ] `cargo clippy -p storage -- -D warnings` — clean
- [ ] Schema matches both Mac SwiftData models and Web Drizzle schema
- [ ] Note bodies round-trip: write → read → identical content
- [ ] No `.unwrap()` in storage crate

---

## Phase 3: Tauri Bridge (Stub → Real)

**Goal:** Flip all command stubs to real storage calls. Create/edit/delete notes
through the UI with persistent data.

### Tasks

1. **Wire AppState** with real Storage instance
   - `src-tauri/src/state.rs` — `AppState { storage, search, ... }`
   - Initialize at app startup in `main.rs`
   - [NEW]

2. **Flip note commands** (stub → real)
   - `create_page` → `state.storage.create_page(...)`
   - `get_page` → `state.storage.get_page(&page_id)`
   - `save_body` → `state.storage.note_body.write(page_id, content)`
   - `list_pages` → `state.storage.list_pages(folder_id, limit, offset)`
   - etc.
   - [NEW]

3. **Flip chat commands** (stub → real)
   - `create_chat`, `list_chats`, `get_messages`, `delete_chat`
   - [NEW]

4. **Implement AppError** with thiserror
   - Compose StorageError → AppError via `#[from]`
   - Serialize as `{ kind, message }` JSON
   - [NEW — improvement]

5. **Re-generate tauri-specta bindings**
   - Types now reflect real data structures, not mocks
   - [NEW]

### Checkpoint
- [ ] Create a note in the UI → persists to SQLite → survives app restart
- [ ] Edit note body → saves to file → block reconciliation runs
- [ ] List notes → shows all created notes
- [ ] Delete a note → gone from DB and UI
- [ ] Create/list/delete chats works
- [ ] Error handling: deleting non-existent page returns structured error

---

## Phase 4: LLM Client + Pipeline

**Goal:** Chat works end-to-end with streaming. User sends query, sees tokens
arrive in real time, gets enriched response.

### Tasks

1. **Implement LlmProvider trait + providers**
   - `crates/engine/src/llm/mod.rs` — trait definition
   - `crates/engine/src/llm/anthropic.rs` — Claude (reqwest + SSE parsing)
   - `crates/engine/src/llm/openai.rs` — GPT (reqwest + SSE parsing)
   - `crates/engine/src/llm/google.rs` — Gemini
   - `crates/engine/src/llm/ollama.rs` — local Ollama
   - `crates/engine/src/llm/foundry.rs` — Foundry Local (NPU)
   - [MAC — port LLMService.swift providers]

2. **Implement QueryAnalyzer** (pure Rust, no LLM)
   - `crates/engine/src/query_analyzer.rs`
   - Domain classification, question type, entity extraction, complexity score
   - [MAC — port QueryAnalyzer.swift]

3. **Implement SignalGenerator** (pure Rust, no LLM)
   - `crates/engine/src/signal.rs`
   - Heuristic confidence, entropy, dissonance, risk scores
   - [MAC — port SignalGenerator.swift]

4. **Implement Pipeline** (3-pass with broadcast channel)
   - `crates/engine/src/pipeline.rs`
   - Pass 1: stream direct answer via LlmProvider::stream()
   - Pass 2: deep analysis (tokio::spawn, 180s timeout)
   - Pass 3: consolidated enrichment (tokio::spawn, 300s timeout)
   - All events via broadcast::Sender<PipelineEvent>
   - [MAC — port PipelineService.swift]

5. **Implement TriageService**
   - `crates/engine/src/triage.rs`
   - Route: NPU → GPU → Cloud based on operation complexity
   - [MAC — port TriageService.swift]

6. **Port prompt templates**
   - `crates/engine/src/prompts/` — system prompts for each pass
   - [MAC — port PromptComposer+Consolidated.swift]

7. **Wire submit_query command**
   - Create broadcast channel
   - Spawn pipeline task
   - Spawn Tauri event emitter subscriber
   - Spawn persistence subscriber
   - [NEW]

8. **Implement InferenceConfig management**
   - `get_inference_config` / `set_inference_config` commands
   - Store config in `Arc<RwLock<InferenceConfig>>`
   - Persist to app data directory (JSON file)
   - [NEW]

### Checkpoint
- [ ] Configure API key in settings UI → persists
- [ ] Send chat query → tokens stream to UI in real time
- [ ] Pipeline stages advance in UI
- [ ] DualMessage appears (research + layman view)
- [ ] TruthAssessment appears after enrichment
- [ ] Message persists to SQLite → visible in chat history
- [ ] Test with Anthropic, OpenAI, and Ollama providers
- [ ] Connection test works for all providers

---

## Phase 5: Graph + Physics

**Goal:** Knowledge graph renders with Bevy/Rapier3D. Nodes have physics.
Click/search/filter works.

### Tasks

1. **Implement GraphStore** (in-memory adjacency list)
   - `crates/graph/src/store.rs`
   - Load from storage, BFS traversal, shortest path, fuzzy search
   - [MAC — port GraphStore.swift]

2. **Implement GraphBuilder** (structural graph)
   - `crates/graph/src/builder.rs`
   - 10-step build pipeline: Pages → Tags → Ideas → Blocks → Refs → Folders → Chats
   - Diff-based persist
   - [MAC — port GraphBuilder.swift]

3. **Wire graph commands** (stub → real)
   - `get_graph`, `get_neighbors`, `shortest_path`, `search_graph`, `rebuild_graph`
   - [NEW]

4. **Create Rapier3D physics world**
   - `crates/graph-render/src/physics.rs`
   - Rigid bodies per node, SpringJoint per edge
   - Center gravity, charge repulsion, link springs
   - [NEW — replaces Mac's Rust FFI graph_engine]

5. **Create Bevy render pipeline**
   - `crates/graph-render/src/renderer.rs`
   - WGSL SDF circle shader for nodes
   - cosmic-text + FontAtlas for labels
   - Edge rendering as lines
   - [NEW — replaces Mac's Metal rendering]

6. **Stream physics positions to frontend**
   - 60fps: emit("graph://physics", positions) from Bevy
   - Frontend updates graph visualization overlay
   - [NEW]

7. **Build UI physics WASM module**
   - `crates/ui-physics/` — spring solver
   - Compile to WASM, load in browser
   - React `useSpring` hook
   - Replace all Framer Motion animations
   - [NEW]

### Checkpoint
- [ ] Graph view shows nodes and edges with physics
- [ ] Nodes can be clicked → shows details
- [ ] Search filters graph in real time (fuzzy)
- [ ] Physics simulation runs at 60fps with 1000 nodes
- [ ] Button hover effects use WASM spring physics
- [ ] Page transitions use WASM spring physics
- [ ] No Framer Motion in the codebase

---

## Phase 6: Entity Extraction

**Goal:** Notes auto-generate semantic graph entities via LLM.

### Tasks

1. **Implement EntityExtractor**
   - `crates/graph/src/extractor.rs`
   - Batch 5 pages, annotate with `[block:UUID]` markers
   - LLM prompt → JSON: `{sources, quotes, tags, crossNoteLinks}`
   - Edge type classification: supports/contradicts/expands/questions/cites
   - [MAC — port EntityExtractor.swift]

2. **Wire extract_entities command**
   - Runs in background via tokio::spawn
   - Emits graph://updated events as batches complete
   - [NEW]

3. **Run extraction on vault import**
   - After import_vault, queue extraction for all new/modified pages
   - [MAC — port from GraphState.refreshStructuralData]

### Checkpoint
- [ ] Create 3+ notes with research content
- [ ] Run entity extraction → graph shows semantic edges
- [ ] Edge types are correctly classified
- [ ] Sources, quotes, tags appear as graph nodes
- [ ] Cross-note links detected between related notes

---

## Phase 7: Full Pipeline + SOAR

**Goal:** Complete chat experience matches macOS version.

### Tasks

1. **Port SOAR learning loop**
   - `crates/engine/src/soar/` — probe, session, reward, contradiction detection
   - [MAC — port from Engine/SOAR/]

2. **Port steering system**
   - `crates/engine/src/steering/` — encoder, memory, prompt composer, feedback
   - [MAC + WEB — merge both implementations]

3. **Implement research copilot**
   - Semantic Scholar integration (reqwest)
   - Novelty check, paper review, idea generation
   - [WEB — port from lib/engine/research/]

4. **Port signal system**
   - Confidence, entropy, dissonance, health score
   - Safety state management
   - [MAC — port from Engine/SignalGenerator.swift]

### Checkpoint
- [ ] SOAR detects learning edge, runs learning session
- [ ] Steering feedback adjusts pipeline behavior
- [ ] Research copilot finds papers from Semantic Scholar
- [ ] Full signal panel shows real values
- [ ] Chat experience is indistinguishable from macOS version

---

## Phase 8: Search + Vault Sync + Polish

**Goal:** Ship-ready. All features complete, all performance targets met.

### Tasks

1. **Implement dual-layer search**
   - `crates/sync/src/search.rs`
   - FST fuzzy (fst crate) + FTS5 full-text (rusqlite)
   - Single query merges both with configurable weights
   - [MAC — port SearchIndexService.swift + Rust FST engine]

2. **Implement vault sync**
   - `crates/sync/src/vault.rs`
   - notify crate file watcher
   - Incremental import (mtime comparison)
   - YAML front-matter parsing
   - Export with front-matter
   - [MAC — port VaultSyncService.swift + VaultIndexActor.swift]

3. **Implement BlockParser + BlockReconciler**
   - `crates/sync/src/block_parser.rs` — markdown ↔ blocks
   - `crates/sync/src/block_reconciler.rs` — Jaccard matching
   - [MAC — port BlockParser.swift + BlockReconciler.swift]

4. **Implement ONNX embeddings**
   - `crates/embeddings/` — ort crate + DirectML
   - [NEW — replaces Mac's NLEmbedding]

5. **CodeMirror 6 editor** with block ref decorations
   - `((blockId))` inline preview + autocomplete
   - `[[wikilink]]` navigation
   - Transclusion widgets
   - [WEB — port from components/notes/block-editor/]

6. **Performance audit**
   - 10K nodes in graph view: <16ms frame
   - FTS5 search: <20ms
   - Cold start: <2 seconds
   - Bundle size: <500KB gzipped

7. **All 6 themes verified**
   - Light, sunny, dark, cosmic, sunset, OLED
   - Bevy background effects per theme
   - [WEB — themes already defined in CSS]

### Checkpoint (Ship-Ready)
- [ ] All Phase 1-7 checkpoints still pass
- [ ] 10K node graph at 60fps
- [ ] Search returns results in <20ms
- [ ] Cold start <2 seconds
- [ ] Bundle <500KB gzipped
- [ ] All 6 themes render correctly
- [ ] Vault import/export works with external editors
- [ ] Block references `((id))` and wikilinks `[[title]]` work
- [ ] ONNX embeddings compute on NPU/GPU
- [ ] No `cargo clippy` warnings
- [ ] No console errors in webview
- [ ] Windows installer builds via `cargo tauri build`

---

## Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend framework | Vite + React Router | No server process, 10x faster dev, lighter bundle |
| Type bridge | tauri-specta | Auto-generated, single source of truth |
| ID system | Newtype-wrapped UUIDs | Compiler prevents cross-entity ID bugs |
| Error handling | thiserror + structured AppError | Frontend pattern-matches error kinds |
| Pipeline events | broadcast channel | Multiple independent consumers |
| UI physics | Rust WASM spring solver | Same engine as graph, replaces Framer Motion |
| Graph node source | NodeSource enum | Compiler enforces valid pairings |
| Note body storage | Files on disk | Keeps SQLite lean, atomic writes, mmap-ready |
| Search | FST + FTS5 dual-layer | Sub-ms fuzzy + ranked full-text |
| Graph rendering | Bevy + wgpu + WGSL | Native GPU, 10K+ nodes at 60fps |
| Graph physics | Rapier3D | True rigid body, SpringJoint |
| LLM streaming | reqwest SSE → broadcast → Tauri events | Zero HTTP overhead in app |
| Stub strategy | Rust mocks via tauri-specta | Type-checked, real invoke from Day 1 |
