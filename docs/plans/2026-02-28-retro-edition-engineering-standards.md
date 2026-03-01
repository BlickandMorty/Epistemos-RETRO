# Epistemos Retro Edition — Engineering Standards

> **Philosophy:** Robustness. Consolidation. Directness. Low latency.
> Lightning fast and light — but still stylish.
>
> Every decision filters through: "Is this the most direct path with the fewest
> moving parts and the lowest latency?" If a Rust-native solution exists, use it.
> If a GPU can do it, don't give it to the CPU. If one IPC call can replace ten,
> batch it. If a type can prevent a bug class, use the type.

---

## The Golden Rule

> If the macOS version uses Metal + Rust + SIMD, the Windows version uses
> Bevy/wgpu + Rust + ONNX Runtime. NEVER downgrade to JavaScript-based
> solutions when a native Rust alternative exists.

### Forbidden → Required Substitutions

| NEVER USE | ALWAYS USE | WHY |
|-----------|------------|-----|
| D3.js for graph rendering | Bevy + wgpu (WebGPU/D3D12/Vulkan) | Native GPU, instanced draw, 10K+ @ 60fps |
| D3-force for physics | Rapier3D via bevy_rapier3d | True rigid body, SpringJoint, collision |
| Canvas/SVG for nodes | WGSL custom shaders (SDF circles) | 3 ALU ops/pixel, anti-aliased, glow |
| DOM text for labels | Bevy cosmic-text + FontAtlas | GPU-instanced, LOD-gated, frustum culled |
| fetch() for backend | Tauri invoke() via tauri-specta | Direct Rust IPC, zero HTTP, fully typed |
| SSE for streaming | Tauri events (listen/emit) | Native IPC, no chunked encoding |
| better-sqlite3 (JS) | rusqlite (Rust) | Direct SQLite C API, no bridge |
| Drizzle ORM (JS) | Raw rusqlite + hand-written SQL | Zero ORM overhead, prepared statements |
| transformers.js | ort crate (ONNX Runtime) | DirectML NPU/GPU, sub-ms |
| JS workers | tokio::spawn / std::thread | Native threads, zero overhead |
| React state for physics | Bevy ECS components | Cache-coherent SoA memory |
| CSS animations for graph | WGSL shaders + Bevy animation | GPU-driven, 60fps |
| Framer Motion for UI physics | Rust WASM spring solver | Same physics engine as graph, consistent |
| Per-item Tauri invoke | Batch commands (Vec<T>) | 1 IPC call, not 100 |
| JSON.parse in hot paths | serde zero-copy / rkyv | No allocation |
| Next.js | Vite + React Router | No server process, 10x faster dev, lighter bundle |
| Manual TS bridge types | tauri-specta auto-generation | Types can never drift, single source of truth |
| String error returns | thiserror + structured AppError | Frontend can pattern-match error kinds |
| String IDs | Newtype-wrapped UUIDs | Compiler prevents cross-entity ID confusion |
| source_id: Option<String> | NodeSource enum | Compiler enforces valid source-node pairings |
| mpsc for pipeline events | broadcast channel | Multi-consumer: emit, persist, log independently |
| next-themes | Custom theme provider | No Next.js dependency, lighter, same 6 themes |

**If you find yourself reaching for ANY item in the left column, STOP.**

---

## ID System — Newtype-Wrapped UUIDs

Every entity ID is a distinct Rust type. The compiler prevents passing a `ChatId`
where a `PageId` is expected.

```rust
macro_rules! define_id {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(Uuid);

        impl $name {
            pub fn new() -> Self { Self(Uuid::new_v4()) }
            pub fn as_uuid(&self) -> &Uuid { &self.0 }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                self.0.fmt(f)
            }
        }
    };
}

define_id!(PageId);
define_id!(BlockId);
define_id!(ChatId);
define_id!(MessageId);
define_id!(GraphNodeId);
define_id!(GraphEdgeId);
define_id!(FolderId);
```

**Storage:** TEXT in SQLite (36 bytes). Debug-friendly. The 20-byte cost per row
vs BLOB(16) is worth it during development. Revisit with a migration if 10K+
nodes makes it measurable.

**Bridge:** `#[serde(transparent)]` serializes as plain UUID strings over IPC.
tauri-specta generates matching branded types on the TypeScript side.

### NodeSource Enum

Graph nodes reference their source entity via a compiler-checked enum, not a
stringly-typed `source_id`:

```rust
pub enum NodeSource {
    Page(PageId),
    Chat(ChatId),
    Folder(FolderId),
    Block(BlockId),
    Idea { origin_page: PageId, index: usize },
    Tag(String),
    Quote { origin_page: PageId },
    None,
}
```

SQLite storage: `source_type TEXT, source_id TEXT` — two columns that reconstruct
the enum on read. The type system ensures you can never create a
`GraphNodeType::Note` with a `NodeSource::Chat`.

---

## Error Handling — Structured, Per-Crate

Every crate defines its own error enum with `thiserror`. Errors compose upward
via `#[from]`. The top-level `AppError` serializes as structured JSON for the
frontend.

```rust
// crates/storage/src/error.rs
#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("page not found: {0}")]
    PageNotFound(PageId),
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("body file I/O: {0}")]
    BodyIo(#[from] std::io::Error),
}

// src-tauri/src/error.rs
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Storage(#[from] StorageError),
    #[error(transparent)]
    Engine(#[from] EngineError),
    #[error(transparent)]
    Graph(#[from] GraphError),
    #[error(transparent)]
    Sync(#[from] SyncError),
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let kind = match self {
            Self::Storage(StorageError::PageNotFound(_)) => "not_found",
            Self::Storage(StorageError::Database(_)) => "database",
            Self::Engine(EngineError::Timeout(_)) => "timeout",
            Self::Engine(EngineError::Provider(_)) => "provider",
            _ => "internal",
        };
        let mut map = s.serialize_map(Some(2))?;
        map.serialize_entry("kind", kind)?;
        map.serialize_entry("message", &self.to_string())?;
        map.end()
    }
}
```

**Rule:** No `.unwrap()` in production code. Use `?` with proper error types or
`.expect("reason this is safe")` with an explanation. The `?` operator composes
cleanly across crate boundaries via `#[from]`.

---

## Concurrency — Broadcast Channels + tokio::spawn

### Pipeline Events

The pipeline emits events via `tokio::broadcast::Sender<PipelineEvent>`.
Multiple consumers subscribe independently:

- **Consumer 1 (Tauri emitter):** Forwards events to the frontend webview
- **Consumer 2 (Persistence):** Saves messages on `Complete` / `Enriched`
- **Consumer 3 (Future):** Logging, analytics, SOAR feedback

Adding a new consumer is `tx.subscribe()` — zero changes to existing code.

### Background Tasks

- LLM streaming: `tokio::spawn` (non-blocking, cancellable via `AbortHandle`)
- Enrichment (Pass 2+3): `tokio::spawn` with timeout (`tokio::time::timeout`)
- Vault file watching: `tokio::spawn` with `notify` crate watcher
- Graph rebuild: `tokio::spawn_blocking` (CPU-bound adjacency list construction)
- Entity extraction: `tokio::spawn` (LLM-bound, batched 5 pages at a time)

### Shared State

- `GraphStore`: `Arc<RwLock<GraphStore>>` (consider `parking_lot::RwLock` for
  faster uncontended locks and no poisoning)
- `InferenceConfig`: `Arc<RwLock<InferenceConfig>>`
- `Storage`: thread-safe via rusqlite connection pooling (or single connection
  with `Mutex`)

---

## Bridge — tauri-specta Auto-Generated

**No manual TypeScript bridge files.** All invoke wrappers and TypeScript types
are auto-generated from Rust `#[tauri::command]` signatures at compile time.

```rust
#[tauri::command]
#[specta::specta]
async fn get_page(
    state: State<'_, AppState>,
    page_id: PageId,
) -> Result<Page, AppError> {
    state.storage.get_page(&page_id)
}
```

Generates:
```typescript
// lib/bindings.ts (auto-generated, never hand-edited)
export async function getPage(pageId: string): Promise<Page> { ... }
```

### Event Naming Convention

```
pipeline://stage          — pipeline stage advancement
pipeline://reasoning      — thinking/deliberation tokens
pipeline://text-delta     — visible answer tokens
pipeline://signals        — signal updates (confidence, entropy, etc.)
pipeline://complete       — full response with DualMessage + TruthAssessment
pipeline://enriched       — background enrichment results (Pass 2+3)
pipeline://error          — pipeline error
graph://updated           — graph structure changed
graph://physics           — 60fps position stream from Rapier3D
vault://changed           — file system change detected
assistant://text-delta    — mini-chat streaming tokens
assistant://complete      — mini-chat response done
```

---

## UI Physics — Rust WASM Spring Solver

Button hover effects, panel transitions, drag interactions — all computed by a
small Rust crate compiled to WASM. This replaces Framer Motion entirely and
gives UI elements the same physics parameters as the knowledge graph.

```
crates/ui-physics/
├── Cargo.toml          # targets: wasm32-unknown-unknown + native
└── src/
    ├── lib.rs
    └── spring.rs       # Spring solver: stiffness, damping, mass
```

The WASM module runs in the browser with zero IPC overhead. React hooks consume
spring values for CSS transforms. The native target is used by Bevy for
consistent physics across both surfaces.

**Visual effects** (glow, particles, animated backgrounds) render on the Bevy
surface behind the transparent webview. The webview is transparent — Bevy
paints the world, React paints the text.

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Graph: 10K nodes, 60fps | <16ms total frame |
| Physics tick (Rapier3D) | <1ms for 10K bodies |
| IPC round-trip (invoke) | <0.5ms |
| Note save + index | <50ms |
| FTS5 search (10K docs) | <20ms |
| Embedding inference (ort) | <1ms per text |
| Cold start to interactive | <2 seconds |
| UI spring calculation (WASM) | <0.1ms per frame |
| Bundle size (Vite prod) | <500KB gzipped JS |

---

## Anti-Patterns (Claude Gets These Wrong)

1. **Creating JS wrapper around Rust** — No. Call Rust directly via invoke.
2. **D3.js "for now, swap later"** — No. Bevy from day 1. There is no later.
3. **useState for physics positions** — No. ECS components. React re-render kills fps.
4. **One invoke per item in a loop** — No. Batch commands. Always Vec<T>.
5. **ORM layer over rusqlite** — No. Hand-written SQL. Prepared statements.
6. **Polling for updates** — No. Tauri events (push, not pull).
7. **Spawning Node.js processes** — No. tokio::spawn in Rust.
8. **CSS transitions for graph animations** — No. WGSL shaders.
9. **REST API between frontend and backend** — No. Tauri invoke is IPC, not HTTP.
10. **Separate search indexes for fuzzy and full-text** — No. Dual-layer: FST + FTS5, single query merges both.
11. **Framer Motion for UI physics** — No. Rust WASM spring solver. Same engine as graph.
12. **Manual TypeScript type maintenance** — No. tauri-specta generates from Rust.
13. **String IDs everywhere** — No. Newtype UUIDs. Compiler catches cross-entity bugs.
14. **String error messages** — No. Structured AppError with thiserror. Frontend pattern-matches.
15. **Next.js in a desktop app** — No. Vite. No server process, lighter, faster.

---

## Pre-Commit Checklist

- [ ] No D3.js, no Canvas, no SVG for graph rendering
- [ ] No fetch() — all backend calls use invoke() via tauri-specta
- [ ] No SSE — streaming uses Tauri events
- [ ] No JS workers — use tokio::spawn
- [ ] No ORM — raw rusqlite with prepared statements
- [ ] No Framer Motion — UI physics via Rust WASM
- [ ] Batch IPC — no per-item invoke loops
- [ ] WGSL shaders for all graph visuals
- [ ] Rapier3D for all physics
- [ ] All IDs use newtype wrappers (PageId, ChatId, etc.)
- [ ] All errors use thiserror, no .map_err(|e| e.to_string())
- [ ] No .unwrap() in production code
- [ ] `cargo test` passes
- [ ] `cargo clippy -- -D warnings` clean
- [ ] `npm run build` succeeds (Vite production build)
