# Epistemos Retro v2 — Full Pure Rust Rewrite

**Date:** 2026-03-03
**Status:** Approved
**Scope:** Replace Tauri+React with Bevy+egui. Rewrite graph engine for ECS. Single Rust binary for Windows.

---

## Decision Summary

- **UI Framework:** Bevy + bevy_egui (no webview, no TypeScript)
- **Graph Engine:** Bevy ECS entities + Rapier3D native (not WASM)
- **Rendering:** wgpu with custom WGSL shaders (DX12 backend on Windows)
- **Target:** Windows only
- **Project Location:** `~/Epistemos-RETRO-v2/` (new folder, copy good crates from v1)

## What Changes vs. What Stays

### Stays (4 crates, ~4,000 LOC)
- `crates/storage/` — rusqlite, WAL mode, 12 tables, FTS5. Pure Rust, no web deps.
- `crates/engine/` — 6 LLM providers, 3-pass SOAR pipeline, streaming. Pure Rust (reqwest/tokio).
- `crates/embeddings/` — ONNX Runtime via ort crate. Pure Rust.
- `crates/sync/` — Vault sync, block parsing. Pure Rust.

These crates need thin Bevy system adapters (run DB queries on AsyncComputeTaskPool, feed results back as events) but their core logic is untouched.

### Rewritten (1 crate, ~950 LOC)
- `crates/graph/` — Rebuilt for Bevy ECS. Graph nodes become Entities with components instead of FxHashMap records. Builder logic (what nodes/edges to create from DB) is ported, output format changes.

### Deleted
- All React/TypeScript (148 files) — replaced by egui
- Tauri command wrappers (67 commands, ~3,000 LOC) — replaced by direct Bevy system calls
- WASM physics bridge (ui-physics crate) — replaced by native Rapier3D
- Tauri bootstrap (lib.rs, state.rs) — replaced by Bevy App
- All JS tooling (package.json, vite.config, tailwind, tsconfig, node_modules)

### New (5 crates)
- `crates/app/` — Bevy App, plugin registration, window setup
- `crates/ui/` — All egui panels (notes editor, chat, library, settings, command palette)
- `crates/render/` — WGSL shaders, instanced node rendering, edge rendering, bloom
- `crates/animation/` — Spring physics, tween interpolation, camera transitions
- `crates/theme/` — Theme system, glass morphism blur shader, wallpaper shaders

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│              Epistemos Retro v2                        │
│           Single Rust Binary (.exe)                    │
├──────────────────────────────────────────────────────┤
│  Render Pipeline (per frame)                          │
│  1. Bevy 3D scene (graph nodes, edges, environment)   │
│  2. Wallpaper layer (fullscreen quad + shader)         │
│  3. Glass blur pass (gaussian blur under UI regions)   │
│  4. egui overlay (semi-transparent themed panels)      │
│  5. Final composite                                    │
├──────────────────────────────────────────────────────┤
│  Bevy ECS Core                                        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐      │
│  │ Graph  │ │Physics │ │ Engine │ │ Storage  │      │
│  │ Plugin │ │ Plugin │ │ Plugin │ │ Plugin   │      │
│  └────────┘ └────────┘ └────────┘ └──────────┘      │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐      │
│  │ Embed  │ │ Sync   │ │ Search │ │ Theme    │      │
│  │ Plugin │ │ Plugin │ │ Plugin │ │ Plugin   │      │
│  └────────┘ └────────┘ └────────┘ └──────────┘      │
│  ┌────────┐ ┌────────┐                               │
│  │Animate │ │Render  │                               │
│  │ Plugin │ │ Plugin │                               │
│  └────────┘ └────────┘                               │
├──────────────────────────────────────────────────────┤
│  rusqlite (WAL) │ ONNX Runtime │ tokio runtime        │
└──────────────────────────────────────────────────────┘
```

---

## Graph Engine Design

### ECS-Native Graph

Each graph node is a Bevy Entity with components:

```rust
#[derive(Component)]
struct GraphNode {
    node_type: NodeType,    // Note, Tag, Block, Folder, Chat
    source_id: String,      // FK to database record
    label: String,
    weight: f64,
}

#[derive(Component)]
struct PhysicsNode {
    is_pinned: bool,
    damping: f32,
}

#[derive(Component)]
struct NodeVisual {
    color: Color,
    radius: f32,
    glow_intensity: f32,
}

#[derive(Component)]
struct GraphEdge {
    edge_type: EdgeType,
    source: Entity,
    target: Entity,
    weight: f64,
}
```

### Data Flow

```
DB → graph_build_system → Bevy Entities (one per node/edge)
  → Rapier3D updates Transform in-place
  → Bevy renderer reads Transform directly → GPU
```

One data representation. No copying between layers.

### Build Pipeline

1. Query pages → spawn Note entities
2. Parse tags → spawn Tag entities + Tagged edge entities
3. Parse blocks (>20 chars) → spawn Block entities + Contains edges
4. Parse ((blockRef)) → spawn Reference edges
5. Walk folder tree → spawn Folder entities + hierarchy edges
6. Query chats → spawn Chat entities
7. Phyllotaxis spiral for initial positions
8. Rapier3D takes over physics

Incremental: on GraphRebuild event, diff against existing entities (add new, remove deleted).

### Systems (run order)

- `graph_build_system` — startup + on GraphRebuild event
- `physics_control_system` — damping, thermal noise, pin/unpin
- `interaction_system` — raycast picking, hover, click, drag
- `camera_system` — orbit + FPS modes + transitions
- `lod_system` — distance-based label/edge/detail visibility
- `node_render_system` — instanced mesh + glow shader
- `edge_render_system` — bezier curves + alpha by weight

---

## Three Graph Modes

### Mode 1: 2D (Default — this IS the landing page)
- Orthographic camera, top-down
- Physics constrained to Z=0 (2D plane)
- Gaussian blur background (clone macOS Opulent look)
- Curved edges with glow, labels always visible

### Mode 2: 3D (toggle from 2D)
- Perspective camera, orbit controls
- Full 3D physics (xyz spread)
- Space environment (nebula skybox, star field)
- Edge tubes with flowing energy, LOD labels

### Mode 3: FPS (toggle from 3D)
- First-person camera, WASD + mouse look
- Player body with node gravity
- World scale increase (nodes feel room-sized)
- Proximity inspection (approach node → details panel)

### Camera Transitions (GTA-style)

2D → 3D: Camera pulls up from top-down, orthographic lerps to perspective, blur crossfades to space nebula, nodes gain Z-spread. ~1 second.

3D → FPS: Camera zooms toward target node, FOV widens, world scales up, orbit fades to WASD. ~1 second.

All transitions use spring interpolation via AnimationPlugin.

---

## UI (egui Panels)

All current features preserved:
- **Notes editor** — egui TextEdit with markdown syntax highlighting
- **Chat** — message list + input, streaming tokens via Bevy events
- **Library** — research view with cards
- **Settings** — LLM provider config, theme selection, physics tuning
- **Command palette** — fuzzy search over commands/notes/tags
- **Search** — FTS5 + FST hybrid search

### Glass Morphism

Bevy renders the scene/wallpaper to a texture. A post-processing shader applies gaussian blur to regions behind egui panels. egui panels render semi-transparent. Result: native glass morphism at GPU speed.

### Animations

Custom AnimationPlugin with spring physics (same feel as Framer Motion). Every UI element that animates has an `Animated<T>` component. Panel slide-in, fade, scale — all spring-driven at native frame rate (144fps+).

---

## Theme System

6 themes, each defining:
- Wallpaper shader (animated, runs on GPU)
- Accent colors (mapped to egui Visuals)
- Panel opacity + blur strength
- Node color palette per type
- Font configuration

Theme switching: swap ThemeConfig resource, everything updates next frame.

---

## Build Phases

### Phase 1: Foundation + 2D Graph
- Scaffold project, copy 4 good crates
- Bevy app bootstrap with egui
- Graph plugin: build from DB → ECS entities
- Rapier3D physics (2D constrained)
- 2D node/edge rendering with glow
- Glass morphism blur shader
- Basic egui panels (notes, settings)
- **Ship milestone: 2D graph with blur background works**

### Phase 2: LLM + Search
- Wire engine crate into Bevy (async streaming via events)
- Chat panel with SOAR pipeline
- FTS5 + FST search integration
- Embeddings integration (K-NN queries)
- **Ship milestone: chat works, search works**

### Phase 3: 3D + FPS
- Unconstrain Z-axis physics
- Space environment (skybox, stars, fog)
- GTA camera transitions
- FPS mode (WASD, mouse look, proximity)
- **Ship milestone: all 3 graph modes work**

### Phase 4: Polish
- Command palette
- Vault sync file watcher
- All 6 themes recreated
- Library view
- Performance profiling + optimization
- **Ship milestone: feature parity with v1**

---

## Dependencies (Cargo)

```toml
bevy = "0.15"             # Or latest stable at build time
bevy_egui = "0.35"        # Or matching bevy_egui version
bevy_rapier3d = "0.33"    # Or matching version
rusqlite = { version = "0.32", features = ["bundled"] }
ort = "2.0"               # ONNX Runtime
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
fst = "0.4"
rustc-hash = "2"          # FxHashMap
```

Note: exact versions will be pinned at project creation time to whatever is latest stable.

---

## Project Location

```
~/Epistemos-RETRO-v2/
├── Cargo.toml               # Workspace root
├── crates/
│   ├── app/                  # Bevy main binary
│   ├── storage/              # COPIED from v1
│   ├── engine/               # COPIED from v1
│   ├── embeddings/           # COPIED from v1
│   ├── sync/                 # COPIED from v1
│   ├── graph/                # REWRITTEN for ECS
│   ├── physics/              # NEW (Rapier3D native)
│   ├── ui/                   # NEW (egui panels)
│   ├── render/               # NEW (WGSL shaders)
│   ├── animation/            # NEW (spring/tween)
│   └── theme/                # NEW (glass morphism)
├── assets/                   # Shaders, fonts, skybox textures
├── docs/
│   └── plans/
└── CLAUDE.md                 # Engineering standards (updated for v2)
```

Old project at `~/Epistemos-RETRO/` stays as reference.
