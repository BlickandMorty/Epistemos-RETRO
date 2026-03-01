use storage::types::{ConnectionTestResult, InferenceConfig};
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn get_inference_config() -> Result<InferenceConfig, AppError> {
    Ok(InferenceConfig {
        api_provider: "anthropic".into(),
        model: "claude-sonnet-4-20250514".into(),
        ollama_base_url: None,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn set_inference_config(config: InferenceConfig) -> Result<(), AppError> {
    let _ = config;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn test_connection(provider: String, api_key: String, model: String) -> Result<ConnectionTestResult, AppError> {
    let _ = (provider, api_key, model);
    Ok(ConnectionTestResult { success: false, message: "Not implemented yet".into(), latency_ms: None })
}

#[tauri::command]
#[specta::specta]
pub async fn get_app_info() -> Result<serde_json::Value, AppError> {
    Ok(serde_json::json!({ "version": env!("CARGO_PKG_VERSION"), "platform": std::env::consts::OS }))
}
