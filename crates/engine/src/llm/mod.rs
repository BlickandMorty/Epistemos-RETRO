pub mod anthropic;
pub mod factory;
pub mod google;
pub mod ollama;
pub mod openai;

mod error;
pub use error::LlmError;

use futures::Stream;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

// ── Provider Trait ──

#[async_trait::async_trait]
pub trait LlmProvider: Send + Sync {
    fn name(&self) -> &str;

    async fn generate(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        max_tokens: u32,
    ) -> Result<LlmResponse, LlmError>;

    async fn stream(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        max_tokens: u32,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, LlmError>> + Send>>, LlmError>;

    async fn test_connection(&self) -> ConnectionResult;
}

// ── Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmResponse {
    pub text: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LlmProviderType {
    Anthropic,
    OpenAi,
    Google,
    Kimi,
    Ollama,
    FoundryLocal,
}

impl LlmProviderType {
    /// Parse from the settings string used in InferenceConfig.api_provider.
    pub fn from_settings_name(name: &str) -> Self {
        match name {
            "anthropic" => Self::Anthropic,
            "openai" => Self::OpenAi,
            "google" => Self::Google,
            "kimi" => Self::Kimi,
            "ollama" => Self::Ollama,
            "foundry" => Self::FoundryLocal,
            _ => Self::Anthropic, // sensible default
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            Self::Anthropic => "Anthropic (Claude)",
            Self::OpenAi => "OpenAI (GPT)",
            Self::Google => "Google (Gemini)",
            Self::Kimi => "Kimi (Moonshot)",
            Self::Ollama => "Ollama (Local)",
            Self::FoundryLocal => "Foundry Local (NPU)",
        }
    }
}

/// Frozen config for background tasks (avoids shared state)
#[derive(Debug, Clone)]
pub struct LlmSnapshot {
    pub provider: LlmProviderType,
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
}

/// Saturating cast from u64 to u32 — clamps at u32::MAX instead of truncating.
pub(crate) fn saturating_u32(v: u64) -> u32 {
    u32::try_from(v).unwrap_or(u32::MAX)
}

/// Exponential backoff delays in seconds: 1s, 2s, 4s.
const RETRY_BACKOFFS: &[u64] = &[1, 2, 4];

/// HTTP request with exponential backoff retry for transient errors.
/// Retries up to 3 times on 429/502/503/529 and network errors.
pub(crate) async fn post_json_with_retry(
    client: &reqwest::Client,
    url: &str,
    body: &serde_json::Value,
    headers: &[(&str, &str)],
    timeout_secs: u64,
) -> Result<reqwest::Response, LlmError> {
    let max_attempts = RETRY_BACKOFFS.len() + 1; // 4 attempts total (initial + 3 retries)
    let mut last_err = None;

    for attempt in 0..max_attempts {
        let mut req = client
            .post(url)
            .timeout(std::time::Duration::from_secs(timeout_secs))
            .json(body);

        for &(k, v) in headers {
            req = req.header(k, v);
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if status >= 400 {
                    let body_text = resp.text().await.unwrap_or_default();
                    let err = LlmError::api_error(status, body_text);

                    if let Some(&delay) = err.is_transient().then(|| RETRY_BACKOFFS.get(attempt)).flatten() {
                        eprintln!("[llm] transient error (attempt {}/{}), retrying in {delay}s: {err}", attempt + 1, max_attempts);
                        tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
                        last_err = Some(err);
                        continue;
                    }
                    return Err(err);
                }
                return Ok(resp);
            }
            Err(e) => {
                let err = LlmError::Network(e.to_string());
                if let Some(&delay) = RETRY_BACKOFFS.get(attempt) {
                    eprintln!("[llm] network error (attempt {}/{}), retrying in {delay}s: {err}", attempt + 1, max_attempts);
                    tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
                    last_err = Some(err);
                    continue;
                }
                return Err(err);
            }
        }
    }

    Err(last_err.unwrap_or_else(|| LlmError::Network("request failed after retries".into())))
}
