use rustc_hash::FxHashMap;

use rapier3d::math::Vector;
use rapier3d::prelude::*;
use serde::Serialize;

use graph::store::GraphStore;

use crate::fps_mode::{self, FpsConfig, FpsFrame, PhysicsMode};
use crate::fps_player::{FpsInput, FpsPlayer};

/// Position snapshot for a single node, sent to frontend each frame.
#[derive(Debug, Clone, Serialize)]
pub struct NodePosition {
    pub id: String,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Full frame of positions for all visible nodes.
#[derive(Debug, Clone, Serialize)]
pub struct PhysicsFrame {
    pub positions: Vec<NodePosition>,
    pub settled: bool,
}

/// Configuration for the force-directed layout.
#[derive(Debug, Clone)]
pub struct PhysicsConfig {
    /// Rest length of spring joints (edge natural length).
    pub spring_rest_length: f32,
    /// Spring stiffness (higher = tighter clusters).
    pub spring_stiffness: f32,
    /// Linear damping applied to all bodies (0.0 = no damping, 1.0 = heavy).
    pub damping: f32,
    /// Repulsion strength for the central force (keeps nodes from drifting).
    pub gravity_strength: f32,
    /// Mass multiplier per unit of node weight.
    pub mass_per_weight: f32,
    /// Velocity threshold below which the simulation is considered settled.
    pub settle_threshold: f32,
    /// Target simulation tick rate in Hz (matches display refresh rate).
    /// Common: 60, 90, 120. Default: 90 (Dell XPS 16 9640 OLED panel).
    pub target_fps: u32,
}

impl Default for PhysicsConfig {
    fn default() -> Self {
        Self {
            spring_rest_length: 80.0,
            spring_stiffness: 0.5,
            damping: 0.85,
            gravity_strength: 0.02,
            mass_per_weight: 1.0,
            settle_threshold: 0.1,
            target_fps: 90,
        }
    }
}

impl PhysicsConfig {
    /// Frame duration in microseconds for the configured fps target.
    pub fn frame_duration_us(&self) -> u64 {
        1_000_000 / (self.target_fps as u64).max(1)
    }
}

/// Rapier3D-backed physics world for force-directed graph layout.
///
/// Each graph node becomes a dynamic rigid body with a ball collider.
/// Each graph edge becomes a spring joint constraining two bodies.
/// A central attractor force pulls nodes toward origin to prevent drift.
///
/// The world runs at a fixed timestep (1/60s) and produces NodePosition
/// snapshots for the frontend to render.
///
/// ## Performance architecture
///
/// - `node_to_body` (FxHashMap): used for O(1) lookups on pin/unpin/move
///   (user interactions, not hot path). FxHash is ~4x faster than SipHash.
/// - `frame_nodes` (Vec): contiguous array iterated every frame in
///   `extract_frame()`. Vec iteration is ~3-5x faster than HashMap iteration
///   due to cache-line locality (16 entries per 64-byte cache line vs scattered).
/// - No `body_to_node` reverse map — it was never read.
pub struct PhysicsWorld {
    rigid_body_set: RigidBodySet,
    collider_set: ColliderSet,
    impulse_joint_set: ImpulseJointSet,
    multibody_joint_set: MultibodyJointSet,
    integration_parameters: IntegrationParameters,
    physics_pipeline: PhysicsPipeline,
    island_manager: IslandManager,
    broad_phase: DefaultBroadPhase,
    narrow_phase: NarrowPhase,
    ccd_solver: CCDSolver,

    /// O(1) lookup: node ID → Rapier body handle (for pin/unpin/move).
    node_to_body: FxHashMap<String, RigidBodyHandle>,
    /// Contiguous hot-path array: iterated every frame in extract_frame().
    /// Built once during load_from_graph, never modified during simulation.
    frame_nodes: Vec<FrameNode>,

    config: PhysicsConfig,
    paused: bool,
    tick_count: u64,

    // ── FPS exploration mode ─────────────────────────────────
    mode: PhysicsMode,
    fps_config: FpsConfig,
    fps_player: Option<FpsPlayer>,
    /// Pending input for the next FPS tick (consumed each step).
    fps_input: FpsInput,
}

/// A single entry in the hot iteration array.
/// Stored contiguously for cache-friendly 60fps iteration.
struct FrameNode {
    id: String,
    handle: RigidBodyHandle,
}

impl PhysicsWorld {
    pub fn new(config: PhysicsConfig) -> Self {
        let params = IntegrationParameters {
            dt: 1.0 / (config.target_fps.max(1)) as f32,
            ..IntegrationParameters::default()
        };

        Self {
            rigid_body_set: RigidBodySet::new(),
            collider_set: ColliderSet::new(),
            impulse_joint_set: ImpulseJointSet::new(),
            multibody_joint_set: MultibodyJointSet::new(),
            integration_parameters: params,
            physics_pipeline: PhysicsPipeline::new(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            ccd_solver: CCDSolver::new(),
            node_to_body: FxHashMap::default(),
            frame_nodes: Vec::new(),
            config,
            paused: false,
            tick_count: 0,
            mode: PhysicsMode::Graph,
            fps_config: FpsConfig::default(),
            fps_player: None,
            fps_input: FpsInput::default(),
        }
    }

    /// Build physics bodies and joints from a GraphStore.
    /// Clears any existing state first.
    /// If in FPS mode, exits cleanly before reloading.
    pub fn load_from_graph(&mut self, store: &GraphStore) {
        // Exit FPS mode cleanly before clearing — avoids silently destroying
        // the player body and leaving the frontend in a stale FPS state.
        if self.mode == PhysicsMode::Fps {
            self.exit_fps_mode();
        }
        self.clear();

        // Pre-allocate based on visible node count estimate.
        let estimated_visible = store.nodes.len();
        self.frame_nodes.reserve(estimated_visible);

        // 1. Create rigid bodies for each visible node.
        for (node_id, node) in &store.nodes {
            if !node.is_visible {
                continue;
            }

            let weight_f32 = if node.weight.is_finite() { node.weight as f32 } else { 1.0 };
            let mass = (weight_f32 * self.config.mass_per_weight).max(0.5);
            let radius = (store.link_count(node_id) as f32).cbrt() * 8.0 + 4.0;

            let rb = RigidBodyBuilder::dynamic()
                .translation(Vector::new(node.x, node.y, node.z))
                .linear_damping(self.config.damping)
                .additional_mass(mass)
                .build();

            let body_handle = self.rigid_body_set.insert(rb);

            // Ball collider for repulsion (nodes push each other apart).
            let collider = ColliderBuilder::ball(radius)
                .restitution(0.0)
                .friction(0.5)
                .build();
            self.collider_set.insert_with_parent(collider, body_handle, &mut self.rigid_body_set);

            self.node_to_body.insert(node_id.clone(), body_handle);
            self.frame_nodes.push(FrameNode {
                id: node_id.clone(),
                handle: body_handle,
            });
        }

        // 2. Create spring joints for each edge.
        for edge in store.edges.values() {
            let src_handle = match self.node_to_body.get(&edge.source_node_id) {
                Some(&h) => h,
                None => continue,
            };
            let tgt_handle = match self.node_to_body.get(&edge.target_node_id) {
                Some(&h) => h,
                None => continue,
            };

            // Spring joint: anchored at body centers, with rest length.
            // Guard: negative/NaN weight → f32::sqrt() returns NaN, NaN.max() is NaN,
            // corrupting the joint and causing all connected nodes to explode.
            // Guard: negative stiffness config → spring becomes attractive, nodes explode outward.
            let safe_weight = (edge.weight as f32).max(0.1);
            let rest_length = self.config.spring_rest_length.max(1.0) / safe_weight.sqrt().max(0.5);
            let stiffness = self.config.spring_stiffness.max(0.01) * safe_weight;

            let joint = SpringJointBuilder::new(rest_length, stiffness, self.config.damping * 0.5)
                .local_anchor1(Vector::ZERO)
                .local_anchor2(Vector::ZERO)
                .build();

            self.impulse_joint_set.insert(src_handle, tgt_handle, joint, true);
        }
    }

    /// Step the simulation forward by one frame.
    /// Dispatches to either graph-layout or FPS-exploration physics.
    pub fn step(&mut self) -> PhysicsFrame {
        if !self.paused {
            match self.mode {
                PhysicsMode::Graph => self.step_graph(),
                PhysicsMode::Fps => self.step_fps(),
            }
            self.tick_count += 1;
        }

        self.extract_frame()
    }

    /// Maximum velocity magnitude for graph-layout mode.
    /// Prevents spring-explosion artifacts when nodes are far apart.
    const MAX_GRAPH_VELOCITY: f32 = 500.0;

    /// Graph-layout step: spring joints + central gravity + velocity clamping.
    fn step_graph(&mut self) {
        self.apply_central_gravity();
        self.run_rapier_step();
        self.clamp_velocities(Self::MAX_GRAPH_VELOCITY);
    }

    /// FPS-exploration step: N-body gravity + thruster forces + stabilization.
    fn step_fps(&mut self) {
        let Some(ref mut player) = self.fps_player else {
            return;
        };

        // Process mouse look
        let sensitivity = self.fps_config.mouse_sensitivity;
        player.apply_mouse_look(
            self.fps_input.mouse_dx,
            self.fps_input.mouse_dy,
            sensitivity,
        );

        if self.fps_input.toggle_stabilization {
            player.toggle_stabilization();
        }

        let player_handle = player.body_handle;
        let stabilization = player.stabilization;

        // Get player position for gravity calculation
        let player_pos = self.rigid_body_set
            .get(player_handle)
            .map(|b| b.translation())
            .unwrap_or(Vector::ZERO);
        let player_mass = self.rigid_body_set
            .get(player_handle)
            .map(|b| b.mass())
            .unwrap_or(1.0);

        // Compute N-body gravity from frozen nodes
        let gravity_force = fps_mode::compute_nbody_gravity(
            &player_pos,
            player_mass,
            &self.node_to_body,
            &self.rigid_body_set,
            player_handle,
            &self.fps_config,
        );

        // Compute thruster force from input
        let Some(player_ref) = self.fps_player.as_ref() else { return; };
        let thrust_force = fps_mode::compute_thruster_force(
            &self.fps_input,
            player_ref,
            &self.fps_config,
        );

        // Apply forces to player body
        if let Some(body) = self.rigid_body_set.get_mut(player_handle) {
            body.add_force(gravity_force + thrust_force, true);
        }

        // Apply stabilization dampening
        let dt = self.integration_parameters.dt;
        if let Some(body) = self.rigid_body_set.get_mut(player_handle) {
            fps_mode::apply_stabilization(body, &stabilization, &self.fps_config, dt);
        }

        // Run physics step
        self.run_rapier_step();

        // Clear consumed input (mouse deltas are per-frame)
        self.fps_input.mouse_dx = 0.0;
        self.fps_input.mouse_dy = 0.0;
        self.fps_input.toggle_stabilization = false;
    }

    /// Shared Rapier3D pipeline step (used by both modes).
    fn run_rapier_step(&mut self) {
        self.physics_pipeline.step(
            Vector::ZERO,
            &self.integration_parameters,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.ccd_solver,
            &(),
            &(),
        );
    }

    /// Apply a gentle central force pulling all bodies toward the origin.
    /// Prevents the graph from drifting off-screen while springs settle.
    fn apply_central_gravity(&mut self) {
        let strength = self.config.gravity_strength;
        for (_, body) in self.rigid_body_set.iter_mut() {
            if !body.is_dynamic() {
                continue;
            }
            let pos = body.translation();
            let dist = pos.length();
            if dist > 1.0 {
                let force = Vector::new(-pos.x * strength, -pos.y * strength, -pos.z * strength);
                body.add_force(force, true);
            }
        }
    }

    /// Clamp all body velocities to prevent explosion artifacts.
    /// When springs are stiff and nodes are far apart, forces can be enormous,
    /// causing nodes to shoot past equilibrium and oscillate wildly.
    fn clamp_velocities(&mut self, max_speed: f32) {
        let max_sq = max_speed * max_speed;
        for (_, body) in self.rigid_body_set.iter_mut() {
            if !body.is_dynamic() {
                continue;
            }
            let vel = body.linvel();
            let speed_sq = vel.length_squared();
            if speed_sq > max_sq {
                let scale = max_speed / speed_sq.sqrt();
                body.set_linvel(vel * scale, true);
            }
        }
    }

    /// Extract current positions for all nodes.
    ///
    /// Iterates the contiguous `frame_nodes` Vec (not a HashMap) for
    /// cache-friendly sequential access. At 10K nodes this saves ~1-2ms
    /// per frame vs HashMap iteration.
    fn extract_frame(&self) -> PhysicsFrame {
        let mut positions = Vec::with_capacity(self.frame_nodes.len());
        let mut max_velocity: f32 = 0.0;

        for node in &self.frame_nodes {
            if let Some(body) = self.rigid_body_set.get(node.handle) {
                let pos = body.translation();
                positions.push(NodePosition {
                    id: node.id.clone(),
                    x: pos.x,
                    y: pos.y,
                    z: pos.z,
                });

                let speed = body.linvel().length();
                max_velocity = max_velocity.max(speed);
            }
        }

        PhysicsFrame {
            positions,
            settled: max_velocity < self.config.settle_threshold,
        }
    }

    /// Check if the simulation has settled (all velocities below threshold).
    pub fn is_settled(&self) -> bool {
        for node in &self.frame_nodes {
            if let Some(body) = self.rigid_body_set.get(node.handle) {
                if body.linvel().length() >= self.config.settle_threshold {
                    return false;
                }
            }
        }
        true
    }

    /// Pin a node in place (make it kinematic).
    pub fn pin_node(&mut self, node_id: &str) {
        if let Some(&handle) = self.node_to_body.get(node_id) {
            if let Some(body) = self.rigid_body_set.get_mut(handle) {
                body.set_body_type(RigidBodyType::KinematicPositionBased, true);
            }
        }
    }

    /// Unpin a node (make it dynamic again).
    pub fn unpin_node(&mut self, node_id: &str) {
        if let Some(&handle) = self.node_to_body.get(node_id) {
            if let Some(body) = self.rigid_body_set.get_mut(handle) {
                body.set_body_type(RigidBodyType::Dynamic, true);
            }
        }
    }

    /// Move a pinned node to a new position (drag support).
    pub fn move_node(&mut self, node_id: &str, x: f32, y: f32, z: f32) {
        if let Some(&handle) = self.node_to_body.get(node_id) {
            if let Some(body) = self.rigid_body_set.get_mut(handle) {
                body.set_translation(Vector::new(x, y, z), true);
            }
        }
    }

    /// Pause/resume the simulation.
    pub fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn integration_parameters(&self) -> &IntegrationParameters {
        &self.integration_parameters
    }

    pub fn tick_count(&self) -> u64 {
        self.tick_count
    }

    pub fn node_count(&self) -> usize {
        self.frame_nodes.len()
    }

    // ── FPS Exploration Mode ──────────────────────────────────────

    /// Current physics mode.
    pub fn mode(&self) -> PhysicsMode {
        self.mode
    }

    /// Toggle between Graph and FPS modes.
    ///
    /// Graph → FPS: freeze all nodes (kinematic), spawn player body at origin.
    /// FPS → Graph: remove player body, unfreeze all nodes (dynamic).
    pub fn toggle_fps_mode(&mut self) -> PhysicsMode {
        match self.mode {
            PhysicsMode::Graph => self.enter_fps_mode(),
            PhysicsMode::Fps => self.exit_fps_mode(),
        }
        self.mode
    }

    /// Enter FPS mode: freeze nodes, spawn player at centroid.
    fn enter_fps_mode(&mut self) {
        // 1. Scale up node positions for exploration feel
        // Guard: world_scale must be positive to avoid zero/negative scaling.
        let scale = self.fps_config.world_scale.max(1.0);
        let mut centroid = Vector::ZERO;
        let mut count = 0u32;

        for node in &self.frame_nodes {
            if let Some(body) = self.rigid_body_set.get_mut(node.handle) {
                let pos = body.translation();
                let scaled = pos * scale;
                body.set_translation(scaled, false);
                // Freeze node in place (kinematic = immovable)
                body.set_body_type(RigidBodyType::KinematicPositionBased, true);
                body.set_linvel(Vector::ZERO, false);
                centroid += scaled;
                count += 1;
            }
        }

        // 2. Spawn player body at centroid of visible nodes (not origin).
        // If the graph is empty, fall back to origin.
        let spawn_pos = if count > 0 {
            centroid / count as f32
        } else {
            Vector::ZERO
        };
        let player_rb = RigidBodyBuilder::dynamic()
            .translation(spawn_pos)
            .linear_damping(0.1)
            .additional_mass(5.0)
            .build();
        let player_handle = self.rigid_body_set.insert(player_rb);

        // Small sphere collider for the player ship
        let collider = ColliderBuilder::ball(2.0)
            .restitution(0.3)
            .friction(0.1)
            .build();
        self.collider_set.insert_with_parent(collider, player_handle, &mut self.rigid_body_set);

        self.fps_player = Some(FpsPlayer::new(player_handle));
        self.fps_input = FpsInput::default();
        self.mode = PhysicsMode::Fps;
    }

    /// Exit FPS mode: remove player, unfreeze nodes, scale back.
    fn exit_fps_mode(&mut self) {
        // 1. Remove player body
        if let Some(ref player) = self.fps_player {
            self.rigid_body_set.remove(
                player.body_handle,
                &mut self.island_manager,
                &mut self.collider_set,
                &mut self.impulse_joint_set,
                &mut self.multibody_joint_set,
                true,
            );
        }
        self.fps_player = None;

        // 2. Unfreeze nodes and scale back down
        // Guard: world_scale must be positive to avoid division by zero/NaN.
        let scale = self.fps_config.world_scale.max(1.0);
        for node in &self.frame_nodes {
            if let Some(body) = self.rigid_body_set.get_mut(node.handle) {
                let pos = body.translation();
                body.set_translation(pos / scale, false);
                body.set_body_type(RigidBodyType::Dynamic, true);
            }
        }

        self.mode = PhysicsMode::Graph;
    }

    /// Set FPS input state (called from Tauri command each frame).
    pub fn set_fps_input(&mut self, input: FpsInput) {
        self.fps_input = input;
    }

    /// Get current FPS frame data (player position, speed, proximity).
    /// Returns None if not in FPS mode.
    pub fn fps_frame(&self) -> Option<FpsFrame> {
        let player = self.fps_player.as_ref()?;
        let body = self.rigid_body_set.get(player.body_handle)?;

        let pos = body.translation();
        let speed = body.linvel().length();

        let proximity = fps_mode::find_nearest_node(
            &pos,
            &self.node_to_body,
            &self.rigid_body_set,
            player.body_handle,
            500.0, // proximity radius
        );

        Some(FpsFrame {
            x: pos.x,
            y: pos.y,
            z: pos.z,
            yaw: player.yaw,
            pitch: player.pitch,
            speed,
            proximity_node: proximity,
            stabilization: player.stabilization.to_string(),
        })
    }

    /// Clear all physics state.
    fn clear(&mut self) {
        self.rigid_body_set = RigidBodySet::new();
        self.collider_set = ColliderSet::new();
        self.impulse_joint_set = ImpulseJointSet::new();
        self.multibody_joint_set = MultibodyJointSet::new();
        self.island_manager = IslandManager::new();
        self.broad_phase = DefaultBroadPhase::new();
        self.narrow_phase = NarrowPhase::new();
        self.ccd_solver = CCDSolver::new();
        self.node_to_body.clear();
        self.frame_nodes.clear();
        self.tick_count = 0;
        self.mode = PhysicsMode::Graph;
        self.fps_player = None;
        self.fps_input = FpsInput::default();
    }
}
