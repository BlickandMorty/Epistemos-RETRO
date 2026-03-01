use async_trait::async_trait;
use futures::{Stream, StreamExt};
use std::pin::Pin;

use super::{saturating_u32, ConnectionResult, LlmError, LlmProvider, LlmResponse};

const DEFAULT_TIMEOUT: u64 = 120;

pub struct OllamaProvider {
    client: reqwest::Client,
    base_url: String,
    model: String,
}

impl OllamaProvider {
    pub fn new(model: String, base_url: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".into()),
            model,
        }
    }

    fn generate_url(&self) -> String {
        format!("{}/api/generate", self.base_url)
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    fn name(&self) -> &str {
        "ollama"
    }

    async fn generate(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        _max_tokens: u32,
    ) -> Result<LlmResponse, LlmError> {
        let mut body = serde_json::json!({
            "model": self.model,
            "prompt": prompt,
            "stream": false,
        });
        if let Some(sys) = system_prompt {
            body["system"] = serde_json::Value::String(sys.to_string());
        }

        let resp = self.client
            .post(self.generate_url())
            .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))?;

        let status = resp.status().as_u16();
        if status >= 400 {
            let body_text = resp.text().await.unwrap_or_default();
            return Err(LlmError::api_error(status, body_text));
        }

        let json: serde_json::Value = resp.json().await
            .map_err(|e| LlmError::Parse(e.to_string()))?;

        let text = json["response"].as_str().unwrap_or("").to_string();
        let input_tokens = json["prompt_eval_count"].as_u64().map(saturating_u32);
        let output_tokens = json["eval_count"].as_u64().map(saturating_u32);

        Ok(LlmResponse { text, input_tokens, output_tokens })
    }

    async fn stream(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        _max_tokens: u32,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, LlmError>> + Send>>, LlmError> {
        let mut body = serde_json::json!({
            "model": self.model,
            "prompt": prompt,
            "stream": true,
        });
        if let Some(sys) = system_prompt {
            body["system"] = serde_json::Value::String(sys.to_string());
        }

        let resp = self.client
            .post(self.generate_url())
            .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))?;

        let status = resp.status().as_u16();
        if status >= 400 {
            let body_text = resp.text().await.unwrap_or_default();
            return Err(LlmError::api_error(status, body_text));
        }

        // Ollama uses line-delimited JSON (no SSE prefix)
        let stream = resp.bytes_stream();
        let parsed = stream.map(move |chunk| {
            let bytes = chunk.map_err(|e| LlmError::Network(e.to_string()))?;
            let text = String::from_utf8_lossy(&bytes);
            let mut tokens = String::new();
            for line in text.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(t) = json["response"].as_str() {
                        tokens.push_str(t);
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
