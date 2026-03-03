# Epistemos Retro Edition — CLAUDE.md

## IDENTITY

Epistemos Retro Edition is a **1:1 port** of the macOS Opulent Edition to Windows.
Same features. Same logic. Same pipeline. Same graph. Same vault sync. Same everything.

- **Tauri 2.x** replaces SwiftUI/AppKit
- **Bevy + wgpu + Rapier3D** replaces Metal + custom force sim
- **Vite + React 19** replaces SwiftUI views
- **rusqlite** replaces SwiftData
- **ort crate** replaces Accelerate SIMD
- **Foundry Local + Ollama** replaces Apple Intelligence

This is a PORT. Not a remix. Not a hybrid. The macOS version is the ONLY source of truth.

---

## CRITICAL RULES — NEVER VIOLATE THESE

### Tech Stack (Enforced)

| NEVER USE | ALWAYS USE |
|-----------|------------|
| D3.js / Canvas / SVG for graph | Bevy + wgpu + WGSL shaders |
| D3-force for physics | Rapier3D via bevy_rapier3d |
| fetch() for backend calls | Tauri invoke() |
| SSE for streaming | Tauri events (listen/emit) |
| better-sqlite3 / Drizzle | rusqlite with hand-written SQL |
| transformers.js | ort crate (ONNX Runtime + DirectML) |
| JS workers / setTimeout | tokio::spawn / std::thread |
| CSS animations for graph | WGSL shaders |
| Per-item invoke() loops | Batch commands (Vec<T>) |
| React state for physics | Bevy ECS components |

### Code Quality (Enforced)

- No `.unwrap()` in production code — use `?` or `.expect("context")`
- No copy-paste between modules — extract shared logic
- No stubs that return empty/mock data unless explicitly building a scaffold step
- No TODO comments without a corresponding issue or phase reference
- `cargo clippy -- -D warnings` must pass
- `cargo test` must pass before any commit

---

## MACOS SOURCE OF TRUTH

The macOS app lives at `/Users/jojo/Epistemos/`. Here is what it implements and what
the Retro Edition MUST match:

### 1. LLM Service (910 LOC → `crates/engine/src/llm/`)

**Source:** `Epistemos/Engine/LLMService.swift`

6 providers, each with streaming + non-streaming:
- **Anthropic** (claude-sonnet-4-6): Messages API, JSON schema
- **OpenAI** (gpt-5.3): Chat Completions, streaming
- **Google Gemini** (gemini-2.5-flash): generateContent, SSE
- **Kimi/Moonshot**: OpenAI-compatible endpoint
- **Ollama**: localhost:11434, any model
- **Foundry Local** (Windows-only): localhost:{port}/v1, NPU auto-routing

Key logic to port:
- `generate(prompt, systemPrompt, maxTokens)` → full completion
- `stream(prompt, systemPrompt, maxTokens)` → AsyncStream of tokens
- `testConnection()` → "Reply with exactly: OK"
- `configSnapshot()` → freeze config for background tasks (avoids MainActor)
- `enrichmentSnapshot()` → select best provider for enrichment (Anthropic preferred)
- Retry logic: 429, 529, 502, 503 → exponential backoff (3 retries)

### 2. Three-Pass SOAR Pipeline (742 LOC → `crates/engine/src/pipeline/`)

**Source:** `Epistemos/Engine/PipelineService.swift`

10-stage pipeline with 3 passes:
```
Pass 1 (Streaming): User sees answer immediately
  - Parse <thinking> tags → deliberation events
  - Extract [CONCEPTS: ...] → concept list
  - Advance through 10 stages, emit stage events
  - Yield text deltas for live display

Pass 2 (Background, 180s timeout): Epistemic Lens
  - Task.detached(priority: .utility) — not on main thread
  - 6,000-token analytical prose with evidence tiers
  - Uses enrichmentSnapshot() for provider selection

Pass 3 (Background, 300s timeout): Consolidated JSON
  - Single structured output call:
    {
      laymanSummary: string,
      reflection: string,
      arbitration: { votes: [{framework, confidence, reasoning}] },
      truthAssessment: { overallLikelihood: float, factors: [...] }
    }
  - Full fallback on parse failure (signal-derived defaults)
```

**10 Pipeline Stages:** TRIAGE → MEMORY → ROUTING → STATISTICAL → CAUSAL →
META_ANALYSIS → BAYESIAN → SYNTHESIS → ADVERSARIAL → CALIBRATION

**INVARIANT:** Pass 1 cancels on new query. Passes 2-3 continue in background.
Results delivered via callback (Tauri event), not return value.

### 3. Triage Service (505 LOC → `crates/engine/src/triage.rs`)

**Source:** `Epistemos/Engine/TriageService.swift`

Routes between on-device (Foundry Local/Ollama) and cloud API:
```
complexity = base + length_factor + query_analysis_factor
if complexity <= 0.25 → on-device (NPU ~50ms)
if complexity > 0.25  → cloud API (~3-8s)
```

Fallback chain (CRITICAL for UX — never show empty response):
1. Try primary provider
2. If auth error (401/403) AND local available → fallback to local
3. If local refusal (heuristic patterns) → fallback to cloud
4. If cloud also fails → use partial local response

Refusal detection: 25+ patterns in first 500 chars ("i can't help", "beyond my capabilities", etc.)

### 4. Query Analyzer (150 LOC → `crates/engine/src/query_analyzer.rs`)

**Source:** `Epistemos/Engine/QueryAnalyzer.swift`

Pure string analysis (NO LLM call):
- Domain: Biology, Medicine, Psychology, History, Physics, Economics, Philosophy, Technology, Art, General
- Question type: Factual, Causal, Definitional, Predictive, Evaluative, Comparison, Counterfactual
- Entity extraction: Named entities (people, places, concepts)
- Complexity: word_count + entity_count + superlative_count + question_marks

### 5. Signal Generator (200 LOC → `crates/engine/src/signals.rs`)

**Source:** `Epistemos/Engine/SignalGenerator.swift`

Derived from QueryAnalysis:
- **Confidence** (0-1): Inverse complexity + entity uncertainty
- **Entropy** (0-1): Question type + domain subjectivity
- **Dissonance** (0-1): Contradiction potential
- **Health Score** (0-1): Overall epistemic health
- **Safety State**: Normal / Caution / Warning
- **Risk Score**: Harm potential (medicine, psychology elevated)
- **Focus Depth**: Depth guidance for analysis
- **Temperature Scale**: LLM temperature multiplier

### 6. SOAR Learning Loop (400 LOC → `crates/engine/src/soar/`)

**Source:** `Epistemos/Engine/SOAR/` (4 files)

- **SOARDetector**: Probe learnability (difficulty > 0.5 AND entropy > 0.6 AND confidence < 0.7)
- **SOARTeacher**: Generate curriculum (3 stones: clarify, frameworks, empirical tests)
- **SOARReward**: Score attempts (confidence 0.40, entropy 0.25, dissonance 0.20, health 0.15)
- **SOAREngine**: Orchestrate probe → curriculum → attempts → rewards

### 7. Graph Builder (420 LOC → `crates/graph/src/builder.rs`)

**Source:** `Epistemos/Graph/GraphBuilder.swift`

Deterministic graph from database (NO AI):
1. Pages → note nodes (weight by word count)
2. Tags → tag nodes + .tagged edges
3. Ideas → idea nodes + .contains edges
4. Blocks (>20 chars) → block nodes + .contains edges
5. ((blockRef)) patterns → .reference edges
6. Folders → folder nodes + containment edges
7. Chats → chat nodes

**Diff-based persist:** Compare expected vs. current, insert/update/delete.
Manual nodes (user-created) are NEVER auto-deleted.

### 8. Entity Extractor (150 LOC → `crates/graph/src/extractor.rs`)

**Source:** `Epistemos/Graph/EntityExtractor.swift`

AI-powered extraction (batches of 5 pages):
- Sources: name, URL, type → source nodes + .cited edges
- Quotes: text, attribution → quote nodes + .contains edges
- Tags: name, description → merge with existing tag nodes
- Cross-note links: from→to with semantic type (supports/contradicts/expands/questions)

### 9. Graph Store (250 LOC → `crates/graph/src/store.rs`)

**Source:** `Epistemos/Graph/GraphStore.swift`

In-memory adjacency list:
- `nodes: HashMap<String, GraphNode>`
- `adjacency: HashMap<String, HashSet<String>>`
- `neighbors(id, edge_types)` → filtered neighbor set
- `path_between(a, b, max_hops)` → shortest path (BFS)
- Load from rusqlite on startup

### 10. Vault Sync (400 LOC → `crates/sync/src/`)

**Source:** `Epistemos/Sync/VaultSyncService.swift`, `NoteFileStorage.swift`

Hybrid model: Database is source of truth, vault .md files are export target.
- Save: SHA256 body hash → write .md with YAML front-matter
- Import: Read .md → parse front-matter → create Page
- Conflict: Compare hashes, present diff
- Watch: `notify` crate (debounced 500ms)
- Auto-save: Configurable interval (default 30s)

### 11. Block System (400 LOC → `crates/sync/src/blocks/`)

**Source:** `Epistemos/Sync/BlockParser.swift`, `BlockReconciler.swift`

Markdown ↔ block structure:
- `- `, `* `, `1. ` → list items (depth by indentation)
- Paragraphs → blocks at depth 0
- Headings → blocks at depth 0
- Fenced code → single block
- O(n) single-pass parsing
- Roundtrip: serialize() reconstructs markdown exactly

### 12. Search Index (200 LOC → `crates/sync/src/search.rs`)

**Source:** `Epistemos/Sync/SearchIndexService.swift`

Dual-layer search:
- **FTS5** (SQLite virtual table): Full-text on title + body + tags, BM25 ranking
- **FST** (fst crate): Levenshtein fuzzy matching on graph labels
- Content-sync triggers: INSERT/DELETE on indexed_pages auto-sync to FTS5
- Startup diff-sync: Compare updatedAt (incremental)

### 13. Database Schema (→ `crates/storage/src/db.rs`)

**Source:** `Epistemos/Models/SD*.swift` (19 files, 2,132 LOC)

Tables (translate SwiftData @Model to CREATE TABLE):
```sql
pages:       id, title, summary, tags_json, file_path, is_pinned, is_archived,
             word_count, research_stage, emoji, created_at, updated_at,
             last_synced_body_hash, needs_vault_sync, parent_page_id, folder_id
blocks:      id, page_id, parent_block_id, content, depth, order, created_at
chats:       id, title, created_at, updated_at
messages:    id, chat_id, role, content, created_at
graph_nodes: id, type, label, source_id, weight, metadata_json, is_manual, created_at
graph_edges: id, source_node_id, target_node_id, type, weight, is_manual, created_at
folders:     id, name, parent_folder_id, created_at
page_versions: id, page_id, hash, parent_hash, timestamp, changes_summary
settings:    key, value (KV store)
```

### 14. Prompt Composer (200 LOC → `crates/engine/src/prompts.rs`)

**Source:** `Epistemos/Engine/PromptComposer+Consolidated.swift`

Static prompt builder (no LLM):
- Evidence hierarchy (Tier 1 meta-analyses → Tier 5 expert opinion)
- Analytics math instructions (Bayesian, effect sizes, p-hacking checks)
- Steering bias injection (confidence multiplier, domain nudge)
- SOAR config injection (max iterations, curriculum stones)

### 15. Enrichment Controller (500 LOC → `crates/engine/src/enrichment.rs`)

**Source:** `Epistemos/Engine/EnrichmentController.swift`

Pass 2: `generate_raw_analysis()` → 6,000-token analytical prose
Pass 3: `generate_consolidated_enrichment()` → single JSON call
Fallback helpers: `fallback_layman_summary()`, `fallback_reflection()`, etc.

---

## CURRENT STATE OF THE RETRO EDITION

### What Exists (DO NOT REBUILD)
- Tauri shell + window configuration ✓
- React UI components (Radix primitives) ✓
- Zustand store (9 slices, event bus) ✓
- Storage types (Page, Chat, Message, Block, GraphNode, GraphEdge) ✓
- Theme system (6 themes) ✓
- Chat component layout (chat.tsx, 842 LOC) ✓

### What's Broken (FIX IMMEDIATELY)
- `src/main.tsx` is a placeholder — must render AppShell
- `framer-motion` imported but not in package.json
- `src/lib/bindings.ts` doesn't exist — needs `npm run tauri dev` to generate
- Storage crate not connected to commands

### What's Missing (BUILD IN ORDER)
Phase 2: Database initialization + CRUD in commands (rusqlite)
Phase 3: Replace all stubs with real invoke() calls
Phase 4: LLM client (6 providers + streaming)
Phase 5: Rapier3D graph (physics + Bevy rendering)
Phase 6: Entity extraction
Phase 7: Full 3-pass pipeline
Phase 8: Search + Polish

---

## IMPLEMENTATION PATTERNS

### Tauri Command Pattern
```rust
#[tauri::command]
#[specta::specta]
async fn create_page(
    state: State<'_, AppState>,
    title: String,
) -> Result<Page, AppError> {
    let db = state.db.lock().await;
    let page = Page::new(title);
    db.insert_page(&page)?;
    Ok(page)
}
```

### Streaming via Tauri Events
```rust
// Backend: emit chunks
app.emit("chat-stream", StreamChunk { text, done: false })?;

// Frontend: listen
listen("chat-stream", (event) => {
    store.appendStreamingText(event.payload.text);
});
```

### Batch IPC (NEVER per-item)
```rust
// WRONG: 100 invoke calls
for note in notes { invoke("create_page", { title: note.title }) }

// RIGHT: 1 invoke call
invoke("create_pages_batch", { pages: notes })
```

---

## REFERENCE DOCS (READ BEFORE CODING)

1. `docs/plans/2026-02-28-retro-edition-engineering-standards.md` — THE LAW
2. `docs/plans/2026-02-28-retro-edition-plan.md` — Phase-by-phase build sequence
3. `docs/plans/2026-02-28-retro-edition-design.md` — Full architecture

---

## PERFORMANCE TARGETS

| Metric | Target |
|--------|--------|
| Graph: 10K nodes @ 60fps | <16ms frame |
| Rapier3D tick (10K bodies) | <1ms |
| IPC round-trip (invoke) | <0.5ms |
| Note save + index | <50ms |
| FTS5 search (10K docs) | <20ms |
| Embedding (ort) | <1ms |
| Cold start | <2 seconds |
