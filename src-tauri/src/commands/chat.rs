use storage::ids::ChatId;
use storage::types::{Chat, Message};
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn create_chat(title: Option<String>) -> Result<Chat, AppError> {
    let id = ChatId::new();
    let mut chat = Chat::mock(id);
    if let Some(t) = title { chat.title = t; }
    Ok(chat)
}

#[tauri::command]
#[specta::specta]
pub async fn list_chats() -> Result<Vec<Chat>, AppError> {
    Ok(vec![])
}

#[tauri::command]
#[specta::specta]
pub async fn get_messages(chat_id: String) -> Result<Vec<Message>, AppError> {
    let _id: ChatId = chat_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(vec![])
}

#[tauri::command]
#[specta::specta]
pub async fn delete_chat(chat_id: String) -> Result<(), AppError> {
    let _id: ChatId = chat_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn submit_query(chat_id: String, query: String) -> Result<(), AppError> {
    let _id: ChatId = chat_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    let _ = query;
    Ok(())
}
