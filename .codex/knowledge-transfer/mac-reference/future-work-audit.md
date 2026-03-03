# Epistemos — The Bible
## Comprehensive Future Work, Audit Findings & Hardening Roadmap
### Last Updated: 2026-02-28

This document is the single source of truth for ALL planned improvements, bugs, edge cases, security concerns, and architectural debt in Epistemos. It consolidates findings from:

- 7-agent deep rebuild audit (`docs/simulate-rebuild/synthesis.md`)
- v2 implementation roadmap (`docs/simulate-rebuild/v2-roadmap.md`)
- Logseq performance comparison (`~/issues2.pdf`)
- Logseq feature plan (`radiant-sleeping-pelican.md`)
- Design docs (`docs/plans/*.md`)
- Part 2 deep codebase audit — edge cases, race conditions, FFI safety
- In-code TODOs
- Pre-commit hardening audit (2026-02-28)
- Gemini "antigravity" feature backlog brainstorm
- Gemini "Epistemos Manifesto" — cognitive exoskeleton roadmap
- Gemini Logseq architecture analysis (block outlining, queries, transclusion)
- Personal brainstorm & feature requests (2026-02-28)
- Gemini physics UI analysis — Rapier integration, relativistic lensing, quantum SOAR collapse
- Epistemos Retro Edition architecture — Tauri + Rust + Next.js Windows port

**How to use this document:** Work through items by priority (P0 → P5). Each item has a checkbox. Mark `[x]` when complete. Items within each wave are ordered by impact.

---

## TABLE OF CONTENTS

**Foundation & Hardening (Waves 0-13):**
1. [Wave 0: DONE](#wave-0-done)
2. [Wave 1: Performance (CRITICAL)](#wave-1-performance-critical--fixes-lag)
3. [Wave 2: Architecture Cleanup](#wave-2-architecture-cleanup)
4. [Wave 3: Quality & Testing](#wave-3-quality--testing)
5. [Wave 4: Second Brain Features](#wave-4-second-brain-features)
6. [Wave 5: Data Integrity & Edge Cases](#wave-5-data-integrity--edge-cases)
7. [Wave 6: Concurrency & Race Conditions](#wave-6-concurrency--race-conditions)
8. [Wave 7: Memory & Resource Exhaustion](#wave-7-memory--resource-exhaustion)
9. [Wave 8: FFI & Rust Boundary Safety](#wave-8-ffi--rust-boundary-safety)
10. [Wave 9: SwiftData Pitfalls](#wave-9-swiftdata-pitfalls)
11. [Wave 10: Security & Privacy](#wave-10-security--privacy)
12. [Wave 11: Error Handling Gaps](#wave-11-error-handling-gaps)
13. [Wave 12: UI/UX Edge Cases](#wave-12-uiux-edge-cases)
14. [Wave 13: Performance Degradation Scenarios](#wave-13-performance-degradation-scenarios)

**Vision & Growth (Waves 14-20):**
15. [Wave 14: AI & Cognitive Features](#wave-14-ai--cognitive-features-vision)
16. [Wave 15: Graph & Visual Innovations](#wave-15-graph--visual-innovations-vision)
17. [Wave 16: Academic Writing & Export](#wave-16-academic-writing--export)
18. [Wave 17: UI/UX Polish & Bugs](#wave-17-uiux-polish--bugs)
19. [Wave 18: Interactive & Live Features](#wave-18-interactive--live-features)
20. [Wave 19: Infrastructure & Comprehensive Testing](#wave-19-infrastructure--comprehensive-testing)
21. [Wave 20: Advanced Architecture & Platform](#wave-20-advanced-architecture--platform)
22. [Wave 21: Epistemos Retro Edition (Windows/Cross-Platform)](#wave-21-epistemos-retro-edition-windowscross-platform)

**Reference:**
23. [Logseq Comparison & Scalability](#logseq-comparison--scalability)
24. [Physics UI Analysis — Rapier & Cognitive Exoskeleton](#physics-ui-analysis--rapier--cognitive-exoskeleton)
25. [UI/UX Audit Findings](#uiux-audit-findings)
26. [Master Priority Order](#master-priority-order)

---

## WAVE 0: DONE

These items are complete. Kept for reference.

- [x] **Fix circular folder recursion** — `recursivePageCount` now uses `visitedFolders` set + depth limit
- [x] **Fix single node settling** — Physics simulation no longer restarts endlessly for isolated nodes
- [x] **Fix tick count reset** — Tick counter properly managed
- [x] **SDPage.body to file storage** — `NoteFileStorage` reads/writes bodies from Application Support files, not inline SQLite
- [x] **SDBlock model** — Persisted block entities with `id`, `pageId`, `parentBlockId`, `order`, `depth`, `content`
- [x] **BlockParser** — Bidirectional markdown ↔ block conversion (O(n) single pass)
- [x] **BlockReconciler** — Jaccard similarity matching preserves block UUIDs across edits
- [x] **Tab/Shift-Tab indent** — Editor indent/outdent via `doCommandBy` handler
- [x] **Lazy block migration** — Existing notes get blocks created on first open
- [x] **QueryTypes DSL** — Full graph query DSL with filters, paths, aggregations
- [x] **HeuristicQueryParser** — Regex pattern matching for common NL queries
- [x] **QueryExecutor** — Dispatches DSL to GraphStore, SwiftData, FTS5, Rust
- [x] **QueryEngine coordinator** — Observable class wiring parser + executor
- [x] **QueryResultsView + sidebar integration** — List/graph/table display modes
- [x] **Block ref `((ref))` detection** — MarkdownTextStorage styling with accent color + tinted background
- [x] **TransclusionOverlayManager** — Floating NSView overlays for block references
- [x] **TransclusionOverlayView** — Subtle left border + tinted background rendering
- [x] **BlockRefAutocomplete** — NSPopover triggered by `((` with searchable block list
- [x] **Dark/light mode fixes** — VersionTimeline, MessageBubble, GraphFloatingControls, QueryResultsView, TimeSliderOverlay, HologramOverlay, HologramSearchSidebar all fixed
- [x] **Pre-commit hardening** — 15 bugs fixed (3 CRITICAL crashes, 11 HIGH, 1 MEDIUM)
- [x] **EntityExtractor N+1 fix** — Per-page block fetching instead of full-table scan
- [x] **BlockReconciler N+1 fix** — Direct SDBlock references instead of re-fetching unsaved objects

---

## WAVE 1: PERFORMANCE (CRITICAL — Fixes Lag)

### 1.1 Per-Node Highlight Flag Buffer
- **Priority:** P1
- **Source:** v2-roadmap Task 1.1, synthesis #6
- **Problem:** `upload_graph()` called 8x for highlight/dim. Each call rebuilds ALL node + edge instances. Clicking a node to highlight neighbors = full geometry rebuild.
- **Fix:** Add `highlight_flags: Vec<u8>` to Engine. Upload only N bytes (the flag buffer), not full geometry. Modify node/edge fragment shaders to read flag.
- **Files:** `graph-engine/src/engine.rs`, `renderer.rs`, `lib.rs`
- **Status:** [ ] NOT STARTED

### 1.2 Pre-Allocate Scratch Buffers in Physics
- **Priority:** P1
- **Source:** v2-roadmap Task 1.2, synthesis #7
- **Problem:** `force_collide()` allocates fresh HashMap with ~N inner Vecs every tick (120/sec). `force_many_body()` allocates Vec<Body> every tick. ~500+ heap allocs/tick.
- **Fix:** Add `collision_grid: FxHashMap` and `bodies_scratch: Vec<Body>` to Simulation. Clear and reuse instead of allocating. Use `rustc_hash::FxHashMap`.
- **Files:** `graph-engine/src/simulation.rs`, `forces.rs`
- **Status:** [ ] NOT STARTED

### 1.3 Pre-Allocate Field Line Metal Buffer
- **Priority:** P2
- **Source:** v2-roadmap Task 1.3
- **Problem:** `renderer.rs` line 1064 creates new Metal buffer via `new_buffer_with_data()` every frame on hover.
- **Fix:** Pre-allocate field line buffer with tracked capacity. `copy_nonoverlapping` into existing buffer when capacity suffices.
- **Files:** `graph-engine/src/renderer.rs`
- **Status:** [ ] NOT STARTED

### 1.4 Straight-Line Edges (Remove Bezier Tessellation)
- **Priority:** P2
- **Source:** v2-roadmap Task 1.4, synthesis lesson #8
- **Problem:** Every edge tessellated into 8 segments = 8x instances. Every production graph tool uses straight lines. Curves look cool in demos, hurt readability in real use.
- **Fix:** Set `EDGE_SEGMENTS = 1` or remove tessellation loop. Remove `gravitational_control_point()`, `bezier_point()`.
- **Files:** `graph-engine/src/renderer.rs`
- **Status:** [ ] NOT STARTED

### 1.5 Remove Motion Blur Post-Process
- **Priority:** P2
- **Source:** v2-roadmap Task 1.5
- **Problem:** 2 offscreen textures + blit copy + full-screen shader per frame. Subtle effect costs ~16MB VRAM and 2 extra render passes.
- **Fix:** Remove `offscreen_texture`, `prev_frame_texture`, `post_process_pipeline`. Render directly to `drawable.texture()`.
- **Files:** `graph-engine/src/renderer.rs`
- **Status:** [ ] NOT STARTED

### 1.6 List Virtualization
- **Priority:** P1
- **Source:** issues2.pdf Critical Gap #1
- **Problem:** Chat history loads ALL messages into memory. Note sidebar lists ALL pages without virtualization. No `LazyVStack` or `UICollectionView` diffing. 10,000 notes = 10,000 SwiftUI view instances = slideshow framerate. Memory pressure causes jetsam.
- **Fix:** Use `LazyVStack` with `.id()` recycling, or `NSCollectionView` wrapper for true virtualization.
- **Files:** NotesSidebar.swift, ChatView.swift, search results views
- **Logseq comparison:** Uses `react-virtuoso` with `:overscan 200` and scroll-pause rendering
- **Status:** [ ] NOT STARTED

### 1.7 Search Debouncing on ALL Entry Points
- **Priority:** P1
- **Source:** issues2.pdf Critical Gap #2
- **Problem:** Only 1 debounce in entire app (`NotesUIState.debouncedSearchQuery`). `GraphState.rustSearch()` called on EVERY keystroke. Typing "quantum" = 7 search queries = 7 FFI calls = 7 GRDB queries.
- **Fix:** Add 150ms debounce to ALL search entry points: graph search, command palette, notes sidebar. Use `Task.sleep(for:)` + cancellation pattern.
- **Files:** GraphState.swift, CommandPaletteOverlay.swift, HologramSearchSidebar.swift
- **Logseq comparison:** Uses `(use-debounced-value query 200)` consistently
- **Status:** [ ] NOT STARTED

### 1.8 Background Graph Building
- **Priority:** P1
- **Source:** issues2.pdf Critical Gap #3
- **Problem:** `GraphBuilder.build()` runs synchronously on main thread. `GraphStore.load(context:)` fetches 15,000+ items directly on `@MainActor`. 15,000 notes x multiple edge types = seconds of blocking. Beachball cursor.
- **Fix:** Move to `actor GraphBuilderActor { func build(context:) async -> GraphData }`. Map heavy SwiftData entities to lightweight `GraphNodeRecord` structs in the background. Main actor awaits result.
- **Files:** GraphBuilder.swift, GraphState.swift, GraphStore.swift
- **Logseq comparison:** Graph computation in WebWorker (background thread), incremental updates
- **Status:** [ ] NOT STARTED

### 1.9 Search Result Caching
- **Priority:** P2
- **Source:** issues2.pdf Critical Gap #4
- **Problem:** `fuzzySearch()` recomputes from scratch EVERY TIME. O(n) scan of ALL nodes. Same query = same work repeated.
- **Fix:** Add `SearchCache` with 30-second TTL. Invalidate on data changes.
- **Files:** GraphStore.swift (new SearchCache class)
- **Logseq comparison:** Uses `query-cache` atom with entity-based invalidation
- **Status:** [ ] NOT STARTED

### 1.10 Frustum Culling in Metal Renderer
- **Priority:** P2
- **Source:** issues2.pdf Moderate Gap #7
- **Problem:** Renders ALL nodes every frame, even off-screen. 5000 nodes = 5000 draw calls = GPU bound.
- **Fix:** In `renderer.rs`, skip nodes where `!frustum.contains(node.position)`.
- **Files:** `graph-engine/src/renderer.rs`
- **Logseq comparison:** Uses `isScrolling` callback to pause expensive rendering
- **Status:** [ ] NOT STARTED

### 1.11 SwiftData Prefetch Relationships
- **Priority:** P2
- **Source:** issues2.pdf Moderate Gap #6
- **Problem:** N+1 query pattern in GraphBuilder. 1000 pages with 10 blocks each = 1001 queries.
- **Fix:** Use `descriptor.relationshipKeyPathsForPrefetching = [\.blocks, \.folder, \.tags]`.
- **Files:** GraphBuilder.swift, any bulk SDPage fetches
- **Status:** PARTIALLY DONE (EntityExtractor N+1 fixed, GraphBuilder still needs it)

### 1.12 Incremental FFI Graph Updates
- **Priority:** P2
- **Source:** newone.pdf 1.2, detailed PDF Section 1
- **Problem:** When a user manually creates a single node or edge, `GraphState` calls `requestRecommit()` which triggers `commitGraphData()` — calling `graph_engine_clear` and re-adding the ENTIRE graph (potentially 15,000+ nodes/edges) over FFI. This drops and rebuilds the entire Metal GPU buffer.
- **Fix:** Implement incremental FFI functions (`graph_engine_add_node`, `graph_engine_remove_node`) so single-node additions don't trigger a full O(N) recommit.
- **Files:** GraphState.swift, MetalGraphView.swift, graph-engine/src/lib.rs
- **Status:** [ ] NOT STARTED

---

## WAVE 2: ARCHITECTURE CLEANUP

### 2.1 AppEnvironment Container (Group 15 → 5 Environment Objects)
- **Priority:** P3
- **Source:** v2-roadmap Task 2.1, synthesis #2
- **Problem:** 15 separate `.environment()` injections duplicated in 3 places. Adding 16th requires updating 3+ files.
- **Fix:** Group into 5 containers: `chat`, `ui`, `notes`, `engine`, `graph` + `ServiceContainer`.
- **Files:** New `AppEnvironment.swift`, modify `EpistemosApp.swift`, `UtilityWindowManager.swift`
- **Status:** [ ] NOT STARTED

### 2.2 Extract AppCoordinator from AppBootstrap
- **Priority:** P3
- **Source:** v2-roadmap Task 2.2, synthesis #1
- **Problem:** AppBootstrap is ~700-line god object. 78 references across 29 files via `.shared`.
- **Fix:** Move `handleQuery()`, `cancelActiveQuery()`, `generateChatTitle()`, `buildNotesContext()`, `executeVaultActions()` into `AppCoordinator`. AppBootstrap shrinks to just initialization.
- **Files:** New `AppCoordinator.swift`, modify `AppBootstrap.swift` and extensions
- **Status:** [ ] NOT STARTED

### 2.3 Consolidate AI Pipeline (5 → 1-2 LLM Calls)
- **Priority:** P3
- **Source:** v2-roadmap Task 2.3, synthesis #3
- **Problem:** Research mode fires 5 enrichment passes at ~17K output tokens ($0.50-1.00/query, 2-5 min latency). SignalGenerator produces fake statistics from regex keyword matching. "Confidence," "entropy," "dissonance," "TDA betti numbers" are polynomials over query length.
- **Fix:** Replace 10-stage loop with 2 phases: stream answer + 1 structured-output enrichment call. Delete SignalGenerator (~500 lines). Remove steering math from PromptComposer.
- **Files:** PipelineService.swift, EnrichmentController.swift, DELETE SignalGenerator.swift, PromptComposer.swift, PipelineState.swift
- **Status:** [ ] NOT STARTED

### 2.4 GraphEngine Swift Wrapper
- **Priority:** P3
- **Source:** v2-roadmap Task 2.4, synthesis Tension #1
- **Problem:** MetalGraphNSView has 940 lines with 100+ raw `withCString`/pointer/UInt8 FFI boilerplate.
- **Fix:** Create typed `GraphEngine` class wrapping the opaque pointer. Methods: `addNode()`, `render()`, `setHighlight()`, etc.
- **Files:** New `GraphEngine.swift`, modify `MetalGraphView.swift`
- **Status:** [ ] NOT STARTED

### 2.5 Diff-Based Graph Rebuild
- **Priority:** P2
- **Source:** v2-roadmap Task 2.5, synthesis #5, issues2.pdf P2 #10
- **Problem:** `GraphBuilder.persist()` deletes ALL non-manual graph data and re-inserts everything on every mutation. For 1000 notes: thousands of DELETE + INSERT SQL operations per session.
- **Fix:** Compute expected nodes/edges, fetch current, compute diff. Only INSERT new, UPDATE changed, DELETE removed.
- **Files:** GraphBuilder.swift, GraphState.swift
- **Status:** [ ] NOT STARTED

### 2.6 Remove EventBus
- **Priority:** P4
- **Source:** synthesis minimalist recommendation
- **Problem:** EventBus has only 3 subscribers. A bus pattern is overkill.
- **Fix:** Replace with direct calls or NotificationCenter for the 3 specific events.
- **Files:** EventBus.swift (DELETE), subscribers
- **Status:** [ ] NOT STARTED

### 2.7 Conversation History Format
- **Priority:** P3
- **Source:** synthesis #9
- **Problem:** Prior messages joined as `"User: ...\nAssistant: ..."` strings instead of provider-native message arrays. JSON extraction duplicated in 3 separate implementations.
- **Fix:** Use provider-native message format for conversation history. Consolidate JSON extraction.
- **Files:** PromptComposer.swift, LLMService.swift
- **Status:** [ ] NOT STARTED

### 2.8 UserDefaults vs SwiftData Split-Brain
- **Priority:** P1
- **Source:** newone.pdf 3.1, detailed PDF Section 3
- **Problem:** `savedPapers` tracked in UserDefaults while notes, folders, and chats are in SwiftData. Crash recovery or iCloud sync delays can cause permanent corruption — a paper is saved but UI refuses to show it (or vice versa).
- **Fix:** Fulfill the existing TODO in `ResearchState.swift` to migrate `savedPapers` to a proper `SDSavedPaper` @Model inside SwiftData.
- **Files:** ResearchState.swift
- **Status:** [ ] NOT STARTED

---

## WAVE 3: QUALITY & TESTING

### 3.1 Build Infrastructure
- **Priority:** P4
- **Source:** v2-roadmap Task 3.1, synthesis #8
- **Fix:** Create `Makefile` with targets: `test` (cargo test + xcodebuild test), `build-rust`, `lint`. Add GitHub Actions CI. Add `.swiftlint.yml`.
- **Status:** [ ] NOT STARTED

### 3.2 Protocol-Based DI + Pipeline Tests
- **Priority:** P4
- **Source:** v2-roadmap Task 3.2, synthesis #8
- **Problem:** Zero tests on AI pipeline (PipelineService, LLMService, ResearchService, AppBootstrap+ChatOrchestration). SearchIndexTests tests a DUPLICATE of the logic, not real code.
- **Fix:** Extract `LLMClientProtocol`. Write 5-10 mock-based pipeline tests. Fix SearchIndexTests.
- **Status:** [ ] NOT STARTED

### 3.3 SwiftData VersionedSchema
- **Priority:** P4
- **Source:** v2-roadmap Task 3.3
- **Fix:** Define current schema as V1. Add `SchemaMigrationPlan`. Remove UserDefaults migration flags.
- **Status:** [ ] NOT STARTED

---

## WAVE 4: SECOND BRAIN FEATURES

### 4.1 Typed Semantic Links
- **Priority:** P5
- **Source:** v2-roadmap Task 4.1, Gemini manifesto
- **Fix:** Modify EntityExtractor for structured output edge classification (support/contradict/expand/cite). Add edge type visualization in graph.
- **Status:** [ ] NOT STARTED

### 4.2 Semantic Clustering via Embeddings
- **Priority:** P5
- **Source:** v2-roadmap Task 4.2, Gemini Manifesto §2
- **Fix:** Generate 384-dim embeddings. Pass to Rust engine. Add SIMD-accelerated cosine similarity force computed at 60fps. Nodes cluster by *meaning*, not just explicit links. "Semantic gravity" — notes that mean similar things attract each other even without wikilinks.
- **Key insight (Manifesto):** This transforms the graph from "link topology" to "meaning topology." Notes about "recession" and "market crash" cluster together naturally.
- **Status:** [ ] NOT STARTED

### 4.3 Rust FST Fuzzy Search (EVERYWHERE)
- **Priority:** P3 (elevated — user priority)
- **Source:** v2-roadmap Task 4.3, Gemini Manifesto §3, personal brainstorm
- **Fix:** Add `fst` crate. Build FST index with Levenshtein-distance SIMD matching during commit. Replace GRDB FTS5 **everywhere**:
  - Command palette (Cmd+S) — autocomplete note titles, ideas, topics
  - Landing page search — full fuzzy search with autocomplete dropdown
  - Graph search sidebar
  - Notes sidebar search
  - All search entry points
- **Semantic discovery:** Combine FST text search with embedding search. Searching "economic decline" should return notes about "recession" and "market crash," prioritized by semantic clustering distance.
- **Target:** Search entire 10K+ note vault in <1ms, stream results to Swift as user types.
- **Status:** [ ] NOT STARTED

### 4.4 Block-Based Outlining (Logseq Features)
- **Source:** radiant-sleeping-pelican.md Wave A
- **Done:** SDBlock model, BlockParser, BlockReconciler, Tab/Shift-Tab indent, lazy migration
- **Remaining:**
  - [ ] Block gutter view (partially done — bullets/disclosure triangles)
  - [ ] Block folding (partially done — glyph hiding implemented, need UI polish)
  - [ ] Graph node type `.block` integration with GraphBuilder
- **Status:** PARTIALLY DONE

### 4.5 Natural Language Query Engine
- **Source:** radiant-sleeping-pelican.md Wave B
- **Done:** QueryTypes DSL, HeuristicQueryParser, QueryExecutor, QueryEngine, QueryResultsView + sidebar
- **Remaining:**
  - [ ] Apple Intelligence on-device parsing
  - [ ] Cloud LLM fallback
  - [ ] CommandPaletteOverlay `?` prefix routing
- **Status:** MOSTLY DONE

### 4.6 Block References (Transclusion)
- **Source:** radiant-sleeping-pelican.md Wave C
- **Done:** Rust parser `((ref))` detection, styling, TransclusionOverlayManager, TransclusionOverlayView, BlockRefAutocomplete
- **Remaining:**
  - [ ] Click-to-navigate for block refs (detect `EpistemosBlockRef` in mouseDown)
  - [ ] Graph edge emission for block refs (scan bodies for `((blockId))` → `.reference` edges)
  - [ ] Live updates on source block edit (NotificationCenter `.blocksDidChange`)
  - [ ] Circular reference depth limit (max 3)
  - [ ] Missing block placeholder ("Block not found" with red tint)
- **Status:** MOSTLY DONE

### 4.7 Graph Engine v2 Features
- **Source:** `docs/plans/2026-02-27-graph-engine-v2-design.md`
- **Items:**
  - [ ] Cluster physics (attraction/repulsion between semantic clusters)
  - [ ] GPU text labels (Metal text rendering for node labels)
  - [ ] Attractor fields (gravitational wells for topic clusters)
  - [ ] LOD system (simplify distant nodes)
  - [ ] Spatial clustering with quadtree-based grouping
- **Status:** [ ] NOT STARTED

### 4.8 Observatory Visual Effects
- **Source:** `docs/plans/2026-02-26-observatory-effects-design.md`
- **Items:**
  - [ ] Constellation lines between related nodes
  - [ ] Nebula clouds for topic clusters
  - [ ] Pulsing/breathing animations for active nodes
- **Status:** [ ] NOT STARTED

### 4.9 Time-Travel Graph
- **Fix:** Temporal index allowing graph state at any past point.
- **Status:** [ ] NOT STARTED

### 4.10 Ambient Capture
- **Fix:** Rust audio processing + Whisper transcription.
- **Status:** [ ] NOT STARTED

### 4.11 Confidence Visualization & Shader Text Effects
- **Source:** v2-roadmap Task 4.11, Gemini Manifesto §6
- **Fix:** Metal shader effects showing confidence levels on nodes/edges. Extends to text editor:
  - **Uncertainty Halos:** Claims flagged by SOAR pipeline as high entropy/dissonance physically "shimmer" or glow in the editor via Metal compute shaders.
  - **Semantic Focus (Lens):** Everything not semantically related to the current cursor line gently Gaussian-blurs, keeping the user focused.
  - **Node confidence:** Graph nodes glow with varying intensity based on epistemic confidence.
- **Dependencies:** Wave 2.3 (pipeline consolidation — needs real SOAR scores, not fake ones)
- **Status:** [ ] NOT STARTED

---

## WAVE 5: DATA INTEGRITY & EDGE CASES

### 5.1 Front-Matter Parsing Edge Cases
- **Priority:** P2
- **Location:** `VaultIndexActor.swift:564-603` (`parseFrontMatter`)
- **Issue:** Custom YAML parser has no handling for:
  - Multi-line string values (`title: "Line 1\nLine 2"`)
  - Nested objects (`parent: { id: "x", type: "note" }`)
  - YAML anchors/aliases (`&anchor`, `*alias`)
  - Comment lines within front-matter (`# this is a comment`)
  - Tab indentation (assumes spaces)
  - Unicode BOM at file start
  - Values with colons (`title: "My: Title"` breaks split-on-colon logic)
- **Risk:** Corrupted metadata, failed imports, data loss on round-trip
- **Fix:** Replace custom parser with Yams library, or at minimum add validation:
  ```swift
  guard frontMatter.count < 100 else {
      log.warning("Excessive front-matter keys in \(fileURL)")
      return ([:], content)
  }
  ```
- **Status:** [ ] NOT STARTED

### 5.2 Filename Collision Edge Case
- **Priority:** P1
- **Location:** `VaultIndexActor.swift:666-688` (`sanitizeFileName`)
- **Issue:** Deduplication loop caps at 100 iterations (`if suffix > 100 { break }`), leaving potential for filename collision. Two notes with titles differing only after character 200 could collide.
- **Risk:** Data loss when one export overwrites another
- **Fix:** Use UUID suffix instead of incremental:
  ```swift
  candidate = parentURL.appendingPathComponent("\(baseName)-\(UUID().uuidString.prefix(8)).md")
  ```
- **Status:** [ ] NOT STARTED

### 5.3 Version Pruning Race Condition
- **Priority:** P3
- **Location:** `VaultSyncService.swift:748-764` (`pruneVersions`)
- **Issue:** No atomicity between fetch and delete — versions could be added between query and deletion.
- **Risk:** In high-activity scenarios, pruning may never catch up → unbounded version growth → storage exhaustion
- **Fix:** Use single transaction with `DELETE ... WHERE rowid NOT IN (SELECT rowid ... LIMIT 50)`
- **Status:** [ ] NOT STARTED

### 5.4 Empty Vault Context Crash Risk
- **Priority:** P2
- **Location:** `VaultIndexActor.swift:753-841` (`buildVaultContext`)
- **Issue:** Returns `nil` for vague queries (intentional), but 5 call sites may not handle nil gracefully.
- **Risk:** Force unwrap crashes in downstream code
- **Fix:** Audit all callers for nil-safety:
  ```bash
  grep -rn "buildVaultContext" Epistemos --include="*.swift" | grep -v "func build"
  ```
- **Status:** [ ] NOT STARTED

### 5.5 FTS5 Query Injection Risk
- **Priority:** P1
- **Location:** `SearchIndexService.swift:97-118` (`search()`)
- **Issue:** `sanitizeFTS5Query()` exists but may not handle all FTS5 special characters:
  - `NEAR`, `NOT`, `AND`, `OR` operators
  - `^` (start anchor), `$` (end anchor)
  - Column filters (`title:search`)
  - Quoted phrases with embedded quotes
- **Risk:** Malicious or unexpected queries could crash SQLite, match everything, or cause performance degradation
- **Caution test cases:**
  ```swift
  query: "\"unclosed quote"   // May crash SQLite
  query: "*"                  // Matches everything, very slow
  query: "a" * 10000          // Very long query = memory pressure
  ```
- **Fix:** Add strict validation:
  ```swift
  guard query.count < 200 else { return [] }
  guard query.filter({ $0 == "\"" }).count % 2 == 0 else { return [] }
  ```
- **Status:** [ ] NOT STARTED

---

## WAVE 6: CONCURRENCY & RACE CONDITIONS

### 6.1 Graph State Version Tracking Non-Atomicity
- **Priority:** P1
- **Location:** `GraphState.swift:168-176` (`requestRecommit()`, `requestFilterSync()`)
- **Issue:** Version increments are not atomic:
  ```swift
  func requestRecommit() { graphDataVersion += 1 }  // Not atomic!
  ```
- **Risk:** Lost updates if called from multiple threads simultaneously → stale graph data visible
- **Fix:** Use atomic increment:
  ```swift
  private let versionLock = NSLock()
  func requestRecommit() {
      versionLock.lock()
      graphDataVersion += 1
      versionLock.unlock()
  }
  ```
- **Status:** [ ] NOT STARTED

### 6.2 Metal Graph View Engine Handle Race
- **Priority:** P1
- **Location:** `MetalGraphView.swift:139-142` (`setupMetal()`)
- **Issue:** `engine` created on main thread, but `graphState?.engineHandle = engine` happens in `didSet` which may fire before `graphState` is set.
- **Risk:** Null pointer in Rust when Swift calls FFI before engine fully initialized → crash on early graph operations
- **Fix:** Move assignment to explicit lifecycle method with nil check
- **Status:** [ ] NOT STARTED

### 6.3 Pipeline Service Task Cancellation Race
- **Priority:** P0
- **Location:** `PipelineService.swift:101-111` (`run()`)
- **Issue:** `pipelineTask?.cancel()` is called, but new task created immediately without awaiting cancellation. The background `enrichmentTask` (Passes 2 and 3) runs in a `Task.detached` that is *never* cancelled by subsequent queries. 5 rapid queries = 5 disconnected background enrichment pipelines hammering the LLM API.
- **Risk:** API rate limits (429s), exhausted token credits, duplicate LLM calls, battery drain
- **Fix:** Track background enrichment tasks by query ID and cancel previous:
  ```swift
  pipelineTask?.cancel()
  try? await pipelineTask?.value  // Wait for actual completion
  pipelineTask = nil
  ```
- **Status:** [ ] NOT STARTED

### 6.4 SwiftData Context Crossing Isolation Boundaries
- **Priority:** P2
- **Location:** `VaultSyncService.swift:240-267` (import task)
- **Issue:** `modelContainer.mainContext` accessed from non-MainActor context inside Task:
  ```swift
  Task {
      // This is NOT MainActor-isolated!
      try await actor?.importVault(from: url)  // Actor has own context
      // But then MainActor.run uses mainContext...
  }
  ```
- **Risk:** Context isolation violations, potential crashes in SwiftData
- **Impact:** Intermittent "Context used on wrong thread" crashes
- **Fix:** Audit all context usage — ensure strict isolation discipline
- **Status:** [ ] NOT STARTED

---

## WAVE 7: MEMORY & RESOURCE EXHAUSTION

### 7.1 Unbounded Version Storage
- **Priority:** P2
- **Location:** `VaultSyncService.swift:718` (`maxVersionsPerPage = 50`)
- **Issue:** Constant is per-page, but with 50,000 pages = 2.5M versions. No global limit on total versions.
- **Risk:** Storage exhaustion over time → app bloat, slow queries, iCloud sync issues
- **Fix:** Add global version limit + periodic purge:
  ```swift
  private static let maxTotalVersions = 10_000
  func pruneVersionsGlobal() { /* delete oldest across all pages */ }
  ```
- **Status:** [ ] NOT STARTED

### 7.2 Embedding Service Unbounded Dictionary Growth
- **Priority:** P1
- **Location:** `EmbeddingService.swift:25`
- **Issue:** `embeddings: [String: [Float]]` grows indefinitely as graph changes. No eviction policy, no size limit. Graph refreshes orphan old embeddings but don't clear them.
- **Calculation:** 10,000 nodes x 512 dimensions x 4 bytes = ~20MB per graph refresh
- **Risk:** Memory exhaustion, jetsam (especially on memory-constrained devices)
- **Fix:** Add LRU cache with max size:
  ```swift
  private let maxCachedEmbeddings = 5000
  func clearEmbeddings() { embeddings.removeAll() }  // Call on graph refresh
  ```
- **Status:** [ ] NOT STARTED

### 7.3 Note Body Memory-Mapped File Leak
- **Priority:** P2
- **Location:** `SDPage.swift:156` (`loadBody(mapped: true)`)
- **Issue:** Mapped files are not explicitly unmapped — rely on ARC. Large bulk operations may keep many files mapped simultaneously.
- **Risk:** Virtual memory exhaustion, file handle exhaustion
- **Impact:** "Too many open files" errors, crashes
- **Fix:** Use explicit `autoreleasepool` around bulk reads:
  ```swift
  autoreleasepool {
      for page in pages {
          _ = page.loadBody(mapped: true)
      }
  }
  ```
- **Status:** [ ] NOT STARTED

### 7.4 Graph Store Adjacency List Memory Explosion
- **Priority:** P3
- **Location:** `GraphStore.swift:57-61`
- **Issue:** Three redundant data structures for graph:
  ```swift
  var nodes: [String: GraphNodeRecord]     // All node data
  var adjacency: [String: Set<String>]     // Neighbor IDs (duplicates node refs)
  var edgesByNode: [String: Set<String>]   // Edge IDs (more duplication)
  ```
- **Calculation:** 50K nodes x 3 structures x overhead = ~300MB+ just for graph state
- **Fix:** Use adjacency list with indices instead of String IDs:
  ```swift
  struct CompactGraph {
      var nodeData: [GraphNodeRecord]       // Indexed by Int
      var adjacency: [[Int]]                // Indices, not String IDs
  }
  ```
- **Status:** [ ] NOT STARTED

---

## WAVE 8: FFI & RUST BOUNDARY SAFETY

### 8.1 String Lifetime Uncertainty in FFI
- **Priority:** P0
- **Location:** `MetalGraphView.swift` (multiple `withCString` calls)
- **Issue:** Pattern repeated throughout:
  ```swift
  uuid.withCString { cUuid in
      graph_engine_set_node_embedding(engine, cUuid, base, UInt32(dim))
  }
  // cUuid is freed here — but Rust may hold reference!
  ```
- **Risk:** Use-after-free if Rust stores pointer beyond call scope → intermittent crashes, corruption
- **Fix:** Document FFI contract explicitly in Rust — for each function, note whether pointers are copied internally:
  ```rust
  /// # Safety
  /// - `uuid` must be valid for the duration of the call (copied internally)
  /// - `vector` must be valid for the duration of the call (copied internally)
  #[no_mangle]
  pub unsafe extern "C" fn graph_engine_set_node_embedding(...)
  ```
- **Audit Required:** Review all Rust FFI functions — which ones copy vs store pointer?
- **Status:** [ ] NOT STARTED

### 8.2 Metal Layer Pointer Unretained
- **Priority:** P1
- **Location:** `MetalGraphView.swift:137-138`
- **Issue:**
  ```swift
  let layerPtr = Unmanaged.passUnretained(layer).toOpaque()
  engine = graph_engine_create(devicePtr, layerPtr)
  ```
- **Risk:** If Rust stores `layerPtr` and Swift layer is deallocated → dangling pointer → crash on render
- **Fix:** Ensure Rust doesn't retain layer pointer, or use `passRetained` with explicit release:
  ```swift
  let layerPtr = Unmanaged.passRetained(layer).toOpaque()
  // In deinit:
  Unmanaged<CAMetalLayer>.fromOpaque(layerPtr).release()
  ```
- **Status:** [ ] NOT STARTED

### 8.3 Missing Null Checks in FFI Call Chain
- **Priority:** P1
- **Location:** `GraphState.swift:396-420` (`rustSearch()`)
- **Issue:** Multiple FFI calls without nil engine check:
  ```swift
  let results = graph_engine_search(engine, cQuery, UInt32(limit), &count)
  // engine could be nil if graph view not yet initialized
  ```
- **Current Safeguards:** Only `guard !query.isEmpty` — no engine nil check
- **Fix:** Centralize FFI safety:
  ```swift
  private func withEngine<T>(_ operation: (OpaquePointer) -> T) -> T? {
      guard let engine = engineHandle else { return nil }
      return operation(engine)
  }
  ```
- **Status:** [ ] NOT STARTED

---

## WAVE 9: SWIFTDATA PITFALLS

### 9.1 Batch Delete Cascade Violation Risk
- **Priority:** P2
- **Location:** `VaultSyncService.swift:317-327` (`clearVaultData()`)
- **Issue:** Comment warns about cascade, but code uses `delete(model:where:)`:
  ```swift
  try context.delete(model: SDPage.self)  // Bypasses cascade!
  ```
- **Risk:** Orphaned relationships (child pages, blocks, versions not deleted)
- **Fix:** Use explicit fetch + delete loop for cascades:
  ```swift
  let pages = try context.fetch(FetchDescriptor<SDPage>())
  for page in pages { context.delete(page) }  // Respects cascade
  ```
- **Status:** [ ] NOT STARTED

### 9.2 Predicates with Arrays Crashing
- **Priority:** P2
- **Location:** `VaultIndexActor.swift:921-936` (`fetchNoteBodies()`)
- **Issue:** Comment explicitly warns:
  > SwiftData #Predicate can't reliably translate local array .contains() to SQL, causing runtime crashes
- **Risk:** Future developer may "optimize" to use .contains() and crash
- **Fix:** Add compile-time guard comment:
  ```swift
  // NEVER use #Predicate { ids.contains($0.id) } — crashes at runtime
  // Always use individual fetches or IN clause via raw SQL
  ```
- **Status:** [ ] NOT STARTED

### 9.3 Transient Cache Invalidation Missing
- **Priority:** P2
- **Location:** `SDPage.swift:111-147` (frontMatter and ideas caches)
- **Issue:** `@Transient` caches (`_frontMatterCache`, `_ideasCache`) never invalidated when underlying Data changes externally.
- **Risk:** Stale data visible after sync-from-vault
- **Fix:** Add timestamp-based invalidation:
  ```swift
  private var cacheTimestamp: Date?
  var frontMatter: [String: String] {
      get {
          if let cached = _frontMatterCache,
             let ts = cacheTimestamp,
             Date().timeIntervalSince(ts) < 5 { return cached }
          // ... re-decode
      }
  }
  ```
- **Status:** [ ] NOT STARTED

---

## WAVE 10: SECURITY & PRIVACY

### 10.1 API Key Storage in Keychain Without Access Control
- **Priority:** P1
- **Location:** `Keychain.swift`
- **Concern:** If keychain items created without `kSecAttrAccessible` flag, may sync to iCloud.
- **Risk:** API keys exposed via iCloud Keychain
- **Fix:** Explicit access control:
  ```swift
  let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
  ]
  ```
- **Status:** [ ] NOT STARTED

### 10.2 Spotlight Indexing Leaks Note Content
- **Priority:** P1
- **Location:** `VaultIndexActor.swift:988-1000` (`spotlightReindexAll()`)
- **Issue:** Note bodies indexed in Spotlight:
  ```swift
  attrs.textContent = String(pageBody.prefix(500))
  ```
- **Risk:** Sensitive notes appear in system-wide Spotlight search
- **Fix:** Add privacy flag — only index titles/tags by default, not bodies:
  ```swift
  attrs.textContent = page.title
  attrs.keywords = page.tags
  // OR add user preference:
  if !page.isPrivate { attrs.textContent = String(pageBody.prefix(500)) }
  ```
- **Status:** [ ] NOT STARTED

### 10.3 Vault Path Exposure in Logs
- **Priority:** P2
- **Location:** Multiple files use `privacy: .public` for file paths
- **Risk:** Vault location exposed in system logs
- **Fix:** Use `.private` for all path logging:
  ```swift
  log.info("Resolved → \(resolved.path, privacy: .private)")
  ```
- **Status:** [ ] NOT STARTED

---

## WAVE 11: ERROR HANDLING GAPS

### 11.1 Silent Failures in Graph Operations
- **Priority:** P1
- **Location:** `GraphBuilder.swift:18-216` (`build()`)
- **Issue:** Multiple `try?` that silently discard errors:
  ```swift
  let pages = (try? context.fetch(SDPage.activePagesDescriptor)) ?? []
  let folders = (try? context.fetch(FetchDescriptor<SDFolder>())) ?? []
  ```
- **Risk:** Database corruption or permission issues go unnoticed → empty graph with no error message
- **Fix:** Propagate errors or at minimum log them:
  ```swift
  do {
      pages = try context.fetch(descriptor)
  } catch {
      Log.app.error("Failed to fetch pages: \(error)")
      throw GraphBuildError.dataUnavailable
  }
  ```
- **Status:** [ ] NOT STARTED

### 11.2 LLM Stream Error Handling Incomplete
- **Priority:** P2
- **Location:** `PipelineService.swift` (throughout)
- **Issue:** Stream processing catches errors but may not handle:
  - Network drops mid-stream
  - Invalid UTF-8 in response
  - Truncated JSON in enrichment
  - Timeout during token generation
- **Risk:** Partial responses shown as complete, malformed data persisted
- **Fix:** Add checksum/validation for complete responses
- **Status:** [ ] NOT STARTED

### 11.3 File I/O Errors Not Distinguished
- **Priority:** P2
- **Location:** `VaultIndexActor.swift:437-445`
- **Issue:** All file read failures treated equally:
  ```swift
  } catch {
      log.error("Failed to read...")
      return false
  }
  ```
- **Risk:** Different errors need different handling:
  - Permission denied → Alert user
  - File not found → Skip (expected for deletions)
  - Disk full → Pause indexing
  - Corrupted UTF-8 → Attempt recovery
- **Fix:** Switch on error type for appropriate handling
- **Status:** [ ] NOT STARTED

---

## WAVE 12: UI/UX EDGE CASES

### 12.1 Zero-State Handling Inconsistent
- **Priority:** P1
- **Location:** Multiple views
- **Issue:** No standard pattern for:
  - Empty vault (first launch)
  - All notes archived
  - Search with no results
  - Graph with 0 nodes
  - No LLM API key configured
- **Risk:** User confusion, app appears broken, poor first impression
- **Fix:** Create `EmptyStateView` component:
  ```swift
  struct EmptyStateView: View {
      let icon: String
      let title: String
      let subtitle: String
      let action: (title: String, handler: () -> Void)?
  }
  ```
- **Status:** [ ] NOT STARTED

### 12.2 Dark Mode Detection Race
- **Priority:** P2
- **Location:** `MetalGraphView.swift:97-102`
- **Issue:** `isLightMode` didSet calls FFI immediately, but if set before engine created, change is lost.
- **Risk:** Wrong colors on initial render
- **Fix:** Sync in `setupMetal()` as well:
  ```swift
  private func setupMetal() {
      // ... after engine creation
      graph_engine_set_light_mode(engine, isLightMode ? 1 : 0)
  }
  ```
- **Status:** [ ] NOT STARTED

---

## WAVE 13: PERFORMANCE DEGRADATION SCENARIOS

### 13.1 Quadtree Degradation on Coincident Points
- **Priority:** P2
- **Location:** `quadtree.rs:98-102`
- **Issue:** MAX_DEPTH = 20 prevents infinite recursion, but many nodes at exact same position = deep tree. Each insert becomes O(20) instead of O(log n).
- **Risk:** Physics slows dramatically when nodes cluster (all nodes near origin on zoom)
- **Fix:** Add micro-jitter to identical positions:
  ```rust
  if x == other_x && y == other_y {
      x += rng.gen_range(-0.1..0.1);
  }
  ```
- **Status:** [ ] NOT STARTED

### 13.2 Fuzzy Search Scalability Ceiling
- **Priority:** P2
- **Location:** `GraphStore.swift:378-411`
- **Issue:** O(n) scan of ALL nodes for every search. Unusable at 50K+ nodes (500ms+ search delays).
- **Fix:** Pre-compute trigram index:
  ```swift
  private var trigramIndex: [String: Set<String>]  // trigram → node IDs
  ```
- **Status:** [ ] NOT STARTED

### 13.3 Spotlight Reindex on Every Launch
- **Priority:** P2
- **Location:** `VaultIndexActor.swift:965-1000`
- **Issue:** No persistent timestamp check — `lastIndexDate` defaults to `.distantPast`, so reindexes entire vault on every launch if any page changed.
- **Risk:** Slow startup, battery drain
- **Fix:** Verify `UserDefaults` persistence of `lastSpotlightIndexDate`
- **Status:** [ ] NOT STARTED

---

## WAVE 14: AI & COGNITIVE FEATURES (VISION)

These are longer-term features from the Gemini brainstorm that elevate Epistemos from a note-taking app into a true cognitive exoskeleton. Prioritize after Waves 1-3 are stable.

### 14.1 Local AI Engine — GPT-OSS + MLX + Platform-Native
- **Priority:** P5
- **Source:** Gemini backlog #1, OpenAI GPT-OSS release (Aug 2025), Microsoft Foundry Local
- **Description:** Fully local, open-source AI models running without API reliance. Eliminates cost concerns and enables offline use. Offered as a **separate optional download** that upgrades the app's local processing capabilities. Each edition uses platform-native acceleration.
- **macOS (Opulent Edition):**
  - **Primary model:** OpenAI GPT-OSS 20B (4-bit quantized, runs on Apple Silicon via Metal shared memory). Benchmarks show 19-27% speed improvement on M4/M5 chips.
  - **System-level AI:** Apple Intelligence Foundation Models (2-bit QAT, ~3B params, NPU-optimized). Accessed via Foundation Models framework.
  - **Secondary models:** Llama variants via MLX.
  - **Embedding:** SIMD Accelerate (70x faster than transformers.js).
- **Windows (Retro Edition):**
  - **Primary local server:** Microsoft Foundry Local — OpenAI-compatible REST API, auto-routes to Intel NPU/CUDA GPU/CPU. Models: Phi-3.5-mini (NPU), DeepSeek-R1.
  - **GPU powerhouse:** Ollama — GPT-OSS 20B (4-bit, RTX 4060 CUDA, ~12GB VRAM).
  - **Inline inference:** ONNX Runtime via `ort` crate with DirectML — sub-ms embeddings (all-MiniLM-L6-v2), fast classification. No HTTP overhead.
  - **Phi Silica (optional):** Windows Copilot Runtime's NPU-tuned model. WinRT API, 650 tok/s at 1.5W. Currently Limited Access Feature.
- **Cross-platform delivery:** Separate download (4-8GB model weights). App detects installed model on launch, enables local processing toggle in Settings. Graceful fallback to cloud API when local model unavailable.
- **Use cases:** SOAR pipeline local pass, entity extraction, query parsing, triage classification, daily briefs — anything currently hitting cloud LLM that doesn't need frontier reasoning.
- **Dependencies:** Wave 2.3 (consolidate pipeline first, then swap provider)
- **Status:** [ ] NOT STARTED

### 14.2 Autonomous Agents (Open Claw)
- **Priority:** P5
- **Source:** Gemini backlog #2, personal brainstorm, PicoClaw inspiration (github.com/sipeed/picoclaw — ultra-lightweight agent runtime philosophy)
- **Description:** Native agents with full filesystem access to vault. Agents use the app's own LLM providers as their brain and Tauri commands / Rust backend functions as their tools. The agent loop (`plan → tool_call → observe → repeat`) runs entirely inside the Rust backend — no external framework needed.
- **Agent Brain (per-platform):**
  - **macOS (Opulent):** Apple Intelligence (triage) + Ollama/MLX (reasoning) + Cloud LLM (frontier tasks)
  - **Windows (Retro):** Foundry Local on NPU (triage, ~50ms) + Ollama on GPU (reasoning, GPT-OSS 20B) + Cloud LLM (frontier tasks)
  - Brain selection follows same triage router used for SOAR pipeline — agents inherit the hardware routing strategy.
- **Agent Tools (Vault Access):**
  - `notes_create`, `notes_update`, `notes_list`, `notes_delete` — full CRUD
  - `graph_query` — NL queries against knowledge graph
  - `graph_search` — fuzzy search across all nodes
  - `vault_read_body`, `vault_write_body` — direct .md file access
  - `search_index` — FTS5 full-text search
  - `entity_extract` — trigger extraction on a note
  - These are the SAME Tauri commands the frontend uses — agents are just another client.
- **Live Agent Dashboard:** Rust-powered real-time dashboard showing:
  - Token counts (input/output per agent)
  - What each agent is currently doing (reading, writing, linking, organizing)
  - Live action stream — watch agents build and organize notes in background
  - Cost tracking per agent session (local = $0, cloud = tracked)
- **Agent types:** Research agent, organization agent, linking agent, summarization agent
- **Architecture:** Minimal agent loop in Rust (~200 lines). No PicoClaw/LangChain/AutoGPT dependency. The app IS the agent runtime.
- **Dependencies:** Wave 2.2 (AppCoordinator), Wave 14.1 (local AI), Wave 21.3b (Windows native AI for Retro)
- **Status:** [ ] NOT STARTED

### 14.3 Research Mode 2.0 (Lucid Lens)
- **Priority:** P5
- **Source:** Gemini backlog #3
- **Description:** Deep robustness upgrade to research library. Apple Intelligence speed, academic engine for rigorous analysis. Fix currently broken citation fetcher.
- **Dependencies:** Wave 2.3 (pipeline consolidation)
- **Status:** [ ] NOT STARTED

### 14.4 Contemplate Mode
- **Priority:** P5
- **Source:** Gemini backlog — "Brain Abstraction Workstation"
- **Description:** Sister feature to Research Mode. AI uses mathematical/data-driven reasoning for deep philosophical contemplation, debating itself as an intellectual sparring partner.
- **Status:** [ ] NOT STARTED

### 14.5 Note Audit Pipeline
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** Send any note through reasoning pipeline for AI analysis. Apple AI annotates with tags (Highest Confidence, Dissonance, Needs More Work). States visually reflect on Knowledge Graph.
- **Dependencies:** Wave 4.1 (typed semantic links), Wave 4.11 (confidence visualization)
- **Status:** [ ] NOT STARTED

### 14.6 Global Idea Portal (Brain Dump Catcher)
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** Dedicated sidebar portal where AI extracts, categorizes, and lists every scattered idea/brain-dump from across entire vault, linking back to the precise note.
- **Status:** [ ] NOT STARTED

### 14.7 AI Pomodoro Study Sessions
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** Timed study session. On end, Apple AI analyzes everything typed and provides breakdown of what was learned + recommendations on note-taking strategy improvement.
- **Status:** [ ] NOT STARTED

### 14.8 Apple Intelligence Auto-Citations
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** Automatically fetch, verify, and format citations for research library. Fix broken citation fetcher.
- **Status:** [ ] NOT STARTED

### 14.9 Deep Siri Integration
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** Extensive App Intents for conversational Siri interaction with vault contents and connections. "Hey Siri, what notes mention quantum computing?" → structured query engine.
- **Dependencies:** Wave 4.5 (NL query engine)
- **Status:** [ ] NOT STARTED

---

## WAVE 15: GRAPH & VISUAL INNOVATIONS (VISION)

### 15.1 Hologram Global Graph (Cmd+G)
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** System-wide shortcut summons 3D knowledge graph hovering over macOS desktop (no app background). Clicking a node opens the note. Uses existing HologramOverlay infrastructure.
- **Status:** [ ] NOT STARTED

### 15.2 Mind Map Toggle & Auto-Write
- **Priority:** P4 (elevated — user priority)
- **Source:** Gemini backlog, personal brainstorm, X bookmark reference
- **Description:** Graph mode toggle button that rearranges chaotic force-directed graph into a structured Mind Map layout.
- **Physics behavior:** Nodes orient in a strict, linear, non-moving web (neural network / tree style). Physics dampens completely so nodes sit still in organized positions.
- **AI Auto-Write:** As the graph reorganizes, AI begins writing detailed "pamphlets" for each node — summaries, key points, connections, insights.
- **Templates:** Offer mind map templates (topic tree, concept map, argument map, etc.)
- **Node inspection:** Click a node → see its knowledge details in a side panel. Select two nodes → "Fuse Insights" button that makes AI combine both nodes' knowledge and outputs a synthesis.
- **Dependencies:** Wave 4.7 (graph engine v2 for layout modes)
- **Status:** [ ] NOT STARTED

### 15.3 3D Geometric Graphing
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** Nodes arrange into intersecting 3D geometric shapes representing different knowledge structures, rather than flat 2D webs.
- **Dependencies:** Wave 4.7 (graph engine v2)
- **Status:** [ ] NOT STARTED

### 15.4 Note Window Black Hole Transition
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** Hotkey blurs note text into "black hole animation," revealing the graph inside the editor window.
- **Status:** [ ] NOT STARTED

### 15.5 Fix Node Spawning Position
- **Priority:** P2
- **Source:** Gemini backlog
- **Description:** Nodes currently spawn/drift from the far left. They need to spawn dynamically from the absolute center and zoom outward.
- **Files:** `graph-engine/src/simulation.rs` (initial position assignment)
- **Status:** [ ] NOT STARTED

---

## WAVE 16: ACADEMIC WRITING & EXPORT

### 16.1 Writer Mode (Pages Clone)
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** Strict formatting mode for academic writing. Title Page toggle, proper margins, native MLA/APA/Chicago format support.
- **Status:** [ ] NOT STARTED

### 16.2 Advanced Export
- **Priority:** P4
- **Source:** Gemini backlog
- **Description:** Export to Word (.docx), PDF, MLA/APA formatted documents, plain text. Currently only markdown export exists.
- **Status:** [ ] NOT STARTED

### 16.3 Advanced Math & Table Rendering
- **Priority:** P3
- **Source:** Gemini backlog
- **Description:** Upgrade markdown parser for advanced tables and LaTeX/Math block rendering. Replace heavy regex highlighting with native structural editor blocks to fix scroll lag.
- **Bug:** Current syntax highlighter code blocks are lagging the scroll view.
- **Status:** [ ] NOT STARTED

### 16.4 "What I Know So Far" Study Log
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** Auto or manual append of timestamped study log at bottom of notes, detailing review progress.
- **Status:** [ ] NOT STARTED

### 16.5 Git-Style Diff Tracker
- **Priority:** P4
- **Source:** Gemini backlog
- **Description:** Auto-save (15/30/60s intervals) with document diff tracker. See exactly what changed in a session + AI button to summarize the diff.
- **Note:** Partially exists — SDPageVersion + VersionTimeline provides version snapshots. LineDiff.swift provides diff rendering. Missing: configurable intervals, AI diff summary.
- **Status:** PARTIALLY DONE

---

## WAVE 17: UI/UX POLISH & BUGS

### 17.1 Note Window Top Bar Cleanup
- **Priority:** P3
- **Source:** Gemini backlog
- **Description:** Remove bulky top Title Bar and padding. Restore sleek, rounded toolbar.
- **Status:** [ ] NOT STARTED

### 17.2 Unified Transparent Nav Bar
- **Priority:** P3
- **Source:** Gemini backlog
- **Description:** Copy the transparent navigation bar from Chat page to all Note windows for consistency.
- **Status:** [ ] NOT STARTED

### 17.3 Sidebar Button Consolidation
- **Priority:** P3
- **Source:** Gemini backlog
- **Description:** Move the 4 floating note buttons onto main sidebar. Place all sidebar buttons on bottom row.
- **Status:** [ ] NOT STARTED

### 17.4 Dynamic Theme Colors for Icons
- **Priority:** P2
- **Source:** Gemini backlog
- **Description:** Button icon colors don't change with themes (stay black). Need to turn white in OLED mode, orange in Ember/Sunset theme.
- **Related:** Dark/light mode fixes already done, but icon tinting may need additional work.
- **Status:** [ ] NOT STARTED

### 17.5 Folder Summaries
- **Priority:** P4
- **Source:** Gemini backlog
- **Description:** Right-clicking a folder or note in sidebar generates instant AI summary of its contents.
- **Status:** [ ] NOT STARTED

### 17.6 Folder State & Toggles
- **Priority:** P3
- **Source:** Gemini backlog
- **Description:** Add "Expand/Collapse All" button to sidebar. Vault should boot with all folders collapsed by default.
- **Status:** [ ] NOT STARTED

### 17.7 Fix Search Highlight Glitch
- **Priority:** P2
- **Source:** Gemini backlog
- **Description:** Searching from landing page incorrectly highlights "Chat with Note" button instead of actual notes.
- **Status:** [ ] NOT STARTED

### 17.8 Fix Missing Vault Notes
- **Priority:** P1
- **Source:** Gemini backlog
- **Description:** Graph and sidebar aren't rendering every single note in the vault. Deep scan audit required to find missing notes.
- **Status:** [ ] NOT STARTED

### 17.9 Fix Daily Briefs
- **Priority:** P3
- **Source:** Gemini backlog
- **Description:** Feature is broken and extremely slow. Route through Apple Intelligence for instant local generation.
- **Status:** [ ] NOT STARTED

### 17.10 Launch & Shortcut Fixes
- **Priority:** P2
- **Source:** Gemini backlog
- **Items:**
  - [ ] App should open as smaller, focused window (not fullscreen)
  - [ ] Fix `Cmd+H` (should go to landing page)
  - [ ] Fix System Status Bar "Home" button
  - [ ] Add `Cmd+N` (New Note) shortcut
  - [ ] Add `Cmd+2` (Notes) shortcut
- **Status:** [ ] NOT STARTED

### 17.11 App Icon Design
- **Priority:** P4
- **Source:** Gemini backlog
- **Description:** Pixelated retro font 'E' with glasses, or offset 'E' on open pixelated book. Famous pixelated quotes with em-dash.
- **Status:** [ ] NOT STARTED

### 17.12 Chat Cannot Access Note Bodies (BUG)
- **Priority:** P1
- **Source:** Personal brainstorm
- **Description:** Chat only sees note titles and IDs — it cannot access the actual body text, paragraphs, or content of notes. "Summaries" generated without the real text are fabricated, not analyzed. ALL chats must be able to speak to note bodies and paragraphs.
- **Fix:** Ensure `buildNotesContext()` in AppBootstrap/ChatOrchestration loads actual file content via `NoteFileStorage.readBody()`, not just `SDPage.title` + `SDPage.id`. Verify context window includes real note content.
- **Files:** AppBootstrap+ChatOrchestration, PromptComposer.swift, NoteFileStorage.swift
- **Status:** [ ] NOT STARTED

### 17.13 App Crashes Creating Note From Current Note (BUG)
- **Priority:** P1
- **Source:** Personal brainstorm
- **Description:** App crashes when trying to create a new note from within the current note view. Needs investigation — likely race condition in note creation + navigation.
- **Status:** [ ] NOT STARTED

### 17.14 Password Prompt on Every Launch
- **Priority:** P2
- **Source:** Personal brainstorm
- **Description:** User has to re-enter password every time the app starts. Need a toggle or config to disable this temporarily, or implement "remember me" session persistence.
- **Files:** Likely Keychain/auth configuration
- **Status:** [ ] NOT STARTED

### 17.15 Graph Overlay Not Robust
- **Priority:** P3
- **Source:** Personal brainstorm
- **Description:** The overlay on the graph is not robust enough. Investigate better overlay logic that works better with the system (NSPanel, HUD window, or Metal overlay layer instead of SwiftUI overlay).
- **Files:** HologramOverlay.swift, MetalGraphView.swift
- **Status:** [ ] NOT STARTED

### 17.16 AMX & GPU Offloading (formerly 17.12)
- **Priority:** P5
- **Source:** Gemini backlog
- **Description:** Route math reasoning pipeline and heavy analytical tasks to Apple Silicon GPU/AMX matrix co-processors to keep CPU free for UI and Rust Engine.
- **Dependencies:** Wave 14.1 (MLX local AI)
- **Status:** [ ] NOT STARTED

---

## WAVE 18: INTERACTIVE & LIVE FEATURES

### 18.1 Live Updates Portal (Landing Page Insights)
- **Priority:** P3
- **Source:** Personal brainstorm
- **Description:** Replace the static greetings on the landing page with a live, continuously updating insights feed powered by LLM calls to Apple Intelligence. The system:
  - Randomly scans interesting connections across your vault
  - References papers, fun facts, thinker quotes with citations
  - Summarizes at least 20 notes in rotating digest
  - Deep connection reports between related notes and unfinished tasks
  - Same retro font as current greetings, but instead of "Greetings, researcher" it shows paragraphs, quotes, excerpts, references with typewriter animation
- **Goal:** User should be genuinely "wowed" by how much insight comes from their own notes. Not generic — deeply personalized from their actual vault content.
- **Implementation:** Fuse Apple Intelligence Siri API with periodic LLM calls. Background task generates insights, caches them, cycles through on landing page. Fallback to pre-computed summaries if LLM unavailable.
- **Status:** [ ] NOT STARTED

### 18.2 Mini Graph Auto-Navigation
- **Priority:** P3
- **Source:** Personal brainstorm
- **Description:** The mini/hologram graph automatically navigates to and highlights the relevant folder, note, source, or entity based on what the user clicks in the notes sidebar, note window, or any navigation point in the app.
- **Behavior:** Click a note → graph zooms to that node. Click a folder → graph highlights all notes in that folder. Click a tag → graph shows all tagged nodes.
- **Files:** HologramSearchSidebar.swift, MetalGraphView.swift, GraphState.swift
- **Status:** [ ] NOT STARTED

### 18.3 Chat About Chats + AI Node Physics Explainer
- **Priority:** P4
- **Source:** Personal brainstorm
- **Description:** Two related features:
  1. **Chat about chats:** Ability to have meta-conversations about previous chat sessions. "What did I discuss about quantum computing last week?" The AI can reference past chat history.
  2. **Node physics explainer:** Click a node in the graph → ask the AI "Why is this node so far away from X?" and get an explanation of what the physical distance means semantically (weak connections, different topics, contradictory content, etc.)
- **Status:** [ ] NOT STARTED

### 18.4 Interactive Rust-Animated UI Mode
- **Priority:** P5
- **Source:** Personal brainstorm
- **Description:** Toggle "Interactive Mode" that brings the entire UI to life with Rust FFI-powered animations. Buttons, transitions, and UI elements use real physics simulations (spring physics, fluid dynamics, etc.) with Rust computing the physics and Swift rendering the visuals.
- **Vision:** Every UI interaction feels alive — buttons have momentum, panels have weight, transitions have physicality. Rust handles all the math, Swift handles all the rendering.
- **Status:** [ ] NOT STARTED

### 18.5 Rust-Physics UI Buttons & Transitions
- **Priority:** P5
- **Source:** Personal brainstorm, Gemini Manifesto
- **Description:** Have buttons and UI chrome use Rust-computed physics for animations — black hole effects where necessary, quantum particle effects, spring physics for panels. Rust computes physics, Swift/Metal renders. The app should feel like a game engine powering a productivity tool.
- **Status:** [ ] NOT STARTED

### 18.6 New Title & Greeting Animations
- **Priority:** P4
- **Source:** Personal brainstorm
- **Description:** New animated title effects for the note screen, landing page, and other views. Typewriter effect, fade-in, parallax, or other premium animations using the retro font.
- **Status:** [ ] NOT STARTED

### 18.7 Chat at Bottom of Page
- **Priority:** P3
- **Source:** Personal brainstorm
- **Description:** Add a chat interface docked to the bottom of the note page. Quick access to AI without leaving the note. Can ask questions about the current note, get suggestions, etc.
- **Status:** [ ] NOT STARTED

### 18.8 Interrogate Mode (Flashcard Game)
- **Priority:** P4
- **Source:** Personal brainstorm
- **Description:** A fun, informative minigame built entirely in Rust for deep optimization. It's a flashcard/quiz game where you "interrogate" your knowledge:
  - **Pick a target:** Choose a node in the graph, search for a note, or select a folder
  - **Quiz mode:** AI generates questions from the note content — user guesses the answer. Flashcard-style with spaced repetition tracking.
  - **Interrogate animation:** The selected node animates into a character that grows feet and a face, tries to "run away" as you question it. Each correct answer makes it react differently — flail, spin, shrink, etc. Wrong answers it gets cocky and grows bigger.
  - **Physics:** All animations driven by Rust physics engine. The node-character uses spring physics, ragdoll dynamics, particle effects.
  - **Folder mode:** Interrogate an entire folder — rapid-fire questions from all notes in the folder.
- **Technical:** Rust handles all game physics, animation state, quiz logic. Swift renders via Metal. Must maintain 120fps during gameplay.
- **Status:** [ ] NOT STARTED

### 18.9 Social Sharing (Twitter/LinkedIn)
- **Priority:** P5
- **Source:** Personal brainstorm
- **Description:** Share insights, note excerpts, or graph visualizations directly to Twitter and LinkedIn from within the app.
- **Status:** [ ] NOT STARTED

---

## WAVE 19: INFRASTRUCTURE & COMPREHENSIVE TESTING

### 19.1 100+ Test Suite (Logseq-Inspired)
- **Priority:** P3 (after features are built)
- **Source:** Personal brainstorm, Logseq test analysis
- **Description:** Study Logseq's test suite in its repo and create 100+ tests for Epistemos using translated/adapted logic. Cover:
  - Block parsing & reconciliation (SDBlock lifecycle)
  - Graph building, edge emission, query execution
  - Note CRUD (create, read, update, delete) including from-current-note creation
  - Chat context building (verify note bodies are included)
  - Theme application across all states
  - Search across all entry points
  - File storage round-trips (NoteFileStorage)
  - Front-matter parsing edge cases
  - FFI boundary safety
  - Keyboard shortcuts
  - Navigation state machine
- **Process:** Build → test → find holes → fix → harden → verify. Recursive until solid.
- **Timing:** After agents and Logseq features are built and ready.
- **Status:** [ ] NOT STARTED

### 19.2 Code Consolidation & Dead Code Removal
- **Priority:** P3
- **Source:** Personal brainstorm, synthesis
- **Description:** Deep audit to:
  - Eliminate duplicate button logic, method duplication
  - Consolidate glass effect pattern (9+ files → `GlassedPanelModifier`)
  - Consolidate capsule button pattern (30+ locations → `CapsuleToggleStyle`)
  - Consolidate search field pattern → `SearchFieldView`
  - Remove dead code, unused imports, orphaned files
  - DRY the codebase ruthlessly
- **Status:** [ ] NOT STARTED

### 19.3 TextKit 2 Migration (Future)
- **Priority:** P5
- **Source:** Technical analysis
- **Description:** TextKit 2 (macOS 12+) replaces NSLayoutManager with NSTextLayoutManager. Uses content-model approach where text elements can be excluded from layout — makes block folding simpler at API level. Migration cost is massive: every custom text attribute, click handler, and style application currently goes through TextKit 1's glyph pipeline.
- **Note:** Evaluate after all Wave 4/15/16 features are stable. Could be Wave E.
- **Status:** [ ] NOT STARTED

### 19.4 CI Pipeline & Automated Testing
- **Priority:** P4
- **Source:** v2-roadmap 3.1
- **Description:** GitHub Actions pipeline: `cargo test` + `xcodebuild test` on every PR. Lint checks. Build verification.
- **Status:** [ ] NOT STARTED

---

## WAVE 20: ADVANCED ARCHITECTURE & PLATFORM

### 20.1 mmap Zero-Copy Vault (10K+ Notes)
- **Priority:** P4 (reconsidered — user has 10K+ notes)
- **Source:** Gemini Manifesto §1, personal brainstorm
- **Description:** Originally rejected as premature optimization, but with 10K+ notes this becomes relevant. Rust memory-maps the vault directory so notes don't "load" into RAM — they ARE an extension of RAM. Swift `~Copyable` structs expose Rust's mmap pointers directly without string allocation.
- **Target:** Opening app with 100,000 notes takes <100ms.
- **Risk:** Complex FFI lifetime management. Evaluate after Wave 1 performance fixes — may not be needed if SwiftData + file storage is fast enough.
- **Status:** [ ] NOT STARTED

### 20.2 DNA Mode — Merkle-Tree Version History
- **Priority:** P5
- **Source:** Gemini Manifesto §7
- **Description:** Back every edit into a content-addressed Merkle DAG (like Git but for single documents). Render version history as a 3D DNA helix in Metal. Users can visually locate "mutations" (major rewrites) and fork thoughts into parallel branches.
- **Dependencies:** Wave 4.9 (time-travel graph), Wave 4.7 (graph engine v2)
- **Status:** [ ] NOT STARTED

### 20.3 Edge Mesh — Local-First CRDT Sync
- **Priority:** P5
- **Source:** Gemini Manifesto §8
- **Description:** Rust `libp2p` + CRDTs for peer-to-peer sync. iPhone and Mac on same WiFi (Swift Bonjour discovery) blast diffs over encrypted TCP. Zero-cloud, zero-conflict sync.
- **Dependencies:** Mobile port (iOS app)
- **Status:** [ ] NOT STARTED

### 20.4 Research Mode 2.0 — Deep Robustness
- **Priority:** P4 (elevated — user priority)
- **Source:** Personal brainstorm, Gemini backlog 14.3
- **Description:** Major upgrade to research library. True linking, more profound robustness. Research mode should be much more robust — academic-grade citation verification, deeper source analysis, multi-paper synthesis. Fix currently broken citation fetcher.
- **Dependencies:** Wave 2.3 (pipeline consolidation)
- **Status:** [ ] NOT STARTED

---

## WAVE 21: EPISTEMOS RETRO EDITION (WINDOWS/CROSS-PLATFORM)

**Platform:** Tauri 2.x + Next.js (existing web frontend) + Rust backend
**Codename:** Epistemos Retro Edition
**macOS app codename:** Epistemos Opulent Edition

The Retro Edition fuses the web frontend's layout/design with the macOS app's logic/features, compiled as a native desktop app via Tauri. All backend logic in Rust. The graph-engine becomes a Cargo workspace member — no FFI bridge, direct `use graph_engine;`.

### 21.1 Tauri Project Scaffold
- **Priority:** P3
- **Description:** Create `epistemos-retro/` project with Tauri 2.x, Next.js frontend (adapted from brainiacv2), Rust backend with graph-engine as workspace member. Set up tauri.conf.json, window config, permissions.
- **Key Decision:** Use `rapier3d` for graph physics on Windows instead of the current custom force simulation. Rapier 3D gives true rigid body dynamics in volumetric space, collision detection, impulse joints (springs), and mass-based gravity — enabling the "cognitive exoskeleton" vision where node importance maps to physical mass. 3D chosen over 2D because: (a) enables camera orbiting, depth clustering, volumetric space; (b) 3D ⊃ 2D (set z=0 for flat mode); (c) performance overhead is marginal (~1.5x for 10K bodies, still <1ms/tick); (d) required for relativistic lensing, DNA helix, hologram features.
- **Status:** [ ] NOT STARTED

### 21.2 Rapier Physics Engine Integration
- **Priority:** P3
- **Source:** Gemini physics UI analysis
- **Description:** Replace or augment the current force-directed graph with `rapier3d` (Rust). Every cognitive node becomes a 3D RigidBody. Important nodes (higher word count, page rank) get higher Mass. Links become ImpulseJointSet springs. This enables physically accurate clustering, collision, and the "bones vs fluid" paradigm where high-confidence nodes feel heavy and uncertain nodes feel light. Volumetric 3D space enables camera orbiting, depth-based clustering, and the full "cognitive exoskeleton" vision.
- **Architecture:** Embed `rapier3d` within `Engine` struct. Expose same FFI surface but with richer physics semantics. For macOS: optional migration path. For Windows (Retro Edition): default physics engine. Target hardware: RTX 4060 class GPU for rendering; Rapier physics runs on CPU (~1ms/tick for 10K bodies).
- **Benefits:** True collision detection, mass-based gravity, restitution (bounce), joint constraints, deterministic simulation, sleeping bodies for performance.
- **Status:** [ ] NOT STARTED

### 21.3 Rust Backend — Pipeline Port
- **Priority:** P3
- **Description:** Port the SOAR pipeline from Swift to Rust. 3-pass system: (1) streaming direct answer, (2) deep research analysis, (3) truth assessment. 10 pipeline stages with signal updates. LLM client abstraction with 6 providers: Anthropic, OpenAI, Google, Ollama (GPU), Foundry Local (NPU/GPU), ONNX embeddings (inline). Tauri commands expose pipeline to frontend via `invoke()`.
- **Key Crates:** `reqwest` (HTTP + Foundry Local REST), `tokio` (async), `serde_json` (structured output), `rusqlite` (storage), `notify` (file watching), `ort` (ONNX Runtime for embeddings/NPU), `foundry-local` (model management).
- **Status:** [ ] NOT STARTED

### 21.3b Windows Native AI — On-Device Intelligence
- **Priority:** P3
- **Source:** Apple Intelligence parity analysis, Microsoft Foundry Local docs, Dell XPS 16 hardware (Intel NPU + RTX 4060 GPU)
- **Description:** Three-layer local AI stack replacing Apple Intelligence on Windows:
  - **Layer 1: Microsoft Foundry Local** — Primary on-device model server. OpenAI-compatible REST API (`localhost:{PORT}/v1`). Auto-detects and routes to best hardware (NPU/CUDA GPU/CPU). Uses `foundry-local` Rust crate for model management + `reqwest` for inference. Models: Phi-3.5-mini (NPU-optimized), DeepSeek-R1 distilled. Equivalent to Apple Intelligence Foundation Models framework.
  - **Layer 2: Ollama** — GPU powerhouse for larger models. GPT-OSS 20B (4-bit, ~12GB VRAM on RTX 4060). Deep analysis, full pipeline passes.
  - **Layer 3: ONNX Runtime** — Direct Rust inference via `ort` crate with DirectML execution provider. Sub-millisecond embedding generation (all-MiniLM-L6-v2), fast classification. No HTTP overhead — runs inline in Rust code.
- **Hardware routing:** NPU for triage/parsing (~50ms, 1.5W), GPU for extraction/analysis (~500ms), Cloud for frontier reasoning.
- **Phi Silica note:** Microsoft's NPU-tuned model is available via WinRT API (`Microsoft.Windows.AI.Text.LanguageModel`) but requires Limited Access Feature unlock token. Foundry Local is preferred — handles NPU routing without LAF restriction.
- **Status:** [ ] NOT STARTED

### 21.4 Tauri Bridge — Frontend Adaptation
- **Priority:** P3
- **Description:** Adapt the existing Next.js frontend: replace `fetch('/api/...')` with `invoke('command_name', { ... })`. Replace SSE streaming with Tauri event listeners (`listen('chat-stream', callback)`). Keep all Zustand state management, Tailwind styling, Framer Motion animations, D3 visualizations as-is.
- **Scope of changes:** ~20 API call sites need `invoke()` wrapping. Everything else unchanged.
- **Status:** [ ] NOT STARTED

### 21.5 Storage Layer — rusqlite + Vault Sync
- **Priority:** P3
- **Description:** Implement persistence in Rust using `rusqlite`. Schema mirrors SwiftData models (Page, Block, Chat, Message, GraphNode, GraphEdge, Folder, PageVersion). Vault sync via `notify` crate file watcher + bidirectional .md sync (same logic as NoteFileStorage/VaultSyncService).
- **Status:** [ ] NOT STARTED

### 21.6 Graph Rendering — WebGPU/wgpu or Canvas
- **Priority:** P4
- **Description:** For graph visualization in the Tauri webview, options: (a) wgpu with Rapier physics rendered to a texture and composited into the web view, (b) D3.js with Rapier coordinates streamed via Tauri events at 60fps, (c) WebGPU shaders in the webview. Option (b) is simplest — Rust computes physics, streams `{id, x, y}[]` to D3 at 60fps.
- **Status:** [ ] NOT STARTED

### 21.7 Relativistic Lensing Shader (Vision)
- **Priority:** P5
- **Source:** Gemini physics UI analysis
- **Description:** When a node is focal point ("Black Hole"), curve digital spacetime around it. Rust calculates semantic "Gravity Vector Field" — center coordinates + mass of important nodes. Pass to GPU shader that distorts UV coordinates using simplified Schwarzschild radius equation. On macOS: Metal `.layerEffect` shader. On Windows: WebGPU/WGSL fragment shader.
- **Status:** [ ] NOT STARTED

### 21.8 Quantum SOAR Collapse Visualization (Vision)
- **Priority:** P5
- **Source:** Gemini physics UI analysis
- **Description:** When SOAR pipeline is reasoning, render the node as a probabilistic particle cloud (alpha/spread proportional to entropy). As confidence increases and entropy drops, particles tighten and "collapse" into a solid high-mass RigidBody sphere. Ties existing SOARSession metrics directly to visual parameters.
- **Status:** [ ] NOT STARTED

### 21.9 Physics-Driven UI Elements (Vision)
- **Priority:** P5
- **Source:** Gemini physics UI analysis
- **Description:** Buttons and panels are physically simulated entities in Rapier. When AI response finishes streaming, the result panel "drops" into layout with Rapier restitution (bounce). Panning/flicking the graph imparts velocity impulse to simulated camera body. Haptic feedback synchronized to collision frames.
- **Status:** [ ] NOT STARTED

---

## LOGSEQ COMPARISON & SCALABILITY

### Executive Comparison

| Metric | Epistemos | Logseq | Gap |
|--------|-----------|--------|-----|
| Graph Physics | O(n log n) Barnes-Hut | O(n log n) Barnes-Hut | Parity |
| Search | In-memory FST + Fuzzy | SQLite FTS5 + Trigram | Different tradeoffs |
| List Virtualization | NONE | React-Virtuoso | CRITICAL Gap |
| Lazy Loading | NONE | IntersectionObserver | CRITICAL Gap |
| Debouncing | 1 instance | Missionary flows | Logseq more mature |
| Background Processing | Task.detached | WebWorkers | Parity |
| Caching | Manual (3-4 places) | LRU + memoize-last | Logseq more systematic |
| Database | SwiftData + GRDB | DataScript + SQLite | Different architectures |

### Logseq Architecture Analysis (From Gemini Deep Dive)
**Why Logseq is slow:** Every bullet is a Clojure map in an immutable DataScript in-browser database. 100K blocks = 5GB RAM. DOM diffing for every edit. Full-memory table scan for complex Datalog queries.

**Epistemos advantages over Logseq:**
1. **Blocks:** SDBlock in SwiftData (SQLite) vs DataScript in-memory. O(1) access vs O(n) garbage collection.
2. **Queries:** Rust FST + Apple Intelligence NL vs user-written Clojure Datalog syntax. 2ms vs 4 seconds.
3. **Rendering:** Native NSTextView + Metal vs React DOM diffing. 120fps vs 30fps.
4. **Transclusion:** NSTextAttachment + overlay views vs recursive React component renders.

**Key takeaway:** Epistemos can achieve Logseq's exact feature set with 0.1% of the memory footprint and 100x the speed by backing blocks with SwiftData, querying with Rust, and rendering with native TextKit/Metal.

### Epistemos Strengths (Keep!)
- **Rust physics engine:** Significantly faster than Logseq's JavaScript. SoA memory layout, dedicated physics thread, SIMD Accelerate framework.
- **SIMD embeddings:** 70x faster on Apple Silicon vs transformers.js
- **Better persistence guarantees** (SwiftData vs DataScript)
- **Theme system:** 9/10 quality — six themes, seven typography tokens, five motion constants
- **Triage routing:** On-device vs cloud AI with bidirectional fallback
- **55 Rust physics tests** — best test coverage in the codebase

### Scalability Table

| Scale | Epistemos Current | Logseq | Epistemos Target |
|-------|------------------|--------|-----------------|
| 1K notes | 60fps | 60fps | 60fps |
| 5K notes | 30fps | 60fps | 60fps |
| 10K notes | 15fps | 30fps | 60fps |
| 15K notes | Static only | 20fps | 30fps |
| 50K notes | Crashes | Unusable | Static only |

### Expected Improvements After P0-P2 Fixes

| Metric | Current | After Fixes | Improvement |
|--------|---------|-------------|-------------|
| Search responsiveness | 200ms | 50ms | 4x faster |
| Graph load (15K notes) | 3s freeze | 500ms | 6x faster |
| List scroll (10K items) | 5fps | 60fps | 12x smoother |
| Memory usage | 800MB | 400MB | 2x reduction |

---

## PHYSICS UI ANALYSIS — RAPIER & COGNITIVE EXOSKELETON

**Source:** Gemini deep analysis (`physics_ui_analysis.md.resolved`)

### Core Metaphor: Bones vs. Fluid
LLMs are "high-potential fluid" — the UI provides "rigid bone structures." High-confidence/low-entropy SOAR results feel physically heavy. High-entropy results feel light, fluid, susceptible to gravitational pull of other nodes. This is the paradigm shift from "software as tool" to "software as environment."

### Rapier Integration Strategy
- **Use `rapier3d`** — volumetric 3D space for camera orbiting, depth clustering, and the full vision
- Every cognitive node → 3D `RigidBody` with mass proportional to importance (word count, page rank, link count)
- Links → `ImpulseJointSet` (spring constraints in 3D)
- Benefits: true collision, sleeping bodies (performance), deterministic simulation, restitution (bounce), ball joints
- Performance: ~1ms/tick for 10K bodies (rapier3d), leaving 15ms/frame for rendering. RTX 4060 class GPU handles 3D rendering trivially.
- Can always constrain `z = 0` for flat 2D mode — 3D ⊃ 2D
- **Phase 1:** Swap graph_engine.rs backend to rapier3d. Prove 10K rigid bodies at 120fps via zero-copy buffers.
- **Phase 2:** Spacetime shader — Metal `.layerEffect` (macOS) or WGSL (Windows) distorts UV around focal node using simplified Schwarzschild radius.
- **Phase 3:** Quantum SOAR collapse — tie entropy/confidence to particle shader alpha/spread.

### Zero-Copy FFI Architecture
- Define `#[repr(C)]` transform structs in Rust (position, rotation, scale)
- Share memory pointer directly with renderer — zero CPU copies
- On macOS: Rust writes, Metal reads same `MTLBuffer` bytes
- On Windows: Rust writes, WebGPU reads same shared buffer
- This is the only way to achieve 120Hz physics syncing without battery drain

### Platform-Specific Rendering
| Feature | macOS (Opulent) | Windows (Retro) |
|---------|----------------|-----------------|
| Graph renderer | Metal + MSL shaders | WebGPU + WGSL shaders or D3 + Rapier coordinates |
| Lensing shader | `.layerEffect` in SwiftUI | WGSL fragment shader in webview |
| Physics engine | Current custom OR Rapier3D | **Rapier3D (mandatory)** |
| UI physics | SwiftUI + GeometryGroup | Framer Motion + Tauri events |

### Key Recommendation
**Use Rapier3D for the Windows Retro Edition.** The current custom force simulation is sufficient for macOS but Rapier3D provides the rigid body dynamics needed for the "cognitive exoskeleton" vision — physics-driven UI, mass-based clustering, collision, bounce, joints, volumetric 3D space. 3D chosen over 2D: marginal perf overhead (~1.5x), enables full vision (camera orbiting, depth clustering, DNA helix, hologram), and 3D ⊃ 2D (z=0 for flat mode). Target GPU: RTX 4060 class. Consider migrating macOS to Rapier3D as well once the Windows implementation proves stable.

---

## UI/UX AUDIT FINDINGS

### Dark/Light Mode Status (as of 2026-02-28)
**FIXED:**
- GraphFloatingControls.swift — all `.white` → `.primary`
- QueryResultsView.swift — all `.white` → `.primary`
- TimeSliderOverlay.swift — all `.white` → `.primary`
- HologramOverlay.swift — expand button `.white` → `.primary`
- HologramSearchSidebar.swift — tab buttons `.white` → `.primary`
- VersionTimeline.swift — 4 instances `.white` → `.primary`
- MessageBubble.swift — user bubble text `.white` → `theme.userBubbleText`

**Already correct (no changes needed):**
- MarkdownTextStorage.swift — uses `isDark` conditionals properly
- WriterTextStorage.swift — uses theme switch + intentional PDF export colors
- PagedDocumentView.swift — full theme switch statements
- LandingView.swift — `.black`/`.white` are adaptive SwiftUI colors
- TransclusionOverlayView.swift — uses `effectiveAppearance` check
- BlockGutterView.swift — uses `isDark` conditional
- ProseEditorRepresentable.swift — uses `isDark` conditional

**Intentionally hardcoded (correct):**
- NotesSidebar.swift:1584 — `.white` text on red badge (needs contrast)
- VaultOrganizerView.swift:496 — `.white` text on accent button (needs contrast)

### Code Deduplication Opportunities
- **100+ raw FFI calls** in MetalGraphView → wrap in GraphEngine class (Wave 2.4)
- **Glass effect pattern** duplicated in 9+ files → extract `GlassedPanelModifier`
- **Capsule button pattern** duplicated in 30+ locations → extract `CapsuleToggleStyle`
- **Search field pattern** duplicated → extract `SearchFieldView`
- **JSON extraction** duplicated in 3 implementations → consolidate

---

## IN-CODE TODOs

| File | Line | Verbatim |
|------|------|----------|
| `Epistemos/State/ResearchState.swift` | 35 | `// TODO: Migrate to SDSavedPaper @Model when library view is built.` |

---

## MASTER PRIORITY ORDER

### P0 — DONE
1. [x] Fix circular folder recursion
2. [x] Fix single node settling
3. [x] Fix tick count reset
4. [x] SDPage.body to file storage (NoteFileStorage)
5. [x] Pre-commit hardening (15 bugs fixed)

### P0 — THIS WEEK (Crash/Data Loss Risks)
6. [ ] Fix pipeline cancellation race — zombie enrichment tasks (6.3)
7. [ ] Audit all FFI call sites for null checks and string lifetime safety (8.1, 8.3)
8. [ ] Add embedding cache size limit — 5000 nodes max (7.2)
9. [ ] Fix filename collision deduplication — use UUID not increment (5.2)
10. [ ] Fix Metal layer pointer — passRetained or verify copy semantics (8.2)

### P1 — NEXT 2 WEEKS (High Impact Performance)
11. [ ] List virtualization — chat, notes sidebar, search results (1.6)
12. [ ] Search debouncing on ALL entry points (1.7)
13. [ ] Background graph building — actor (1.8)
14. [ ] Per-node highlight flag buffer — Rust (1.1)
15. [ ] Pre-allocate physics scratch buffers — Rust (1.2)
16. [ ] UserDefaults vs SwiftData split-brain fix (2.8)
17. [ ] Graph version atomicity fix (6.1)
18. [ ] Metal graph view engine handle race fix (6.2)
19. [ ] API key storage access control (10.1)
20. [ ] Spotlight indexing privacy (10.2)
21. [ ] FTS5 query sanitization hardening (5.5)
22. [ ] Zero-state views for all list views (12.1)
23. [ ] Silent failure error handling in graph ops (11.1)

### P2 — THIS MONTH (Polish + Moderate Impact)
24. [ ] Search result caching — 30s TTL (1.9)
25. [ ] Frustum culling in Metal renderer (1.10)
26. [ ] Prefetch relationships in SwiftData (1.11)
27. [ ] Incremental graph updates — diff-based rebuild (2.5)
28. [ ] Incremental FFI graph updates (1.12)
29. [ ] GraphEngine Swift wrapper — FFI consolidation (2.4)
30. [ ] Straight-line edges + remove motion blur (1.4, 1.5)
31. [ ] Pre-allocate field line Metal buffer (1.3)
32. [ ] Front-matter edge cases — Yams or validation (5.1)
33. [ ] Empty vault context nil-safety audit (5.4)
34. [ ] SwiftData context isolation audit (6.4)
35. [ ] Unbounded version storage — global limit (7.1)
36. [ ] Memory-mapped file leak — autoreleasepool (7.3)
37. [ ] Batch delete cascade fix (9.1)
38. [ ] Predicate array crash guard (9.2)
39. [ ] Transient cache invalidation (9.3)
40. [ ] Vault path privacy in logs (10.3)
41. [ ] LLM stream error handling (11.2)
42. [ ] File I/O error discrimination (11.3)
43. [ ] Dark mode detection race (12.2)
44. [ ] Quadtree coincident point jitter (13.1)
45. [ ] Fuzzy search trigram index (13.2)
46. [ ] Spotlight reindex timestamp fix (13.3)

### P3 — ARCHITECTURE (Next Month)
47. [ ] AppEnvironment container — 15 → 5 objects (2.1)
48. [ ] Extract AppCoordinator from AppBootstrap (2.2)
49. [ ] Consolidate AI pipeline — 5 → 1-2 LLM calls (2.3)
50. [ ] Delete SignalGenerator
51. [ ] Remove EventBus (2.6)
52. [ ] Provider-native conversation history (2.7)
53. [ ] Version pruning atomicity (5.3)
54. [ ] Graph Store compact adjacency list (7.4)

### P4 — QUALITY (Before v1.0)
55. [ ] Makefile + CI pipeline (3.1)
56. [ ] LLMClientProtocol + pipeline tests (3.2)
57. [ ] SwiftData VersionedSchema (3.3)
58. [ ] Fix SearchIndexTests
59. [ ] Replace custom YAML parser with Yams (5.1 full fix)
60. [ ] Implement trigram search index for large graphs (13.2 full fix)
61. [ ] Add comprehensive error handling to graph operations (11.1 full fix)
62. [ ] Security audit — API key storage, path logging (10.1, 10.3)

### P1 — BUGS (Critical — Fix ASAP)
63. [ ] Chat cannot access note bodies — only sees title/ID (17.12)
64. [ ] App crashes creating note from current note (17.13)
65. [ ] Fix missing vault notes — deep scan audit (17.8)

### P2 — UX Fixes
66. [ ] Fix node spawning position — center not left (15.5)
67. [ ] Dynamic theme colors for button icons (17.4)
68. [ ] Fix search highlight glitch on landing page (17.7)
69. [ ] Launch & shortcut fixes — Cmd+H, Cmd+N, window size (17.10)
70. [ ] Password prompt on every launch — add "remember me" (17.14)

### P3 — ELEVATED (User Priorities + Polish)
71. [ ] Rust FST fuzzy search EVERYWHERE — command palette, landing, sidebar, graph (4.3)
72. [ ] Mini graph auto-navigation — syncs with sidebar/note clicks (18.2)
73. [ ] Live Updates Portal — landing page vault insights (18.1)
74. [ ] Chat at bottom of note page (18.7)
75. [ ] Graph overlay robustness upgrade (17.15)
76. [ ] 100+ test suite — Logseq-inspired (19.1)
77. [ ] Code consolidation — deduplicate, remove dead code (19.2)
78. [ ] Advanced math & table rendering — fix scroll lag (16.3)
79. [ ] Note window top bar cleanup (17.1)
80. [ ] Unified transparent nav bar (17.2)
81. [ ] Sidebar button consolidation (17.3)
82. [ ] Folder state & toggles — expand/collapse all (17.6)
83. [ ] Fix Daily Briefs — route through Apple Intelligence (17.9)

### P4 — FEATURES
84. [ ] Mind Map Toggle & Auto-Write — templates, fuse insights (15.2)
85. [ ] Research Mode 2.0 — deep robustness upgrade (20.4)
86. [ ] Chat about chats + AI node physics explainer (18.3)
87. [ ] New title & greeting animations (18.6)
88. [ ] Advanced export — .docx, PDF, MLA/APA (16.2)
89. [ ] Git-style diff tracker + AI summary (16.5)
90. [ ] Folder summaries via AI (17.5)
91. [ ] App icon design (17.11)
92. [ ] mmap zero-copy vault for 10K+ notes (20.1)
93. [ ] CI pipeline + automated testing (19.4)

### P5 — SECOND BRAIN (After Foundation)
94. [ ] Complete block ref click-to-navigate + graph edges (4.6)
95. [ ] Apple Intelligence query parsing (4.5)
96. [ ] Block gutter view + folding polish (4.4)
97. [ ] Typed semantic links (4.1)
98. [ ] Semantic clustering via embeddings (4.2)
99. [ ] Graph engine v2 — clusters, GPU labels, LOD (4.7)
100. [ ] Observatory visual effects (4.8)
101. [ ] Time-travel graph (4.9)
102. [ ] Ambient capture (4.10)
103. [ ] Confidence visualization + shader text effects (4.11)
104. [ ] CommandPaletteOverlay `?` query routing (4.5)

### P5 — VISION (Long-term)
105. [ ] Local AI Engine — GPT-OSS 20B + MLX (optional download upgrade) (14.1)
106. [ ] Autonomous Agents — Open Claw + live dashboard (14.2)
107. [ ] Contemplate Mode (14.4)
108. [ ] Note Audit Pipeline (14.5)
109. [ ] Global Idea Portal — Brain Dump Catcher (14.6)
110. [ ] AI Pomodoro Study Sessions (14.7)
111. [ ] Apple Intelligence Auto-Citations (14.8)
112. [ ] Deep Siri Integration — App Intents (14.9)
113. [ ] Hologram Global Graph — Cmd+G (15.1)
114. [ ] 3D Geometric Graphing (15.3)
115. [ ] Note Window Black Hole Transition (15.4)
116. [ ] Writer Mode — Pages Clone (16.1)
117. [ ] Study Log — "What I Know So Far" (16.4)
118. [ ] Interactive Rust-animated UI mode (18.4)
119. [ ] Rust-physics UI buttons & transitions (18.5)
120. [ ] Interrogate Mode — flashcard quiz game with animated nodes (18.8)
121. [ ] Social sharing — Twitter/LinkedIn (18.9)
122. [ ] DNA Mode — Merkle-tree version history (20.2)
123. [ ] Edge Mesh — CRDT local-first sync (20.3)
124. [ ] TextKit 2 migration (19.3)
125. [ ] AMX & GPU Offloading (17.16)

### P3 — RETRO EDITION (Windows/Cross-Platform)
126. [ ] Tauri project scaffold + workspace setup (21.1)
127. [ ] Rapier3D physics engine integration (21.2)
128. [ ] Rust backend — SOAR pipeline port (21.3)
129. [ ] Windows native AI — Foundry Local (NPU) + Ollama (GPU) + ort (ONNX embeddings) (21.3b)
130. [ ] Tauri bridge — frontend fetch→invoke adaptation (21.4)
131. [ ] rusqlite storage layer + vault sync (21.5)

### P4 — RETRO EDITION (Rendering + Polish)
132. [ ] Graph rendering — WebGPU/wgpu or D3 + Rapier coordinates (21.6)

### P5 — RETRO EDITION (Vision)
133. [ ] Relativistic lensing shader — Schwarzschild UV distortion (21.7)
134. [ ] Quantum SOAR collapse visualization (21.8)
135. [ ] Physics-driven UI elements — Rapier buttons & panels (21.9)

---

## LESSONS LEARNED

1. **Always store large blobs outside SQLite.** The "inline is simpler" tradeoff becomes a trap at >1000 records.
2. **Never fire >2 LLM calls per user action without explicit cost/time disclosure.** Users don't know they're spending $1 per query.
3. **Test the money path first.** 55 physics tests and zero pipeline tests means the least-breakable code is the most-tested. Invert that.
4. **Compose state, don't scatter it.** 16 @Observable classes should be 5-6 composed containers.
5. **Profile before optimizing, profile before adding features.** The lag was never "missing features" — it was allocation in hot loops and full graph re-uploads.
6. **Singletons are for AppKit bridges only.** `AppBootstrap.shared` accessed from views that HAVE the environment is a code smell.
7. **Fake metrics erode trust.** One honest number is worth more than ten decorative polynomials.
8. **Bezier edges are visual noise.** Straight lines are what every production graph tool uses.
9. **Dictionary mutation during iteration crashes.** Always collect keys first, then mutate.
10. **SwiftData #Predicate can't use local array .contains().** It crashes at runtime. Use individual fetches.
11. **NSLayoutManager glyph access needs bounds checking.** Always `ensureGlyphs` + `ensureLayout` before querying positions.
12. **`guard` is not allowed inside `@ViewBuilder` closures.** Split into wrapper + content functions.
