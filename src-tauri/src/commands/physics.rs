use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use graph::store::GraphStore;
use ui_physics::fps_player::FpsInput;
use crate::error::AppError;
use crate::state::AppState;

/// Start the physics simulation loop at the configured tick rate (default: 90Hz).
/// Loads graph from DB, builds physics world, and emits `physics-frame` events.
#[tauri::command]
#[specta::specta]
pub async fn start_physics(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    // Don't start if already running.
    if state.physics_running.load(Ordering::Relaxed) {
        return Ok(());
    }

    // Load graph from DB and build physics world.
    let (nodes, edges) = {
        let db = state.lock_db()?;
        let nodes = db.get_all_graph_nodes()?;
        let edges = db.get_all_graph_edges()?;
        (nodes, edges)
    };

    {
        let mut store = GraphStore::new();
        store.load(&nodes, &edges);
        let mut physics = state.lock_physics()?;
        physics.load_from_graph(&store);
    }

    // Mark as running.
    state.physics_running.store(true, Ordering::Relaxed);

    // Compute frame timing from physics config.
    let frame_duration_us = {
        let physics_world = state.lock_physics()?;
        let dt = physics_world.integration_parameters().dt;
        let fps = (1.0 / dt).round() as u64;
        1_000_000 / fps.max(1)
    };

    // Spawn the physics loop on a background thread.
    let physics = state.physics.clone();
    let running = state.physics_running.clone();
    let fps_input_buf = state.fps_input_pending.clone();

    tokio::spawn(async move {
        let frame_duration = std::time::Duration::from_micros(frame_duration_us);

        while running.load(Ordering::Relaxed) {
            let start = std::time::Instant::now();

            // Drain pending FPS input BEFORE acquiring the physics lock.
            // This keeps the input buffer lock held for < 1μs (struct copy),
            // completely eliminating contention with the frontend's fps_input() calls.
            let pending_input = {
                let mut buf = fps_input_buf.lock().unwrap_or_else(|e| e.into_inner());
                let snapshot = buf.clone();
                *buf = FpsInput::default();
                snapshot
            };

            // Single lock acquisition per frame — apply input + step + extract FPS data.
            let (frame, fps_data) = {
                let Ok(mut world) = physics.lock() else {
                    eprintln!("[WARN][physics] lock poisoned — stopping simulation");
                    running.store(false, Ordering::Relaxed);
                    break;
                };
                world.set_fps_input(pending_input);
                let f = world.step();
                let fps = world.fps_frame();
                (f, fps)
            };

            // Emit positions to frontend.
            let _ = app.emit("physics-frame", &frame);

            // Check FPS mode before consuming fps_data.
            let is_fps = fps_data.is_some();

            // In FPS mode, also emit player state.
            if let Some(fps_frame) = fps_data {
                let _ = app.emit("fps-frame", &fps_frame);
            }

            // If settled in graph mode, slow to 15fps to save CPU.
            // NEVER throttle in FPS mode — player needs responsive controls even when hovering.
            let target = if frame.settled && !is_fps {
                std::time::Duration::from_millis(67) // ~15fps idle
            } else {
                frame_duration
            };

            let elapsed = start.elapsed();
            if elapsed < target {
                tokio::time::sleep(target - elapsed).await;
            }
        }
    });

    Ok(())
}

/// Stop the physics simulation loop.
#[tauri::command]
#[specta::specta]
pub async fn stop_physics(state: State<'_, AppState>) -> Result<(), AppError> {
    state.physics_running.store(false, Ordering::Relaxed);
    Ok(())
}

/// Pin a node in place (drag start).
#[tauri::command]
#[specta::specta]
pub async fn pin_node(state: State<'_, AppState>, node_id: String) -> Result<(), AppError> {
    let mut physics = state.lock_physics()?;
    physics.pin_node(&node_id);
    Ok(())
}

/// Unpin a node (drag end).
#[tauri::command]
#[specta::specta]
pub async fn unpin_node(state: State<'_, AppState>, node_id: String) -> Result<(), AppError> {
    let mut physics = state.lock_physics()?;
    physics.unpin_node(&node_id);
    Ok(())
}

/// Move a pinned node to new coordinates (during drag).
#[tauri::command]
#[specta::specta]
pub async fn move_node(state: State<'_, AppState>, node_id: String, x: f32, y: f32, z: f32) -> Result<(), AppError> {
    let mut physics = state.lock_physics()?;
    physics.move_node(&node_id, x, y, z);
    Ok(())
}

/// Check if physics is currently running.
#[tauri::command]
#[specta::specta]
pub async fn is_physics_running(state: State<'_, AppState>) -> Result<bool, AppError> {
    Ok(state.is_physics_running())
}

// ── FPS Exploration Mode ─────────────────────────────────────────────

/// Toggle between graph layout and FPS exploration mode.
/// Returns the new mode ("Graph" or "Fps").
#[tauri::command]
#[specta::specta]
pub async fn toggle_fps_mode(state: State<'_, AppState>) -> Result<String, AppError> {
    let mut physics = state.lock_physics()?;
    let new_mode = physics.toggle_fps_mode();
    Ok(format!("{new_mode:?}"))
}

/// Send FPS input (thruster + mouse) for the current frame.
/// Called by the frontend on each animation frame while in FPS mode.
/// Writes to a decoupled input buffer (NOT the physics mutex) to avoid
/// contention with the 90Hz physics loop. Input is consumed by the loop
/// on its next tick.
#[tauri::command]
#[specta::specta]
pub async fn fps_input(state: State<'_, AppState>, input: FpsInput) -> Result<(), AppError> {
    let mut pending = state.fps_input_pending.lock()
        .map_err(|e| AppError::Internal(format!("fps_input lock: {e}")))?;
    // Accumulate mouse deltas (summed between physics ticks) but overwrite thrust.
    pending.forward = input.forward;
    pending.strafe = input.strafe;
    pending.vertical = input.vertical;
    pending.mouse_dx += input.mouse_dx;
    pending.mouse_dy += input.mouse_dy;
    pending.toggle_stabilization |= input.toggle_stabilization;
    Ok(())
}

/// Get the current physics mode ("Graph" or "Fps").
#[tauri::command]
#[specta::specta]
pub async fn get_physics_mode(state: State<'_, AppState>) -> Result<String, AppError> {
    let physics = state.lock_physics()?;
    Ok(format!("{:?}", physics.mode()))
}
