# FPS Exploration Mode — Knowledge Graph as No Man's Sky

**Status:** Queued (post-build)
**Inspiration:** [bevy-space-physics](https://github.com/SKY-ALIN/bevy-space-physics)
**Priority:** Post-Phase 8 polish feature — the quirk of the Retro Edition

---

## Concept

Toggle on the graph view to drop into first-person. The knowledge graph becomes a universe:
nodes are celestial bodies, clusters are solar systems, and the player pilots a small ship
between them with thruster controls.

## Core Design Decision

**Freeze the graph, fly through it.**

When FPS mode activates:
1. Graph spring physics **stops** — nodes freeze at current positions
2. Nodes become static celestial bodies (no jittering, no layout forces)
3. Player ship spawns at current camera position
4. Newtonian gravity kicks in — nodes pull the player gently based on importance
5. Thruster controls: WASD + mouse look + stabilization toggles

## Physics Model (from bevy-space-physics)

Extract three algorithms — no Bevy dependency needed, pure Rust math in `ui-physics` crate:

### 1. N-body Gravity (~30 lines)
```
F = G × m1 × m2 / r²
```
- Node mass = edge_count × base_mass (important nodes = stronger pull)
- G scaled way down so gravity is gentle — suggestive, not trapping
- Only compute for nodes within render distance (frustum cull)

### 2. Thruster Controller (~40 lines)
- WASD → desired_movement_vector (local space)
- Mouse → desired_rotation_vector
- Each thruster has a direction; fires when `dot(thruster_dir, desired) < 0`
- Main thruster: strong forward push. Side thrusters: gentle strafing.

### 3. Momentum Integration (~15 lines)
```
velocity += acceleration × dt
position += velocity × dt
angular_velocity += angular_acceleration × dt
rotation *= Quat::from_axis_angle(angular_axis, angular_speed × dt)
```

### Stabilization Modes (from bevy-space-physics)
- **Rotation stabilization:** None → Aiming → Full (auto-dampens spin)
- **Movement stabilization:** None ↔ Full (auto-dampens drift)
- Toggle with keyboard shortcuts

## Node → Celestial Body Mapping

| Graph Concept | FPS Representation |
|--------------|-------------------|
| Note node | Planet / asteroid |
| Concept node | Star (glowing) |
| Tag node | Space station (geometric) |
| Chat node | Satellite |
| Edge (supports) | Green tether / orbit trail |
| Edge (contradicts) | Red warning beacon |
| Cluster | Solar system |
| Isolated node | Distant star |

## Interaction

- **Proximity HUD:** Flying within range of a node shows its title + preview
- **Landing:** Getting very close opens the note/chat in a side panel
- **Waypoints:** Graph search results appear as beacon markers with distance
- **Minimap:** Small overhead graph view in corner showing your position
- **Warp:** Double-click a node in minimap to warp near it

## Scale

Force-layout positions (~1000 unit radius) need to be **scaled up 100-1000x** for FPS to feel
like exploration, not a crowded room. Clusters should feel like they're light-years apart.

Consider `big_space` crate (64-bit grid cells) if floating-point jitter becomes visible at
large scales.

## Ship Visual

Use the actual ship model/concept from bevy-space-physics repo — a small thruster-equipped
vessel. Render with the same WGSL shader pipeline as graph nodes but with:
- Engine glow particles (on thrust)
- Stabilization indicator lights
- Camera mounted behind/above ship (third-person) or cockpit (first-person toggle)

## Implementation Location

`crates/ui-physics/src/fps_mode.rs` — new module alongside existing spring layout.
Shares the same position output format so the renderer doesn't care which mode produced
the coordinates.

## Files to Create
- `crates/ui-physics/src/fps_mode.rs` — gravity + thrusters + integration
- `crates/ui-physics/src/fps_player.rs` — input mapping + stabilization
- Tauri command: `toggle_fps_mode` + `fps_input` (keyboard/mouse events)
- Frontend: FPS HUD overlay component, crosshair, proximity info panel

## Files to Modify
- `crates/ui-physics/src/lib.rs` — add fps_mode module, PhysicsMode enum
- `crates/graph-render/src/lib.rs` — node-as-celestial-body rendering
- `src/lib/tauri-bridge.ts` — listen for fps-specific events (proximity, warp)
