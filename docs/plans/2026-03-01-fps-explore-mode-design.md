# FPS Explore Mode — Design Document

> Approved 2026-03-01. Implementation begins AFTER Phase 4 hardening is complete.

---

## 1. Architecture — Dual-Surface Rendering

The original Retro Edition design specifies a **dual-surface architecture** and the
engineering standards explicitly forbid JavaScript-based graph rendering. FPS Explore
Mode follows this architecture:

```
TAO Native Window
├── Bevy + wgpu Render Surface (bottom, opaque)
│   ├── Graph mode: force-directed node layout (spheres + edges)
│   ├── FPS mode: frozen nodes as celestial bodies + Knowledge Probe vessel
│   ├── WGSL shaders: glow, particles, edge tethers, bloom
│   └── Rapier3D: physics simulation (spring layout OR N-body + thrusters)
│
└── Transparent React Webview (top)
    ├── Graph mode: node labels, search overlay, sidebar
    ├── FPS mode: HUD (speed, stabilization, crosshair, proximity label)
    └── App mode: notes editor, chat, landing page
```

**Why dual-surface, not Three.js/WebGPU canvas:**
- Native GPU performance via wgpu (no JS overhead on render path)
- Shared Rapier3D physics — same simulation drives both graph and FPS
- React handles UI only (text, overlays, panels) — what DOM does best
- Matches the macOS Opulent Edition's Metal rendering approach

The Bevy render surface runs **inside the Tauri window** beneath the transparent
webview. React overlays float on top. The two communicate via Tauri events
(`physics-frame`, `fps-frame`) at 90Hz.

---

## 2. View Modes & Transitions

Three application states with seamless transitions:

```
         ┌─────────────────────────────────────────┐
         │                APP MODE                   │
         │   Landing page, notes, chat, settings     │
         └────────────┬──────────────────────────────┘
                      │ G key (or button)
                      ▼
         ┌─────────────────────────────────────────┐
         │              GRAPH MODE                   │
         │   Overhead orbit view of knowledge graph  │
         │   Bevy renders nodes + edges underneath   │
         │   React renders labels + search overlay   │
         └────────────┬──────────────────────────────┘
                      │ F key
                      ▼
         ┌─────────────────────────────────────────┐
         │           FPS EXPLORE MODE                │
         │   First-person flight through the graph   │
         │   Knowledge Probe vessel, N-body gravity  │
         │   React renders HUD overlay               │
         └─────────────────────────────────────────┘
                      │ Esc → Graph  │  Esc Esc → App
```

### Transition Animations

**App → Graph (G key):** The Bevy surface fades in from behind the React UI.
React panels slide to the side (sidebar remains). ~300ms ease-out.

**Graph → FPS (F key):** Zoom-dive. Camera smoothly dives from overhead orbit
INTO the graph, decelerating at the centroid. Nodes scale up to celestial-body
size. Knowledge Probe materializes at the dive endpoint. ~1.5s cinematic.

**FPS → Graph (Esc):** Reverse zoom — camera pulls back to overhead. Probe
dissolves. Nodes shrink back to graph scale. ~1.0s.

**Split-view (Shift+G from notes):** The notes panel takes 60% width. The graph
renders in the remaining 40% on the right. Graph auto-navigates to the node
corresponding to the current note/folder/block.

---

## 3. Knowledge Probe (Player Vessel)

An **icosahedron** — 20 triangular faces — chosen for its organic geometry that
evokes both a microscope probe and a celestial body.

### Visual Design

- **Base mesh:** Icosahedron, ~2 world units radius
- **Material:** Semi-transparent with emissive inner glow (theme-aware color)
- **Particle trail:** 20-30 small particles emitted from rear face on thrust
- **Thruster glow:** Rear faces brighten on forward thrust, side faces on strafe
- **Idle pulse:** Gentle breathing glow cycle (~2s period) when stationary
- **Theme colors:** Probe adapts to the active UI theme
  - Default: electric blue core, white edge highlights
  - Dark themes: neon cyan / magenta
  - Light themes: deep indigo / gold

### Physics

- **Rapier3D dynamic body:** Ball collider (radius 1.0), mass 10.0
- **Main thruster:** 50.0 N forward/backward
- **Lateral thrusters:** 30.0 N strafe/up/down
- **Boost (Shift held):** 2.5x multiplier on all thrusters
- **Max speed:** Soft-capped at 500 units/s via progressive drag

---

## 4. FPS HUD Overlay (React)

The HUD is a React component consuming `fps-frame` Tauri events. All elements
are positioned with CSS `position: fixed` on the transparent webview.

```
┌─────────────────────────────────────────────────┐
│ [AIMING]                              Speed: 42 │
│                                                 │
│                                                 │
│                    +                            │
│                                                 │
│                                                 │
│           ╭─── Quantum Mechanics ───╮           │
│           │ 12.4 units away         │           │
│           ╰─────────────────────────╯           │
│                                                 │
│ [W] Fwd  [A/D] Strafe  [Space] Up  [Tab] Stab  │
└─────────────────────────────────────────────────┘
```

### HUD Elements

| Element | Position | Data Source |
|---------|----------|-------------|
| Stabilization mode badge | Top-left | `fps-frame.stabilization` |
| Speed readout | Top-right | `fps-frame.speed` |
| Crosshair (+) | Center | Static CSS |
| Proximity node label | Bottom-center | `fps-frame.proximity_node` |
| Control hints | Bottom bar | Static (fade after 10s) |

The proximity label appears when the player is within range of a node. Clicking
the label (or pressing Enter) opens that note in a side panel.

---

## 5. Keyboard Shortcuts (Vim-Inspired)

### Global

| Key | Action | Context |
|-----|--------|---------|
| `G` | Toggle graph view | App mode |
| `Shift+G` | Split-view (notes + graph) | Notes mode |
| `F` | Enter FPS explore mode | Graph mode |
| `Esc` | Exit current mode (FPS → Graph → App) | Any |
| `/` | Search nodes | Graph / FPS mode |

### FPS Mode

| Key | Action |
|-----|--------|
| `W` / `S` | Forward / backward thrust |
| `A` / `D` | Strafe left / right |
| `Space` | Thrust up |
| `X` | Thrust down |
| `Shift` (held) | Boost (2.5x thrust) |
| `Tab` | Cycle stabilization (None → Aiming → Full) |
| `E` | Interact with nearest node (open note) |
| `Q` | Toggle minimap |
| `1-3` | Direct stabilization select |
| Mouse | Yaw / pitch (pointer-locked) |

### Graph Mode

| Key | Action |
|-----|--------|
| `H` / `L` | Pan left / right |
| `J` / `K` | Pan down / up |
| `+` / `-` | Zoom in / out |
| `C` | Center on selected node |
| `R` | Reset camera to default orbit |

---

## 6. Data Flow

### Physics → Rendering

```
Rapier3D (90Hz tick in Rust)
    │
    ├── Graph mode: PhysicsFrame { positions: Vec<NodePosition>, settled: bool }
    │     └── Tauri emit("physics-frame") → Bevy consumes → renders node spheres
    │
    └── FPS mode: FpsFrame { x, y, z, yaw, pitch, speed, proximity_node, stabilization }
          ├── Tauri emit("fps-frame") → Bevy positions camera + probe mesh
          └── Tauri emit("fps-frame") → React renders HUD overlay
```

### Input → Physics

```
React (keydown/mousemove)
    └── invoke("fps_input", { forward, strafe, vertical, mouse_dx, mouse_dy, toggle_stabilization })
          └── Writes to fps_input_pending Mutex (NOT physics mutex — decoupled)
                └── Physics loop drains buffer each tick (< 1μs lock)
```

### Mode Transitions

```
React: invoke("toggle_fps_mode")
    └── Rust: PhysicsWorld.toggle_fps_mode()
          ├── Graph → FPS: freeze all nodes (set Fixed), spawn player at centroid
          └── FPS → Graph: remove player body, unfreeze nodes, resume spring layout
              └── Returns new mode string ("Graph" | "Fps")
```

---

## 7. Auto-Navigate (Graph Follows Context)

When graph is visible (full-screen or split-view), it automatically navigates
to the node representing the user's current context:

| Context | Navigation |
|---------|------------|
| Viewing a note | Center on that note's node |
| Browsing a folder | Center on folder node, highlight children |
| Editing a block | Highlight block's parent note node + zoom slightly |
| Mentioning `[[Another Note]]` | Animate edge glow from current to mentioned node |
| Search results | Highlight matching nodes as beacons |

Implementation: React emits a `navigate-graph` event with `{ target_node_id }`.
Bevy smoothly interpolates the camera toward that node (~500ms ease-out).
In FPS mode, auto-navigate places a waypoint beacon instead of moving the camera
(the player is in control).

---

## Backend Status (Already Implemented)

The entire FPS physics backend exists and is tested:

| Module | File | Status |
|--------|------|--------|
| N-body gravity | `crates/ui-physics/src/fps_mode.rs` | Complete (4 tests) |
| Thruster controller | `crates/ui-physics/src/fps_mode.rs` | Complete |
| Stabilization | `crates/ui-physics/src/fps_mode.rs` | Complete (3 modes) |
| Player state | `crates/ui-physics/src/fps_player.rs` | Complete (3 tests) |
| World integration | `crates/ui-physics/src/world.rs` | Complete (toggle, enter, exit, step) |
| Tauri commands | `src-tauri/src/commands/physics.rs` | Complete (toggle, input, mode query) |
| Decoupled input | `src-tauri/src/commands/physics.rs` | Complete (separate mutex) |
| Physics loop | `src-tauri/src/commands/physics.rs` | Complete (90Hz, settled throttle) |

### What Remains (Frontend + Rendering)

1. **Bevy scene setup** — `crates/graph-render/` (currently empty `lib.rs`)
   - Bevy app with wgpu surface
   - Node sphere meshes + edge line meshes
   - Knowledge Probe mesh + particle system
   - Camera system (orbit for graph, chase for FPS)
   - WGSL shaders (glow, bloom, edge tethers)

2. **React HUD components**
   - `src/components/graph/GraphCanvas.tsx` — receives physics-frame, positions Bevy surface
   - `src/components/graph/FpsHud.tsx` — receives fps-frame, renders overlay
   - `src/components/graph/GraphSplitView.tsx` — split-view container
   - `src/components/graph/Minimap.tsx` — small overhead view

3. **Tauri window configuration**
   - Dual-surface setup (Bevy underneath, transparent webview on top)
   - Pointer lock for FPS mouse-look
   - Keyboard shortcut registration

---

## Appendix: Inspiration

- **bevy-space-physics** (https://github.com/SKY-ALIN/bevy-space-physics):
  SpaceObject component, N-body gravity (G = 6.67430e-11), thruster decomposition,
  stabilization dampening, camera chase system.
- **No Man's Sky**: Seamless planet-to-space transitions, waypoint beacons.
- **Obsidian Graph View**: Node-as-knowledge, proximity-based detail reveal.
