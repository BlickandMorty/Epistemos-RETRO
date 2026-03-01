use storage::ids::PageId;
use storage::types::{Block, Page};
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn create_page(title: String) -> Result<Page, AppError> {
    let id = PageId::new();
    let mut page = Page::mock(id);
    page.title = title;
    Ok(page)
}

#[tauri::command]
#[specta::specta]
pub async fn get_page(page_id: String) -> Result<Page, AppError> {
    let id: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(Page::mock(id))
}

#[tauri::command]
#[specta::specta]
pub async fn list_pages() -> Result<Vec<Page>, AppError> {
    Ok(vec![])
}

#[tauri::command]
#[specta::specta]
pub async fn delete_page(page_id: String) -> Result<(), AppError> {
    let _id: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn load_body(page_id: String) -> Result<String, AppError> {
    let _id: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(String::new())
}

#[tauri::command]
#[specta::specta]
pub async fn save_body(page_id: String, content: String) -> Result<(), AppError> {
    let _id: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    let _ = content;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_blocks(page_id: String) -> Result<Vec<Block>, AppError> {
    let _id: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(vec![])
}
