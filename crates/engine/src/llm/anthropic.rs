use async_trait::async_trait;
use futures::{Stream, StreamExt};
use std::pin::Pin;

use super::{post_json_with_retry, saturating_u32, ConnectionResult, LlmError, LlmProvider, LlmResponse};

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";
const DEFAULT_TIMEOUT: u64 = 60;

pub struct AnthropicProvider {
    client: reqwest::Client,
    api_key: String,
    model: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String, model: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            model,
        }
    }

    fn headers(&self) -> Vec<(&str, &str)> {
        vec![
            ("x-api-key", &self.api_key),
            ("anthropic-version", API_VERSION),
            ("content-type", "application/json"),
        ]
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    fn name(&self) -> &str {
        "anthropic"
    }

    async fn generate(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        max_tokens: u32,
    ) -> Result<LlmResponse, LlmError> {
        let mut body = serde_json::json!({
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
            "stream": false,
        });
        if let Some(sys) = system_prompt {
            body["system"] = serde_json::Value::String(sys.to_string());
        }

        let resp = post_json_with_retry(
            &self.client,
            API_URL,
            &body,
            &self.headers().iter().map(|&(k, v)| (k, v)).collect::<Vec<_>>(),
            DEFAULT_TIMEOUT,
        ).await?;

        let json: serde_json::Value = resp.json().await
            .map_err(|e| LlmError::Parse(e.to_string()))?;

        let text = json["content"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let input_tokens = json["usage"]["input_tokens"].as_u64().map(saturating_u32);
        let output_tokens = json["usage"]["output_tokens"].as_u64().map(saturating_u32);

        Ok(LlmResponse { text, input_tokens, output_tokens })
    }

    async fn stream(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        max_tokens: u32,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, LlmError>> + Send>>, LlmError> {
        let tokens = if max_tokens == 0 { 4096 } else { max_tokens };
        let mut body = serde_json::json!({
            "model": self.model,
            "max_tokens": tokens,
            "messages": [{"role": "user", "content": prompt}],
            "stream": true,
        });
        if let Some(sys) = system_prompt {
            body["system"] = serde_json::Value::String(sys.to_string());
        }

        let headers = self.headers();
        let mut req = self.client
            .post(API_URL)
            .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT))
            .json(&body);
        for &(k, v) in &headers {
            req = req.header(k, v);
        }

        let resp = req.send().await.map_err(|e| LlmError::Network(e.to_string()))?;
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
                        if let Some(t) = json["delta"]["text"].as_str() {
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
                    format!("Unexpected response: {}", resp.text.chars().take(50).collect::<String>())
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
