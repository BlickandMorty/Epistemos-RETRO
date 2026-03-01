use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use embeddings::onnx::DEFAULT_DIM;
use embeddings::store::EmbeddingStore;
use engine::cost::CostTracker;
use graph::store::GraphStore;
use storage::db::Database;
use sync::watcher::VaultWatcher;
use tokio_util::sync::CancellationToken;
use ui_physics::fps_player::FpsInput;
use ui_physics::world::{PhysicsConfig, PhysicsWorld};

use crate::error::AppError;

// LOCK ORDERING: Always acquire in this order to prevent deadlock:
// 1. db
// 2. graph
// 3. embeddings
// 4. physics
// 5. watcher
// 6. cost_tracker
// Never hold a higher-numbered lock while acquiring a lower-numbered one.

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub physics: Arc<Mutex<PhysicsWorld>>,
    /// Cached in-memory graph store with FST search index.
    /// Avoids rebuilding per-request (~5-10ms savings per search).
    pub graph: Arc<Mutex<GraphStore>>,
    /// SIMD-accelerated embedding store for semantic similarity + KNN.
    pub embeddings: Arc<Mutex<EmbeddingStore>>,
    /// Whether the 90fps physics loop is currently running.
    pub physics_running: Arc<AtomicBool>,
    /// Live vault file watcher. None when no vault is configured or watching is stopped.
    pub watcher: Arc<Mutex<Option<VaultWatcher>>>,
    /// Per-model token pricing + daily budget tracking.
    pub cost_tracker: Arc<Mutex<CostTracker>>,
    /// Cancellation token for the current enrichment pipeline.
    /// Replaced on each new `submit_query` to cancel stale enrichment.
    pub enrichment_cancel: Arc<Mutex<Option<CancellationToken>>>,
    /// Cached inference availability — refreshed by `check_local_services`.
    pub inference_availability: Arc<Mutex<engine::triage::InferenceAvailability>>,
    /// Decoupled FPS input buffer — written by frontend at 60Hz, read by physics
    /// loop at 90Hz. Separate from physics mutex to eliminate input lag.
    pub fps_input_pending: Arc<Mutex<FpsInput>>,
}

impl AppState {
    pub fn new(db: Database) -> Self {
        // Load persisted cost tracker from settings KV, or default.
        let cost_tracker = db.get_setting("cost_tracker")
            .ok()
            .flatten()
            .map(|json| CostTracker::from_json(&json))
            .unwrap_or_default();

        Self {
            db: Arc::new(Mutex::new(db)),
            physics: Arc::new(Mutex::new(PhysicsWorld::new(PhysicsConfig::default()))),
            graph: Arc::new(Mutex::new(GraphStore::new())),
            embeddings: Arc::new(Mutex::new(EmbeddingStore::new(DEFAULT_DIM))),
            physics_running: Arc::new(AtomicBool::new(false)),
            watcher: Arc::new(Mutex::new(None)),
            cost_tracker: Arc::new(Mutex::new(cost_tracker)),
            enrichment_cancel: Arc::new(Mutex::new(None)),
            inference_availability: Arc::new(Mutex::new(engine::triage::InferenceAvailability {
                has_npu: false,
                has_gpu: false,
                has_cloud: true, // Cloud is the default assumption
            })),
            fps_input_pending: Arc::new(Mutex::new(FpsInput::default())),
        }
    }

    pub fn lock_db(&self) -> Result<MutexGuard<'_, Database>, AppError> {
        self.db.lock().map_err(|e| AppError::Internal(format!("db lock poisoned: {e}")))
    }

    pub fn lock_graph(&self) -> Result<MutexGuard<'_, GraphStore>, AppError> {
        self.graph.lock().map_err(|e| AppError::Internal(format!("graph lock poisoned: {e}")))
    }

    pub fn lock_embeddings(&self) -> Result<MutexGuard<'_, EmbeddingStore>, AppError> {
        self.embeddings.lock().map_err(|e| AppError::Internal(format!("embeddings lock poisoned: {e}")))
    }

    pub fn lock_physics(&self) -> Result<MutexGuard<'_, PhysicsWorld>, AppError> {
        self.physics.lock().map_err(|e| AppError::Internal(format!("physics lock poisoned: {e}")))
    }

    pub fn lock_watcher(&self) -> Result<MutexGuard<'_, Option<VaultWatcher>>, AppError> {
        self.watcher.lock().map_err(|e| AppError::Internal(format!("watcher lock poisoned: {e}")))
    }

    pub fn lock_cost_tracker(&self) -> Result<MutexGuard<'_, CostTracker>, AppError> {
        self.cost_tracker.lock().map_err(|e| AppError::Internal(format!("cost_tracker lock poisoned: {e}")))
    }

    pub fn is_physics_running(&self) -> bool {
        self.physics_running.load(Ordering::Relaxed)
    }

    /// Reload the cached graph store from the database.
    /// Call after graph mutations (rebuild, entity extraction, etc.).
    pub fn reload_graph(&self) -> Result<(), AppError> {
        // Extract data from db, then DROP db lock before acquiring graph lock.
        // Lock ordering: db (1) must not be held while acquiring graph (2).
        let (nodes, edges) = {
            let db = self.lock_db()?;
            let n = db.get_all_graph_nodes().map_err(AppError::from)?;
            let e = db.get_all_graph_edges().map_err(AppError::from)?;
            (n, e)
        }; // db lock dropped here

        let mut store = self.lock_graph()?;
        store.load(&nodes, &edges);
        Ok(())
    }
}
