use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};
use sync::vault;
use sync::watcher::{VaultChangeKind, VaultWatcher};
use crate::error::AppError;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_vault_path(state: State<'_, AppState>) -> Result<Option<String>, AppError> {
    let db = state.lock_db()?;
    Ok(db.get_setting("vault_path")?)
}

#[tauri::command]
#[specta::specta]
pub async fn set_vault_path(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    let db = state.lock_db()?;
    db.set_setting("vault_path", &path)?;
    Ok(())
}

/// Import result returned to the frontend.
#[derive(Clone, Serialize, specta::Type)]
pub struct ImportResult {
    pub imported: usize,
    pub updated: usize,
    pub skipped: usize,
    pub errors: usize,
}

/// Import all .md files from the user's vault directory.
/// Incremental: only imports files newer than last sync.
/// Runs on spawn_blocking to avoid starving the async runtime with sync I/O.
#[tauri::command]
#[specta::specta]
pub async fn import_vault(state: State<'_, AppState>) -> Result<ImportResult, AppError> {
    let vault_path = {
        let db = state.lock_db()?;
        db.get_setting("vault_path")?
            .ok_or_else(|| AppError::Internal("No vault path configured".into()))?
    };

    // Clone Arc for spawn_blocking (State doesn't implement Send)
    let app_state = state.inner().clone();

    tokio::task::spawn_blocking(move || {
        let db = app_state.lock_db()?;
        let stats = vault::import_vault(&db, &PathBuf::from(&vault_path))
            .map_err(|e| AppError::Internal(format!("vault import: {e}")))?;

        Ok::<ImportResult, AppError>(ImportResult {
            imported: stats.imported,
            updated: stats.updated,
            skipped: stats.skipped,
            errors: stats.errors,
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("task join: {e}")))?
}

/// Export a single page to the vault as a .md file with front-matter.
/// Runs on spawn_blocking to avoid blocking the async runtime with file I/O.
#[tauri::command]
#[specta::specta]
pub async fn export_page(
    state: State<'_, AppState>,
    page_id: String,
) -> Result<String, AppError> {
    let vault_path = {
        let db = state.lock_db()?;
        db.get_setting("vault_path")?
            .ok_or_else(|| AppError::Internal("No vault path configured".into()))?
    };

    let pid: storage::ids::PageId = page_id
        .parse()
        .map_err(|e| AppError::Internal(format!("invalid page id: {e}")))?;

    let app_state = state.inner().clone();

    tokio::task::spawn_blocking(move || {
        let db = app_state.lock_db()?;
        let path = vault::export_page(&db, pid, &PathBuf::from(&vault_path))
            .map_err(|e| AppError::Internal(format!("vault export: {e}")))?;
        Ok::<String, AppError>(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| AppError::Internal(format!("task join: {e}")))?
}

/// Export all pages to the vault directory.
/// Runs on spawn_blocking to avoid blocking the async runtime with file I/O.
#[tauri::command]
#[specta::specta]
pub async fn export_all(state: State<'_, AppState>) -> Result<u32, AppError> {
    let vault_path = {
        let db = state.lock_db()?;
        db.get_setting("vault_path")?
            .ok_or_else(|| AppError::Internal("No vault path configured".into()))?
    };

    let app_state = state.inner().clone();

    tokio::task::spawn_blocking(move || {
        let db = app_state.lock_db()?;
        let stats = vault::export_all(&db, &PathBuf::from(&vault_path))
            .map_err(|e| AppError::Internal(format!("vault export all: {e}")))?;
        Ok::<u32, AppError>(stats.exported as u32)
    })
    .await
    .map_err(|e| AppError::Internal(format!("task join: {e}")))?
}

// ─── Live Vault Watcher ──────────────────────────────────────────

/// Payload emitted via the `vault-change` Tauri event.
#[derive(Clone, Serialize, specta::Type)]
pub struct VaultFileChange {
    pub path: String,
    pub kind: String, // "changed" | "removed"
}

/// Start watching the configured vault directory for .md changes.
/// Emits `vault-change` events on the frontend when files change.
/// Auto-imports changed files into the database.
#[tauri::command]
#[specta::specta]
pub async fn start_vault_watcher(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), AppError> {
    // Read vault path from settings
    let vault_path = {
        let db = state.lock_db()?;
        db.get_setting("vault_path")?
            .ok_or_else(|| AppError::Internal("No vault path configured".into()))?
    };

    // Stop existing watcher if running
    {
        let mut watcher_slot = state.lock_watcher()?;
        *watcher_slot = None;
    }

    let vault_dir = PathBuf::from(&vault_path);
    let db_arc = state.db.clone();

    let watcher = VaultWatcher::start(&vault_dir, move |event| {
        // Build frontend-friendly payload
        let changes: Vec<VaultFileChange> = event
            .changes
            .iter()
            .map(|c| match c {
                VaultChangeKind::FileChanged(p) => VaultFileChange {
                    path: p.to_string_lossy().into_owned(),
                    kind: "changed".into(),
                },
                VaultChangeKind::FileRemoved(p) => VaultFileChange {
                    path: p.to_string_lossy().into_owned(),
                    kind: "removed".into(),
                },
            })
            .collect();

        // Auto-import changed files into the database
        if let Ok(db) = db_arc.lock() {
            for change in &event.changes {
                if let VaultChangeKind::FileChanged(path) = change {
                    if let Err(e) = vault::import_single_file(&db, path) {
                        eprintln!("[WARN][vault-watcher] auto-import failed for {} — file skipped: {e}", path.display());
                        // Surface error to frontend so user knows sync is degraded
                        let _ = app.emit("vault-watcher-error", serde_json::json!({
                            "path": path.display().to_string(),
                            "error": e.to_string(),
                        }));
                    }
                }
            }
        } else {
            // DB lock failed — surface to frontend
            let _ = app.emit("vault-watcher-error", serde_json::json!({
                "path": "",
                "error": "database lock unavailable during auto-import",
            }));
        }

        // Emit Tauri event to frontend
        if let Err(e) = app.emit("vault-change", &changes) {
            eprintln!("[WARN][vault-watcher] failed to emit vault-change event to frontend: {e}");
        }
    })
    .map_err(|e| AppError::Internal(format!("failed to start watcher: {e}")))?;

    let mut watcher_slot = state.lock_watcher()?;
    *watcher_slot = Some(watcher);

    Ok(())
}

/// Stop the live vault watcher.
#[tauri::command]
#[specta::specta]
pub async fn stop_vault_watcher(state: State<'_, AppState>) -> Result<(), AppError> {
    let mut watcher_slot = state.lock_watcher()?;
    *watcher_slot = None; // Drop stops watching
    Ok(())
}

/// Check if the vault watcher is currently running.
#[tauri::command]
#[specta::specta]
pub async fn is_vault_watching(state: State<'_, AppState>) -> Result<bool, AppError> {
    let watcher_slot = state.lock_watcher()?;
    Ok(watcher_slot.is_some())
}
