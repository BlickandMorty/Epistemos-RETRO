use serde::Serialize;
use tauri::State;
use storage::types::{ConnectionTestResult, InferenceConfig};
use crate::error::AppError;
use crate::state::AppState;

use engine::llm;

#[tauri::command]
#[specta::specta]
pub async fn get_inference_config(state: State<'_, AppState>) -> Result<InferenceConfig, AppError> {
    let db = state.lock_db()?;
    let json = db.get_setting("inference_config")?;
    match json {
        Some(s) => serde_json::from_str(&s).map_err(|e| AppError::Internal(format!("{e}"))),
        None => Ok(InferenceConfig {
            api_provider: "anthropic".into(),
            model: "claude-sonnet-4-20250514".into(),
            ollama_base_url: None,
        }),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn set_inference_config(state: State<'_, AppState>, config: InferenceConfig) -> Result<(), AppError> {
    let db = state.lock_db()?;
    let json = serde_json::to_string(&config).map_err(|e| AppError::Internal(format!("{e}")))?;
    db.set_setting("inference_config", &json)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn test_connection(
    provider: String,
    api_key: String,
    model: String,
) -> Result<ConnectionTestResult, AppError> {
    let llm_provider: Box<dyn llm::LlmProvider> = match provider.as_str() {
        "anthropic" => Box::new(llm::anthropic::AnthropicProvider::new(api_key, model)),
        "openai" => Box::new(llm::openai::OpenAiProvider::new(api_key, model)),
        "google" => Box::new(llm::google::GoogleProvider::new(api_key, model)),
        "ollama" => Box::new(llm::ollama::OllamaProvider::new(model, None)),
        "kimi" => Box::new(llm::openai::OpenAiProvider::with_base_url(
            api_key, model,
            "https://api.moonshot.ai/v1/chat/completions".into(),
            "kimi",
        )),
        "foundry" => Box::new(llm::openai::OpenAiProvider::with_base_url(
            String::new(), model,
            "http://localhost:5272/v1/chat/completions".into(),
            "foundry",
        )),
        _ => return Err(AppError::Internal(format!("Unknown provider: {provider}"))),
    };

    let result = llm_provider.test_connection().await;
    Ok(ConnectionTestResult {
        success: result.success,
        message: result.message,
        latency_ms: result.latency_ms,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn get_app_info() -> Result<serde_json::Value, AppError> {
    Ok(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
    }))
}

// ── Local Model Configuration ─────────────────────────────────────────

/// Configuration for local AI services (Foundry Local + Ollama).
/// These settings are used by the triage router when routing to NPU/GPU.
#[derive(Clone, Serialize, serde::Deserialize, specta::Type)]
pub struct LocalModelConfig {
    pub foundry_model: String,
    pub foundry_base_url: String,
    pub ollama_model: String,
    pub ollama_base_url: String,
}

/// Get local model configuration (Foundry + Ollama model names and URLs).
#[tauri::command]
#[specta::specta]
pub async fn get_local_model_config(state: State<'_, AppState>) -> Result<LocalModelConfig, AppError> {
    let db = state.lock_db()?;
    Ok(LocalModelConfig {
        foundry_model: db.get_setting("foundry_model")?.unwrap_or_else(|| "phi-3.5-mini".into()),
        foundry_base_url: db.get_setting("foundry_base_url")?.unwrap_or_else(|| "http://localhost:5272/v1/chat/completions".into()),
        ollama_model: db.get_setting("ollama_model")?.unwrap_or_else(|| "llama3.2:3b".into()),
        ollama_base_url: db.get_setting("ollama_base_url")?.unwrap_or_else(|| "http://localhost:11434".into()),
    })
}

/// Set local model configuration. Persists to settings KV for triage routing.
#[tauri::command]
#[specta::specta]
pub async fn set_local_model_config(state: State<'_, AppState>, config: LocalModelConfig) -> Result<(), AppError> {
    let db = state.lock_db()?;
    db.set_setting("foundry_model", &config.foundry_model)?;
    db.set_setting("foundry_base_url", &config.foundry_base_url)?;
    db.set_setting("ollama_model", &config.ollama_model)?;
    db.set_setting("ollama_base_url", &config.ollama_base_url)?;
    Ok(())
}

// ── Cost Tracking ────────────────────────────────────────────────────

/// Cost summary returned to the frontend.
#[derive(Clone, Serialize, specta::Type)]
pub struct CostSummary {
    pub daily_input_tokens: u64,
    pub daily_output_tokens: u64,
    pub daily_call_count: u32,
    pub daily_cost_usd: f64,
    pub daily_budget_usd: f64,
    pub budget_exceeded: bool,
    pub provider_breakdown: Vec<ProviderCost>,
}

/// Per-provider cost breakdown.
#[derive(Clone, Serialize, specta::Type)]
pub struct ProviderCost {
    pub provider: String,
    pub call_count: u32,
    pub cost_usd: f64,
}

/// Get today's cost summary (tokens, calls, spending, budget status).
#[tauri::command]
#[specta::specta]
pub async fn get_cost_summary(state: State<'_, AppState>) -> Result<CostSummary, AppError> {
    let ct = state.lock_cost_tracker()?;
    let providers: Vec<ProviderCost> = ct.providers.iter()
        .map(|(name, usage)| ProviderCost {
            provider: name.clone(),
            call_count: usage.call_count,
            cost_usd: usage.estimated_cost_usd,
        })
        .collect();

    Ok(CostSummary {
        daily_input_tokens: ct.today.input_tokens,
        daily_output_tokens: ct.today.output_tokens,
        daily_call_count: ct.today.call_count,
        daily_cost_usd: ct.today.estimated_cost_usd,
        daily_budget_usd: ct.daily_budget_usd,
        budget_exceeded: ct.budget_exceeded(),
        provider_breakdown: providers,
    })
}

/// Set the daily spending budget (USD). 0 = unlimited.
#[tauri::command]
#[specta::specta]
pub async fn set_daily_budget(state: State<'_, AppState>, budget_usd: f64) -> Result<(), AppError> {
    let mut ct = state.lock_cost_tracker()?;
    ct.daily_budget_usd = budget_usd;
    // Persist to settings KV
    if let Ok(json) = ct.to_json() {
        drop(ct); // drop cost_tracker lock before acquiring db lock (ordering: db=1 < cost=6)
        let db = state.lock_db()?;
        let _ = db.set_setting("cost_tracker", &json);
    }
    Ok(())
}

/// Reset all cost tracking data for today.
#[tauri::command]
#[specta::specta]
pub async fn reset_cost_tracker(state: State<'_, AppState>) -> Result<(), AppError> {
    let mut ct = state.lock_cost_tracker()?;
    ct.reset();
    if let Ok(json) = ct.to_json() {
        drop(ct);
        let db = state.lock_db()?;
        let _ = db.set_setting("cost_tracker", &json);
    }
    Ok(())
}

// ── Local AI Service Discovery ────────────────────────────────────────

/// Status of a local AI service (Foundry Local or Ollama).
#[derive(Clone, Serialize, specta::Type)]
pub struct LocalServiceStatus {
    pub name: String,
    pub available: bool,
    pub endpoint: String,
    pub models: Vec<String>,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

/// Probe all local AI services and return their status.
/// [NEW] — Windows equivalent of macOS Apple Intelligence availability check.
/// Enables triage routing: NPU (Foundry) → GPU (Ollama) → Cloud.
/// Also caches availability in AppState for triage routing.
#[tauri::command]
#[specta::specta]
pub async fn check_local_services(state: State<'_, AppState>) -> Result<Vec<LocalServiceStatus>, AppError> {
    probe_and_cache_services(state.inner()).await
}

/// Core probing logic — usable from both the Tauri command and startup hook.
pub async fn probe_and_cache_services(state: &AppState) -> Result<Vec<LocalServiceStatus>, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| AppError::Internal(format!("HTTP client: {e}")))?;

    let (foundry, ollama) = tokio::join!(
        probe_service(&client, "Foundry Local", "http://localhost:5272/v1/models"),
        probe_service(&client, "Ollama", "http://localhost:11434/api/tags"),
    );

    // Cache availability for triage routing
    let has_cloud = {
        let db = state.lock_db()?;
        // Cloud is available if any API key is configured
        db.get_setting("anthropic_api_key").ok().flatten().is_some()
            || db.get_setting("openai_api_key").ok().flatten().is_some()
            || db.get_setting("google_api_key").ok().flatten().is_some()
    };
    if let Ok(mut avail) = state.inference_availability.lock() {
        avail.has_npu = foundry.available;
        avail.has_gpu = ollama.available;
        avail.has_cloud = has_cloud;
    }

    eprintln!(
        "[startup] inference availability: NPU={} GPU={} Cloud={}",
        foundry.available, ollama.available, has_cloud
    );

    Ok(vec![foundry, ollama])
}

/// Probe a single local service endpoint for model availability.
async fn probe_service(client: &reqwest::Client, name: &str, url: &str) -> LocalServiceStatus {
    let start = std::time::Instant::now();

    match client.get(url).send().await {
        Ok(resp) => {
            let latency = start.elapsed().as_millis() as u64;
            if !resp.status().is_success() {
                return LocalServiceStatus {
                    name: name.into(),
                    available: false,
                    endpoint: url.into(),
                    models: vec![],
                    latency_ms: Some(latency),
                    error: Some(format!("HTTP {}", resp.status())),
                };
            }

            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            let models = extract_model_names(&body, name);

            LocalServiceStatus {
                name: name.into(),
                available: true,
                endpoint: url.into(),
                models,
                latency_ms: Some(latency),
                error: None,
            }
        }
        Err(e) => LocalServiceStatus {
            name: name.into(),
            available: false,
            endpoint: url.into(),
            models: vec![],
            latency_ms: None,
            error: Some(e.to_string()),
        },
    }
}

/// Extract model names from service response JSON.
fn extract_model_names(body: &serde_json::Value, service: &str) -> Vec<String> {
    match service {
        "Foundry Local" => {
            // OpenAI-compatible: { "data": [{"id": "model-name"}, ...] }
            body.get("data")
                .and_then(|d| d.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| m.get("id").and_then(|v| v.as_str()))
                        .map(String::from)
                        .collect()
                })
                .unwrap_or_default()
        }
        "Ollama" => {
            // Ollama: { "models": [{"name": "model:tag"}, ...] }
            body.get("models")
                .and_then(|d| d.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| m.get("name").and_then(|v| v.as_str()))
                        .map(String::from)
                        .collect()
                })
                .unwrap_or_default()
        }
        _ => vec![],
    }
}
