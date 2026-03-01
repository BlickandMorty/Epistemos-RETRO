use storage::types::{GraphEdge, GraphNode};
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn get_graph() -> Result<(Vec<GraphNode>, Vec<GraphEdge>), AppError> {
    Ok((vec![], vec![]))
}

#[tauri::command]
#[specta::specta]
pub async fn rebuild_graph() -> Result<(), AppError> {
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn search_graph(query: String) -> Result<Vec<GraphNode>, AppError> {
    let _ = query;
    Ok(vec![])
}
