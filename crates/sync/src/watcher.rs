//! Vault file watcher — monitors the vault directory for changes.
//!
//! [NEW] — macOS uses DispatchSourceFileSystemObject (removed in later builds).
//!         Retro Edition uses the `notify` crate (cross-platform, kqueue/inotify/ReadDirectoryChanges).
//!
//! Architecture:
//! - Watches the vault directory recursively for .md file changes
//! - Debounces rapid changes (2-second window) to avoid import storms
//! - Emits `VaultChangeEvent` via a callback (wired to Tauri events at the app layer)
//! - Only tracks Create/Modify/Remove of .md files (ignores dotfiles, temp files)

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify_debouncer_full::{
    new_debouncer, DebounceEventResult, Debouncer, RecommendedCache,
};
use notify::RecursiveMode;

use crate::error::SyncError;

/// What kind of change happened in the vault.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultChangeKind {
    /// A .md file was created or modified.
    FileChanged(PathBuf),
    /// A .md file was removed.
    FileRemoved(PathBuf),
}

/// A debounced vault change event.
#[derive(Debug, Clone)]
pub struct VaultChangeEvent {
    pub changes: Vec<VaultChangeKind>,
}

/// File watcher that monitors a vault directory for .md changes.
///
/// Uses `notify-debouncer-full` with a 2-second debounce window.
/// Drop this struct to stop watching.
pub struct VaultWatcher {
    /// The debouncer owns the watcher thread. Dropping it stops watching.
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
    /// Path being watched.
    pub vault_path: PathBuf,
}

impl VaultWatcher {
    /// Start watching a vault directory.
    ///
    /// The `on_change` callback fires when debounced changes are detected.
    /// It runs on a background thread — keep it lightweight (e.g. send to a channel).
    pub fn start<F>(vault_path: &Path, on_change: F) -> Result<Self, SyncError>
    where
        F: Fn(VaultChangeEvent) + Send + 'static,
    {
        if !vault_path.is_dir() {
            return Err(SyncError::Watcher(format!(
                "vault path is not a directory: {}",
                vault_path.display()
            )));
        }

        let mut debouncer = new_debouncer(
            Duration::from_secs(2),
            None, // No tick rate override
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        let changes = filter_vault_events(&events);
                        if !changes.is_empty() {
                            on_change(VaultChangeEvent { changes });
                        }
                    }
                    Err(errors) => {
                        for e in errors {
                            eprintln!("[WARN][vault-watcher] filesystem notification error — some changes may be missed: {e}");
                        }
                    }
                }
            },
        )
        .map_err(|e| SyncError::Watcher(format!("failed to create debouncer: {e}")))?;

        debouncer
            .watch(vault_path, RecursiveMode::Recursive)
            .map_err(|e| SyncError::Watcher(format!("failed to watch {}: {e}", vault_path.display())))?;

        Ok(Self {
            _debouncer: debouncer,
            vault_path: vault_path.to_path_buf(),
        })
    }

    /// Stop watching. Same as dropping the watcher.
    pub fn stop(self) {
        drop(self);
    }
}

/// Filter raw debouncer events to only vault-relevant .md changes.
/// DebouncedEvent wraps a `notify::Event` (with `paths` and `kind`) + a timestamp.
fn filter_vault_events(
    events: &[notify_debouncer_full::DebouncedEvent],
) -> Vec<VaultChangeKind> {
    let mut changes = Vec::with_capacity(events.len());
    let mut seen = std::collections::HashSet::with_capacity(events.len());

    for debounced in events {
        let inner = &debounced.event;
        for path in &inner.paths {
            // Only track .md files
            let ext = path.extension().and_then(|e| e.to_str());
            if ext != Some("md") {
                continue;
            }

            // Skip dotfiles and temp files
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('.') || name.starts_with('~') || name.ends_with(".tmp") {
                    continue;
                }
            }

            // Deduplicate within this batch
            if !seen.insert(path.clone()) {
                continue;
            }

            let kind = match inner.kind {
                notify::EventKind::Remove(_) => VaultChangeKind::FileRemoved(path.clone()),
                _ => VaultChangeKind::FileChanged(path.clone()),
            };
            changes.push(kind);
        }
    }

    changes
}

/// Create a watcher that sends events through an mpsc channel.
/// Useful when you need to process events on a different thread (e.g. Tauri main thread).
pub fn channel_watcher(
    vault_path: &Path,
) -> Result<(VaultWatcher, mpsc::Receiver<VaultChangeEvent>), SyncError> {
    let (tx, rx) = mpsc::channel();
    let watcher = VaultWatcher::start(vault_path, move |event| {
        let _ = tx.send(event);
    })?;
    Ok((watcher, rx))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    /// Helper to create a DebouncedEvent wrapping a notify::Event.
    fn make_event(paths: Vec<PathBuf>, kind: notify::EventKind) -> notify_debouncer_full::DebouncedEvent {
        notify_debouncer_full::DebouncedEvent {
            event: notify::Event {
                kind,
                paths,
                attrs: Default::default(),
            },
            time: Instant::now(),
        }
    }

    #[test]
    fn filter_ignores_non_md() {
        let event = make_event(
            vec![PathBuf::from("/vault/file.txt")],
            notify::EventKind::Modify(notify::event::ModifyKind::Data(
                notify::event::DataChange::Content,
            )),
        );
        let changes = filter_vault_events(&[event]);
        assert!(changes.is_empty(), "should ignore non-.md files");
    }

    #[test]
    fn filter_tracks_md_changes() {
        let event = make_event(
            vec![PathBuf::from("/vault/note.md")],
            notify::EventKind::Modify(notify::event::ModifyKind::Data(
                notify::event::DataChange::Content,
            )),
        );
        let changes = filter_vault_events(&[event]);
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], VaultChangeKind::FileChanged(_)));
    }

    #[test]
    fn filter_tracks_md_removal() {
        let event = make_event(
            vec![PathBuf::from("/vault/deleted.md")],
            notify::EventKind::Remove(notify::event::RemoveKind::File),
        );
        let changes = filter_vault_events(&[event]);
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], VaultChangeKind::FileRemoved(_)));
    }

    #[test]
    fn filter_ignores_dotfiles() {
        let event = make_event(
            vec![PathBuf::from("/vault/.hidden.md")],
            notify::EventKind::Modify(notify::event::ModifyKind::Data(
                notify::event::DataChange::Content,
            )),
        );
        let changes = filter_vault_events(&[event]);
        assert!(changes.is_empty(), "should ignore dotfiles");
    }

    #[test]
    fn filter_ignores_temp_files() {
        let event = make_event(
            vec![PathBuf::from("/vault/~note.md")],
            notify::EventKind::Modify(notify::event::ModifyKind::Data(
                notify::event::DataChange::Content,
            )),
        );
        let changes = filter_vault_events(&[event]);
        assert!(changes.is_empty(), "should ignore temp files");
    }

    #[test]
    fn filter_deduplicates() {
        let events = vec![
            make_event(
                vec![PathBuf::from("/vault/note.md")],
                notify::EventKind::Modify(notify::event::ModifyKind::Data(
                    notify::event::DataChange::Content,
                )),
            ),
            make_event(
                vec![PathBuf::from("/vault/note.md")],
                notify::EventKind::Modify(notify::event::ModifyKind::Data(
                    notify::event::DataChange::Content,
                )),
            ),
        ];
        let changes = filter_vault_events(&events);
        assert_eq!(changes.len(), 1, "should deduplicate same-path events");
    }

    #[test]
    fn watcher_rejects_nonexistent_dir() {
        let result = VaultWatcher::start(
            Path::new("/this/path/does/not/exist"),
            |_| {},
        );
        assert!(result.is_err());
    }

    #[test]
    fn watcher_starts_and_stops() {
        let dir = tempfile::tempdir().expect("create temp dir");
        let watcher = VaultWatcher::start(dir.path(), |_| {}).expect("start watcher");
        assert_eq!(watcher.vault_path, dir.path());
        watcher.stop();
    }
}
