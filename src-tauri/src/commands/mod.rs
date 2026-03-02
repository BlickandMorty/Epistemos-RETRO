pub mod notes;
pub mod chat;
pub mod graph;
pub mod folders;
pub mod physics;
pub mod research;
pub mod search;
pub mod vault;
pub mod system;

use crate::error::AppError;

/// Parse a string ID into a typed ID (PageId, ChatId, FolderId, etc.).
/// Replaces 14+ occurrences of `.parse().map_err(|e| AppError::Internal(format!("{e}")))`.
pub fn parse_id<T: std::str::FromStr>(s: &str) -> Result<T, AppError>
where
    T::Err: std::fmt::Display,
{
    s.parse().map_err(|e| AppError::Internal(format!("{e}")))
}
