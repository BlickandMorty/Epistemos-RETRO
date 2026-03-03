# Epistemos — Engineering Bible

## Golden Rules (non-negotiable)

1. **Zero copy-paste.** If code exists, call it. If two things look similar, extract a shared function. Three similar lines is better than a premature abstraction, but four is not.
2. **Direct communication.** No wrappers around wrappers. No indirection for indirection's sake. The shortest path from intent to execution wins.
3. **Performance is architecture.** Pre-allocate buffers. Debounce hot paths. Cache expensive results. Zero per-frame allocations in render loops. No `repeatForever` animations — gate with `windowOccluded` + `reduceMotion`.
4. **Minimal fixes.** Don't refactor adjacent code. Don't add features beyond what's asked. Don't add comments to code you didn't change. A bug fix is just a bug fix.
5. **Test-first.** Write a failing test before the fix. Edge cases: empty, nil, max, unicode, concurrent, rapid toggle.
6. **Read before writing.** Never modify a file you haven't read. Understand existing code before touching it.
7. **macOS Opulent only.** Never touch `~/Epistemos-RETRO/`, `src-tauri/`, or `~/meta-analytical-pfc/` from this repo. Those are separate projects.

## Architecture Overview

**Opulent Edition** = Swift + Metal + Rust FFI. macOS native. Apple Design Award quality.

```
User → SwiftUI Views → @Observable State → Services (Engine/) → Rust FFI (graph-engine/)
                                         → SwiftData (Models/)
                                         → Apple Intelligence (TriageService)
```

### Key Files (read these first for any subsystem)

| Subsystem | Start Here | Then Read |
|-----------|-----------|-----------|
| AI Pipeline | `Engine/TriageService.swift` | `Engine/PipelineService.swift`, `Engine/LLMService.swift` |
| Graph | `Graph/GraphState.swift` | `Graph/GraphStore.swift`, `Graph/GraphBuilder.swift` |
| Graph Engine (Rust) | `graph-engine/src/lib.rs` | `src/renderer.rs`, `src/physics.rs`, `src/types.rs` |
| Note Editor | `Views/Notes/ProseEditorRepresentable.swift` | `Views/Notes/ProseEditorView.swift`, `Views/Notes/MarkdownTextStorage.swift` |
| Note Chat | `State/NoteChatState.swift` | `Views/Notes/NoteChatOrb.swift`, `Views/Notes/NoteWindowManager.swift` |
| Note Windows | `Views/Notes/NoteWindowManager.swift` | `Views/Notes/NotesSidebar.swift` |
| Graph Overlay | `Views/Graph/HologramController.swift` | `Views/Graph/HologramOverlay.swift`, `Views/Graph/MetalGraphView.swift` |
| Environment | `App/AppEnvironment.swift` | `App/AppBootstrap.swift`, `App/EpistemosApp.swift` |
| Vault Sync | `Sync/VaultSyncService.swift` | `Sync/NoteFileStorage.swift` |
| Models | `Models/SDPage.swift` | `Models/SDGraphNode.swift`, `Models/GraphTypes.swift` |

### Bible & State Files

- `docs/future-work-audit.md` — THE BIBLE. 21 waves, 134 items. All planned work.
- `docs/audit-progress.md` — Audit state. Read this to know what's been fixed/deferred.

## Patterns to Follow

### Swift

- `@MainActor @Observable` for all state classes. Never `ObservableObject`.
- `withAppEnvironment(bootstrap)` for environment injection — never manual `.environment()` chains. Single source: `AppEnvironment.swift`. NoteWindowManager uses this too.
- `nonisolated(unsafe)` for NSView properties written from AppKit event handlers.
- `Task { @MainActor in }` for delayed work — never `DispatchQueue.main.asyncAfter`.
- Swift Testing framework (`@Suite` + `@Test` + `#expect`). Never XCTest.
- `guard let` / `if let` — never force unwrap (`!`).
- `do/catch` — never `try!`.
- `Int(floatValue)` traps on NaN/Infinity — always guard with `value.isFinite` first.

### Rust

- `#[repr(C)]` on all FFI structs. Match Swift layout.
- `// SAFETY:` comment required on every `unsafe` block.
- `with_capacity()` for all Vec allocations in hot paths.
- `#[test]` inline in modules or `tests/` directory.
- Zero `clone()` in render loop — borrow or use indices.

### SwiftUI + AppKit Bridge

- NSTextStorage changes go through `shouldChangeText`/`didChangeText` for undo support.
- Use `isFlushingTokens` flag to suppress binding sync during programmatic storage changes.
- Binding sync (Coordinator → SwiftUI) must be debounced (300ms) to prevent per-keystroke SwiftUI re-evaluation.
- Never call `page.loadBody()` in a SwiftUI view body — it reads from disk on every re-evaluation.

## Patterns to Avoid

- Manual `.environment()` chains — use `withAppEnvironment()`.
- `.repeatForever` animations — use `TimelineView` gated by `windowOccluded`.
- `DispatchQueue.main.asyncAfter` — use `Task.sleep`.
- `parent.text = tv.string` on every keystroke — debounce to 300ms.
- `page.needsVaultSync = true` during streaming — causes @Query refetch cascade.
- `loadBody()` in SwiftUI view body — disk read on every re-evaluation.
- `Int(Float.nan)` — traps. Always check `.isFinite` first.
- Committing without running `xcodebuild test` + `cargo test`.

## Critical Anti-Patterns (learned from real bugs)

### The Binding Cascade
Coordinator writes `parent.text` → SwiftUI `onChange` fires → sets `page.needsVaultSync = true` → `@Query` refetches → NoteTabView body re-evaluates → `loadBody()` (disk read) → `updateNSView` → text sync races with next callback. **Fix:** Debounce binding sync to 300ms. Never sync during AI streaming.

### The Zone Protection Gap
`shouldChangeTextIn` guards AI zone only during `isStreaming`. After streaming ends but before accept/discard, user edits above divider don't adjust offset → stale offset → data loss on accept. **Fix:** Guard whenever `hasDivider` is true, not just `isStreaming`.

### The Multi-Turn Double Insertion
Second query when `hasDivider` is already true — tokens appended raw without prompt header separator. **Fix:** Track `lastFlushedTurnCount`, insert header when turn count increases.

### The Environment Sync Drift
NoteWindowManager had a manual list of `.environment()` calls that drifted from `AppEnvironment.swift`. Any new state object added to AppEnvironment but not to NoteWindowManager caused runtime crashes. **Fix:** Use `withAppEnvironment(bootstrap)` everywhere. Single source of truth.

## Service Architecture

### TriageService — AI Routing
Routes operations to the right AI backend based on complexity:
- `baseComplexity < 0.30` → On-device (Apple Intelligence / Neural Engine)
- `baseComplexity 0.30–0.50` → Threshold-dependent (may go on-device or cloud)
- `baseComplexity > 0.50` → Cloud (Anthropic/OpenAI)

Operations and their tiers:
| Operation | Complexity | Route |
|-----------|-----------|-------|
| `.rewrite` | 0.25 | On-device |
| `.summarize` | 0.20 | On-device |
| `.continueWriting` | 0.30 | Threshold |
| `.outline` | 0.40 | Cloud |
| `.expand` | 0.50 | Cloud |
| `.analyze` | 0.60 | Cloud |
| `.ask(query:)` | 0.35 | Threshold |

### NoteChatState — Per-Note AI Chat
One instance per open note tab. Manages query → response cycle with 60ms token buffering.
- Callbacks wired by ProseEditorRepresentable Coordinator: `onStreamStart`, `onTokenFlush`, `onAccept`, `onDiscard`.
- AI text lives in NSTextStorage below a `---` divider, not in a separate view.
- Accept strips divider, keeps response inline. Discard removes everything from divider onward.
- `noteBodyProvider` closure reads current body from storage (set by Coordinator).

### GraphStore — Compact Storage
Internal storage uses Int-indexed arrays for O(1) adjacency lookup:
- `_nodeIdx: [String: Int]` — node ID → stable compact index
- `_neighbors: [[Int]]` — compact adjacency lists (deduplicated)
- `_edgesOf: [[Int]]` — edge reverse index
- `_trigramIdx: [String: [Int]]` — trigram → posting list for fuzzy search
- Proxy types (`AdjacencyProxy`, `EdgesByNodeProxy`) preserve `store.adjacency[nodeId]` syntax.
- Public API unchanged: `nodes`, `edges`, `adjacency`, `edgesByNode` all work as before.

### GraphState — FFI Bridge
- `engineHandle: OpaquePointer?` — the Rust engine pointer.
- `pendingNodes` / `pendingEdges` — queue for incremental FFI updates, drained in render loop.
- `mode: .global | .page(nodeId:)` — determines graph scope.
- `buildPageSubgraph()` — extracts quotes, sources, wikilinks as ephemeral nodes.
- All mutations `@MainActor` serialized. No races.

### PhysicsCoordinator — Cross-View State
`@Observable` singleton for graph ↔ sidebar hover signaling:
- `graphHoveredNodeId: String?` — written by MetalGraphNSView on mouseMoved.
- Read by `GraphReactiveModifier` on sidebar rows for highlight effect.
- Zero cost when idle (no timers, no per-frame work).

## FFI Boundary (Swift <-> Rust)

Header: `graph-engine-bridge/graph_engine.h` (42 functions)
- All FFI calls must have nil engine guards.
- String encoding: UTF-8 both sides, validate on return.
- Memory ownership: Rust allocates, Rust frees. Swift never frees Rust memory directly.
- Node types: Note(0), Chat(1), Idea(2), Source(3), Folder(4), Quote(5), Tag(6), Block(7)
- Edge types: reference(0)..questions(11) — 12 total including semantic edges.

## Note Editor Internals

### ProseEditorRepresentable (the heart of editing)
NSViewRepresentable wrapping ClickableTextView (NSTextView subclass).
- **Coordinator** owns: binding sync debounce (300ms), table alignment (500ms), AI zone callbacks.
- **MarkdownTextStorage** — live syntax highlighting via `processEditing()`. Handles: headers, bold, italic, code, blockquotes, links, wikilinks, tables, AI comment markers.
- **ClickableTextView** — NSTextView subclass with: wikilink click handling, right-click AI context menu, hover tracking areas for wikilink glow, `shouldChangeTextIn` zone protection.

### Text Flow
```
User types → NSTextStorage.processEditing() → highlight
           → textDidChange() → debounced binding sync (300ms)
           → table alignment check (500ms)
AI streams → NoteChatState.appendStreamingText() → 60ms buffer
           → flushTokens() → onTokenFlush callback
           → Coordinator.flushNoteChatTokens() → insert into storage
           → isFlushingTokens flag prevents binding sync cascade
```

### AI Context Menu Operations
Right-click in editor → ClickableTextView builds menu → posts notification with operation string.
NoteTabView receives notification → `handleAIContextMenuOperation()` maps to `(NotesOperation, systemPrompt, userPrompt)` → `noteChatState.submitQuery()`.

Operations: rewrite, summarize, expand, simplify, toList, toTable, continue, outline, structure, restructure.

## View Modifiers (Theme/PhysicsModifiers.swift)

| Modifier | Purpose | Cost |
|----------|---------|------|
| `.physicsHover(.subtle/.medium/.lift)` | Scale + shadow on hover | Zero when idle |
| `.physicsPress()` | Scale down on press, spring back | Zero when idle |
| `.breathe()` | 30Hz subtle oscillation | TimelineView, gated by `windowOccluded` |
| `.springEntrance(index:)` | Staggered appear animation | One-shot |
| `.graphReactive(nodeId:)` | Highlight when graph hovers matching node | Requires `PhysicsCoordinator` in environment |
| `.glassEffect()` | macOS 26 liquid glass | System-provided |
| `.siriGlow()` | Animated border glow (streaming indicator) | Active only during streaming |

## Testing

```bash
# Swift (1403 tests, 194 suites)
xcodebuild -project Epistemos.xcodeproj -scheme Epistemos -destination 'platform=macOS' test

# Rust (549 tests)
cd graph-engine && cargo test

# Quick build check
xcodebuild -project Epistemos.xcodeproj -scheme Epistemos -destination 'platform=macOS' build
```

Test file naming:
- `EpistemosTests/<System>Tests.swift` — core tests
- `EpistemosTests/<System>EdgeCaseTests.swift` — boundary + edge cases
- `EpistemosTests/<System>ComprehensiveTests.swift` — thorough coverage
- `EpistemosTests/<System>AuditTests.swift` — audit-specific tests

## Audit Status

**AUDIT COMPLETE.** Waves 1-13 fully reviewed. 16 fixes committed, 9 already implemented, 15 not-a-bug.
Remaining deferred (architecture changes, not minimal fixes):
- W7.4: Graph Store Memory — DONE (compact Int-indexed arrays)
- W13.2: Fuzzy Search Scalability — DONE (trigram index)
- W17.13: App Crashes Creating Note — needs actual crash log to reproduce

## File Layout

| Purpose | Location |
|---------|----------|
| App bootstrap + environment | `Epistemos/App/` |
| State classes (@Observable) | `Epistemos/State/` |
| Services (AI, pipeline, triage) | `Epistemos/Engine/` |
| Graph state + builder | `Epistemos/Graph/` |
| Graph engine (Rust) | `graph-engine/src/` |
| FFI bridge header | `graph-engine-bridge/graph_engine.h` |
| SwiftData models | `Epistemos/Models/` |
| Vault sync + file I/O | `Epistemos/Sync/` |
| Views — Graph | `Epistemos/Views/Graph/` |
| Views — Notes | `Epistemos/Views/Notes/` |
| Views — Chat | `Epistemos/Views/Chat/` |
| Views — Landing | `Epistemos/Views/Landing/` |
| Views — Shell | `Epistemos/Views/Shell/` |
| Theme + modifiers | `Epistemos/Theme/` |
| Tests (Swift) | `EpistemosTests/` |
| Audit bible | `docs/future-work-audit.md` |
| Audit progress | `docs/audit-progress.md` |
