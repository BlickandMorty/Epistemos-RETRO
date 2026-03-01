//! FPS Exploration Mode — knowledge graph as a navigable universe.
//!
//! When active, graph nodes freeze at their current positions and become
//! celestial bodies. The player pilots a ship using Newtonian gravity
//! (N-body from nodes) and thruster controls (WASD + mouse).
//!
//! Physics: pure Rapier3D — no Bevy dependency. Algorithms extracted from
//! bevy-space-physics: N-body gravity (~30 lines), thruster controller (~40),
//! and Verlet-style momentum integration (handled by Rapier's solver).

use rapier3d::math::Vector;
use rapier3d::prelude::*;
use rustc_hash::FxHashMap;
use serde::Serialize;

use super::fps_player::{FpsInput, FpsPlayer, StabilizationMode};

/// Which simulation mode is active on the PhysicsWorld.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum PhysicsMode {
    /// Force-directed graph layout with spring joints.
    Graph,
    /// First-person exploration — nodes are frozen celestial bodies.
    Fps,
}

/// FPS-specific tuning parameters.
#[derive(Debug, Clone)]
pub struct FpsConfig {
    /// Gravitational constant (G). Scaled way down so gravity is suggestive,
    /// not trapping. Typical: 0.5–2.0.
    pub gravity_constant: f32,
    /// Main thruster force (forward/backward).
    pub main_thrust: f32,
    /// Lateral/vertical thruster force (strafe/up/down).
    pub lateral_thrust: f32,
    /// Mouse sensitivity in radians per pixel of mouse movement.
    pub mouse_sensitivity: f32,
    /// Maximum distance (in world units) for gravity computation.
    /// Nodes beyond this are ignored (frustum cull for perf).
    pub gravity_range: f32,
    /// Scale factor: graph layout coords → FPS world coords.
    /// Force-layout produces ~1000-unit radius; FPS needs 100–1000× for
    /// exploration feel (clusters should feel like solar systems).
    pub world_scale: f32,
    /// Rotation dampening factor when stabilization is active.
    pub rotation_damping: f32,
    /// Movement dampening factor when full stabilization is active.
    pub movement_damping: f32,
}

impl Default for FpsConfig {
    fn default() -> Self {
        Self {
            gravity_constant: 1.0,
            main_thrust: 50.0,
            lateral_thrust: 30.0,
            mouse_sensitivity: 0.003,
            gravity_range: 50_000.0,
            world_scale: 100.0,
            rotation_damping: 3.0,
            movement_damping: 2.0,
        }
    }
}

/// Extended frame data emitted in FPS mode (alongside the normal PhysicsFrame).
#[derive(Debug, Clone, Serialize)]
pub struct FpsFrame {
    /// Player position in world space.
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// Player orientation (yaw/pitch in radians).
    pub yaw: f32,
    pub pitch: f32,
    /// Current speed (scalar, for HUD speedometer).
    pub speed: f32,
    /// Nearest node within proximity range, if any.
    pub proximity_node: Option<ProximityInfo>,
    /// Current stabilization mode.
    pub stabilization: String,
}

/// Info about the nearest node (for proximity HUD).
#[derive(Debug, Clone, Serialize)]
pub struct ProximityInfo {
    pub node_id: String,
    pub distance: f32,
}

/// Compute N-body gravitational forces on the player from all frozen nodes.
///
/// F = G × m_player × m_node / r²
///
/// Only considers nodes within `gravity_range` (spatial culling).
/// Returns the total gravitational force vector.
pub fn compute_nbody_gravity(
    player_pos: &Vector,
    player_mass: f32,
    node_to_body: &FxHashMap<String, RigidBodyHandle>,
    rigid_body_set: &RigidBodySet,
    player_handle: RigidBodyHandle,
    config: &FpsConfig,
) -> Vector {
    let mut total_force = Vector::ZERO;
    let range_sq = config.gravity_range * config.gravity_range;
    let g = config.gravity_constant;

    for &handle in node_to_body.values() {
        if handle == player_handle {
            continue;
        }

        let Some(body) = rigid_body_set.get(handle) else {
            continue;
        };

        let node_pos = body.translation();
        let delta = node_pos - player_pos;
        let dist_sq = delta.length_squared();

        // Skip nodes beyond range or too close (avoid division by near-zero)
        if dist_sq > range_sq || dist_sq < 1.0 {
            continue;
        }

        let dist = dist_sq.sqrt();
        let node_mass = body.mass();
        let force_magnitude = g * player_mass * node_mass / dist_sq;

        // Direction: toward the node
        let direction = delta / dist;
        let contribution = direction * force_magnitude;
        // Guard against NaN from corrupted physics state
        if contribution.x.is_finite() && contribution.y.is_finite() && contribution.z.is_finite() {
            total_force += contribution;
        }
    }

    total_force
}

/// Apply thruster forces based on player input, in the player's local frame.
///
/// Returns the world-space force vector to apply.
pub fn compute_thruster_force(
    input: &FpsInput,
    player: &FpsPlayer,
    config: &FpsConfig,
) -> Vector {
    // Build local-space direction vectors from yaw/pitch
    let (sin_yaw, cos_yaw) = player.yaw.sin_cos();
    let (sin_pitch, cos_pitch) = player.pitch.sin_cos();

    // Forward vector (into the screen, following yaw + pitch)
    let forward = Vector::new(
        cos_pitch * sin_yaw,
        -sin_pitch,
        cos_pitch * cos_yaw,
    );

    // Right vector (perpendicular to forward, in XZ plane)
    let right = Vector::new(cos_yaw, 0.0, -sin_yaw);

    // Up vector (world up for simplicity — no roll)
    let up = Vector::new(0.0, 1.0, 0.0);

    forward * (input.forward * config.main_thrust)
        + right * (input.strafe * config.lateral_thrust)
        + up * (input.vertical * config.lateral_thrust)
}

/// Apply stabilization dampening forces to the player body.
pub fn apply_stabilization(
    body: &mut RigidBody,
    stabilization: &StabilizationMode,
    config: &FpsConfig,
    dt: f32,
) {
    match stabilization {
        StabilizationMode::None => {}
        StabilizationMode::Aiming => {
            // Dampen angular velocity only
            let angvel = body.angvel();
            let damping = (-config.rotation_damping * dt).exp();
            body.set_angvel(angvel * damping, true);
        }
        StabilizationMode::Full => {
            // Dampen both angular and linear velocity
            let angvel = body.angvel();
            let linvel = body.linvel();
            let rot_damping = (-config.rotation_damping * dt).exp();
            let mov_damping = (-config.movement_damping * dt).exp();
            body.set_angvel(angvel * rot_damping, true);
            body.set_linvel(linvel * mov_damping, true);
        }
    }
}

/// Find the nearest node to the player within a proximity radius.
pub fn find_nearest_node(
    player_pos: &Vector,
    node_to_body: &FxHashMap<String, RigidBodyHandle>,
    rigid_body_set: &RigidBodySet,
    player_handle: RigidBodyHandle,
    proximity_radius: f32,
) -> Option<ProximityInfo> {
    let mut nearest: Option<(String, f32)> = None;
    let radius_sq = proximity_radius * proximity_radius;

    for (node_id, &handle) in node_to_body {
        if handle == player_handle {
            continue;
        }
        let Some(body) = rigid_body_set.get(handle) else {
            continue;
        };
        let dist_sq = (body.translation() - player_pos).length_squared();
        if dist_sq < radius_sq {
            let dist = dist_sq.sqrt();
            if nearest.as_ref().is_none_or(|(_, d)| dist < *d) {
                nearest = Some((node_id.clone(), dist));
            }
        }
    }

    nearest.map(|(node_id, distance)| ProximityInfo { node_id, distance })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_is_reasonable() {
        let c = FpsConfig::default();
        assert!(c.gravity_constant > 0.0);
        assert!(c.main_thrust > c.lateral_thrust);
        assert!(c.world_scale >= 10.0);
    }

    #[test]
    fn thruster_force_zero_input() {
        let input = FpsInput::default();
        let player = FpsPlayer::new(RigidBodyHandle::from_raw_parts(0, 0));
        let config = FpsConfig::default();
        let force = compute_thruster_force(&input, &player, &config);
        assert!(force.length() < f32::EPSILON);
    }

    #[test]
    fn thruster_forward_produces_force() {
        let input = FpsInput { forward: 1.0, ..Default::default() };
        let player = FpsPlayer::new(RigidBodyHandle::from_raw_parts(0, 0));
        let config = FpsConfig::default();
        let force = compute_thruster_force(&input, &player, &config);
        assert!(force.length() > 0.0);
    }

    #[test]
    fn gravity_empty_world() {
        let map = FxHashMap::default();
        let bodies = RigidBodySet::new();
        let handle = RigidBodyHandle::from_raw_parts(0, 0);
        let config = FpsConfig::default();
        let force = compute_nbody_gravity(
            &Vector::ZERO, 1.0, &map, &bodies, handle, &config,
        );
        assert_eq!(force, Vector::ZERO);
    }
}
