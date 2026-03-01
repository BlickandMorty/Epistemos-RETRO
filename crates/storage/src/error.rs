use crate::ids::PageId;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("page not found: {0}")]
    PageNotFound(PageId),
    #[error("chat not found: {0}")]
    ChatNotFound(String),
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("body file I/O: {0}")]
    BodyIo(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}
