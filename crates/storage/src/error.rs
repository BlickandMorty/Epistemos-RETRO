use crate::ids::{PageId, BlockId, TransclusionId};

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("page not found: {0}")]
    PageNotFound(PageId),
    #[error("block not found: {0}")]
    BlockNotFound(BlockId),
    #[error("chat not found: {0}")]
    ChatNotFound(String),
    #[error("folder not found: {0}")]
    FolderNotFound(String),
    #[error("transclusion not found: {0}")]
    TransclusionNotFound(TransclusionId),
    #[error("version not found: {0}")]
    VersionNotFound(String),
    #[error("circular transclusion detected")]
    CircularTransclusion,
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("body file I/O: {0}")]
    BodyIo(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}
