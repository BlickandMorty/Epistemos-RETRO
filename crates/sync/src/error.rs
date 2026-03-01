//! Error types for the sync crate.

use storage::error::StorageError;

#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error(transparent)]
    Storage(#[from] StorageError),

    #[error("vault I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("YAML front-matter parse error: {0}")]
    FrontMatter(String),

    #[error("vault path not set")]
    NoVaultPath,

    #[error("file watcher error: {0}")]
    Watcher(String),
}
