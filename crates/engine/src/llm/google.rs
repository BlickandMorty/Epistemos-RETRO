use async_trait::async_trait;
use futures::{Stream, StreamExt};
use std::pin::Pin;

use super::{post_json_with_retry, saturating_u32, ConnectionResult, LlmError, LlmProvider, LlmResponse};

const DEFAULT_TIMEOUT: u64 = 60;

pub struct GoogleProvider {
    client: reqwest::Client,
    api_key: String,
    model: String,
}

impl GoogleProvider {
    pub fn new(api_key: String, model: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            model,
        }
    }

    fn generate_url(&self) -> String {
        format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            self.model
        )
    }

    fn stream_url(&self) -> String {
        format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse",
            self.model
        )
    }

    fn headers(&self) -> Vec<(&str, &str)> {
        vec![
            ("x-goog-api-key", &self.api_key),
            ("content-type", "application/json"),
        ]
    }
}

#[async_trait]
impl LlmProvider for GoogleProvider {
    fn name(&self) -> &str {
        "google"
    }

    async fn generate(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        max_tokens: u32,
    ) -> Result<LlmResponse, LlmError> {
        // Gemini combines system + user into a single content part
        let full_prompt = match system_prompt {
            Some(sys) => format!("System: {sys}\n\n{prompt}"),
            None => prompt.to_string(),
        };

        let body = serde_json::json!({
            "contents": [{"parts": [{"text": full_prompt}]}],
            "generationConfig": {"maxOutputTokens": max_tokens},
        });

        let resp = post_json_with_retry(
            &self.client,
            &self.generate_url(),
            &body,
            &self.headers().iter().map(|&(k, v)| (k, v)).collect::<Vec<_>>(),
            DEFAULT_TIMEOUT,
        ).await?;

        let json: serde_json::Value = resp.json().await
            .map_err(|e| LlmError::Parse(e.to_string()))?;

        let text = json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let input_tokens = json["usageMetadata"]["promptTokenCount"].as_u64().map(saturating_u32);
        let output_tokens = json["usageMetadata"]["candidatesTokenCount"].as_u64().map(saturating_u32);

        Ok(LlmResponse { text, input_tokens, output_tokens })
    }

    async fn stream(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        max_tokens: u32,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, LlmError>> + Send>>, LlmError> {
        let tokens = if max_tokens == 0 { 4096 } else { max_tokens };
        let full_prompt = match system_prompt {
            Some(sys) => format!("System: {sys}\n\n{prompt}"),
            None => prompt.to_string(),
        };

        let body = serde_json::json!({
            "contents": [{"parts": [{"text": full_prompt}]}],
            "generationConfig": {"maxOutputTokens": tokens},
        });

        let api_key = self.api_key.clone();
        let resp = self.client
            .post(self.stream_url())
            .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT))
            .header("x-goog-api-key", &api_key)
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
                        if let Some(t) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
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
