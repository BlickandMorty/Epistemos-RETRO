# Phase 1: Foundation + 2D Graph — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold Epistemos Retro v2 as a pure-Rust Bevy application with a working 2D knowledge graph, glass morphism UI, and basic notes/settings panels.

**Architecture:** Single Bevy App with ECS-native graph (each node = Entity), Rapier3D physics constrained to 2D plane, egui overlay for chrome panels, custom WGSL shaders for glass morphism blur. Database and types reused from v1 crates.

**Tech Stack:** bevy 0.18, bevy_egui 0.39, bevy_rapier3d 0.33, rusqlite (bundled), tokio, serde

---

## Task 1: Scaffold Project & Cargo Workspace

**Files:**
- Create: `~/Epistemos-RETRO-v2/Cargo.toml`
- Create: `~/Epistemos-RETRO-v2/crates/app/Cargo.toml`
- Create: `~/Epistemos-RETRO-v2/crates/app/src/main.rs`
- Create: `~/Epistemos-RETRO-v2/.gitignore`
- Create: `~/Epistemos-RETRO-v2/CLAUDE.md`

**Step 1: Create directory structure**

```bash
mkdir -p ~/Epistemos-RETRO-v2/crates/{app/src,graph/src,physics/src,ui/src,render/src,animation/src,theme/src}
mkdir -p ~/Epistemos-RETRO-v2/{assets/shaders,assets/fonts,docs/plans}
```

**Step 2: Create workspace Cargo.toml**

```toml
# ~/Epistemos-RETRO-v2/Cargo.toml
[workspace]
resolver = "2"
members = [
    "crates/app",
    "crates/storage",
    "crates/engine",
    "crates/embeddings",
    "crates/sync",
    "crates/graph",
    "crates/physics",
    "crates/ui",
    "crates/render",
    "crates/animation",
    "crates/theme",
]

[workspace.dependencies]
bevy = "0.18"
bevy_egui = "0.39"
bevy_rapier3d = "0.33"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
thiserror = "2"
uuid = { version = "1", features = ["v4", "serde"] }
rusqlite = { version = "0.32", features = ["bundled"] }
rustc-hash = "2"
fst = "0.4"
reqwest = { version = "0.12", features = ["json", "stream"] }
similar = "2"
regex = "1"
futures = "0.3"
async-trait = "0.1"
chrono = "0.4"
log = "0.4"
env_logger = "0.11"
```

**Step 3: Create app crate Cargo.toml**

```toml
# ~/Epistemos-RETRO-v2/crates/app/Cargo.toml
[package]
name = "epistemos"
version = "2.0.0"
edition = "2021"

[[bin]]
name = "epistemos"
path = "src/main.rs"

[dependencies]
bevy = { workspace = true }
bevy_egui = { workspace = true }
bevy_rapier3d = { workspace = true }
storage = { path = "../storage" }
graph = { path = "../graph" }
physics = { path = "../physics" }
ui = { path = "../ui" }
render = { path = "../render" }
animation = { path = "../animation" }
theme = { path = "../theme" }
log = { workspace = true }
env_logger = { workspace = true }
```

**Step 4: Create minimal main.rs**

```rust
// ~/Epistemos-RETRO-v2/crates/app/src/main.rs
use bevy::prelude::*;

fn main() {
    env_logger::init();

    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Epistemos".into(),
                resolution: (1600., 900.).into(),
                ..default()
            }),
            ..default()
        }))
        .run();
}
```

**Step 5: Copy 4 kept crates from v1**

```bash
cp -r ~/Epistemos-RETRO/crates/storage ~/Epistemos-RETRO-v2/crates/storage
cp -r ~/Epistemos-RETRO/crates/engine ~/Epistemos-RETRO-v2/crates/engine
cp -r ~/Epistemos-RETRO/crates/embeddings ~/Epistemos-RETRO-v2/crates/embeddings
cp -r ~/Epistemos-RETRO/crates/sync ~/Epistemos-RETRO-v2/crates/sync
```

**Step 6: Remove `specta` dependency from copied crates**

The copied crates have `specta` (Tauri TypeScript binding generator) which we no longer need. Remove `specta` from each crate's Cargo.toml and strip `#[derive(specta::Type)]` from all structs. This is a find-and-replace across 4 crates:

- In each crate's `Cargo.toml`: remove the `specta = ...` line
- In each crate's `.rs` files: remove `specta::Type` from derive macros, remove `use specta` imports

**Step 7: Create stub Cargo.toml for new crates**

Each new crate (graph, physics, ui, render, animation, theme) needs a minimal Cargo.toml and lib.rs:

```toml
# Template for each — adjust [package] name
[package]
name = "graph"  # or physics, ui, render, animation, theme
version = "0.1.0"
edition = "2021"

[dependencies]
bevy = { workspace = true }
```

```rust
// src/lib.rs for each stub
pub fn placeholder() {}
```

**Step 8: Verify workspace compiles**

```bash
cd ~/Epistemos-RETRO-v2 && cargo check
```

Expected: compiles with no errors (stubs + copied crates).

**Step 9: Create .gitignore**

```
/target
*.swp
*.swo
.DS_Store
```

**Step 10: Create CLAUDE.md**

Copy from v1 and update: remove all Tauri/React/Canvas/D3 references. Update tech stack table to reflect Bevy+egui. Keep all golden rules and code quality standards.

**Step 11: Init git and commit**

```bash
cd ~/Epistemos-RETRO-v2
git init
git add -A
git commit -m "feat: scaffold Epistemos Retro v2 workspace

Bevy 0.18 + egui + Rapier3D. Copied storage, engine, embeddings,
sync crates from v1. Stub crates for graph, physics, ui, render,
animation, theme."
```

---

## Task 2: Storage Plugin — Wire Database into Bevy

**Files:**
- Create: `crates/storage/src/plugin.rs`
- Modify: `crates/storage/src/lib.rs`
- Create: `crates/storage/tests/plugin_test.rs`

**Step 1: Write the failing test**

```rust
// crates/storage/tests/plugin_test.rs
use bevy::prelude::*;
use storage::StoragePlugin;

#[test]
fn storage_plugin_provides_database_resource() {
    let mut app = App::new();
    app.add_plugins(MinimalPlugins);
    app.add_plugins(StoragePlugin::in_memory());
    app.update();

    let db = app.world().get_resource::<storage::DbResource>();
    assert!(db.is_some(), "StoragePlugin should insert DbResource");
}
```

**Step 2: Run test to verify it fails**

```bash
cd ~/Epistemos-RETRO-v2 && cargo test -p storage plugin_test -- --nocapture
```

Expected: FAIL — `StoragePlugin` doesn't exist yet.

**Step 3: Implement StoragePlugin**

```rust
// crates/storage/src/plugin.rs
use bevy::prelude::*;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use crate::db::Database;

/// Thread-safe wrapper around Database for Bevy.
/// rusqlite Connection is not Send, so we wrap in Mutex.
#[derive(Resource, Clone)]
pub struct DbResource {
    inner: Arc<Mutex<Database>>,
}

impl DbResource {
    pub fn with<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&Database) -> R,
    {
        let db = self.inner.lock().expect("db mutex poisoned");
        f(&db)
    }
}

pub struct StoragePlugin {
    path: Option<PathBuf>,
}

impl StoragePlugin {
    pub fn new(path: PathBuf) -> Self {
        Self { path: Some(path) }
    }

    pub fn in_memory() -> Self {
        Self { path: None }
    }
}

impl Plugin for StoragePlugin {
    fn build(&self, app: &mut App) {
        let db = match &self.path {
            Some(p) => Database::open(p).expect("failed to open database"),
            None => Database::open_in_memory().expect("failed to open in-memory database"),
        };
        app.insert_resource(DbResource {
            inner: Arc::new(Mutex::new(db)),
        });
    }
}
```

**Step 4: Add bevy dependency to storage crate Cargo.toml**

```toml
[dependencies]
bevy = { workspace = true }
# ... existing deps ...
```

**Step 5: Export plugin from lib.rs**

Add to `crates/storage/src/lib.rs`:

```rust
pub mod plugin;
pub use plugin::{StoragePlugin, DbResource};
```

**Step 6: Run test to verify it passes**

```bash
cargo test -p storage plugin_test -- --nocapture
```

Expected: PASS

**Step 7: Commit**

```bash
git add crates/storage/src/plugin.rs crates/storage/src/lib.rs crates/storage/tests/plugin_test.rs crates/storage/Cargo.toml
git commit -m "feat(storage): add Bevy StoragePlugin with DbResource"
```

---

## Task 3: Graph Plugin — ECS Graph Builder

**Files:**
- Create: `crates/graph/src/lib.rs`
- Create: `crates/graph/src/plugin.rs`
- Create: `crates/graph/src/components.rs`
- Create: `crates/graph/src/systems.rs`
- Create: `crates/graph/src/builder.rs`
- Create: `crates/graph/tests/builder_test.rs`
- Modify: `crates/graph/Cargo.toml`

**Step 1: Define graph components**

```rust
// crates/graph/src/components.rs
use bevy::prelude::*;
use storage::types::GraphNodeType;

/// Marker for all graph node entities.
#[derive(Component)]
pub struct GraphNode {
    pub node_type: GraphNodeType,
    pub source_id: String,
    pub label: String,
    pub weight: f64,
}

/// Marker for all graph edge entities.
#[derive(Component)]
pub struct GraphEdge {
    pub edge_type: storage::types::GraphEdgeType,
    pub source: Entity,
    pub target: Entity,
    pub weight: f64,
}

/// Visual properties for a graph node.
#[derive(Component)]
pub struct NodeVisual {
    pub base_color: Color,
    pub radius: f32,
    pub glow_intensity: f32,
}

/// Physics state for a graph node.
#[derive(Component)]
pub struct PhysicsNode {
    pub is_pinned: bool,
    pub damping: f32,
}

/// Marker: this entity is selected.
#[derive(Component)]
pub struct Selected;

/// Marker: this entity is hovered.
#[derive(Component)]
pub struct Hovered;

/// Event fired to trigger a full graph rebuild.
#[derive(Event)]
pub struct RebuildGraph;

/// Event fired when graph build completes.
#[derive(Event)]
pub struct GraphReady {
    pub node_count: usize,
    pub edge_count: usize,
}
```

**Step 2: Write the builder (DB → Bevy entities)**

The builder reads from the database and returns a list of node/edge descriptors. It does NOT spawn entities directly — that happens in a Bevy system, so we can test the builder in isolation.

```rust
// crates/graph/src/builder.rs
use storage::db::Database;
use storage::types::{GraphNodeType, GraphEdgeType};
use rustc_hash::FxHashSet;
use regex::Regex;
use std::sync::LazyLock;
use std::f32::consts::PI;

static BLOCK_REF_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\(\(([^)]+)\)\)").expect("invalid block-ref regex"));

const GOLDEN_ANGLE: f32 = PI * (3.0 - (5.0_f32).sqrt());

/// Descriptor for a node to be spawned (not yet an Entity).
#[derive(Debug, Clone)]
pub struct NodeDescriptor {
    pub db_node_id: String,
    pub node_type: GraphNodeType,
    pub source_id: String,
    pub label: String,
    pub weight: f64,
    pub x: f32,
    pub y: f32,
}

/// Descriptor for an edge to be spawned.
/// source/target reference NodeDescriptor indices (not Entity IDs).
#[derive(Debug, Clone)]
pub struct EdgeDescriptor {
    pub db_edge_id: String,
    pub edge_type: GraphEdgeType,
    pub source_idx: usize,
    pub target_idx: usize,
    pub weight: f64,
}

pub struct BuildResult {
    pub nodes: Vec<NodeDescriptor>,
    pub edges: Vec<EdgeDescriptor>,
}

/// Build graph descriptors from database.
/// Returns descriptors that a Bevy system will use to spawn entities.
pub fn build_from_db(db: &Database) -> Result<BuildResult, storage::error::StorageError> {
    let pages = db.list_pages()?;
    let all_blocks_by_page = |pid| db.get_blocks_for_page(pid);
    let folders = db.list_folders()?;
    let chats = db.list_chats()?;

    let capacity = pages.len() * 3;
    let mut nodes = Vec::with_capacity(capacity);
    let mut edges = Vec::with_capacity(capacity);
    let mut seen_sources: FxHashSet<String> = FxHashSet::default();
    // Map from source_id → node index for edge resolution
    let mut source_to_idx: rustc_hash::FxHashMap<String, usize> = rustc_hash::FxHashMap::default();

    // --- Pages → Note nodes ---
    for page in &pages {
        if page.is_archived {
            continue;
        }
        let key = format!("page:{}", page.id);
        if !seen_sources.insert(key.clone()) {
            continue;
        }
        let idx = nodes.len();
        source_to_idx.insert(key.clone(), idx);
        let (x, y) = phyllotaxis(idx);
        nodes.push(NodeDescriptor {
            db_node_id: format!("auto-note-{}", page.id),
            node_type: GraphNodeType::Note,
            source_id: page.id.to_string(),
            label: page.title.clone(),
            weight: page.word_count as f64 / 100.0,
            x, y,
        });
    }

    // --- Tags → Tag nodes + edges ---
    let mut tag_keys: FxHashSet<String> = FxHashSet::default();
    for page in &pages {
        if page.is_archived { continue; }
        for tag in &page.tags {
            let tag_key = format!("tag:{}", tag);
            let tag_idx = if tag_keys.insert(tag_key.clone()) {
                let idx = nodes.len();
                source_to_idx.insert(tag_key.clone(), idx);
                let (x, y) = phyllotaxis(idx);
                nodes.push(NodeDescriptor {
                    db_node_id: format!("auto-tag-{}", tag),
                    node_type: GraphNodeType::Tag,
                    source_id: tag.clone(),
                    label: format!("#{}", tag),
                    weight: 1.0,
                    x, y,
                });
                idx
            } else {
                source_to_idx[&tag_key]
            };

            let page_key = format!("page:{}", page.id);
            if let Some(&page_idx) = source_to_idx.get(&page_key) {
                edges.push(EdgeDescriptor {
                    db_edge_id: format!("auto-tagged-{}-{}", page.id, tag),
                    edge_type: GraphEdgeType::Tagged,
                    source_idx: page_idx,
                    target_idx: tag_idx,
                    weight: 1.0,
                });
            }
        }
    }

    // --- Folders → Folder nodes + hierarchy edges ---
    for folder in &folders {
        let key = format!("folder:{}", folder.id);
        if !seen_sources.insert(key.clone()) { continue; }
        let idx = nodes.len();
        source_to_idx.insert(key.clone(), idx);
        let (x, y) = phyllotaxis(idx);
        nodes.push(NodeDescriptor {
            db_node_id: format!("auto-folder-{}", folder.id),
            node_type: GraphNodeType::Folder,
            source_id: folder.id.to_string(),
            label: folder.name.clone(),
            weight: 2.0,
            x, y,
        });

        // Parent folder edge
        if let Some(ref parent_id) = folder.parent_folder_id {
            let parent_key = format!("folder:{}", parent_id);
            if let (Some(&parent_idx), Some(&child_idx)) =
                (source_to_idx.get(&parent_key), source_to_idx.get(&key))
            {
                edges.push(EdgeDescriptor {
                    db_edge_id: format!("auto-contains-{}-{}", parent_id, folder.id),
                    edge_type: GraphEdgeType::Contains,
                    source_idx: parent_idx,
                    target_idx: child_idx,
                    weight: 1.0,
                });
            }
        }
    }

    // --- Page → Folder edges ---
    for page in &pages {
        if page.is_archived { continue; }
        if let Some(ref fid) = page.folder_id {
            let page_key = format!("page:{}", page.id);
            let folder_key = format!("folder:{}", fid);
            if let (Some(&pidx), Some(&fidx)) =
                (source_to_idx.get(&page_key), source_to_idx.get(&folder_key))
            {
                edges.push(EdgeDescriptor {
                    db_edge_id: format!("auto-infolder-{}-{}", page.id, fid),
                    edge_type: GraphEdgeType::Contains,
                    source_idx: fidx,
                    target_idx: pidx,
                    weight: 1.0,
                });
            }
        }
    }

    // --- Chats → Chat nodes ---
    for chat in &chats {
        let key = format!("chat:{}", chat.id);
        if !seen_sources.insert(key.clone()) { continue; }
        let idx = nodes.len();
        source_to_idx.insert(key.clone(), idx);
        let (x, y) = phyllotaxis(idx);
        nodes.push(NodeDescriptor {
            db_node_id: format!("auto-chat-{}", chat.id),
            node_type: GraphNodeType::Chat,
            source_id: chat.id.to_string(),
            label: chat.title.clone(),
            weight: 1.0,
            x, y,
        });
    }

    Ok(BuildResult { nodes, edges })
}

/// Phyllotaxis spiral for initial 2D positions.
fn phyllotaxis(i: usize) -> (f32, f32) {
    let fi = i as f32;
    let r = 120.0 * fi.sqrt();
    let theta = fi * GOLDEN_ANGLE;
    (r * theta.cos(), r * theta.sin())
}
```

**Step 3: Write the failing test**

```rust
// crates/graph/tests/builder_test.rs
use storage::db::Database;
use storage::types::Page;
use graph::builder;

#[test]
fn build_creates_note_nodes_from_pages() {
    let db = Database::open_in_memory().unwrap();
    let page = Page::new("Test Note".into());
    db.insert_page(&page).unwrap();

    let result = builder::build_from_db(&db).unwrap();

    assert_eq!(result.nodes.len(), 1);
    assert_eq!(result.nodes[0].label, "Test Note");
    assert_eq!(result.nodes[0].node_type, storage::types::GraphNodeType::Note);
}

#[test]
fn build_creates_tag_nodes_and_edges() {
    let db = Database::open_in_memory().unwrap();
    let mut page = Page::new("Tagged Note".into());
    page.tags = vec!["rust".into(), "bevy".into()];
    db.insert_page(&page).unwrap();

    let result = builder::build_from_db(&db).unwrap();

    // 1 note + 2 tags = 3 nodes
    assert_eq!(result.nodes.len(), 3);
    // 2 tagged edges
    assert_eq!(result.edges.len(), 2);
}

#[test]
fn build_skips_archived_pages() {
    let db = Database::open_in_memory().unwrap();
    let mut page = Page::new("Archived".into());
    page.is_archived = true;
    db.insert_page(&page).unwrap();

    let result = builder::build_from_db(&db).unwrap();
    assert_eq!(result.nodes.len(), 0);
}

#[test]
fn phyllotaxis_produces_unique_positions() {
    let db = Database::open_in_memory().unwrap();
    for i in 0..100 {
        let page = Page::new(format!("Note {}", i));
        db.insert_page(&page).unwrap();
    }

    let result = builder::build_from_db(&db).unwrap();
    // All positions should be unique
    let positions: Vec<(i32, i32)> = result.nodes.iter()
        .map(|n| ((n.x * 100.0) as i32, (n.y * 100.0) as i32))
        .collect();
    let unique: std::collections::HashSet<_> = positions.iter().collect();
    assert_eq!(unique.len(), positions.len());
}
```

**Step 4: Run tests**

```bash
cargo test -p graph builder_test -- --nocapture
```

Expected: PASS after implementation.

**Step 5: Implement the graph plugin (spawns entities from BuildResult)**

```rust
// crates/graph/src/plugin.rs
use bevy::prelude::*;
use storage::DbResource;
use crate::builder::{self, BuildResult};
use crate::components::*;

pub struct GraphPlugin;

impl Plugin for GraphPlugin {
    fn build(&self, app: &mut App) {
        app.add_event::<RebuildGraph>()
           .add_event::<GraphReady>()
           .add_systems(Startup, initial_graph_build)
           .add_systems(Update, handle_rebuild_event);
    }
}

fn initial_graph_build(
    mut commands: Commands,
    db: Res<DbResource>,
    mut ready_events: EventWriter<GraphReady>,
) {
    let result = db.with(|db| builder::build_from_db(db));
    match result {
        Ok(build) => {
            let counts = spawn_graph(&mut commands, &build);
            ready_events.send(counts);
        }
        Err(e) => {
            error!("Failed to build graph: {e}");
        }
    }
}

fn handle_rebuild_event(
    mut commands: Commands,
    db: Res<DbResource>,
    mut rebuild_events: EventReader<RebuildGraph>,
    mut ready_events: EventWriter<GraphReady>,
    existing_nodes: Query<Entity, With<GraphNode>>,
    existing_edges: Query<Entity, With<GraphEdge>>,
) {
    for _event in rebuild_events.read() {
        // Despawn all existing graph entities
        for entity in existing_nodes.iter() {
            commands.entity(entity).despawn_recursive();
        }
        for entity in existing_edges.iter() {
            commands.entity(entity).despawn_recursive();
        }

        let result = db.with(|db| builder::build_from_db(db));
        match result {
            Ok(build) => {
                let counts = spawn_graph(&mut commands, &build);
                ready_events.send(counts);
            }
            Err(e) => {
                error!("Failed to rebuild graph: {e}");
            }
        }
    }
}

fn spawn_graph(commands: &mut Commands, build: &BuildResult) -> GraphReady {
    let mut entity_map: Vec<Entity> = Vec::with_capacity(build.nodes.len());

    for node in &build.nodes {
        let color = color_for_type(&node.node_type);
        let radius = (node.weight as f32).clamp(3.0, 30.0);

        let entity = commands.spawn((
            GraphNode {
                node_type: node.node_type,
                source_id: node.source_id.clone(),
                label: node.label.clone(),
                weight: node.weight,
            },
            NodeVisual {
                base_color: color,
                radius,
                glow_intensity: 0.0,
            },
            PhysicsNode {
                is_pinned: false,
                damping: 0.95,
            },
            Transform::from_xyz(node.x, node.y, 0.0),
            GlobalTransform::default(),
        )).id();

        entity_map.push(entity);
    }

    let mut edge_count = 0;
    for edge in &build.edges {
        if edge.source_idx >= entity_map.len() || edge.target_idx >= entity_map.len() {
            continue;
        }
        commands.spawn(GraphEdge {
            edge_type: edge.edge_type,
            source: entity_map[edge.source_idx],
            target: entity_map[edge.target_idx],
            weight: edge.weight,
        });
        edge_count += 1;
    }

    GraphReady {
        node_count: entity_map.len(),
        edge_count,
    }
}

fn color_for_type(node_type: &storage::types::GraphNodeType) -> Color {
    use storage::types::GraphNodeType::*;
    match node_type {
        Note => Color::srgb(0.4, 0.7, 1.0),     // Blue
        Tag => Color::srgb(1.0, 0.6, 0.2),       // Orange
        Block => Color::srgb(0.6, 0.8, 0.4),     // Green
        Folder => Color::srgb(0.8, 0.5, 0.9),    // Purple
        Chat => Color::srgb(0.3, 0.9, 0.7),      // Teal
        _ => Color::srgb(0.7, 0.7, 0.7),         // Gray
    }
}
```

**Step 6: Wire up lib.rs**

```rust
// crates/graph/src/lib.rs
pub mod builder;
pub mod components;
pub mod plugin;

pub use components::*;
pub use plugin::GraphPlugin;
```

**Step 7: Commit**

```bash
git add crates/graph/
git commit -m "feat(graph): ECS-native graph builder + plugin

Builds graph from DB → NodeDescriptor/EdgeDescriptor → Bevy Entities.
Phyllotaxis spiral for initial 2D positions. Incremental rebuild via events."
```

---

## Task 4: 2D Node Rendering

**Files:**
- Create: `crates/render/src/lib.rs`
- Create: `crates/render/src/plugin.rs`
- Create: `crates/render/src/node_render.rs`
- Create: `crates/render/src/edge_render.rs`
- Modify: `crates/render/Cargo.toml`

**Step 1: Update render Cargo.toml**

```toml
[package]
name = "render"
version = "0.1.0"
edition = "2021"

[dependencies]
bevy = { workspace = true }
graph = { path = "../graph" }
storage = { path = "../storage" }
```

**Step 2: Implement node rendering system**

For 2D, each graph node is a `Mesh2d` circle with a `ColorMaterial`. Glow comes from Bevy's bloom post-processing.

```rust
// crates/render/src/node_render.rs
use bevy::prelude::*;
use graph::components::{GraphNode, NodeVisual, Hovered, Selected};

/// Marker: this entity has been given a mesh for rendering.
#[derive(Component)]
pub struct NodeMeshSpawned;

/// System: spawn 2D circle meshes for graph nodes that don't have one yet.
pub fn spawn_node_meshes(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
    query: Query<(Entity, &NodeVisual), (With<GraphNode>, Without<NodeMeshSpawned>)>,
) {
    for (entity, visual) in &query {
        let mesh = meshes.add(Circle::new(visual.radius));
        let material = materials.add(ColorMaterial::from_color(visual.base_color));

        commands.entity(entity).insert((
            Mesh2d(mesh),
            MeshMaterial2d(material),
            NodeMeshSpawned,
        ));
    }
}

/// System: update node material color on hover/select.
pub fn update_node_visuals(
    mut materials: ResMut<Assets<ColorMaterial>>,
    query: Query<
        (&MeshMaterial2d<ColorMaterial>, &NodeVisual, Has<Hovered>, Has<Selected>),
        With<GraphNode>,
    >,
) {
    for (material_handle, visual, is_hovered, is_selected) in &query {
        if let Some(material) = materials.get_mut(&material_handle.0) {
            material.color = if is_selected {
                Color::WHITE
            } else if is_hovered {
                visual.base_color.lighter(0.3)
            } else {
                visual.base_color
            };
        }
    }
}
```

**Step 3: Implement edge rendering system**

```rust
// crates/render/src/edge_render.rs
use bevy::prelude::*;
use graph::components::GraphEdge;

/// System: draw edges as lines using Gizmos.
/// Gizmos is the simplest approach for 2D lines — upgrade to custom mesh later for bezier curves.
pub fn draw_edges(
    mut gizmos: Gizmos,
    edges: Query<&GraphEdge>,
    transforms: Query<&Transform>,
) {
    for edge in &edges {
        let Ok(source_tf) = transforms.get(edge.source) else { continue };
        let Ok(target_tf) = transforms.get(edge.target) else { continue };

        gizmos.line_2d(
            source_tf.translation.truncate(),
            target_tf.translation.truncate(),
            Color::srgba(0.5, 0.5, 0.5, 0.3),
        );
    }
}
```

**Step 4: Create render plugin**

```rust
// crates/render/src/plugin.rs
use bevy::prelude::*;
use crate::node_render;
use crate::edge_render;

pub struct RenderPlugin;

impl Plugin for RenderPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, (
            node_render::spawn_node_meshes,
            node_render::update_node_visuals,
            edge_render::draw_edges,
        ));
    }
}
```

```rust
// crates/render/src/lib.rs
pub mod plugin;
pub mod node_render;
pub mod edge_render;

pub use plugin::RenderPlugin;
```

**Step 5: Commit**

```bash
git add crates/render/
git commit -m "feat(render): 2D node circles + edge gizmo lines

Nodes rendered as Mesh2d circles with color-by-type.
Edges drawn via Gizmos (will upgrade to bezier mesh later).
Hover/select visual feedback on node materials."
```

---

## Task 5: Physics Plugin — Rapier3D Constrained to 2D

**Files:**
- Create: `crates/physics/src/lib.rs`
- Create: `crates/physics/src/plugin.rs`
- Create: `crates/physics/src/systems.rs`
- Modify: `crates/physics/Cargo.toml`

**Step 1: Update Cargo.toml**

```toml
[package]
name = "physics"
version = "0.1.0"
edition = "2021"

[dependencies]
bevy = { workspace = true }
bevy_rapier3d = { workspace = true }
graph = { path = "../graph" }
```

**Step 2: Implement physics plugin**

```rust
// crates/physics/src/plugin.rs
use bevy::prelude::*;
use bevy_rapier3d::prelude::*;
use graph::components::{GraphNode, GraphEdge, PhysicsNode};

/// Physics configuration resource.
#[derive(Resource)]
pub struct PhysicsConfig {
    pub repulsion_strength: f32,
    pub attraction_strength: f32,
    pub damping: f32,
    pub is_running: bool,
}

impl Default for PhysicsConfig {
    fn default() -> Self {
        Self {
            repulsion_strength: 5000.0,
            attraction_strength: 0.01,
            damping: 0.95,
            is_running: true,
        }
    }
}

/// Marker: physics body has been added to this node.
#[derive(Component)]
pub struct PhysicsBodySpawned;

pub struct PhysicsPlugin;

impl Plugin for PhysicsPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(RapierPhysicsPlugin::<NoUserData>::default())
           .init_resource::<PhysicsConfig>()
           .add_systems(Update, (
               add_physics_bodies,
               apply_repulsion_forces,
               apply_edge_attraction,
               clamp_z_axis, // Keep 2D
           ).chain());
    }
}

/// Add Rapier rigid bodies to new graph nodes.
fn add_physics_bodies(
    mut commands: Commands,
    query: Query<(Entity, &PhysicsNode), (With<GraphNode>, Without<PhysicsBodySpawned>)>,
) {
    for (entity, pn) in &query {
        let body_type = if pn.is_pinned {
            RigidBody::Fixed
        } else {
            RigidBody::Dynamic
        };

        commands.entity(entity).insert((
            body_type,
            Collider::ball(5.0),
            Velocity::default(),
            ExternalForce::default(),
            Damping {
                linear_damping: pn.damping,
                angular_damping: 1.0,
            },
            GravityScale(0.0), // No gravity in graph space
            PhysicsBodySpawned,
        ));
    }
}

/// N-body repulsion: nodes push each other apart.
fn apply_repulsion_forces(
    config: Res<PhysicsConfig>,
    mut query: Query<(&Transform, &mut ExternalForce), With<GraphNode>>,
) {
    if !config.is_running { return; }

    let positions: Vec<(Entity, Vec3)> = query.iter()
        .map(|(tf, _)| (Entity::PLACEHOLDER, tf.translation))
        .collect();

    // This is O(n²) — fine for <5000 nodes, use spatial hash for more.
    let mut forces: Vec<Vec3> = vec![Vec3::ZERO; positions.len()];

    for i in 0..positions.len() {
        for j in (i + 1)..positions.len() {
            let delta = positions[i].1 - positions[j].1;
            let dist_sq = delta.length_squared().max(1.0);
            let force = delta.normalize_or_zero() * config.repulsion_strength / dist_sq;
            forces[i] += force;
            forces[j] -= force;
        }
    }

    for (i, (_, mut ext_force)) in query.iter_mut().enumerate() {
        ext_force.force = forces[i];
    }
}

/// Edge attraction: connected nodes pull toward each other.
fn apply_edge_attraction(
    config: Res<PhysicsConfig>,
    edges: Query<&GraphEdge>,
    mut bodies: Query<(&Transform, &mut ExternalForce), With<GraphNode>>,
) {
    if !config.is_running { return; }

    for edge in &edges {
        let Ok([(source_tf, _), (target_tf, _)]) =
            bodies.get_many([edge.source, edge.target])
        else { continue };

        let delta = target_tf.translation - source_tf.translation;
        let force = delta * config.attraction_strength;

        if let Ok((_, mut src_force)) = bodies.get_mut(edge.source) {
            src_force.force += force;
        }
        if let Ok((_, mut tgt_force)) = bodies.get_mut(edge.target) {
            tgt_force.force -= force;
        }
    }
}

/// Clamp all graph nodes to Z=0 (2D mode).
fn clamp_z_axis(mut query: Query<&mut Transform, With<GraphNode>>) {
    for mut tf in &mut query {
        tf.translation.z = 0.0;
    }
}
```

```rust
// crates/physics/src/lib.rs
pub mod plugin;
pub use plugin::{PhysicsPlugin, PhysicsConfig};
```

**Step 3: Commit**

```bash
git add crates/physics/
git commit -m "feat(physics): Rapier3D force-directed layout constrained to 2D

N-body repulsion + edge attraction. Z-axis clamped for 2D mode.
Dynamic rigid bodies with configurable damping."
```

---

## Task 6: Camera System — Orthographic 2D with Pan/Zoom

**Files:**
- Create: `crates/render/src/camera.rs`
- Modify: `crates/render/src/plugin.rs`

**Step 1: Implement 2D camera with scroll zoom and drag pan**

```rust
// crates/render/src/camera.rs
use bevy::prelude::*;
use bevy::input::mouse::{MouseWheel, MouseMotion};

#[derive(Component)]
pub struct GraphCamera;

#[derive(Resource)]
pub struct CameraConfig {
    pub zoom_speed: f32,
    pub min_zoom: f32,
    pub max_zoom: f32,
    pub pan_speed: f32,
}

impl Default for CameraConfig {
    fn default() -> Self {
        Self {
            zoom_speed: 0.1,
            min_zoom: 0.05,
            max_zoom: 10.0,
            pan_speed: 1.0,
        }
    }
}

pub fn spawn_camera(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        OrthographicProjection {
            scale: 1.0,
            ..OrthographicProjection::default_2d()
        },
        GraphCamera,
    ));
}

pub fn camera_zoom(
    mut scroll_events: EventReader<MouseWheel>,
    config: Res<CameraConfig>,
    mut query: Query<&mut OrthographicProjection, With<GraphCamera>>,
) {
    let mut scroll_total = 0.0;
    for event in scroll_events.read() {
        scroll_total += event.y;
    }
    if scroll_total == 0.0 { return; }

    for mut proj in &mut query {
        proj.scale *= 1.0 - scroll_total * config.zoom_speed;
        proj.scale = proj.scale.clamp(config.min_zoom, config.max_zoom);
    }
}

pub fn camera_pan(
    mouse_button: Res<ButtonInput<MouseButton>>,
    mut motion_events: EventReader<MouseMotion>,
    config: Res<CameraConfig>,
    mut query: Query<(&mut Transform, &OrthographicProjection), With<GraphCamera>>,
) {
    if !mouse_button.pressed(MouseButton::Middle)
        && !mouse_button.pressed(MouseButton::Right)
    {
        motion_events.clear();
        return;
    }

    let mut delta = Vec2::ZERO;
    for event in motion_events.read() {
        delta += event.delta;
    }
    if delta == Vec2::ZERO { return; }

    for (mut transform, proj) in &mut query {
        transform.translation.x -= delta.x * proj.scale * config.pan_speed;
        transform.translation.y += delta.y * proj.scale * config.pan_speed;
    }
}
```

**Step 2: Register camera systems in render plugin**

Add to `crates/render/src/plugin.rs`:

```rust
use crate::camera;

impl Plugin for RenderPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<camera::CameraConfig>()
           .add_systems(Startup, camera::spawn_camera)
           .add_systems(Update, (
               camera::camera_zoom,
               camera::camera_pan,
               node_render::spawn_node_meshes,
               node_render::update_node_visuals,
               edge_render::draw_edges,
           ));
    }
}
```

**Step 3: Commit**

```bash
git add crates/render/src/camera.rs crates/render/src/plugin.rs
git commit -m "feat(render): orthographic 2D camera with scroll zoom and drag pan"
```

---

## Task 7: Theme Plugin — Glass Morphism Foundation

**Files:**
- Create: `crates/theme/src/lib.rs`
- Create: `crates/theme/src/plugin.rs`
- Create: `crates/theme/src/config.rs`
- Modify: `crates/theme/Cargo.toml`

**Step 1: Update Cargo.toml**

```toml
[package]
name = "theme"
version = "0.1.0"
edition = "2021"

[dependencies]
bevy = { workspace = true }
bevy_egui = { workspace = true }
serde = { workspace = true }
```

**Step 2: Implement theme config**

```rust
// crates/theme/src/config.rs
use bevy::prelude::*;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThemeName {
    Midnight,
    Ocean,
    Forest,
    Sunset,
    Nebula,
    Aurora,
}

#[derive(Resource, Clone)]
pub struct ThemeConfig {
    pub active: ThemeName,
    pub panel_opacity: f32,
    pub blur_strength: f32,
    pub accent: Color,
    pub background: Color,
    pub surface: Color,
    pub text_primary: Color,
    pub text_secondary: Color,
    pub border: Color,
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self::midnight()
    }
}

impl ThemeConfig {
    pub fn midnight() -> Self {
        Self {
            active: ThemeName::Midnight,
            panel_opacity: 0.75,
            blur_strength: 20.0,
            accent: Color::srgb(0.4, 0.6, 1.0),
            background: Color::srgb(0.05, 0.05, 0.1),
            surface: Color::srgba(0.1, 0.1, 0.15, 0.75),
            text_primary: Color::srgb(0.95, 0.95, 0.95),
            text_secondary: Color::srgb(0.6, 0.6, 0.7),
            border: Color::srgba(1.0, 1.0, 1.0, 0.08),
        }
    }

    pub fn nebula() -> Self {
        Self {
            active: ThemeName::Nebula,
            panel_opacity: 0.7,
            blur_strength: 25.0,
            accent: Color::srgb(0.8, 0.4, 1.0),
            background: Color::srgb(0.08, 0.03, 0.12),
            surface: Color::srgba(0.12, 0.06, 0.18, 0.7),
            text_primary: Color::srgb(0.95, 0.9, 1.0),
            text_secondary: Color::srgb(0.7, 0.6, 0.8),
            border: Color::srgba(0.8, 0.4, 1.0, 0.1),
        }
    }

    // Additional themes follow same pattern — implement in Phase 4
}
```

**Step 3: Implement theme plugin that applies to egui**

```rust
// crates/theme/src/plugin.rs
use bevy::prelude::*;
use bevy_egui::{EguiContexts, egui};
use crate::config::ThemeConfig;

pub struct ThemePlugin;

impl Plugin for ThemePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ThemeConfig>()
           .add_systems(Update, apply_egui_theme);
    }
}

fn apply_egui_theme(
    theme: Res<ThemeConfig>,
    mut contexts: EguiContexts,
) {
    if !theme.is_changed() && !contexts.ctx_mut().is_using_pointer() {
        // Only re-apply when theme changes (optimization)
        // But apply every frame initially until we know it's been set
    }

    let ctx = contexts.ctx_mut();
    let mut visuals = egui::Visuals::dark();

    let accent = to_egui_color(theme.accent);
    let surface = to_egui_color(theme.surface);
    let text = to_egui_color(theme.text_primary);
    let text_dim = to_egui_color(theme.text_secondary);
    let border = to_egui_color(theme.border);

    // Window (panels)
    visuals.window_fill = surface;
    visuals.window_stroke = egui::Stroke::new(1.0, border);
    visuals.window_rounding = egui::Rounding::same(12.0);

    // Panel backgrounds
    visuals.panel_fill = surface;

    // Widgets
    visuals.widgets.noninteractive.fg_stroke = egui::Stroke::new(1.0, text_dim);
    visuals.widgets.inactive.fg_stroke = egui::Stroke::new(1.0, text);
    visuals.widgets.hovered.fg_stroke = egui::Stroke::new(1.0, accent);
    visuals.widgets.active.fg_stroke = egui::Stroke::new(2.0, accent);

    // Selection
    visuals.selection.bg_fill = egui::Color32::from_rgba_unmultiplied(
        (accent.r() * 255.0) as u8,
        (accent.g() * 255.0) as u8,
        (accent.b() * 255.0) as u8,
        60,
    );
    visuals.selection.stroke = egui::Stroke::new(1.0, accent);

    ctx.set_visuals(visuals);
}

fn to_egui_color(color: Color) -> egui::Color32 {
    let c = color.to_srgba();
    egui::Color32::from_rgba_unmultiplied(
        (c.red * 255.0) as u8,
        (c.green * 255.0) as u8,
        (c.blue * 255.0) as u8,
        (c.alpha * 255.0) as u8,
    )
}
```

```rust
// crates/theme/src/lib.rs
pub mod config;
pub mod plugin;

pub use config::{ThemeConfig, ThemeName};
pub use plugin::ThemePlugin;
```

**Step 4: Commit**

```bash
git add crates/theme/
git commit -m "feat(theme): glass morphism theme system with egui integration

Midnight and Nebula themes. Semi-transparent panels with accent colors.
Applied to egui Visuals each frame on change."
```

---

## Task 8: Animation Plugin — Spring Interpolation

**Files:**
- Create: `crates/animation/src/lib.rs`
- Create: `crates/animation/src/plugin.rs`
- Create: `crates/animation/src/spring.rs`
- Create: `crates/animation/tests/spring_test.rs`
- Modify: `crates/animation/Cargo.toml`

**Step 1: Update Cargo.toml**

```toml
[package]
name = "animation"
version = "0.1.0"
edition = "2021"

[dependencies]
bevy = { workspace = true }
```

**Step 2: Write failing spring test**

```rust
// crates/animation/tests/spring_test.rs
use animation::spring::Spring;

#[test]
fn spring_converges_to_target() {
    let mut spring = Spring::new(0.0, 1.0, 300.0, 25.0);
    for _ in 0..300 {
        spring.step(1.0 / 60.0);
    }
    assert!((spring.value() - 1.0).abs() < 0.01, "spring should converge to target");
}

#[test]
fn spring_with_high_damping_does_not_oscillate() {
    let mut spring = Spring::new(0.0, 1.0, 300.0, 30.0);
    let mut prev = 0.0_f32;
    let mut crossed_target = 0;
    for _ in 0..200 {
        spring.step(1.0 / 60.0);
        if (prev < 1.0) != (spring.value() < 1.0) {
            crossed_target += 1;
        }
        prev = spring.value();
    }
    assert!(crossed_target <= 1, "critically damped spring should not oscillate");
}
```

**Step 3: Implement spring**

```rust
// crates/animation/src/spring.rs

/// Damped harmonic oscillator (spring).
/// Same feel as Framer Motion's spring() transition.
pub struct Spring {
    current: f32,
    target: f32,
    velocity: f32,
    stiffness: f32,
    damping: f32,
}

impl Spring {
    pub fn new(initial: f32, target: f32, stiffness: f32, damping: f32) -> Self {
        Self {
            current: initial,
            target,
            velocity: 0.0,
            stiffness,
            damping,
        }
    }

    pub fn step(&mut self, dt: f32) {
        let displacement = self.current - self.target;
        let spring_force = -self.stiffness * displacement;
        let damping_force = -self.damping * self.velocity;
        let acceleration = spring_force + damping_force;
        self.velocity += acceleration * dt;
        self.current += self.velocity * dt;
    }

    pub fn value(&self) -> f32 {
        self.current
    }

    pub fn set_target(&mut self, target: f32) {
        self.target = target;
    }

    pub fn is_settled(&self, threshold: f32) -> bool {
        (self.current - self.target).abs() < threshold && self.velocity.abs() < threshold
    }
}

/// Bevy component: animate a float value with spring physics.
use bevy::prelude::*;

#[derive(Component)]
pub struct SpringAnimation {
    pub spring: Spring,
    pub settled: bool,
}

impl SpringAnimation {
    pub fn new(initial: f32, target: f32) -> Self {
        Self {
            spring: Spring::new(initial, target, 300.0, 25.0),
            settled: false,
        }
    }

    pub fn with_config(initial: f32, target: f32, stiffness: f32, damping: f32) -> Self {
        Self {
            spring: Spring::new(initial, target, stiffness, damping),
            settled: false,
        }
    }
}
```

**Step 4: Implement animation plugin**

```rust
// crates/animation/src/plugin.rs
use bevy::prelude::*;
use crate::spring::SpringAnimation;

pub struct AnimationPlugin;

impl Plugin for AnimationPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, tick_spring_animations);
    }
}

fn tick_spring_animations(
    time: Res<Time>,
    mut query: Query<&mut SpringAnimation>,
) {
    let dt = time.delta_secs();
    for mut anim in &mut query {
        if anim.settled { continue; }
        anim.spring.step(dt);
        anim.settled = anim.spring.is_settled(0.001);
    }
}
```

```rust
// crates/animation/src/lib.rs
pub mod spring;
pub mod plugin;

pub use plugin::AnimationPlugin;
pub use spring::{Spring, SpringAnimation};
```

**Step 5: Run tests**

```bash
cargo test -p animation spring_test -- --nocapture
```

Expected: PASS

**Step 6: Commit**

```bash
git add crates/animation/
git commit -m "feat(animation): spring physics interpolation (Framer Motion equivalent)

Damped harmonic oscillator with configurable stiffness/damping.
Bevy component SpringAnimation for per-entity animations."
```

---

## Task 9: UI Plugin — egui Shell with Sidebar

**Files:**
- Create: `crates/ui/src/lib.rs`
- Create: `crates/ui/src/plugin.rs`
- Create: `crates/ui/src/sidebar.rs`
- Create: `crates/ui/src/state.rs`
- Create: `crates/ui/src/notes_panel.rs`
- Create: `crates/ui/src/settings_panel.rs`
- Modify: `crates/ui/Cargo.toml`

**Step 1: Update Cargo.toml**

```toml
[package]
name = "ui"
version = "0.1.0"
edition = "2021"

[dependencies]
bevy = { workspace = true }
bevy_egui = { workspace = true }
storage = { path = "../storage" }
graph = { path = "../graph" }
theme = { path = "../theme" }
```

**Step 2: Define UI state**

```rust
// crates/ui/src/state.rs
use bevy::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Panel {
    Graph,
    Notes,
    Chat,
    Library,
    Settings,
}

#[derive(Resource)]
pub struct UiState {
    pub active_panel: Panel,
    pub sidebar_open: bool,
    pub command_palette_open: bool,
}

impl Default for UiState {
    fn default() -> Self {
        Self {
            active_panel: Panel::Graph,
            sidebar_open: true,
            command_palette_open: false,
        }
    }
}
```

**Step 3: Implement sidebar**

```rust
// crates/ui/src/sidebar.rs
use bevy_egui::egui;
use crate::state::{UiState, Panel};

pub fn draw_sidebar(ctx: &egui::Context, ui_state: &mut UiState) {
    egui::SidePanel::left("sidebar")
        .resizable(false)
        .default_width(56.0)
        .frame(egui::Frame::none().fill(egui::Color32::from_rgba_unmultiplied(15, 15, 25, 200)))
        .show(ctx, |ui| {
            ui.vertical_centered(|ui| {
                ui.add_space(16.0);

                let buttons = [
                    (Panel::Graph, "G", "Graph"),
                    (Panel::Notes, "N", "Notes"),
                    (Panel::Chat, "C", "Chat"),
                    (Panel::Library, "L", "Library"),
                    (Panel::Settings, "S", "Settings"),
                ];

                for (panel, icon, tooltip) in buttons {
                    let is_active = ui_state.active_panel == panel;
                    let btn = egui::Button::new(
                        egui::RichText::new(icon)
                            .size(18.0)
                            .color(if is_active {
                                egui::Color32::WHITE
                            } else {
                                egui::Color32::from_gray(140)
                            }),
                    )
                    .min_size(egui::vec2(40.0, 40.0))
                    .fill(if is_active {
                        egui::Color32::from_rgba_unmultiplied(100, 130, 255, 40)
                    } else {
                        egui::Color32::TRANSPARENT
                    })
                    .rounding(8.0);

                    if ui.add(btn).on_hover_text(tooltip).clicked() {
                        ui_state.active_panel = panel;
                    }
                    ui.add_space(4.0);
                }
            });
        });
}
```

**Step 4: Implement basic notes panel**

```rust
// crates/ui/src/notes_panel.rs
use bevy_egui::egui;
use storage::DbResource;

pub struct NotesState {
    pub selected_page_id: Option<String>,
    pub page_list: Vec<(String, String)>, // (id, title)
    pub needs_refresh: bool,
}

impl Default for NotesState {
    fn default() -> Self {
        Self {
            selected_page_id: None,
            page_list: Vec::new(),
            needs_refresh: true,
        }
    }
}

pub fn draw_notes_panel(
    ctx: &egui::Context,
    notes_state: &mut NotesState,
    db: &DbResource,
) {
    // Refresh page list from DB if needed
    if notes_state.needs_refresh {
        notes_state.page_list = db.with(|db| {
            db.list_pages()
                .unwrap_or_default()
                .into_iter()
                .filter(|p| !p.is_archived)
                .map(|p| (p.id.to_string(), p.title))
                .collect()
        });
        notes_state.needs_refresh = false;
    }

    egui::SidePanel::right("notes_panel")
        .default_width(350.0)
        .resizable(true)
        .frame(egui::Frame::none()
            .fill(egui::Color32::from_rgba_unmultiplied(15, 15, 25, 190))
            .inner_margin(16.0))
        .show(ctx, |ui| {
            ui.heading("Notes");
            ui.separator();

            egui::ScrollArea::vertical().show(ui, |ui| {
                for (id, title) in &notes_state.page_list {
                    let is_selected = notes_state.selected_page_id.as_ref() == Some(id);
                    let response = ui.selectable_label(is_selected, title);
                    if response.clicked() {
                        notes_state.selected_page_id = Some(id.clone());
                    }
                }
            });
        });
}
```

**Step 5: Implement settings panel**

```rust
// crates/ui/src/settings_panel.rs
use bevy_egui::egui;
use theme::{ThemeConfig, ThemeName};
use crate::state::UiState;

pub fn draw_settings_panel(
    ctx: &egui::Context,
    theme: &mut ThemeConfig,
) {
    egui::CentralPanel::default()
        .frame(egui::Frame::none()
            .fill(egui::Color32::from_rgba_unmultiplied(15, 15, 25, 200))
            .inner_margin(32.0))
        .show(ctx, |ui| {
            ui.heading("Settings");
            ui.separator();
            ui.add_space(16.0);

            ui.label("Theme");
            egui::ComboBox::from_id_salt("theme_select")
                .selected_text(format!("{:?}", theme.active))
                .show_ui(ui, |ui| {
                    if ui.selectable_value(&mut theme.active, ThemeName::Midnight, "Midnight").changed() {
                        *theme = ThemeConfig::midnight();
                    }
                    if ui.selectable_value(&mut theme.active, ThemeName::Nebula, "Nebula").changed() {
                        *theme = ThemeConfig::nebula();
                    }
                });

            ui.add_space(16.0);
            ui.label("Panel Opacity");
            ui.add(egui::Slider::new(&mut theme.panel_opacity, 0.3..=1.0));
        });
}
```

**Step 6: Wire up the UI plugin**

```rust
// crates/ui/src/plugin.rs
use bevy::prelude::*;
use bevy_egui::EguiContexts;
use storage::DbResource;
use theme::ThemeConfig;
use crate::state::{UiState, Panel};
use crate::sidebar;
use crate::notes_panel::{self, NotesState};
use crate::settings_panel;

pub struct UiPlugin;

impl Plugin for UiPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<UiState>()
           .insert_resource(NotesState::default())
           .add_systems(Update, draw_ui);
    }
}

fn draw_ui(
    mut contexts: EguiContexts,
    mut ui_state: ResMut<UiState>,
    mut notes_state: ResMut<NotesState>,
    mut theme: ResMut<ThemeConfig>,
    db: Res<DbResource>,
) {
    let ctx = contexts.ctx_mut().clone();

    sidebar::draw_sidebar(&ctx, &mut ui_state);

    match ui_state.active_panel {
        Panel::Graph => {
            // Graph is rendered by Bevy — no egui panel needed.
            // Optionally show a floating info bar.
        }
        Panel::Notes => {
            notes_panel::draw_notes_panel(&ctx, &mut notes_state, &db);
        }
        Panel::Settings => {
            settings_panel::draw_settings_panel(&ctx, &mut theme);
        }
        Panel::Chat => {
            // Stub — implemented in Phase 2
            egui::CentralPanel::default().show(&ctx, |ui| {
                ui.centered_and_justified(|ui| {
                    ui.label("Chat — coming in Phase 2");
                });
            });
        }
        Panel::Library => {
            // Stub — implemented in Phase 4
            egui::CentralPanel::default().show(&ctx, |ui| {
                ui.centered_and_justified(|ui| {
                    ui.label("Library — coming in Phase 4");
                });
            });
        }
    }
}
```

```rust
// crates/ui/src/lib.rs
pub mod plugin;
pub mod state;
pub mod sidebar;
pub mod notes_panel;
pub mod settings_panel;

pub use plugin::UiPlugin;
pub use state::UiState;
```

**Step 7: Commit**

```bash
git add crates/ui/
git commit -m "feat(ui): egui shell with sidebar, notes panel, settings panel

Sidebar with Graph/Notes/Chat/Library/Settings navigation.
Notes panel shows page list from DB. Settings panel with theme selector.
Chat and Library are stubs for future phases."
```

---

## Task 10: Wire Everything Together in main.rs

**Files:**
- Modify: `crates/app/src/main.rs`
- Modify: `crates/app/Cargo.toml`

**Step 1: Update main.rs with all plugins**

```rust
// crates/app/src/main.rs
use bevy::prelude::*;
use bevy_egui::EguiPlugin;

fn main() {
    env_logger::init();

    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Epistemos".into(),
                resolution: (1600., 900.).into(),
                present_mode: bevy::window::PresentMode::AutoVsync,
                ..default()
            }),
            ..default()
        }))
        .insert_resource(ClearColor(Color::srgb(0.05, 0.05, 0.1)))
        .add_plugins(EguiPlugin)
        .add_plugins(storage::StoragePlugin::new(db_path()))
        .add_plugins(graph::GraphPlugin)
        .add_plugins(physics::PhysicsPlugin)
        .add_plugins(render::RenderPlugin)
        .add_plugins(theme::ThemePlugin)
        .add_plugins(animation::AnimationPlugin)
        .add_plugins(ui::UiPlugin)
        .run();
}

fn db_path() -> std::path::PathBuf {
    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Epistemos");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("epistemos.db")
}
```

**Step 2: Add `dirs` dependency to app Cargo.toml**

```toml
[dependencies]
# ... existing deps ...
dirs = "6"
```

**Step 3: Build and run**

```bash
cd ~/Epistemos-RETRO-v2 && cargo run
```

Expected: Window opens. If DB has data from v1, graph nodes appear as colored circles with gizmo edges. Sidebar visible. Click Notes → notes list. Click Settings → theme selector. Click Graph → back to graph view.

**Step 4: Commit**

```bash
git add crates/app/
git commit -m "feat(app): wire all Phase 1 plugins into Bevy app

StoragePlugin, GraphPlugin, PhysicsPlugin, RenderPlugin,
ThemePlugin, AnimationPlugin, UiPlugin all registered.
App opens with 2D graph as landing page."
```

---

## Task 11: Node Labels + Interaction (Hover/Select)

**Files:**
- Create: `crates/render/src/labels.rs`
- Create: `crates/render/src/interaction.rs`
- Modify: `crates/render/src/plugin.rs`

**Step 1: Implement label rendering via egui painter overlay**

```rust
// crates/render/src/labels.rs
use bevy::prelude::*;
use bevy_egui::EguiContexts;
use graph::components::GraphNode;
use crate::camera::GraphCamera;

/// Draw node labels as egui text overlays positioned at world coordinates.
pub fn draw_node_labels(
    mut contexts: EguiContexts,
    nodes: Query<(&GraphNode, &Transform)>,
    camera_query: Query<(&Camera, &GlobalTransform), With<GraphCamera>>,
) {
    let Ok((camera, camera_transform)) = camera_query.get_single() else { return };
    let ctx = contexts.ctx_mut();
    let painter = ctx.layer_painter(bevy_egui::egui::LayerId::background());

    for (node, transform) in &nodes {
        // Project world position to screen
        let Some(screen_pos) = camera.world_to_viewport(camera_transform, transform.translation)
        else { continue };

        let pos = bevy_egui::egui::pos2(screen_pos.x, screen_pos.y + 15.0);
        painter.text(
            pos,
            bevy_egui::egui::Align2::CENTER_TOP,
            &node.label,
            bevy_egui::egui::FontId::proportional(11.0),
            bevy_egui::egui::Color32::from_rgba_unmultiplied(220, 220, 230, 180),
        );
    }
}
```

**Step 2: Implement hover/select interaction**

```rust
// crates/render/src/interaction.rs
use bevy::prelude::*;
use bevy::window::PrimaryWindow;
use graph::components::{GraphNode, Hovered, Selected, NodeVisual};
use crate::camera::GraphCamera;

/// Raycast from cursor to find hovered node.
pub fn hover_detection(
    mut commands: Commands,
    windows: Query<&Window, With<PrimaryWindow>>,
    camera_query: Query<(&Camera, &GlobalTransform), With<GraphCamera>>,
    nodes: Query<(Entity, &Transform, &NodeVisual), With<GraphNode>>,
    currently_hovered: Query<Entity, With<Hovered>>,
) {
    // Clear previous hover
    for entity in &currently_hovered {
        commands.entity(entity).remove::<Hovered>();
    }

    let Ok(window) = windows.get_single() else { return };
    let Some(cursor_pos) = window.cursor_position() else { return };
    let Ok((camera, camera_transform)) = camera_query.get_single() else { return };

    // Convert screen position to world position
    let Ok(world_pos) = camera.viewport_to_world_2d(camera_transform, cursor_pos) else { return };

    // Find closest node within radius
    let mut closest: Option<(Entity, f32)> = None;
    for (entity, transform, visual) in &nodes {
        let dist = world_pos.distance(transform.translation.truncate());
        if dist < visual.radius * 2.0 {
            if closest.is_none() || dist < closest.unwrap().1 {
                closest = Some((entity, dist));
            }
        }
    }

    if let Some((entity, _)) = closest {
        commands.entity(entity).insert(Hovered);
    }
}

/// Click to select node.
pub fn click_select(
    mut commands: Commands,
    mouse_button: Res<ButtonInput<MouseButton>>,
    hovered: Query<Entity, With<Hovered>>,
    selected: Query<Entity, With<Selected>>,
) {
    if !mouse_button.just_pressed(MouseButton::Left) { return; }

    // Clear previous selection
    for entity in &selected {
        commands.entity(entity).remove::<Selected>();
    }

    // Select hovered node
    for entity in &hovered {
        commands.entity(entity).insert(Selected);
    }
}
```

**Step 3: Register in render plugin**

Update `crates/render/src/plugin.rs` to add:

```rust
pub mod labels;
pub mod interaction;

// In Plugin::build():
.add_systems(Update, (
    interaction::hover_detection,
    interaction::click_select,
    labels::draw_node_labels,
    // ... existing systems ...
))
```

**Step 4: Commit**

```bash
git add crates/render/src/labels.rs crates/render/src/interaction.rs crates/render/src/plugin.rs crates/render/src/lib.rs
git commit -m "feat(render): node labels + hover/select interaction

Labels drawn as egui text at world-projected screen positions.
Hover detection via cursor-to-world raycast.
Click to select/deselect nodes."
```

---

## Task 12: Background Color + Basic Visual Polish

**Files:**
- Modify: `crates/app/src/main.rs`
- Modify: `crates/render/src/node_render.rs`

**Step 1: Enable Bevy bloom for node glow**

In `main.rs`, add bloom to the camera setup. Update `crates/render/src/camera.rs`:

```rust
use bevy::core_pipeline::bloom::Bloom;

pub fn spawn_camera(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        OrthographicProjection {
            scale: 1.0,
            ..OrthographicProjection::default_2d()
        },
        // HDR required for bloom
        Camera {
            hdr: true,
            ..default()
        },
        Bloom {
            intensity: 0.15,
            ..default()
        },
        GraphCamera,
    ));
}
```

**Step 2: Use emissive colors for nodes (triggers bloom)**

In `node_render.rs`, use emissive color values (>1.0) for the node materials so bloom picks them up:

```rust
let material = materials.add(ColorMaterial::from_color(
    Color::srgb(
        visual.base_color.to_srgba().red * 1.5,
        visual.base_color.to_srgba().green * 1.5,
        visual.base_color.to_srgba().blue * 1.5,
    )
));
```

**Step 3: Commit**

```bash
git add crates/render/src/camera.rs crates/render/src/node_render.rs
git commit -m "feat(render): bloom post-processing for node glow effect

HDR camera with bloom intensity 0.15. Emissive node colors trigger bloom.
Creates the glowing node effect from the macOS Opulent edition."
```

---

## Task 13: Integration Test — Full Pipeline

**Files:**
- Create: `crates/app/tests/integration_test.rs`

**Step 1: Write integration test**

```rust
// crates/app/tests/integration_test.rs
use bevy::prelude::*;
use bevy::app::ScheduleRunnerPlugin;
use storage::{StoragePlugin, DbResource};
use storage::types::Page;
use graph::{GraphPlugin, GraphReady};

#[test]
fn full_pipeline_builds_graph_from_db() {
    let mut app = App::new();
    app.add_plugins(MinimalPlugins.set(ScheduleRunnerPlugin::run_once()));
    app.add_plugins(StoragePlugin::in_memory());
    app.add_plugins(GraphPlugin);

    // Insert test data before first update
    {
        let db = app.world().resource::<DbResource>();
        db.with(|db| {
            let mut page = Page::new("Test Note".into());
            page.tags = vec!["rust".into()];
            db.insert_page(&page).unwrap();
        });
    }

    // Run one frame — triggers graph build
    app.update();

    // Verify GraphReady event was fired
    let events = app.world().resource::<Events<GraphReady>>();
    let mut reader = events.get_cursor();
    let ready_events: Vec<_> = reader.read(events).collect();
    assert_eq!(ready_events.len(), 1);
    assert_eq!(ready_events[0].node_count, 2); // 1 note + 1 tag
    assert_eq!(ready_events[0].edge_count, 1); // 1 tagged edge
}
```

**Step 2: Run**

```bash
cargo test -p epistemos integration_test -- --nocapture
```

Expected: PASS

**Step 3: Commit**

```bash
git add crates/app/tests/integration_test.rs
git commit -m "test: integration test for full DB → graph → ECS pipeline"
```

---

## Task 14: Run App, Verify Visual Output, Fix Issues

**Step 1: Create a test database with sample data**

```bash
cd ~/Epistemos-RETRO-v2 && cargo run
```

If the DB is empty, the graph will be empty. You can either:
- Copy the v1 database file to the v2 data directory
- Or add a dev-mode system that inserts sample data on empty DB

**Step 2: Verify visually**

- [ ] Window opens at 1600x900
- [ ] Dark background (midnight theme)
- [ ] Sidebar visible on left with G/N/C/L/S buttons
- [ ] Graph nodes appear as colored circles
- [ ] Nodes spread out via force-directed physics
- [ ] Edges visible as gray lines between connected nodes
- [ ] Labels appear below nodes
- [ ] Scroll wheel zooms in/out
- [ ] Right-click drag pans camera
- [ ] Hover over node → highlight
- [ ] Click node → select (turns white)
- [ ] Click Notes → right panel with page list
- [ ] Click Settings → theme selector works
- [ ] Click Graph → back to graph (instant, no lag)
- [ ] Nodes glow slightly (bloom effect)

**Step 3: Fix any issues found, commit**

```bash
git add -A
git commit -m "fix: Phase 1 visual verification fixes"
```

---

## Summary

| Task | What | Crate |
|------|------|-------|
| 1 | Scaffold project + copy crates | workspace |
| 2 | Storage Bevy plugin | storage |
| 3 | Graph builder + plugin (ECS) | graph |
| 4 | 2D node + edge rendering | render |
| 5 | Rapier3D physics (2D constrained) | physics |
| 6 | Camera (orthographic, pan/zoom) | render |
| 7 | Theme plugin (glass morphism) | theme |
| 8 | Animation plugin (springs) | animation |
| 9 | UI plugin (sidebar + panels) | ui |
| 10 | Wire everything in main.rs | app |
| 11 | Labels + hover/select interaction | render |
| 12 | Bloom + visual polish | render |
| 13 | Integration test | app |
| 14 | Run + verify + fix | all |

**End state:** A running Epistemos v2 window with 2D force-directed graph, glass morphism theme, sidebar navigation, notes list, and settings. All pure Rust. No webview.
