use async_trait::async_trait;
use futures::{Stream, StreamExt};
use std::pin::Pin;

use super::{post_json_with_retry, saturating_u32, ConnectionResult, LlmError, LlmProvider, LlmResponse};

const API_URL: &str = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TIMEOUT: u64 = 60;

/// OpenAI-compatible provider (also used for Kimi/Moonshot and Foundry Local)
pub struct OpenAiProvider {
    client: reqwest::Client,
    api_key: String,
    model: String,
    base_url: String,
    provider_name: String,
}

impl OpenAiProvider {
    pub fn new(api_key: String, model: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            model,
            base_url: API_URL.to_string(),
            provider_name: "openai".to_string(),
        }
    }

    /// Create with custom base URL (for Kimi, Foundry Local, etc.)
    pub fn with_base_url(api_key: String, model: String, base_url: String, name: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            model,
            base_url,
            provider_name: name.to_string(),
        }
    }

}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    fn name(&self) -> &str {
        &self.provider_name
    }

    async fn generate(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        max_tokens: u32,
    ) -> Result<LlmResponse, LlmError> {
        let mut messages = Vec::new();
        if let Some(sys) = system_prompt {
            messages.push(serde_json::json!({"role": "system", "content": sys}));
        }
        messages.push(serde_json::json!({"role": "user", "content": prompt}));

        let body = serde_json::json!({
            "model": self.model,
            "messages": messages,
            "max_completion_tokens": max_tokens,
            "stream": false,
        });

        let auth_header = format!("Bearer {}", self.api_key);
        let headers: Vec<(&str, &str)> = vec![
            ("content-type", "application/json"),
            ("Authorization", &auth_header),
        ];

        let resp = post_json_with_retry(
            &self.client,
            &self.base_url,
            &body,
            &headers,
            DEFAULT_TIMEOUT,
        ).await?;

        let json: serde_json::Value = resp.json().await
            .map_err(|e| LlmError::Parse(e.to_string()))?;

        let text = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let input_tokens = json["usage"]["prompt_tokens"].as_u64().map(saturating_u32);
        let output_tokens = json["usage"]["completion_tokens"].as_u64().map(saturating_u32);

        Ok(LlmResponse { text, input_tokens, output_tokens })
    }

    async fn stream(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        max_tokens: u32,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, LlmError>> + Send>>, LlmError> {
        let tokens = if max_tokens == 0 { 4096 } else { max_tokens };
        let mut messages = Vec::new();
        if let Some(sys) = system_prompt {
            messages.push(serde_json::json!({"role": "system", "content": sys}));
        }
        messages.push(serde_json::json!({"role": "user", "content": prompt}));

        let body = serde_json::json!({
            "model": self.model,
            "messages": messages,
            "max_completion_tokens": tokens,
            "stream": true,
        });

        let auth_header = format!("Bearer {}", self.api_key);
        let resp = self.client
            .post(&self.base_url)
            .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT))
            .header("content-type", "application/json")
            .header("Authorization", &auth_header)
            .json(&body)
            .send()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))?;

        let status = resp.status().as_u16();
        if status >= 400 {
            let body_text = resp.text().await.unwrap_or_default();
            return Err(LlmError::api_error(status, body_text));
        }

        let stream = resp.bytes_stream();
        let parsed = stream.map(move |chunk| {
            let bytes = chunk.map_err(|e| LlmError::Network(e.to_string()))?;
            let text = String::from_utf8_lossy(&bytes);
            let mut tokens = String::new();
            for line in text.lines() {
                let line = line.trim();
                if let Some(data) = line.strip_prefix("data: ") {
                    if data == "[DONE]" {
                        continue;
                    }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(t) = json["choices"][0]["delta"]["content"].as_str() {
                            tokens.push_str(t);
                        }
                    }
                }
            }
            Ok(tokens)
        });

        Ok(Box::pin(parsed))
    }

    async fn test_connection(&self) -> ConnectionResult {
        let start = std::time::Instant::now();
        match self.generate("Reply with exactly: OK", None, 10).await {
            Ok(resp) => ConnectionResult {
                success: resp.text.trim().contains("OK"),
                message: if resp.text.trim().contains("OK") {
                    "Connected".into()
                } else {
                    format!("Unexpected: {}", resp.text.chars().take(50).collect::<String>())
                },
                latency_ms: Some(start.elapsed().as_millis() as u64),
            },
            Err(e) => ConnectionResult {
                success: false,
                message: e.user_message(),
                latency_ms: Some(start.elapsed().as_millis() as u64),
            },
        }
    }
}
