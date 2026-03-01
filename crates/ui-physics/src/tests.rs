use graph::store::{EdgeRecord, GraphStore, NodeRecord};
use storage::types::{GraphEdgeType, GraphNodeType};

use crate::world::{PhysicsConfig, PhysicsWorld};

fn make_node(id: &str, x: f32, y: f32) -> NodeRecord {
    NodeRecord {
        id: id.into(),
        node_type: GraphNodeType::Note,
        label: id.into(),
        source_id: id.into(),
        metadata_json: None,
        weight: 1.0,
        created_at: 0,
        x, y, z: 0.0,
        vx: 0.0, vy: 0.0, vz: 0.0,
        is_visible: true,
        is_pinned: false,
    }
}

fn make_edge(id: &str, src: &str, tgt: &str) -> EdgeRecord {
    EdgeRecord {
        id: id.into(),
        source_node_id: src.into(),
        target_node_id: tgt.into(),
        edge_type: GraphEdgeType::Reference,
        weight: 1.0,
        created_at: 0,
    }
}

fn make_edge_weighted(id: &str, src: &str, tgt: &str, weight: f64) -> EdgeRecord {
    EdgeRecord {
        id: id.into(),
        source_node_id: src.into(),
        target_node_id: tgt.into(),
        edge_type: GraphEdgeType::Reference,
        weight,
        created_at: 0,
    }
}

fn simple_graph() -> GraphStore {
    let mut store = GraphStore::new();
    store.add_node(make_node("a", -50.0, 0.0));
    store.add_node(make_node("b", 50.0, 0.0));
    store.add_node(make_node("c", 0.0, 80.0));
    store.add_edge(make_edge("e1", "a", "b"));
    store.add_edge(make_edge("e2", "b", "c"));
    store.add_edge(make_edge("e3", "a", "c"));
    store
}

#[test]
fn world_creates_bodies_for_nodes() {
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);
    assert_eq!(world.node_count(), 3);
}

#[test]
fn world_step_produces_positions() {
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);

    let frame = world.step();
    assert_eq!(frame.positions.len(), 3);
    // Positions should exist for all nodes
    let ids: Vec<&str> = frame.positions.iter().map(|p| p.id.as_str()).collect();
    assert!(ids.contains(&"a"));
    assert!(ids.contains(&"b"));
    assert!(ids.contains(&"c"));
}

#[test]
fn world_nodes_move_after_steps() {
    // Spread nodes far apart so spring forces produce visible movement.
    let mut store = GraphStore::new();
    store.add_node(make_node("a", -500.0, 0.0));
    store.add_node(make_node("b", 500.0, 0.0));
    store.add_edge(make_edge("e1", "a", "b"));

    let mut world = PhysicsWorld::new(PhysicsConfig {
        damping: 0.3,          // Low damping so nodes move freely.
        gravity_strength: 0.1, // Strong central pull to generate force.
        ..PhysicsConfig::default()
    });
    world.load_from_graph(&store);

    let frame0 = world.step();
    for _ in 0..50 {
        world.step();
    }
    let frame50 = world.step();

    let pos_a_0 = frame0.positions.iter().find(|p| p.id == "a").unwrap();
    let pos_a_50 = frame50.positions.iter().find(|p| p.id == "a").unwrap();
    let moved = (pos_a_0.x - pos_a_50.x).abs() > 0.01
        || (pos_a_0.y - pos_a_50.y).abs() > 0.01;
    assert!(moved, "Node A should have moved after 51 physics steps");
}

#[test]
fn world_settles_eventually() {
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig {
        damping: 0.95,
        ..PhysicsConfig::default()
    });
    world.load_from_graph(&store);

    // Run 500 steps — should settle
    for _ in 0..500 {
        world.step();
    }
    assert!(world.is_settled(), "Physics should settle after 500 steps with high damping");
}

#[test]
fn world_pause_stops_movement() {
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);

    world.step(); // 1 step to get initial positions
    world.set_paused(true);

    let frame_paused_1 = world.step();
    let frame_paused_2 = world.step();

    // Positions should be identical when paused
    for (p1, p2) in frame_paused_1.positions.iter().zip(frame_paused_2.positions.iter()) {
        assert!((p1.x - p2.x).abs() < 0.0001);
        assert!((p1.y - p2.y).abs() < 0.0001);
    }
}

#[test]
fn world_pin_node() {
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);

    world.pin_node("a");
    let frame0 = world.step();
    let pos_a_0 = frame0.positions.iter().find(|p| p.id == "a").unwrap();

    for _ in 0..20 {
        world.step();
    }
    let frame20 = world.step();
    let pos_a_20 = frame20.positions.iter().find(|p| p.id == "a").unwrap();

    // Pinned node should not have moved
    assert!((pos_a_0.x - pos_a_20.x).abs() < 0.01, "Pinned node should stay put");
}

#[test]
fn world_move_node() {
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);

    world.pin_node("b");
    world.move_node("b", 200.0, 300.0, 0.0);

    let frame = world.step();
    let pos_b = frame.positions.iter().find(|p| p.id == "b").unwrap();
    assert!((pos_b.x - 200.0).abs() < 0.1);
    assert!((pos_b.y - 300.0).abs() < 0.1);
}

#[test]
fn world_invisible_nodes_excluded() {
    let mut store = GraphStore::new();
    let mut visible = make_node("v", 0.0, 0.0);
    visible.is_visible = true;
    let mut invisible = make_node("i", 50.0, 50.0);
    invisible.is_visible = false;
    store.add_node(visible);
    store.add_node(invisible);

    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);
    assert_eq!(world.node_count(), 1);
}

#[test]
fn world_tick_count() {
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);

    assert_eq!(world.tick_count(), 0);
    world.step();
    world.step();
    world.step();
    assert_eq!(world.tick_count(), 3);
}

#[test]
fn world_reload_clears_state() {
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);
    assert_eq!(world.node_count(), 3);

    // Reload with empty graph
    let empty = GraphStore::new();
    world.load_from_graph(&empty);
    assert_eq!(world.node_count(), 0);
}

#[test]
fn fps_step_no_panic_without_player() {
    // In graph mode, fps_player is None. Toggling to FPS mode and stepping
    // should not panic even if the player is not yet spawned.
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);

    // Toggle to FPS mode (creates player)
    world.toggle_fps_mode();

    // Step multiple times in FPS mode — should not panic
    for _ in 0..10 {
        let frame = world.step();
        assert!(!frame.positions.is_empty());
    }
}

#[test]
fn fps_frame_returns_some_in_fps_mode() {
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);

    // In graph mode, fps_frame should be None
    assert!(world.fps_frame().is_none());

    // Toggle to FPS mode
    world.toggle_fps_mode();
    world.step();

    // Now fps_frame should return Some
    let fps_frame = world.fps_frame();
    assert!(fps_frame.is_some());
}

// ── Audit: Graph/FPS mode fixes ──────────────────────────────────────

#[test]
fn negative_edge_weight_does_not_produce_nan() {
    // Negative edge weights caused NaN in sqrt() → spring explosion.
    let mut store = GraphStore::new();
    store.add_node(make_node("a", -50.0, 0.0));
    store.add_node(make_node("b", 50.0, 0.0));
    store.add_edge(make_edge_weighted("e1", "a", "b", -5.0));

    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);

    // Run several steps — should not produce NaN positions
    for _ in 0..20 {
        let frame = world.step();
        for pos in &frame.positions {
            assert!(pos.x.is_finite(), "x is NaN/Inf for node {}", pos.id);
            assert!(pos.y.is_finite(), "y is NaN/Inf for node {}", pos.id);
            assert!(pos.z.is_finite(), "z is NaN/Inf for node {}", pos.id);
        }
    }
}

#[test]
fn zero_edge_weight_does_not_produce_nan() {
    let mut store = GraphStore::new();
    store.add_node(make_node("a", -50.0, 0.0));
    store.add_node(make_node("b", 50.0, 0.0));
    store.add_edge(make_edge_weighted("e1", "a", "b", 0.0));

    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);

    for _ in 0..20 {
        let frame = world.step();
        for pos in &frame.positions {
            assert!(pos.x.is_finite(), "x is NaN/Inf for node {}", pos.id);
            assert!(pos.y.is_finite(), "y is NaN/Inf for node {}", pos.id);
        }
    }
}

#[test]
fn velocity_clamping_prevents_explosion() {
    // Nodes far apart with stiff springs = enormous forces.
    // Without clamping, nodes shoot to infinity.
    let mut store = GraphStore::new();
    store.add_node(make_node("a", -10000.0, 0.0));
    store.add_node(make_node("b", 10000.0, 0.0));
    store.add_edge(make_edge("e1", "a", "b"));

    let mut world = PhysicsWorld::new(PhysicsConfig {
        spring_stiffness: 5.0,
        damping: 0.1,
        gravity_strength: 0.5,
        ..PhysicsConfig::default()
    });
    world.load_from_graph(&store);

    // After many steps, positions should stay bounded (not explode to infinity)
    for _ in 0..100 {
        let frame = world.step();
        for pos in &frame.positions {
            assert!(
                pos.x.abs() < 100_000.0 && pos.y.abs() < 100_000.0,
                "Node {} exploded to ({}, {})", pos.id, pos.x, pos.y
            );
        }
    }
}

#[test]
fn zero_target_fps_does_not_panic() {
    let config = PhysicsConfig {
        target_fps: 0,
        ..PhysicsConfig::default()
    };
    // frame_duration_us should not panic with division by zero
    let duration = config.frame_duration_us();
    assert!(duration > 0);

    // Constructor should not panic
    let _world = PhysicsWorld::new(config);
}

#[test]
fn reload_during_fps_mode_exits_cleanly() {
    let store = simple_graph();
    let mut world = PhysicsWorld::new(PhysicsConfig::default());
    world.load_from_graph(&store);

    // Enter FPS mode
    world.toggle_fps_mode();
    assert_eq!(world.mode(), crate::fps_mode::PhysicsMode::Fps);

    // Reload graph — should exit FPS mode first, not panic
    world.load_from_graph(&store);
    assert_eq!(world.mode(), crate::fps_mode::PhysicsMode::Graph);
    assert!(world.fps_frame().is_none());
    assert_eq!(world.node_count(), 3);
}
