use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn get_vault_path() -> Result<Option<String>, AppError> {
    Ok(None)
}

#[tauri::command]
#[specta::specta]
pub async fn set_vault_path(path: String) -> Result<(), AppError> {
    let _ = path;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn import_vault() -> Result<u32, AppError> {
    Ok(0)
}
