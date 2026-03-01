# FPS Explore Mode — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Bevy + wgpu rendering layer and React HUD overlay that transforms the knowledge graph into a navigable 3D universe with seamless FPS exploration.

**Architecture:** Dual-surface rendering — Bevy renders natively to the Tauri window surface (bottom, opaque) via a TauriPlugin that shares the raw window handle. React's transparent webview floats on top for HUD overlays and UI panels. The existing Rapier3D physics (90Hz headless loop) drives both graph layout and FPS exploration. Bevy reads position snapshots from a shared buffer; React reads HUD data via Tauri events.

**Tech Stack:** Bevy 0.15 (wgpu, ECS, meshes, materials, cameras), Rapier3D 0.32 (physics — already done), Tauri 2 (window management), React 19 + Zustand 5 (HUD + state), TailwindCSS 4 (styling).

**Precondition:** ALL hardening phases must be complete before starting this plan.

**Reference:** [BevyTauriExample](https://github.com/sunxfancy/BevyTauriExample) — Bevy 0.15.1 + Tauri 2, wgpu surface created from webview window handle via `instance.create_surface(&webview_window)`.

---

## Task 1: Add Bevy dependencies to graph-render crate

**Files:**
- Modify: `crates/graph-render/Cargo.toml`
- Modify: `Cargo.toml` (workspace — add bevy to workspace deps)

**Step 1: Update workspace Cargo.toml**

Add to `[workspace.dependencies]`:
```toml
bevy = { version = "0.15", default-features = false, features = [
  "bevy_asset", "bevy_render", "bevy_pbr", "bevy_core_pipeline",
  "bevy_winit", "bevy_scene", "bevy_gizmos", "bevy_state",
  "png", "x11", "wayland",
] }
raw-window-handle = "0.6"
```

**Step 2: Update graph-render/Cargo.toml**

```toml
[package]
name = "graph-render"
version = "0.1.0"
edition = "2021"

[dependencies]
bevy = { workspace = true }
raw-window-handle = { workspace = true }
ui-physics = { path = "../ui-physics" }
storage = { path = "../storage" }
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
rustc-hash = { workspace = true }
crossbeam-channel = "0.5"
```

**Step 3: Verify workspace compiles**

Run: `cargo check -p graph-render`
Expected: Clean compilation (no code yet, just deps)

**Step 4: Commit**

```bash
git add Cargo.toml crates/graph-render/Cargo.toml Cargo.lock
git commit -m "build: add Bevy 0.15 dependencies to graph-render crate"
```

---

## Task 2: Create TauriPlugin — Bevy ↔ Tauri window sharing

This is the foundational integration. Bevy needs Tauri's window handle to create
a wgpu render surface. The TauriPlugin:
1. Receives the Tauri `WebviewWindow` during app setup
2. Creates a wgpu `Surface` from the window's raw handle
3. Forwards window events (resize, scale change) into Bevy

**Files:**
- Create: `crates/graph-render/src/tauri_plugin.rs`
- Modify: `crates/graph-render/src/lib.rs`

**Step 1: Write TauriPlugin skeleton**

```rust
// crates/graph-render/src/tauri_plugin.rs
//! Bridges Tauri's window management with Bevy's rendering pipeline.
//!
//! The TauriPlugin receives a raw window handle from the Tauri webview
//! window and creates a wgpu Surface for Bevy to render into.

use bevy::prelude::*;
use bevy::window::{PrimaryWindow, RawHandleWrapper};
use bevy::winit::WinitPlugin;
use raw_window_handle::{HasRawDisplayHandle, HasRawWindowHandle};
use std::sync::Arc;

/// Marker: window is managed by Tauri, not winit.
#[derive(Resource)]
pub struct TauriWindowHandle {
    pub raw_window: Arc<dyn HasRawWindowHandle + Send + Sync>,
    pub raw_display: Arc<dyn HasRawDisplayHandle + Send + Sync>,
    pub width: u32,
    pub height: u32,
}

/// Plugin that replaces Bevy's default windowing with Tauri's window.
pub struct TauriPlugin {
    pub handle: TauriWindowHandle,
}

impl Plugin for TauriPlugin {
    fn build(&self, app: &mut App) {
        // Remove default WinitPlugin — Tauri owns the window
        // Insert our handle as a resource
        app.insert_resource(self.handle.clone());
        // TODO: create Bevy Window entity from Tauri handle
        // TODO: forward resize events
    }
}
```

> **NOTE to implementer:** The exact integration code depends on the Bevy 0.15
> window abstraction. Study BevyTauriExample's `tauri_plugin.rs` for the
> `RawHandleWrapper` and `CustomRendererPlugin` patterns. The critical call is
> `instance.create_surface(&webview_window)`. Bevy 0.15 changed windowing
> significantly — check `bevy_winit` source for `create_windows` system.

**Step 2: Update lib.rs**

```rust
// crates/graph-render/src/lib.rs
pub mod tauri_plugin;
mod scene;       // Task 3
mod graph_scene;  // Task 5
```

**Step 3: Verify compilation**

Run: `cargo check -p graph-render`
Expected: Compiles (plugin skeleton only)

**Step 4: Commit**

```bash
git add crates/graph-render/
git commit -m "feat(graph-render): TauriPlugin skeleton for window handle sharing"
```

---

## Task 3: Basic Bevy scene — colored background in Tauri window

Get Bevy rendering ANYTHING in the Tauri window. Once a colored background
appears behind the React webview, the dual-surface integration is proven.

**Files:**
- Create: `crates/graph-render/src/scene.rs`
- Modify: `src-tauri/src/lib.rs` (spawn Bevy app on background thread)
- Modify: `src-tauri/Cargo.toml` (add graph-render dependency)

**Step 1: Create minimal Bevy scene**

```rust
// crates/graph-render/src/scene.rs
use bevy::prelude::*;

/// Setup: camera + ambient light + dark background.
pub fn setup_scene(mut commands: Commands) {
    // Camera — starts at overhead orbit position
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 500.0, 500.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));

    // Ambient light
    commands.insert_resource(AmbientLight {
        color: Color::srgb(0.1, 0.1, 0.15),
        brightness: 300.0,
    });

    // Dark space background
    commands.insert_resource(ClearColor(Color::srgb(0.02, 0.02, 0.05)));
}
```

**Step 2: Wire Bevy app into Tauri startup**

In `src-tauri/src/lib.rs`, after `app.manage(state.clone())`:

```rust
// Spawn Bevy render thread with Tauri window handle
let main_window = app.get_webview_window("main")
    .expect("main window must exist");
std::thread::spawn(move || {
    graph_render::run_bevy_app(main_window);
});
```

In `crates/graph-render/src/lib.rs`:

```rust
pub fn run_bevy_app(window: tauri::WebviewWindow) {
    App::new()
        .add_plugins((
            DefaultPlugins.set(WindowPlugin {
                primary_window: None, // Tauri owns the window
                ..default()
            }),
            tauri_plugin::TauriPlugin::new(window),
        ))
        .add_systems(Startup, scene::setup_scene)
        .run();
}
```

**Step 3: Add graph-render dep to src-tauri**

In `src-tauri/Cargo.toml`:
```toml
graph-render = { path = "../crates/graph-render" }
```

**Step 4: Test visually**

Run: `npm run tauri dev`
Expected: Window shows dark blue/black background. React scaffold text still visible on top.

**Step 5: Commit**

```bash
git add crates/graph-render/ src-tauri/
git commit -m "feat: Bevy renders dark background in Tauri window (dual-surface proof)"
```

---

## Task 4: Transparent webview configuration

Configure the Tauri webview to be transparent so React UI floats over the
Bevy render surface. Only React elements with background colors will be opaque.

**Files:**
- Modify: `src-tauri/tauri.conf.json` (window transparency)
- Modify: `src/index.css` or `src/main.tsx` (transparent body background)

**Step 1: Enable transparent webview in Tauri config**

In `src-tauri/tauri.conf.json`, update the window config:
```json
{
  "app": {
    "windows": [
      {
        "title": "Epistemos Retro Edition",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false,
        "transparent": true
      }
    ]
  }
}
```

**Step 2: Make HTML/body backgrounds transparent**

In `index.html` or root CSS:
```css
html, body, #root {
  background: transparent !important;
}
```

**Step 3: Test visually**

Run: `npm run tauri dev`
Expected: Bevy's dark background shows through. React text/buttons are still
visible and interactive. Clicking through transparent areas hits nothing (or
optionally Bevy in future).

**Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src/ index.html
git commit -m "feat: transparent webview — React floats over Bevy surface"
```

---

## Task 5: Shared PhysicsFrame buffer + Bevy position sync

The physics loop (90Hz) writes position snapshots. Bevy (60Hz vsync) reads the
latest snapshot each frame. No Tauri event serialization needed for rendering.

**Files:**
- Create: `crates/graph-render/src/graph_scene.rs`
- Modify: `src-tauri/src/state.rs` (add shared frame buffer)
- Modify: `src-tauri/src/commands/physics.rs` (write to shared buffer)

**Step 1: Write failing test for frame buffer**

```rust
// crates/graph-render/src/graph_scene.rs
use std::sync::{Arc, Mutex};
use ui_physics::world::PhysicsFrame;

/// Shared buffer: physics loop writes, Bevy reads.
#[derive(Clone)]
pub struct FrameBuffer {
    inner: Arc<Mutex<PhysicsFrame>>,
}

impl FrameBuffer {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(PhysicsFrame {
                positions: vec![],
                settled: true,
            })),
        }
    }

    /// Physics loop calls this at 90Hz.
    pub fn write(&self, frame: PhysicsFrame) {
        if let Ok(mut buf) = self.inner.lock() {
            *buf = frame;
        }
    }

    /// Bevy render loop calls this at vsync.
    pub fn read(&self) -> PhysicsFrame {
        self.inner.lock()
            .map(|f| f.clone())
            .unwrap_or_else(|e| e.into_inner().clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ui_physics::world::NodePosition;

    #[test]
    fn frame_buffer_write_read_roundtrip() {
        let buf = FrameBuffer::new();
        let frame = PhysicsFrame {
            positions: vec![NodePosition {
                id: "test-node".into(),
                x: 1.0, y: 2.0, z: 3.0,
            }],
            settled: false,
        };
        buf.write(frame.clone());
        let read = buf.read();
        assert_eq!(read.positions.len(), 1);
        assert_eq!(read.positions[0].id, "test-node");
        assert!(!read.settled);
    }

    #[test]
    fn frame_buffer_default_is_empty_settled() {
        let buf = FrameBuffer::new();
        let read = buf.read();
        assert!(read.positions.is_empty());
        assert!(read.settled);
    }
}
```

**Step 2: Run test**

Run: `cargo test -p graph-render`
Expected: 2 tests pass

**Step 3: Wire FrameBuffer into AppState**

Add to `src-tauri/src/state.rs`:
```rust
use graph_render::graph_scene::FrameBuffer;

pub struct AppState {
    // ... existing fields ...
    pub frame_buffer: FrameBuffer,
}
```

In `AppState::new()`:
```rust
frame_buffer: FrameBuffer::new(),
```

**Step 4: Write to buffer in physics loop**

In `src-tauri/src/commands/physics.rs`, after `world.step()`:
```rust
let frame_buffer = state.frame_buffer.clone();
// Inside the tokio::spawn loop, after extracting frame:
frame_buffer.write(frame.clone());
```

**Step 5: Commit**

```bash
git add crates/graph-render/ src-tauri/
git commit -m "feat: shared PhysicsFrame buffer — physics writes, Bevy reads"
```

---

## Task 6: Node sphere rendering from PhysicsFrame

Bevy reads the shared frame buffer each tick and creates/updates sphere meshes
at node positions. This is the core graph visualization.

**Files:**
- Modify: `crates/graph-render/src/graph_scene.rs`
- Modify: `crates/graph-render/src/scene.rs`

**Step 1: Define node rendering components**

```rust
// In graph_scene.rs

use bevy::prelude::*;
use rustc_hash::FxHashMap;

/// Tag component linking a Bevy entity to a graph node ID.
#[derive(Component)]
pub struct GraphNodeMarker {
    pub node_id: String,
}

/// Resource tracking which graph nodes have been spawned as Bevy entities.
#[derive(Resource, Default)]
pub struct SpawnedNodes {
    pub map: FxHashMap<String, Entity>,
}

/// Bevy system: sync node sphere positions from the shared frame buffer.
pub fn sync_node_positions(
    frame_buffer: Res<FrameBuffer>,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut spawned: ResMut<SpawnedNodes>,
    mut transforms: Query<&mut Transform, With<GraphNodeMarker>>,
) {
    let frame = frame_buffer.read();

    for pos in &frame.positions {
        if let Some(&entity) = spawned.map.get(&pos.id) {
            // Update existing node position
            if let Ok(mut t) = transforms.get_mut(entity) {
                t.translation = Vec3::new(pos.x, pos.y, pos.z);
            }
        } else {
            // Spawn new node sphere
            let entity = commands.spawn((
                Mesh3d(meshes.add(Sphere::new(5.0))),
                MeshMaterial3d(materials.add(StandardMaterial {
                    base_color: Color::srgb(0.3, 0.5, 1.0),
                    emissive: LinearRgba::new(0.1, 0.2, 0.5, 1.0),
                    ..default()
                })),
                Transform::from_xyz(pos.x, pos.y, pos.z),
                GraphNodeMarker { node_id: pos.id.clone() },
            )).id();
            spawned.map.insert(pos.id.clone(), entity);
        }
    }
}
```

**Step 2: Register system in Bevy app**

In `lib.rs` `run_bevy_app()`:
```rust
.insert_resource(graph_scene::SpawnedNodes::default())
.add_systems(Update, graph_scene::sync_node_positions)
```

**Step 3: Test visually**

Run: `npm run tauri dev`
Then trigger physics: invoke `start_physics` from React or dev console.
Expected: Blue spheres appear and settle into force-directed layout positions.

**Step 4: Commit**

```bash
git add crates/graph-render/
git commit -m "feat: Bevy renders graph nodes as spheres from PhysicsFrame"
```

---

## Task 7: Edge line rendering

Draw lines between connected nodes. Bevy 0.15 has `bevy_gizmos` for debug
lines, but for production we need proper line meshes or the gizmos system.

**Files:**
- Modify: `crates/graph-render/src/graph_scene.rs`
- Modify: `crates/graph-render/src/lib.rs`

**Step 1: Add edge data to frame buffer**

Extend `FrameBuffer` to also carry edge data (source_id, target_id pairs).
This requires adding an edge list. The simplest approach: store edges once
during `load_from_graph`, pass them alongside positions.

Add to `graph_scene.rs`:

```rust
/// Edge pair: (source_node_id, target_node_id)
#[derive(Resource, Default)]
pub struct GraphEdges {
    pub edges: Vec<(String, String)>,
}

/// Bevy system: draw edges as gizmo lines between node positions.
pub fn draw_edges(
    mut gizmos: Gizmos,
    edges: Res<GraphEdges>,
    spawned: Res<SpawnedNodes>,
    transforms: Query<&Transform, With<GraphNodeMarker>>,
) {
    for (src, tgt) in &edges.edges {
        let Some(&src_entity) = spawned.map.get(src) else { continue };
        let Some(&tgt_entity) = spawned.map.get(tgt) else { continue };
        let Ok(src_t) = transforms.get(src_entity) else { continue };
        let Ok(tgt_t) = transforms.get(tgt_entity) else { continue };

        gizmos.line(
            src_t.translation,
            tgt_t.translation,
            Color::srgba(0.2, 0.4, 0.8, 0.3),
        );
    }
}
```

**Step 2: Register system**

```rust
.insert_resource(graph_scene::GraphEdges::default())
.add_systems(Update, graph_scene::draw_edges.after(graph_scene::sync_node_positions))
```

**Step 3: Test visually**

Run: `npm run tauri dev` → start physics
Expected: Blue lines connect related nodes.

**Step 4: Commit**

```bash
git add crates/graph-render/
git commit -m "feat: edge line rendering between graph nodes"
```

---

## Task 8: Orbit camera for graph mode

HJKL pan, +/- zoom, R reset. The camera orbits at a fixed distance above the
graph centroid. Mouse wheel also zooms.

**Files:**
- Create: `crates/graph-render/src/camera.rs`
- Modify: `crates/graph-render/src/lib.rs`

**Step 1: Write orbit camera system**

```rust
// crates/graph-render/src/camera.rs
use bevy::prelude::*;
use bevy::input::mouse::MouseWheel;

/// Tag for the main graph camera.
#[derive(Component)]
pub struct GraphCamera;

/// Orbit camera state.
#[derive(Resource)]
pub struct OrbitState {
    pub target: Vec3,     // Look-at point
    pub distance: f32,    // Distance from target
    pub yaw: f32,         // Horizontal angle
    pub pitch: f32,       // Vertical angle (clamped)
}

impl Default for OrbitState {
    fn default() -> Self {
        Self {
            target: Vec3::ZERO,
            distance: 800.0,
            yaw: 0.0,
            pitch: std::f32::consts::FRAC_PI_4, // 45° down
        }
    }
}

pub fn orbit_camera_input(
    keys: Res<ButtonInput<KeyCode>>,
    mut scroll: EventReader<MouseWheel>,
    mut state: ResMut<OrbitState>,
    time: Res<Time>,
) {
    let dt = time.delta_secs();
    let pan_speed = 300.0 * dt;
    let zoom_speed = 500.0 * dt;

    // Vim-inspired pan: H=left, L=right, J=down, K=up
    if keys.pressed(KeyCode::KeyH) { state.target.x -= pan_speed; }
    if keys.pressed(KeyCode::KeyL) { state.target.x += pan_speed; }
    if keys.pressed(KeyCode::KeyJ) { state.target.z += pan_speed; }
    if keys.pressed(KeyCode::KeyK) { state.target.z -= pan_speed; }

    // Zoom: +/- keys
    if keys.pressed(KeyCode::Equal) { state.distance -= zoom_speed; }
    if keys.pressed(KeyCode::Minus) { state.distance += zoom_speed; }

    // Mouse wheel zoom
    for ev in scroll.read() {
        state.distance -= ev.y * 50.0;
    }

    // Clamp distance
    state.distance = state.distance.clamp(100.0, 5000.0);

    // Reset: R key
    if keys.just_pressed(KeyCode::KeyR) {
        *state = OrbitState::default();
    }
}

pub fn apply_orbit_camera(
    state: Res<OrbitState>,
    mut query: Query<&mut Transform, With<GraphCamera>>,
) {
    let Ok(mut transform) = query.get_single_mut() else { return };

    let (sin_yaw, cos_yaw) = state.yaw.sin_cos();
    let (sin_pitch, cos_pitch) = state.pitch.sin_cos();

    let offset = Vec3::new(
        cos_pitch * sin_yaw * state.distance,
        sin_pitch * state.distance,
        cos_pitch * cos_yaw * state.distance,
    );

    transform.translation = state.target + offset;
    transform.look_at(state.target, Vec3::Y);
}
```

**Step 2: Register camera systems**

Add to Bevy app:
```rust
.insert_resource(camera::OrbitState::default())
.add_systems(Update, (
    camera::orbit_camera_input,
    camera::apply_orbit_camera.after(camera::orbit_camera_input),
))
```

Tag the startup camera with `GraphCamera`:
```rust
commands.spawn((
    Camera3d::default(),
    Transform::from_xyz(0.0, 500.0, 500.0).looking_at(Vec3::ZERO, Vec3::Y),
    camera::GraphCamera,
));
```

**Step 3: Test visually**

Run: `npm run tauri dev` → HJKL pans, +/- zooms, R resets.

**Step 4: Commit**

```bash
git add crates/graph-render/
git commit -m "feat: orbit camera with HJKL pan, zoom, and R reset"
```

---

## Task 9: Graph Zustand slice — view mode state

React needs to track the current view mode (App/Graph/FPS) and communicate
mode transitions to Rust. This slice owns that state.

**Files:**
- Create: `src/lib/store/slices/graph.ts`
- Modify: `src/lib/store/use-pfc-store.ts` (compose new slice)
- Test: `src/lib/store/__tests__/graph.test.ts` (unit tests for state transitions)

**Step 1: Write failing tests**

```typescript
// src/lib/store/__tests__/graph.test.ts
import { describe, it, expect } from 'vitest';

// Test the pure state transition logic
describe('graph slice', () => {
  it('starts in App mode', () => {
    // viewMode should default to 'app'
    expect(true).toBe(true); // placeholder — implement after slice exists
  });

  it('toggles App → Graph', () => {
    // After calling toggleGraph(), viewMode should be 'graph'
  });

  it('toggles Graph → FPS', () => {
    // After calling enterFps(), viewMode should be 'fps'
  });

  it('Esc from FPS → Graph', () => {
    // After calling exitFps(), viewMode should be 'graph'
  });

  it('Esc from Graph → App', () => {
    // After calling exitGraph(), viewMode should be 'app'
  });
});
```

**Step 2: Create graph slice**

```typescript
// src/lib/store/slices/graph.ts
import type { PFCSet, PFCGet } from '../use-pfc-store';

export type ViewMode = 'app' | 'graph' | 'fps';

export interface GraphSliceState {
  viewMode: ViewMode;
  graphVisible: boolean;          // Bevy surface shown
  splitView: boolean;             // Notes + graph side by side
  fpsHudVisible: boolean;         // FPS overlay shown
  navigateTarget: string | null;  // Node ID to center on
}

export interface GraphSliceActions {
  toggleGraph: () => void;        // App ↔ Graph
  enterFps: () => void;           // Graph → FPS
  exitFps: () => void;            // FPS → Graph
  exitGraph: () => void;          // Graph → App
  toggleSplitView: () => void;    // Notes + Graph side by side
  navigateTo: (nodeId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
}

export function createGraphSlice(
  set: PFCSet,
  _get: PFCGet,
): GraphSliceState & GraphSliceActions {
  return {
    // State
    viewMode: 'app',
    graphVisible: false,
    splitView: false,
    fpsHudVisible: false,
    navigateTarget: null,

    // Actions
    toggleGraph: () => set((s) => {
      const newMode = s.viewMode === 'app' ? 'graph' : 'app';
      return {
        viewMode: newMode,
        graphVisible: newMode === 'graph',
        fpsHudVisible: false,
      };
    }),

    enterFps: () => set({
      viewMode: 'fps',
      graphVisible: true,
      fpsHudVisible: true,
    }),

    exitFps: () => set({
      viewMode: 'graph',
      fpsHudVisible: false,
    }),

    exitGraph: () => set({
      viewMode: 'app',
      graphVisible: false,
      fpsHudVisible: false,
      splitView: false,
    }),

    toggleSplitView: () => set((s) => ({
      splitView: !s.splitView,
      graphVisible: true,
      viewMode: 'graph',
    })),

    navigateTo: (nodeId) => set({ navigateTarget: nodeId }),

    setViewMode: (mode) => set({
      viewMode: mode,
      graphVisible: mode !== 'app',
      fpsHudVisible: mode === 'fps',
    }),
  };
}
```

**Step 3: Wire into store**

Add import and compose in `use-pfc-store.ts`:
```typescript
import { createGraphSlice } from './slices/graph';
import type { GraphSliceState, GraphSliceActions } from './slices/graph';

// Add to PFCStoreState and PFCStoreActions union types
// Add ...createGraphSlice(set, get) to create() call
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/store/__tests__/graph.test.ts`
Expected: All pass

**Step 5: Commit**

```bash
git add src/lib/store/
git commit -m "feat: graph Zustand slice — viewMode state machine (App/Graph/FPS)"
```

---

## Task 10: FPS HUD React component

The FPS overlay consumes `fps-frame` Tauri events and renders speed,
stabilization mode, crosshair, proximity label, and control hints.

**Files:**
- Create: `src/components/graph/FpsHud.tsx`
- Modify: `src/lib/tauri-bridge.ts` (wire fps-frame to store)

**Step 1: Wire fps-frame events to store**

In `tauri-bridge.ts`, update the fps-frame listener:
```typescript
await listen<FpsFrame>('fps-frame', (event) => {
  const store = usePFCStore.getState();
  store.updateFpsFrame(event.payload);
})
```

Add to graph slice:
```typescript
// State additions:
fpsSpeed: 0,
fpsStabilization: 'aiming',
fpsProximityNode: null as { node_id: string; distance: number } | null,

// Action:
updateFpsFrame: (frame: FpsFrame) => set({
  fpsSpeed: frame.speed,
  fpsStabilization: frame.stabilization,
  fpsProximityNode: frame.proximity_node,
}),
```

**Step 2: Create FPS HUD component**

```tsx
// src/components/graph/FpsHud.tsx
import { usePFCStore } from '@/lib/store/use-pfc-store';

export function FpsHud() {
  const speed = usePFCStore((s) => s.fpsSpeed);
  const stabilization = usePFCStore((s) => s.fpsStabilization);
  const proximity = usePFCStore((s) => s.fpsProximityNode);
  const visible = usePFCStore((s) => s.fpsHudVisible);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 font-mono text-white">
      {/* Stabilization badge — top left */}
      <div className="absolute top-4 left-4 px-3 py-1 rounded bg-black/50 text-sm uppercase tracking-wider">
        {stabilization}
      </div>

      {/* Speed — top right */}
      <div className="absolute top-4 right-4 px-3 py-1 rounded bg-black/50 text-sm">
        Speed: {Math.round(speed)}
      </div>

      {/* Crosshair — center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl opacity-60">
        +
      </div>

      {/* Proximity label — bottom center */}
      {proximity && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/60 border border-white/20 text-center pointer-events-auto">
          <div className="text-sm font-semibold">{proximity.node_id}</div>
          <div className="text-xs opacity-60">{proximity.distance.toFixed(1)} units</div>
        </div>
      )}

      {/* Control hints — bottom bar (fades after 10s) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 text-xs opacity-40">
        <span>[W] Fwd</span>
        <span>[A/D] Strafe</span>
        <span>[Space] Up</span>
        <span>[X] Down</span>
        <span>[Tab] Stabilize</span>
        <span>[Esc] Exit</span>
      </div>
    </div>
  );
}
```

**Step 3: Test visually**

Render `<FpsHud />` in the app shell. Set `fpsHudVisible: true` in devtools.
Expected: HUD elements appear with correct positioning.

**Step 4: Commit**

```bash
git add src/components/graph/ src/lib/
git commit -m "feat: FPS HUD overlay — speed, stabilization, crosshair, proximity"
```

---

## Task 11: FPS keyboard/mouse input handler

Captures WASD, Space, X, mouse movement, and sends to Rust via `fps_input`
command. Manages pointer lock for mouse-look.

**Files:**
- Create: `src/components/graph/FpsInputHandler.tsx`
- Create: `src/hooks/use-pointer-lock.ts`

**Step 1: Create pointer lock hook**

```typescript
// src/hooks/use-pointer-lock.ts
import { useCallback, useEffect, useRef } from 'react';

export function usePointerLock() {
  const isLocked = useRef(false);

  const lock = useCallback(() => {
    document.documentElement.requestPointerLock();
  }, []);

  const unlock = useCallback(() => {
    document.exitPointerLock();
  }, []);

  useEffect(() => {
    const onChange = () => {
      isLocked.current = !!document.pointerLockElement;
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  return { lock, unlock, isLocked };
}
```

**Step 2: Create input handler component**

```tsx
// src/components/graph/FpsInputHandler.tsx
import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { usePointerLock } from '@/hooks/use-pointer-lock';

export function FpsInputHandler() {
  const viewMode = usePFCStore((s) => s.viewMode);
  const { lock, unlock } = usePointerLock();
  const keys = useRef(new Set<string>());
  const mouseAccum = useRef({ dx: 0, dy: 0 });
  const rafId = useRef<number>(0);

  useEffect(() => {
    if (viewMode !== 'fps') {
      unlock();
      return;
    }
    lock();

    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      // Tab = toggle stabilization
      if (e.code === 'Tab') {
        e.preventDefault();
        invoke('fps_input', {
          input: { forward: 0, strafe: 0, vertical: 0, mouse_dx: 0, mouse_dy: 0, toggle_stabilization: true },
        });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onMouseMove = (e: MouseEvent) => {
      mouseAccum.current.dx += e.movementX;
      mouseAccum.current.dy += e.movementY;
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);

    // Send input at 60fps (requestAnimationFrame)
    const sendInput = () => {
      const k = keys.current;
      const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 2.5 : 1.0;
      const forward = ((k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)) * boost;
      const strafe = ((k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)) * boost;
      const vertical = ((k.has('Space') ? 1 : 0) - (k.has('KeyX') ? 1 : 0)) * boost;

      invoke('fps_input', {
        input: {
          forward,
          strafe,
          vertical,
          mouse_dx: mouseAccum.current.dx,
          mouse_dy: mouseAccum.current.dy,
          toggle_stabilization: false,
        },
      });
      mouseAccum.current = { dx: 0, dy: 0 };
      rafId.current = requestAnimationFrame(sendInput);
    };
    rafId.current = requestAnimationFrame(sendInput);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(rafId.current);
      unlock();
    };
  }, [viewMode, lock, unlock]);

  return null; // Invisible — just handles input
}
```

**Step 3: Mount in app shell**

Add `<FpsInputHandler />` and `<FpsHud />` to the root layout.

**Step 4: Commit**

```bash
git add src/components/graph/ src/hooks/
git commit -m "feat: FPS input handler — WASD/mouse to fps_input with pointer lock"
```

---

## Task 12: Knowledge Probe mesh (icosahedron vessel)

Spawn the player vessel when FPS mode activates. Uses Bevy's `Icosphere` mesh
primitive with emissive material.

**Files:**
- Create: `crates/graph-render/src/probe.rs`
- Modify: `crates/graph-render/src/lib.rs`

**Step 1: Create probe rendering module**

```rust
// crates/graph-render/src/probe.rs
use bevy::prelude::*;
use ui_physics::fps_mode::FpsFrame;
use std::sync::{Arc, Mutex};

/// Tag for the Knowledge Probe entity.
#[derive(Component)]
pub struct KnowledgeProbe;

/// Shared FPS frame buffer (written by physics loop, read by Bevy).
#[derive(Resource, Clone)]
pub struct FpsFrameBuffer {
    inner: Arc<Mutex<Option<FpsFrame>>>,
}

impl FpsFrameBuffer {
    pub fn new() -> Self {
        Self { inner: Arc::new(Mutex::new(None)) }
    }

    pub fn write(&self, frame: FpsFrame) {
        if let Ok(mut buf) = self.inner.lock() {
            *buf = Some(frame);
        }
    }

    pub fn read(&self) -> Option<FpsFrame> {
        self.inner.lock().ok().and_then(|f| f.clone())
    }
}

/// Spawn the probe when entering FPS mode.
pub fn spawn_probe(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    probe_query: Query<Entity, With<KnowledgeProbe>>,
) {
    // Only spawn if not already present
    if !probe_query.is_empty() { return; }

    commands.spawn((
        Mesh3d(meshes.add(Sphere::new(2.0).mesh().ico(2).unwrap())),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgba(0.2, 0.5, 1.0, 0.8),
            emissive: LinearRgba::new(0.3, 0.6, 1.0, 1.0),
            alpha_mode: AlphaMode::Blend,
            ..default()
        })),
        Transform::from_xyz(0.0, 0.0, 0.0),
        KnowledgeProbe,
    ));
}

/// Update probe position from FPS frame data.
pub fn sync_probe_position(
    fps_buffer: Res<FpsFrameBuffer>,
    mut query: Query<&mut Transform, With<KnowledgeProbe>>,
) {
    let Some(frame) = fps_buffer.read() else { return };
    let Ok(mut t) = query.get_single_mut() else { return };
    t.translation = Vec3::new(frame.x, frame.y, frame.z);
    t.rotation = Quat::from_euler(EulerRot::YXZ, frame.yaw, frame.pitch, 0.0);
}

/// Despawn probe when leaving FPS mode.
pub fn despawn_probe(
    mut commands: Commands,
    query: Query<Entity, With<KnowledgeProbe>>,
) {
    for entity in &query {
        commands.entity(entity).despawn_recursive();
    }
}
```

**Step 2: Register systems conditionally**

Systems should run based on physics mode. Use a Bevy `State` or check a resource.

**Step 3: Commit**

```bash
git add crates/graph-render/
git commit -m "feat: Knowledge Probe icosahedron mesh with emissive glow"
```

---

## Task 13: Global keyboard shortcuts (G, F, Esc)

Wire the top-level mode transitions: G toggles graph, F enters FPS, Esc exits.

**Files:**
- Create: `src/hooks/use-graph-shortcuts.ts`
- Modify: Root layout to mount the hook

**Step 1: Create shortcut hook**

```typescript
// src/hooks/use-graph-shortcuts.ts
import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePFCStore } from '@/lib/store/use-pfc-store';

export function useGraphShortcuts() {
  const viewMode = usePFCStore((s) => s.viewMode);

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      // Don't intercept when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      const store = usePFCStore.getState();

      switch (e.code) {
        case 'KeyG':
          if (e.shiftKey && store.viewMode === 'app') {
            // Shift+G: split view
            store.toggleSplitView();
          } else if (store.viewMode === 'app') {
            // G: toggle graph
            store.toggleGraph();
            await invoke('start_physics');
          }
          break;

        case 'KeyF':
          if (store.viewMode === 'graph') {
            // F: enter FPS mode
            const mode = await invoke<string>('toggle_fps_mode');
            if (mode === 'Fps') {
              store.enterFps();
            }
          }
          break;

        case 'Escape':
          if (store.viewMode === 'fps') {
            // Esc from FPS → Graph
            await invoke<string>('toggle_fps_mode');
            store.exitFps();
          } else if (store.viewMode === 'graph') {
            // Esc from Graph → App
            store.exitGraph();
          }
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [viewMode]);
}
```

**Step 2: Mount in app shell**

```tsx
// In app-shell.tsx or App.tsx
import { useGraphShortcuts } from '@/hooks/use-graph-shortcuts';
// Inside component:
useGraphShortcuts();
```

**Step 3: Test manually**

Run: `npm run tauri dev` → press G (graph appears), press F (FPS activates + HUD), press Esc (back to graph), Esc again (back to app).

**Step 4: Commit**

```bash
git add src/hooks/ src/components/
git commit -m "feat: global keyboard shortcuts — G (graph), F (FPS), Esc (exit)"
```

---

## Task 14: FPS chase camera

In FPS mode, the Bevy camera follows the Knowledge Probe. Position and
rotation come from the FPS frame data.

**Files:**
- Modify: `crates/graph-render/src/camera.rs`

**Step 1: Add FPS camera system**

```rust
// In camera.rs, add:

use crate::probe::{FpsFrameBuffer, KnowledgeProbe};

/// In FPS mode, camera follows the probe from behind/above.
pub fn fps_chase_camera(
    fps_buffer: Res<FpsFrameBuffer>,
    mut camera_query: Query<&mut Transform, (With<GraphCamera>, Without<KnowledgeProbe>)>,
) {
    let Some(frame) = fps_buffer.read() else { return };
    let Ok(mut cam) = camera_query.get_single_mut() else { return };

    let player_pos = Vec3::new(frame.x, frame.y, frame.z);

    // Chase offset: behind and above the probe
    let (sin_yaw, cos_yaw) = frame.yaw.sin_cos();
    let behind = Vec3::new(-sin_yaw, 0.3, -cos_yaw) * 15.0;
    let above = Vec3::Y * 5.0;

    cam.translation = player_pos + behind + above;
    cam.look_at(player_pos, Vec3::Y);
}
```

**Step 2: Conditionally run orbit vs chase camera**

Use a Bevy `State<PhysicsMode>` resource that switches between Graph and FPS.
- Graph mode: run `orbit_camera_input` + `apply_orbit_camera`
- FPS mode: run `fps_chase_camera`

**Step 3: Commit**

```bash
git add crates/graph-render/
git commit -m "feat: FPS chase camera — follows Knowledge Probe from behind"
```

---

## Task 15: Auto-navigate — graph follows current note

When the user views a note, the graph camera smoothly centers on that note's
node. React emits a `navigateTo(nodeId)` action; Bevy interpolates the camera.

**Files:**
- Modify: `crates/graph-render/src/camera.rs` (target interpolation)
- Modify: `src/lib/tauri-bridge.ts` (emit navigate-graph event)
- Create: Tauri command `navigate_graph` (optional — or use shared buffer)

**Step 1: Add target interpolation to orbit camera**

```rust
// In camera.rs, modify apply_orbit_camera:

pub fn apply_orbit_camera(
    state: Res<OrbitState>,
    time: Res<Time>,
    mut actual_target: Local<Vec3>,
    mut query: Query<&mut Transform, With<GraphCamera>>,
) {
    // Smoothly interpolate toward the desired target
    let lerp_speed = 3.0 * time.delta_secs();
    *actual_target = actual_target.lerp(state.target, lerp_speed.min(1.0));

    let Ok(mut transform) = query.get_single_mut() else { return };
    // ... use *actual_target instead of state.target for camera position
}
```

**Step 2: Wire navigateTo from React**

When a note is opened/selected:
```typescript
// In notes-related components:
const navigateTo = usePFCStore((s) => s.navigateTo);
// On note selection:
navigateTo(noteNodeId);
```

The `navigateTarget` from the Zustand store is sent to Bevy via a shared buffer
or Tauri command that updates the `OrbitState.target`.

**Step 3: Commit**

```bash
git add crates/graph-render/ src/
git commit -m "feat: auto-navigate — graph camera smoothly follows current note"
```

---

## Task 16: Split-view layout (Notes + Graph)

Shift+G splits the view: notes on the left (60%), graph on the right (40%).

**Files:**
- Create: `src/components/graph/GraphSplitView.tsx`
- Modify: App shell layout to support split mode

**Step 1: Create split-view container**

```tsx
// src/components/graph/GraphSplitView.tsx
import { usePFCStore } from '@/lib/store/use-pfc-store';

export function GraphSplitView({ children }: { children: React.ReactNode }) {
  const splitView = usePFCStore((s) => s.splitView);

  if (!splitView) return <>{children}</>;

  return (
    <div className="flex h-full w-full">
      {/* Notes panel: 60% */}
      <div className="w-[60%] h-full overflow-auto border-r border-white/10">
        {children}
      </div>
      {/* Graph panel: 40% — Bevy renders here, this div is transparent */}
      <div className="w-[40%] h-full relative">
        {/* Bevy surface shows through the transparent background */}
        <div className="absolute inset-0 pointer-events-none" />
      </div>
    </div>
  );
}
```

**Step 2: Wrap page content with split-view**

In the notes/page layout:
```tsx
<GraphSplitView>
  <NotesEditor />
</GraphSplitView>
```

**Step 3: Commit**

```bash
git add src/components/graph/
git commit -m "feat: split-view layout — Shift+G shows notes (60%) + graph (40%)"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `cargo check --workspace` — no errors
- [ ] `cargo test --workspace` — all tests pass (370+ existing + new)
- [ ] `cargo clippy --workspace -- -D warnings` — clean
- [ ] `npm run tauri dev` — app launches with Bevy background
- [ ] Press G → graph nodes appear as spheres
- [ ] HJKL pans, +/- zooms, R resets
- [ ] Press F → FPS mode, probe spawns, HUD appears
- [ ] WASD flies, mouse looks, Tab cycles stabilization
- [ ] Esc → back to graph, Esc → back to app
- [ ] Shift+G → split view with graph on right

---

## Architecture Reference

```
┌────────────────────────────────────────────────────────┐
│                   TAO Native Window                     │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Bevy + wgpu Render Surface (bottom, opaque)     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │  │
│  │  │ Node     │  │ Edge     │  │ Knowledge    │   │  │
│  │  │ Spheres  │──│ Lines    │  │ Probe (FPS)  │   │  │
│  │  └──────────┘  └──────────┘  └──────────────┘   │  │
│  │  Camera: Orbit (graph) | Chase (FPS)             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Transparent React Webview (top)                  │  │
│  │  ┌────────┐ ┌──────────┐ ┌──────────────────┐   │  │
│  │  │Sidebar │ │FPS HUD   │ │Notes/Chat panels │   │  │
│  │  │(always)│ │(FPS only)│ │(app mode)        │   │  │
│  │  └────────┘ └──────────┘ └──────────────────┘   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Rust Backend (shared)                            │  │
│  │  Rapier3D 90Hz → FrameBuffer → Bevy reads        │  │
│  │  FpsInput buffer → Physics loop → FpsFrame event  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

## Data Flow Summary

```
Physics Loop (90Hz, tokio::spawn)
  ├── Writes PhysicsFrame → FrameBuffer (Arc<Mutex>)
  ├── Emits "physics-frame" Tauri event → React (for future label overlay)
  ├── Writes FpsFrame → FpsFrameBuffer (Arc<Mutex>)
  └── Emits "fps-frame" Tauri event → React HUD

Bevy Render Loop (vsync, std::thread)
  ├── Reads FrameBuffer → updates node Transform components
  ├── Reads FpsFrameBuffer → updates probe Transform + chase camera
  └── Renders to wgpu Surface (shared with Tauri window)

React Input (60fps, requestAnimationFrame)
  └── invoke("fps_input") → fps_input_pending Mutex (< 1μs lock)

Mode Transitions
  └── invoke("toggle_fps_mode") → PhysicsWorld state change
```
