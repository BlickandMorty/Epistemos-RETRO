use storage::types::SearchResult;
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn search_pages(query: String, limit: Option<usize>) -> Result<Vec<SearchResult>, AppError> {
    let _ = (query, limit);
    Ok(vec![])
}
