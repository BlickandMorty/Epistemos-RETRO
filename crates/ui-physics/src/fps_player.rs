//! FPS player state and input mapping.
//!
//! The player is a single Rapier3D dynamic body (small sphere collider)
//! that receives thruster forces and gravitational attraction. Yaw/pitch
//! are tracked separately (not via Rapier rotation) for responsive mouse-look.

use rapier3d::prelude::RigidBodyHandle;
use serde::{Deserialize, Serialize};

/// Stabilization mode — dampens unwanted motion.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StabilizationMode {
    /// No dampening — full Newtonian drift.
    None,
    /// Dampens rotation only (smooth aiming while drifting).
    Aiming,
    /// Dampens both rotation and movement (hover-in-place).
    Full,
}

impl StabilizationMode {
    /// Cycle to the next mode: None → Aiming → Full → None.
    pub fn next(self) -> Self {
        match self {
            Self::None => Self::Aiming,
            Self::Aiming => Self::Full,
            Self::Full => Self::None,
        }
    }
}

impl std::fmt::Display for StabilizationMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::None => write!(f, "none"),
            Self::Aiming => write!(f, "aiming"),
            Self::Full => write!(f, "full"),
        }
    }
}

/// Player state in FPS mode.
pub struct FpsPlayer {
    /// The Rapier3D body handle for the player ship.
    pub body_handle: RigidBodyHandle,
    /// Yaw angle in radians (horizontal rotation).
    pub yaw: f32,
    /// Pitch angle in radians (vertical tilt, clamped ±89°).
    pub pitch: f32,
    /// Current stabilization mode.
    pub stabilization: StabilizationMode,
}

impl FpsPlayer {
    pub fn new(body_handle: RigidBodyHandle) -> Self {
        Self {
            body_handle,
            yaw: 0.0,
            pitch: 0.0,
            stabilization: StabilizationMode::Aiming,
        }
    }

    /// Apply mouse delta to yaw/pitch. Pitch is clamped to ±89°.
    pub fn apply_mouse_look(&mut self, dx: f32, dy: f32, sensitivity: f32) {
        self.yaw += dx * sensitivity;
        self.pitch = (self.pitch + dy * sensitivity).clamp(
            -std::f32::consts::FRAC_PI_2 + 0.01,
            std::f32::consts::FRAC_PI_2 - 0.01,
        );
    }

    /// Cycle stabilization mode.
    pub fn toggle_stabilization(&mut self) {
        self.stabilization = self.stabilization.next();
    }
}

/// Input state from the frontend, sent per frame or on keypress.
#[derive(Debug, Clone, Default, Deserialize, specta::Type)]
pub struct FpsInput {
    /// Forward/backward thrust (-1.0 = backward, 1.0 = forward).
    pub forward: f32,
    /// Left/right strafe (-1.0 = left, 1.0 = right).
    pub strafe: f32,
    /// Up/down thrust (-1.0 = down, 1.0 = up).
    pub vertical: f32,
    /// Mouse horizontal delta (pixels).
    pub mouse_dx: f32,
    /// Mouse vertical delta (pixels).
    pub mouse_dy: f32,
    /// Whether to toggle stabilization mode this frame.
    pub toggle_stabilization: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stabilization_cycles() {
        let mut mode = StabilizationMode::None;
        mode = mode.next();
        assert_eq!(mode, StabilizationMode::Aiming);
        mode = mode.next();
        assert_eq!(mode, StabilizationMode::Full);
        mode = mode.next();
        assert_eq!(mode, StabilizationMode::None);
    }

    #[test]
    fn pitch_clamps() {
        let handle = RigidBodyHandle::from_raw_parts(0, 0);
        let mut player = FpsPlayer::new(handle);
        // Apply extreme upward mouse
        player.apply_mouse_look(0.0, -10000.0, 0.01);
        assert!(player.pitch > -std::f32::consts::FRAC_PI_2);
        assert!(player.pitch < -std::f32::consts::FRAC_PI_2 + 0.02);
    }

    #[test]
    fn default_input_is_zero() {
        let input = FpsInput::default();
        assert_eq!(input.forward, 0.0);
        assert_eq!(input.strafe, 0.0);
        assert_eq!(input.vertical, 0.0);
    }
}
