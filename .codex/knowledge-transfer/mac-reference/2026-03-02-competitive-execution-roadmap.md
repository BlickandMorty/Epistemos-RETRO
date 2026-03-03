# Epistemos Competitive Execution Roadmap

## For Any AI Model Reading This

This document is the **single source of truth** for Epistemos's competitive strategy and execution plan. It contains everything you need to understand the codebase, the philosophy, and the work ahead. Read the entire thing before writing a single line of code.

---

## Design Philosophy — Non-Negotiable

These are not suggestions. They are laws. Violating any of them means the code gets rejected.

### 1. Direct Communication — No Middlemen
The shortest path from intent to execution wins. No wrappers around wrappers. No indirection for indirection's sake. If a function calls another function that calls another function to do one thing, that's three functions too many. One function. One job. Done.

### 2. Source of Truth — One, Always One
Every piece of data has exactly one owner. Currently: `SDPage.body` owns page text, `BlockReconciler` reconstructs blocks from it. This is the core problem — text is the source of truth and blocks are derived. After BTK, the op log is the source of truth. Markdown is a projection. SwiftData is a cache. There is never ambiguity about which layer owns the data.

### 3. Deep Stable Foundation Before Features
Build the foundation right. Then build on it. Never build features on shaky ground hoping to fix the foundation later. BTK comes first because everything else — queries, transclusion, versioning, sync — depends on stable block identity. If block IDs drift, every downstream feature is unreliable.

### 4. Native or Nothing
This is a macOS app. Swift, Metal, Rust via FFI. No Electron. No web views. No cross-platform abstractions. The performance advantage of native code is not a nice-to-have — it IS the competitive moat. Every frame rendered by Metal, every force computed by Rust, every UI element drawn by AppKit is proof that Electron apps cannot compete.

### 5. Zero Copy, Zero Waste
Pre-allocate buffers. Borrow instead of clone. Use indices instead of copying objects. In Rust: `with_capacity()` for all Vecs in hot paths, zero `clone()` in the render loop. In Swift: no disk reads in SwiftUI view bodies, debounce binding syncs to 300ms, never fire `@Query` refetches during streaming.

### 6. Test-First, Always
Write a failing test before writing the fix. Edge cases: empty, nil, max, unicode, concurrent, rapid toggle. Swift uses the Swift Testing framework (`@Suite`, `@Test`, `#expect`) — never XCTest. Rust uses `#[test]` inline in modules.

---

## Architecture — What Exists Today

```
User → SwiftUI Views → @Observable State → Services (Engine/) → Rust FFI (graph-engine/)
                                         → SwiftData (Models/)
                                         → Apple Intelligence (TriageService)
```

### The Stack
- **Swift + SwiftUI + AppKit**: UI layer. `@MainActor @Observable` for all state classes. Never `ObservableObject`. SwiftUI for layout, AppKit (NSTextView) for the editor.
- **SwiftData**: Persistence. Models: `SDPage`, `SDBlock`, `SDGraphNode`, `SDGraphEdge`, `SDPageVersion`.
- **Rust FFI**: Graph engine. Physics simulation (d3-force velocity Verlet), Metal rendering, spatial indexing, search, embeddings. 531 tests.
- **Metal**: GPU rendering for the graph. Node circles, edge lines, glow effects, selection highlights. Driven by the Rust renderer.

### File Layout
```
Epistemos/
├── App/                    # Bootstrap, environment injection
│   ├── AppBootstrap.swift  # Creates model container, state objects
│   ├── AppEnvironment.swift # withAppEnvironment() — SINGLE source for .environment()
│   └── EpistemosApp.swift  # @main entry point
├── State/                  # @Observable state classes
├── Engine/                 # AI pipeline, query system, triage
│   ├── TriageService.swift # Routes AI ops by complexity (on-device vs cloud)
│   ├── PipelineService.swift
│   ├── LLMService.swift
│   ├── QueryParser.swift   # NL → GraphQueryDSL (60% regex heuristic)
│   ├── QueryEngine.swift   # @Observable coordinator
│   ├── QueryExecutor.swift # Dispatches to 8 backends
│   └── QueryTypes.swift    # GraphQueryDSL enum, NodeFilter, EdgeFilter
├── Graph/                  # Graph state, store, builder
│   ├── GraphState.swift    # FFI bridge, mode (global/page), physics presets
│   ├── GraphStore.swift    # Compact Int-indexed storage, trigram index
│   ├── GraphBuilder.swift  # Diff-based graph commit
│   └── EmbeddingService.swift # NLEmbedding → Rust via FFI
├── Models/                 # SwiftData models
│   ├── SDPage.swift        # Note model (id, title, body, tags, etc.)
│   ├── SDBlock.swift       # Block model (id, pageId, parentBlockId, content, depth, order)
│   ├── SDGraphNode.swift   # Graph node model
│   ├── SDGraphEdge.swift   # Graph edge model
│   ├── SDPageVersion.swift # Version snapshot (title, body, wordCount, createdAt)
│   └── GraphTypes.swift    # GraphNodeType (8 types), GraphEdgeType (12 types)
├── Sync/                   # Vault sync, file I/O, search
│   ├── VaultSyncService.swift
│   ├── NoteFileStorage.swift  # Reads/writes .md files to disk
│   ├── BlockReconciler.swift  # Jaccard-based block sync (TO BE REPLACED by BTK)
│   ├── BlockParser.swift      # Markdown → [ParsedBlock]
│   └── SearchIndexService.swift # FTS5 via GRDB (page-level)
├── Views/
│   ├── Notes/
│   │   ├── ProseEditorRepresentable.swift # NSViewRepresentable wrapping ClickableTextView
│   │   ├── ProseEditorView.swift          # SwiftUI container, debounced saves
│   │   ├── MarkdownTextStorage.swift      # Live syntax highlighting
│   │   ├── NoteWindowManager.swift        # Window lifecycle, NoteTabShell, breadcrumbs
│   │   ├── TransclusionOverlayView.swift  # Read-only block ref overlay (TO BE REPLACED)
│   │   └── BlockRefAutocomplete.swift     # (( autocomplete popover
│   ├── Graph/
│   │   ├── HologramController.swift       # Graph overlay lifecycle
│   │   ├── HologramOverlay.swift          # Graph overlay view
│   │   └── MetalGraphView.swift           # NSView hosting Metal layer + input events
│   └── Shell/
│       └── CommandPalette.swift           # Global command palette
└── Theme/
    └── PhysicsModifiers.swift             # .physicsHover, .breathe, .glassEffect, etc.

graph-engine/                   # Rust crate
├── src/
│   ├── lib.rs                  # FFI entry points (50+ extern "C" functions)
│   ├── engine.rs               # Orchestrator: physics thread, input, camera, highlighting
│   ├── simulation.rs           # D3-force velocity Verlet: alpha decay → forces → integration
│   ├── renderer.rs             # Metal rendering: nodes, edges, glow, selection
│   ├── types.rs                # Graph, Node, Edge structs (#[repr(C)])
│   ├── forces.rs               # Force implementations: link, many-body, collide, center, cluster, semantic
│   ├── quadtree.rs             # Barnes-Hut approximation for many-body force
│   ├── spatial.rs              # Spatial index for hit testing (mouse → node)
│   ├── cluster.rs              # Louvain community detection
│   ├── search.rs               # Trigram-based fuzzy search
│   ├── embedding.rs            # Cosine similarity, KNN for semantic neighbors
│   ├── markdown.rs             # Markdown utilities
│   └── version.rs              # Version chain storage
└── graph-engine-bridge/
    └── graph_engine.h          # C header for Swift FFI (50+ function declarations)
```

### Critical Patterns

**Environment injection:** Always use `withAppEnvironment(bootstrap)`. Never manual `.environment()` chains. `NoteWindowManager.openWindow(for:)` uses this to inject all state objects into new windows.

**NSTextView editing flow:**
```
User types → NSTextStorage.processEditing() → MarkdownTextStorage highlights
           → textDidChange() → Coordinator debounces binding sync (300ms)
           → ProseEditorView.onChange(of: bodyText) → debouncedSave (5s)
           → NoteFileStorage.writeBody() (background thread)
           → BlockReconciler.reconcile() (MainActor, same 5s cadence)
```

**AI streaming flow:**
```
User submits query → NoteChatState.submitQuery()
    → TriageService routes (on-device vs cloud)
    → tokens arrive → 60ms buffer → flushTokens()
    → Coordinator.flushNoteChatTokens() → inserts below --- divider
    → isFlushingTokens flag prevents binding sync cascade
    → Accept: strip divider, keep text inline
    → Discard: remove everything from divider onward
```

**Graph FFI flow:**
```
GraphBuilder.build() → adds nodes/edges to Rust via batch FFI
    → graph_engine_add_nodes_batch() / graph_engine_add_edges_batch()
    → graph_engine_commit(entrance: 1)
    → Rust: load_from_graph() → positions, edges, degrees computed
    → Physics thread: tick() at 60Hz (alpha decay → forces → integration)
    → Render thread: graph_engine_render() copies positions → Metal draw
```

### The Current Block System (What BTK Replaces)

**BlockReconciler** (`Epistemos/Sync/BlockReconciler.swift`):
- Runs on the 5-second debounced save timer in `ProseEditorView.debouncedSave()`
- Algorithm: Parse markdown → fetch existing SDBlocks → Jaccard similarity matching → insert/update/delete
- Jaccard threshold: 0.4 (word-level set intersection / set union)
- Bipartite matching: collects all (parsedIdx, existingIdx, score) pairs above threshold, sorts by score descending, greedily assigns best matches first
- Parent chain: computed by walking parsed blocks, tracking depth via a stack
- Performance: O(n×m) worst case, practically O(n) for sequential edits, <1ms for 200 blocks

**SDBlock** model: `id` (UUID), `pageId`, `parentBlockId`, `content`, `depth`, `order`, `createdAt`, `updatedAt`

**BlockParser** (`Epistemos/Sync/BlockParser.swift`): Single-pass O(n) markdown → `[ParsedBlock]`. Splits on headings for depth hierarchy.

**The fundamental weakness:** BlockReconciler is post-hoc reconstruction. It sees "old text vs new text" and guesses which blocks changed. Heavy edits (rewriting >60% of words) cause the Jaccard score to drop below 0.4, creating a new block ID and orphaning all `((refs))` to the old one.

### The Current Query System (What the Compiler Replaces)

**QueryParser** (`Epistemos/Engine/QueryParser.swift`):
- Three-tier design, but only Tier 1 is implemented
- Tier 1: regex heuristic patterns (~60% coverage). Handles: aggregations, type filters, relationships (supports/contradicts/neighbors/path), date filters, tagged queries, content search, semantic search
- Tier 2 (future): Apple Intelligence structured output (~200ms)
- Tier 3 (future): Cloud LLM fallback (~800ms)
- Ultimate fallback: treat entire input as content search

**GraphQueryDSL** (`Epistemos/Models/QueryTypes.swift`):
- 8 query variants: findNodes, findEdges, pathBetween, neighbors, aggregation, contentSearch, semanticSearch, compound
- NodeFilter: types, labelContains, createdAfter, createdBefore, metadata, limit
- SetCombiner: union, intersection, difference

**QueryExecutor** (`Epistemos/Engine/QueryExecutor.swift`): Dispatches to 8 backends:
- findNodes → in-memory GraphStore filter
- findEdges → edge enumeration
- pathBetween → BFS shortest path via GraphStore
- neighbors → 1-hop or multi-hop traversal
- aggregation → countByType, mostConnected, orphans, recentlyCreated
- contentSearch → FTS5 via SearchIndexService
- semanticSearch → GraphState.hybridSearch (Rust + embeddings)
- compound → set operations (union/intersection/difference)

**What's missing:** No typed query algebra. No reactive subscriptions. No block/property/time operators. No compiled execution plans. No predicate pushdown.

### The Current Edge Types

```swift
// GraphTypes.swift — 12 types: 8 structural + 4 semantic
enum GraphEdgeType: String, Codable, Sendable {
    case reference      // Generic wikilink [[target]]
    case contains       // Note in folder
    case tagged         // Page tagged with tag
    case mentions       // Person/entity mentioned
    case cites          // Source cited
    case authored       // Author of work
    case related        // Generic semantic link
    case quotes         // Direct quote from source
    case supports       // Evidence FOR a claim (semantic, never auto-inferred today)
    case contradicts    // Evidence AGAINST a claim (semantic, never auto-inferred today)
    case expands        // Expands on ideas (semantic, never auto-inferred today)
    case questions      // Raises questions about (semantic, never auto-inferred today)
}
```

The 4 semantic types (`supports`, `contradicts`, `expands`, `questions`) are defined but NEVER automatically created. They exist as infrastructure waiting for the epistemic analyzer. Currently they can only be created manually or via future AI inference.

### The FFI Boundary

50+ `extern "C"` functions in `graph-engine/src/lib.rs`. Key patterns:

```rust
// Null-guard macros — every FFI function starts with these
macro_rules! ffi_engine {
    ($ptr:ident) => {
        if $ptr.is_null() { return; }
        let $ptr = unsafe { &mut *$ptr };
    };
}

// String safety: all C strings are copied into Rust-owned String at the boundary.
// Swift's withCString closures are safe — Rust never holds a reference after return.
macro_rules! ffi_cstr {
    ($ptr:ident) => {{
        if $ptr.is_null() { "" } else { unsafe { CStr::from_ptr($ptr) }.to_str().unwrap_or("") }
    }};
}
```

**Memory ownership rule:** Rust allocates, Rust frees. Swift never frees Rust memory directly. For returned strings, Rust stores a `CString` in the engine and returns a pointer; the pointer is valid until the next call that returns a string.

**Node types (FFI index):** Note(0), Chat(1), Idea(2), Source(3), Folder(4), Quote(5), Tag(6), Block(7)
**Edge types (FFI index):** reference(0)..questions(11) — 12 total

### The Physics Engine

`simulation.rs` — D3-force velocity Verlet simulation. SoA (Structure of Arrays) layout for cache efficiency.

**Forces applied per tick (in order):**
1. Link force — springs along edges, per-edge weight modulates distance
2. Many-body force — Barnes-Hut approximation (O(n log n) via quadtree)
3. Collision force — position-based overlap prevention (grid-based spatial hash)
4. Center force — pull toward anchor (page mode) or origin (global mode)
5. Cluster cohesion — pulls nodes toward cluster centroid (Louvain communities)
6. Semantic attraction — pulls embedding-similar nodes together

**Alpha floor:** Physics never fully stops. Alpha decays to 0.0005 (floor), then expensive forces (many-body, collision, cluster, semantic) are skipped. Only link + center keep equilibrium. Physics thread sleeps 50ms when settled. Any interaction reheats to 0.3.

**Threading:** Physics thread runs at 60Hz, locks `Simulation` briefly via `parking_lot::Mutex`. Render thread (main) locks briefly to copy positions. Low-contention design.

### The Rendering Pipeline

`renderer.rs` — Metal rendering.

**Per-frame:** `update_positions()` copies simulation positions → GPU buffers. `draw()` issues Metal draw calls: edges (instanced lines), nodes (instanced circles), glow (additive blend), selection ring.

**Guard rails:** Edge rendering skips endpoints at (0,0) or NaN/Inf to prevent streak artifacts. Node rendering clamps radius to `[MIN_RADIUS, MAX_RADIUS]`.

### Testing

```bash
# Swift: 1403 tests, 194 suites
xcodebuild -project Epistemos.xcodeproj -scheme Epistemos -destination 'platform=macOS' test

# Rust: 531 tests
cd graph-engine && cargo test

# Quick build check
xcodebuild -project Epistemos.xcodeproj -scheme Epistemos -destination 'platform=macOS' build
```

Test file naming: `<System>Tests.swift`, `<System>EdgeCaseTests.swift`, `<System>ComprehensiveTests.swift`

---

## The Competitive Situation

### Obsidian's Ceiling: "Text Editor with a Map"
- **Architecture:** Electron + TypeScript + CodeMirror + WebGL
- **Bottleneck:** Single JavaScript thread. Graph stutters at 10K files. Block references are `^hash` injection at line ends — post-hoc, same weakness as our BlockReconciler.
- **Query:** Community plugin (Dataview) that parses files into JS objects. Locks UI on complex queries.
- **Strength:** Plugin ecosystem (1000+ plugins). We ignore plugins — comparing core to core.

### Logseq's Ceiling: "DOM-Bound Outliner"
- **Architecture:** Electron + ClojureScript + React + DataScript
- **Bottleneck:** Every block is a React DOM node. DOM is slow at rendering thousands of elements. DataScript (in-browser Datalog) scales terribly in memory.
- **Strength over us:** Native block identity (DataScript gives blocks IDs from birth). Deep Datalog queries with reactive rule injection. Editable block embeds.
- **Weakness:** Sync is catastrophic. File-based sync clashes with internal graph DB. Users report data loss.

### Where We're Behind (Hard Gaps)
1. **Block identity** — Post-hoc (Jaccard) vs Logseq's native DataScript. We're BEHIND Logseq here.
2. **Query substrate** — Regex heuristics vs Logseq's Datalog. We're BEHIND Logseq here.
3. **Transclusion** — Read-only overlay vs Logseq's editable embeds. We're BEHIND Logseq here.
4. **Search granularity** — Page-level FTS5 vs Logseq's block-level. We're BEHIND Logseq here.
5. **Platform breadth** — macOS-only vs both being cross-platform. Accepted trade-off — native performance IS the strategy.

### Where We're Ahead (Already)
1. **Graph physics** — Metal + Rust at 120fps/50K nodes vs their WebGL/Canvas stuttering at 5K-10K
2. **On-device AI** — TriageService routes to Neural Engine. Neither competitor has on-device AI.
3. **Semantic forces** — Embeddings drive physics (similar nodes attract). Neither competitor has this.
4. **Semantic edge types** — supports/contradicts/questions/expands defined. Neither has edge types at all.
5. **Performance** — Native Swift+Metal+Rust vs Electron. Permanent structural advantage.

---

## Goal

Close the 5 gaps. Then exploit the 5 advantages. The result: an app that does everything Logseq does at the block level, everything Obsidian does at the editor level, plus epistemic reasoning and Metal-powered graph physics that neither can ever replicate without rewriting their entire stack.

**Platform:** macOS-only. The native advantage IS the strategy.

**Phases:**
- **Phase 1** (90 days): Block Transaction Kernel + block-level indexes
- **Phase 2** (90 days): Query compiler + reactive views + editable transclusion
- **Phase 3** (180 days): Epistemic reasoning layer + branch/merge + unified canvas

**Principle:** Each phase ships usable features. BTK is infrastructure, but it ships with stable block refs and block-level search on day 1.

---

## Phase 1: Block Transaction Kernel (90 Days)

### Why This Comes First

The competitive analysis says it plainly: "If you do only one thing first, do #1. Without that, everything else stays brittle."

Every feature in Phases 2 and 3 depends on block identity:
- Query compiler needs stable block IDs to index and subscribe to
- Editable transclusion needs stable block IDs to propagate edits
- Epistemic analyzer needs stable block IDs to attach confidence scores
- Branch/merge needs an op log to fork and merge
- CRDT sync needs an op log to replicate

Without BTK, you're building on sand.

### What BlockReconciler Does Today (And Why It's Not Enough)

`BlockReconciler.swift` is a 232-line enum with two entry points:

**`reconcile(pageId:markdown:context:)`** — called every 5 seconds from `ProseEditorView.debouncedSave()`:
1. `BlockParser.parse(markdown)` → `[ParsedBlock]` (content, depth, order)
2. Fetch existing `SDBlock` entities for this page, sorted by order
3. For every (parsedBlock, existingBlock) pair, compute Jaccard similarity (word-level set overlap)
4. Collect all pairs scoring > 0.4, sort descending, greedily assign best matches
5. Matched blocks: update content/depth/order if changed, keep UUID
6. Unmatched parsed blocks: create new SDBlock with fresh UUID
7. Unmatched existing blocks: delete

**`initialPopulate(pageId:markdown:context:)`** — called once per page open if no blocks exist:
1. Parse markdown, create SDBlock for each parsed block
2. Set parent IDs based on depth hierarchy

**The failure mode:** User rewrites a paragraph heavily (changes >60% of words). Jaccard drops below 0.4. Block gets a new UUID. Every `((blockRef))` pointing to the old UUID now points to nothing. The user has no idea this happened. No error, no warning — just a broken reference that shows "Block not found" when clicked.

This is not a bug you can fix with a better threshold. It's a fundamental architectural limitation of post-hoc reconstruction.

### What BTK Does Instead

**Core concept:** The edit IS the operation. When the user types, we don't save text and then figure out what changed. We know what changed because we intercepted the edit.

NSTextView tells us exactly what happened: "at range (45, 12), the user replaced 'old text here' with 'new text there'". That's an `update_block` operation. If the cursor is at the end of a block and the user presses Enter, that's a `split_block` operation. If the user selects a heading and all its children and drags them to a new location, that's a `move_subtree` operation.

**The op log is append-only.** Every operation gets a monotonic sequence number and a timestamp. The current state of all blocks is a materialized view over the op log — computed by replaying ops from the beginning, or (in practice) maintained incrementally as each op arrives. The op log is the source of truth. The block tree is a cache. Markdown is a projection.

### Architecture: Rust Side

**New module:** `graph-engine/src/block_kernel/`

```
block_kernel/
├── mod.rs          # Public API: apply_op, get_block, get_tree, export_markdown
├── op.rs           # Op enum definition + serialization
├── op_log.rs       # Append-only storage, sequence numbering, persistence
├── block_tree.rs   # Materialized block tree (HashMap<BlockId, Block>)
├── projection.rs   # Block tree → markdown string
└── translator.rs   # (old_text, new_text, cursor_pos) → Vec<Op>
```

**`op.rs` — The operation types:**
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum BlockOp {
    InsertBlock {
        block_id: BlockId,        // UUID generated here, stable forever
        parent_id: Option<BlockId>,
        position: usize,          // Index among siblings
        content: String,
    },
    DeleteBlock {
        block_id: BlockId,
        // Children are reparented to deleted block's parent
    },
    UpdateBlock {
        block_id: BlockId,
        content: String,
    },
    SplitBlock {
        block_id: BlockId,
        offset: usize,           // Character offset where split happens
        new_block_id: BlockId,   // UUID for the new block after split
    },
    MergeBlock {
        block_id: BlockId,       // This block's content appended to target
        into_id: BlockId,        // Target block that absorbs content
    },
    MoveSubtree {
        block_id: BlockId,       // Root of subtree to move
        new_parent: Option<BlockId>,
        position: usize,
    },
    SetProperty {
        block_id: BlockId,
        key: String,             // "tag", "confidence", "status", etc.
        value: PropertyValue,    // String, Float, Bool, or Null (delete)
    },
    SetRef {
        block_id: BlockId,
        target_id: BlockId,
        ref_type: u8,            // Maps to GraphEdgeType
    },
}

type BlockId = [u8; 16]; // UUID as fixed-size bytes (no allocation)
```

**`op_log.rs` — Append-only storage:**
```rust
pub struct OpLog {
    ops: Vec<(u64, BlockOp)>,  // (sequence_number, op)
    next_seq: u64,
    // Persistence: write-ahead log to disk. On load, replay to rebuild block tree.
    // Format: length-prefixed bincode frames. One file per page.
}
```

**`block_tree.rs` — Materialized view:**
```rust
pub struct BlockTree {
    blocks: HashMap<BlockId, Block>,
    children: HashMap<BlockId, Vec<BlockId>>,  // Parent → ordered children
    roots: Vec<BlockId>,                        // Top-level blocks (no parent)
}

pub struct Block {
    pub id: BlockId,
    pub parent: Option<BlockId>,
    pub content: String,
    pub depth: u32,
    pub order: u32,
    pub properties: HashMap<String, PropertyValue>,
    pub created_at: f64,
    pub updated_at: f64,
}
```

**`translator.rs` — Text edit → ops:**

This is the hardest part. NSTextView gives us: `(editedRange: NSRange, replacementString: String)`. We need to map that to block ops.

Algorithm:
1. Find which block(s) the edited range spans (binary search on block content offsets in the markdown projection)
2. If edit is within a single block: `UpdateBlock` with new content
3. If edit spans block boundary (deleted a newline between blocks): `MergeBlock`
4. If edit inserts a newline within a block: `SplitBlock` at the newline offset
5. If edit is at the start of a block and inserts a newline: `InsertBlock` (new empty block before)
6. If entire block content is deleted: `DeleteBlock`

Key insight: the translator needs the current markdown projection to map NSTextStorage ranges to block IDs. The projection is updated after each op, so ranges stay in sync.

**`projection.rs` — Block tree → markdown:**

Walks the block tree depth-first, emitting markdown headers based on depth:
- Depth 0: raw paragraph (no header prefix)
- Depth 1: `# heading`
- Depth 2: `## heading`
- etc.

Must produce IDENTICAL output to the current `BlockParser` → markdown flow. This is tested by round-tripping: `parse(markdown) → ops → block_tree → project() == original markdown`.

### Architecture: FFI Boundary

New functions in `lib.rs`:
```rust
// Initialize BTK for a page (creates empty op log + block tree)
graph_engine_btk_init(engine, page_id_cstr) -> u8

// Load existing blocks into BTK (migration from SDBlock)
graph_engine_btk_load_blocks(engine, page_id_cstr, blocks_ptr, count) -> u8

// Translate a text edit into block ops and apply them
// Returns: number of ops generated (0 = no-op)
graph_engine_btk_translate_edit(
    engine, page_id_cstr,
    edit_location: u64,    // NSRange.location
    edit_length: u64,      // NSRange.length (chars deleted)
    replacement_ptr,       // New text (UTF-8 C string)
) -> u32

// Get the current markdown projection for a page
graph_engine_btk_get_markdown(engine, page_id_cstr) -> *const c_char

// Get a single block by ID
graph_engine_btk_get_block(engine, block_id_ptr) -> *const BlockFFI

// Get all blocks for a page (for indexing, search, etc.)
graph_engine_btk_get_all_blocks(engine, page_id_cstr, out_ptr, out_count) -> u8
```

### Architecture: Swift Side

**`BlockEditTranslator`** — Lives in the ProseEditorRepresentable Coordinator. Intercepts `textDidChange` before the existing binding sync debounce.

```swift
// In Coordinator.textDidChange(_:)
// BEFORE the existing 300ms debounce:
if let engine = graphState?.engineHandle {
    let editRange = /* captured from shouldChangeText */
    let replacement = /* captured from shouldChangeText */

    // Translate edit to block ops (Rust does the work)
    let opsApplied = graph_engine_btk_translate_edit(
        engine,
        pageId.cString,
        UInt64(editRange.location),
        UInt64(editRange.length),
        replacement.cString
    )

    // If BTK changed the markdown projection (e.g., reordered blocks),
    // update NSTextStorage to match. This is rare — usually the text
    // is already correct because the user typed it.
}
```

**Migration flow:**
1. On page open, if BTK has no data for this page: call `graph_engine_btk_load_blocks()` with existing SDBlock data
2. BTK creates the op log with synthetic `InsertBlock` ops for each existing block
3. From this point forward, BTK owns block identity — BlockReconciler is bypassed
4. Feature flag: `UserDefaults.standard.bool(forKey: "epistemos.btk.enabled")`

### Block-Level FTS5 Index

Extend `SearchIndexService.swift` to index blocks alongside pages:

```sql
-- New virtual table (alongside existing page_search)
CREATE VIRTUAL TABLE block_search USING fts5(
    block_id,
    page_id UNINDEXED,
    content,
    tokenize='unicode61'
);
```

On BTK op:
- `InsertBlock` → INSERT into block_search
- `UpdateBlock` → UPDATE block_search content
- `DeleteBlock` → DELETE from block_search

### Block-Level Embeddings

Extend `EmbeddingService.swift`:
- After BTK processes ops, compute embeddings for changed blocks
- Push per-block embeddings to Rust via `graph_engine_set_node_embedding()` (blocks are already a node type)
- Semantic search now returns blocks, not just pages

### Block Search in Command Palette

`CommandPalette.swift` already has page search. Add a "Blocks" tab or mixed results:
- Type query → FTS5 block_search → ranked results with page context
- Each result shows: block content snippet + parent page title
- Click → navigate to page, scroll to block

### Deliverables & Exit Criteria

- [ ] BTK Rust module with all 8 op types implemented and tested
- [ ] `translator.rs` correctly maps NSTextStorage edits to ops
- [ ] `projection.rs` round-trips: `parse(md) → ops → tree → project() == md`
- [ ] FFI bridge functions for all BTK operations
- [ ] `BlockEditTranslator.swift` in Coordinator
- [ ] Migration from existing SDBlock data
- [ ] Feature flag for gradual rollout
- [ ] Block-level FTS5 index
- [ ] Block-level embeddings
- [ ] Block search in command palette
- [ ] All existing `((blockRef))` survive 100 edits across 50 blocks (zero ID drift)
- [ ] Markdown export byte-identical to current format
- [ ] `cargo test` passes (target: 600+ tests, up from 531)
- [ ] `xcodebuild test` passes (target: 1500+ tests, up from 1403)
- [ ] Retire BlockReconciler after verification

### What Can Go Wrong

1. **Translator accuracy** — The text edit → op mapping must be perfect. One wrong op = corrupted block tree. Test exhaustively: every combination of insert/delete/replace at block boundaries, mid-block, across blocks, empty blocks, nested blocks.

2. **Cursor position drift** — After BTK processes an op and updates the projection, the cursor position in NSTextView must not jump. The projection should match what the user typed, so this should be a no-op in practice. But test it.

3. **Performance** — The translator runs on every keystroke (in shouldChangeText/textDidChange). It must be <0.1ms. The Rust side is fast; the FFI overhead is the concern. Batch rapid keystrokes into a single translate call using the existing 300ms debounce if needed.

4. **Undo/redo** — NSTextView has built-in undo. BTK has its own op log. These must stay in sync. Option A: let NSTextView handle undo at the text level, and replay the resulting text edits through the translator. Option B: override NSTextView's undo to directly reverse BTK ops. Option A is simpler and recommended.

---

## Phase 2: Query Compiler + Editable Transclusion (90 Days)

### Why This Comes Second

With BTK providing stable block IDs and an op stream, we can now:
1. Index blocks by property (the `set_property` op gives us structured metadata)
2. Subscribe to block changes (the op stream tells us when to re-execute queries)
3. Edit transclusions (edits become `update_block` ops targeting the source block ID)

### Query Compiler — Deep Dive

**Current system limitations:**
- `QueryParser` is NL heuristic only — no structured syntax for power users
- `QueryExecutor` is a switch statement dispatching to 8 backends — no optimization
- No reactive subscriptions — queries are one-shot
- No block-level operators — can't query "all blocks tagged #claim where confidence < 0.5"

**The new system:**

```
User input
    ↓
┌─────────────────────┐
│   Parser Layer       │  Two parsers, same output:
│  ┌─────────────────┐ │  - NL parser (existing QueryParser, enhanced)
│  │ NL Parser       │ │  - Structured parser (?tags=philosophy & depth<3)
│  └────────┬────────┘ │
│  ┌────────┴────────┐ │
│  │ Struct Parser   │ │
│  └────────┬────────┘ │
└───────────┼──────────┘
            ↓
┌─────────────────────┐
│   QueryAST           │  Typed, validated, composable
│   - Leaf nodes: FTS match, property filter, graph traversal, semantic search
│   - Combinators: AND, OR, NOT
│   - Projections: select fields, limit, offset, order by
└───────────┬──────────┘
            ↓
┌─────────────────────┐
│   QueryCompiler      │  AST → QueryPlan
│   - Index selection: which backend(s) to query
│   - Predicate pushdown: push filters to the fastest layer
│   - Join ordering: if query touches multiple backends, choose optimal order
└───────────┬──────────┘
            ↓
┌─────────────────────┐
│   QueryRuntime       │  Executes plans against backends
│   Backends:          │
│   - BTK block tree (block properties, depth, parent)
│   - FTS5 (lexical search, page + block level)
│   - Rust graph engine (paths, neighbors, edge types)
│   - Embedding store (semantic similarity)
└───────────┬──────────┘
            ↓
┌─────────────────────┐
│   ReactiveQuery      │  Optional: wraps plan in AsyncStream
│   - BTK op stream: when an op touches a block that matches the query,
│     re-execute and push updated results
│   - Debounced: 100ms coalesce window
└──────────────────────┘
```

**QueryAST nodes:**
```swift
indirect enum QueryAST {
    // Leaf queries
    case ftsMatch(query: String, scope: SearchScope)    // Lexical
    case propertyFilter(key: String, op: CompOp, value: PropertyValue)  // Structural
    case typeFilter(types: [GraphNodeType])              // Structural
    case dateFilter(field: DateField, op: CompOp, value: Date)  // Structural
    case depthFilter(op: CompOp, value: Int)            // Structural
    case graphNeighbors(of: NodeRef, edgeTypes: [GraphEdgeType]?, depth: Int)  // Graph
    case graphPath(from: NodeRef, to: NodeRef, maxHops: Int)  // Graph
    case semanticSimilar(to: String, threshold: Float)  // Semantic

    // Combinators
    case and([QueryAST])
    case or([QueryAST])
    case not(QueryAST)

    // Projection
    case project(QueryAST, limit: Int?, offset: Int?, orderBy: OrderBy?)
}

enum SearchScope { case pages, blocks, all }
enum CompOp { case eq, neq, lt, gt, lte, gte, contains }
enum DateField { case created, updated }
enum OrderBy { case created(ascending: Bool), updated(ascending: Bool), relevance }
```

**Structured query syntax:**
```
?type=note & created:last_week                    → findNodes + date filter
?tag=claim & confidence<0.5                       → BTK property query
?supports("General Relativity") & created:2024    → graph neighbors + date filter
?path("Kant" → "Hegel")                          → BFS shortest path
?similar("consciousness", 0.8)                    → embedding cosine search
?"machine learning" & type=block                  → FTS5 block search
```

Parsing: the `?` prefix signals structured mode. `&` is AND. `|` is OR. Quotes for phrases. Parentheses for grouping. Properties are `key=value` or `key<value` etc.

### Editable Transclusion — Deep Dive

**Current system:** `TransclusionOverlayView.swift` creates a floating NSView overlay positioned at the `((blockRef))` location in NSTextStorage. The overlay shows the block's content as a read-only label with a left accent border. `TransclusionOverlayManager` handles lifecycle (create/reposition/remove as text scrolls).

**The new system:**

Instead of a floating overlay, the transclusion is a **live range in NSTextStorage** backed by the source block's content. When the user's cursor enters the range, it becomes editable. Edits generate `UpdateBlock` ops targeting the source block ID.

**Implementation steps:**

1. **Replace overlay with attributed range:** In `MarkdownTextStorage.processEditing()`, when encountering `((blockId))`, replace the syntax with the block's actual content and apply custom attributes (background tint, provenance metadata).

2. **Intercept edits in transclusion range:** In `ClickableTextView.shouldChangeText(in:replacementString:)`, detect if the edit falls within a transclusion range. If so, capture the edit and route it through BTK as an `UpdateBlock` targeting the source block.

3. **Propagate changes:** BTK's op stream notifies all pages that transclude the same block. Each page's `MarkdownTextStorage` updates the transclusion range with the new content.

4. **Provenance badge:** On mouse hover over a transclusion range, show a small tooltip: "from [[PageName]]" with a click-to-navigate action.

**NSTextStorage mechanics:**
- Custom attribute: `.transclusionBlockId: BlockId` — marks the range as a transclusion
- Custom attribute: `.transclusionSourcePageId: String` — for provenance display
- `processEditing()` checks for these attributes before and after the edit to maintain consistency
- The block content in the transclusion range MUST stay in sync with the source block — any desync means the user sees stale text

### Block Properties

BTK's `SetProperty` op enables structured metadata per block:

```swift
// User tags a block as a "claim" with confidence 0.7
graph_engine_btk_apply_op(engine, SetProperty(blockId, "type", .string("claim")))
graph_engine_btk_apply_op(engine, SetProperty(blockId, "confidence", .float(0.7)))
graph_engine_btk_apply_op(engine, SetProperty(blockId, "tag", .string("epistemology")))
```

Properties are queryable via the QueryCompiler: `?type=claim & confidence<0.5`.

**UI:** Right-click a block → "Set property..." → key/value editor. Or inline syntax: `@type=claim @confidence=0.7` at the end of a block line (parsed by MarkdownTextStorage, stored as BTK properties).

### Deliverables & Exit Criteria

- [ ] QueryAST with all leaf/combinator/projection nodes
- [ ] Structured query parser (? prefix syntax)
- [ ] Enhanced NL parser emitting QueryAST (replaces current GraphQueryDSL)
- [ ] QueryCompiler with index selection
- [ ] QueryRuntime replacing QueryExecutor
- [ ] Reactive subscriptions via AsyncStream + BTK op stream
- [ ] Editable transclusion (inline mode)
- [ ] Provenance badges on transclusion hover
- [ ] Block property system (SetProperty op + UI)
- [ ] Structured query syntax in command palette
- [ ] `?tags=philosophy & depth<3` returns correct results in <1ms
- [ ] Editing a `((blockRef))` updates the source block in real time
- [ ] Reactive query view updates within 100ms of relevant block change
- [ ] `cargo test` + `xcodebuild test` pass

---

## Phase 3: Epistemic Reasoning + Branch/Merge (180 Days)

### Why This Is The Moat

Phases 1-2 close the gaps with Logseq. Phase 3 builds features neither competitor has or can easily replicate:

1. **Epistemic reasoning** — Auto-inferred supports/contradicts/questions/expands edges with confidence scores. No knowledge tool does this.
2. **Branch/merge** — Fork a line of reasoning, explore alternatives, merge back. Git for thought. No knowledge tool does this.
3. **Unified canvas** — The graph IS the workspace. Zoom into text. No knowledge tool does this with native Metal performance.

### Epistemic Analyzer — Deep Dive

**The pipeline:**
```
Block created/updated (BTK op stream)
    ↓
EpistemicAnalyzer.analyzeBlock(blockId)
    ↓
1. Get block content + embedding from BTK
2. Find candidate pairs: blocks with embedding cosine > 0.6
   (use graph_engine_semantic_search for fast KNN)
3. Filter: skip pairs already analyzed (check edge exists in GraphStore)
4. For each candidate pair:
   a. Build prompt: "Given block A: '{content_a}' and block B: '{content_b}',
      classify their relationship: supports, contradicts, questions, expands, or unrelated.
      Return: { type, confidence (0-1), reasoning (1 sentence) }"
   b. Route through TriageService:
      - Simple pairs (short blocks, clear relationship): on-device (complexity 0.25)
      - Complex pairs (long blocks, nuanced relationship): cloud (complexity 0.55)
   c. Parse response → create edge via GraphStore.addEdge()
5. Recalibrate confidence for affected blocks
```

**ConfidenceCalibrator:**
```
For block B with type=claim:
    supporting = sum(edge.weight for edge in edges(target=B, type=supports))
    contradicting = sum(edge.weight for edge in edges(target=B, type=contradicts))
    net = (supporting - contradicting) / max(supporting + contradicting, 1)
    confidence = (net + 1) / 2    // Normalize [-1, 1] → [0, 1]
    BTK: SetProperty(B, "confidence", confidence)
```

**Metal visualization:**
- Node glow intensity ∝ confidence (0 = dim red, 0.5 = neutral, 1.0 = bright green)
- Edge thickness ∝ edge confidence
- Edge color: green = supports, red = contradicts, blue = questions, purple = expands
- This is a Rust renderer change: add confidence to the per-node GPU buffer, use it in the fragment shader for glow color/intensity

### Branch/Merge — Deep Dive

**Built on BTK's op log.** A branch is simply a named fork point in the op sequence.

```rust
pub struct Branch {
    pub name: String,
    pub fork_seq: u64,        // Sequence number where branch diverged
    pub head_seq: u64,        // Current head of this branch
    pub created_at: f64,
}
```

**Branching:** When the user says "branch this reasoning":
1. Record the current op log sequence number as `fork_seq`
2. Create a new branch with `head_seq = fork_seq`
3. Future ops on this branch get their own sequence numbers in a separate namespace

**Switching:** When the user switches to a branch:
1. Roll back the block tree to `fork_seq` state (replay ops 0..fork_seq)
2. Apply branch ops (fork_seq..branch.head_seq)
3. The markdown projection now shows the branch state

**Merging:** Three-way merge:
1. Common ancestor: block tree at `fork_seq`
2. Main: block tree at main's head
3. Branch: block tree at branch's head
4. For each block:
   - Modified only in main → keep main's version
   - Modified only in branch → keep branch's version
   - Modified in both → CONFLICT: present both to user
   - Deleted in one, modified in other → CONFLICT
   - Structural moves (different parents) → CONFLICT

**UI:**
- `BranchListView`: sidebar panel showing branches for the current page
- `MergeView`: side-by-side comparison. Left = main, right = branch. Conflicts highlighted in red. User clicks "accept left" / "accept right" / "accept both" per block.
- `BranchTimelineView`: visual timeline showing branch points and merge points as a DAG

### Unified Canvas (Stretch Goal)

The ultimate expression of the native advantage. The graph and the editor are the same surface.

**Concept:** `HologramOverlay` already renders nodes as circles in Metal. At high zoom levels (when a node's screen size exceeds a threshold), the circle dissolves into an embedded `ProseEditorRepresentable` view. The user can type directly into the graph.

**Implementation sketch:**
1. Track zoom level per node: `nodeScreenSize = nodeWorldRadius * camera.zoom`
2. When `nodeScreenSize > LOD_THRESHOLD` (e.g., 200px):
   - Hide the Metal-rendered node circle
   - Overlay an NSTextView at the node's screen position
   - Load the block's content into the text view via BTK
3. When user zooms out past threshold:
   - Flush edits to BTK
   - Remove NSTextView
   - Show Metal-rendered node circle again

This requires careful management of NSTextView instances (pool and reuse, don't create hundreds) and precise coordinate mapping between Metal world space and AppKit screen space.

### Deliverables & Exit Criteria

- [ ] EpistemicAnalyzer: auto-infers semantic edges with >80% accuracy on test dataset
- [ ] ConfidenceCalibrator: per-block confidence scores
- [ ] Metal confidence visualization (glow intensity + edge color)
- [ ] Contradiction map view (filtered graph showing contradicts edges only)
- [ ] "What contradicts X?" / "What supports X?" one-click queries
- [ ] Branch creation from any page state
- [ ] Branch switching (isolated editing)
- [ ] Three-way structural merge with conflict detection
- [ ] MergeView: side-by-side comparison with merge controls
- [ ] Branch timeline visualization
- [ ] Unified canvas (stretch): embedded text views at high zoom
- [ ] `cargo test` + `xcodebuild test` pass
- [ ] No data loss in branch + edit + merge cycle

---

## Competitive Kill Matrix

| Feature | Obsidian | Logseq | Epistemos (after roadmap) |
|---------|----------|--------|--------------------------|
| Block identity | Post-hoc (`^hash`) | Native (DataScript) | **Native (BTK op log)** |
| Query language | Plugin (Dataview) | Built-in (Datalog) | **Compiled query algebra** |
| Transclusion | Read-only embed | Editable in outliner | **Editable in prose + outliner** |
| Semantic edges | None | None | **Auto-inferred with confidence** |
| Branch/merge | None | None | **Block-level branching** |
| Graph physics | WebGL, stutters at 10K | Canvas, stutters at 5K | **Metal, 120fps at 50K** |
| On-device AI | None | None | **Neural Engine via TriageService** |
| Query reactivity | None | Partial (rule injection) | **Full reactive subscriptions** |
| Confidence scoring | None | None | **Per-block calibration** |
| Platform performance | Electron (JS thread) | Electron (ClojureScript) | **Native Swift+Metal+Rust** |

---

## Rules For Any Model Working On This Codebase

1. **Read before writing.** Never modify a file you haven't read. Understand existing patterns.
2. **`@MainActor @Observable`** for all state classes. Never `ObservableObject`.
3. **`guard let` / `if let`** — never force unwrap (`!`). Never `try!`.
4. **`withAppEnvironment(bootstrap)`** for environment injection. Never manual `.environment()` chains.
5. **Swift Testing** (`@Suite`, `@Test`, `#expect`). Never XCTest.
6. **Rust FFI:** `#[repr(C)]` on all FFI structs. `// SAFETY:` on all `unsafe`. `with_capacity()` for Vecs. Zero `clone()` in hot paths.
7. **Debounce:** Binding sync 300ms, body save 5s, table alignment 500ms. Never sync on every keystroke.
8. **`isFlushingTokens` flag** — set during programmatic NSTextStorage changes to prevent binding cascade.
9. **Test commands:** `cd graph-engine && cargo test` (Rust), `xcodebuild -project Epistemos.xcodeproj -scheme Epistemos -destination 'platform=macOS' build` (Swift build check).
10. **No over-engineering.** Don't design for hypothetical futures. Build what's needed now. Three similar lines is better than a premature abstraction.
