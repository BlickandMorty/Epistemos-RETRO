use tauri::State;
use storage::ids::FolderId;
use storage::types::Folder;
use crate::error::AppError;
use crate::state::AppState;
use super::parse_id;

#[tauri::command]
#[specta::specta]
pub async fn create_folder(state: State<'_, AppState>, name: String) -> Result<Folder, AppError> {
    let folder = Folder::new(name);
    let db = state.lock_db()?;
    db.insert_folder(&folder)?;
    Ok(folder)
}

#[tauri::command]
#[specta::specta]
pub async fn get_folder(state: State<'_, AppState>, folder_id: String) -> Result<Folder, AppError> {
    let id: FolderId = parse_id(&folder_id)?;
    let db = state.lock_db()?;
    Ok(db.get_folder(id)?)
}

#[tauri::command]
#[specta::specta]
pub async fn list_folders(state: State<'_, AppState>) -> Result<Vec<Folder>, AppError> {
    let db = state.lock_db()?;
    Ok(db.list_folders()?)
}

#[tauri::command]
#[specta::specta]
pub async fn update_folder(state: State<'_, AppState>, folder: Folder) -> Result<(), AppError> {
    let db = state.lock_db()?;
    db.update_folder(&folder)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_folder(state: State<'_, AppState>, folder_id: String) -> Result<(), AppError> {
    let id: FolderId = parse_id(&folder_id)?;
    let db = state.lock_db()?;
    db.delete_folder(id)?;
    Ok(())
}
