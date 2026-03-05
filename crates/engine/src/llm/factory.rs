use std::sync::Arc;
use super::{LlmProvider, LlmProviderType};
use super::anthropic::AnthropicProvider;
use super::openai::OpenAiProvider;
use super::google::GoogleProvider;
use super::ollama::OllamaProvider;

/// Create an LLM provider from settings values.
///
/// Kimi uses OpenAI-compatible API at api.moonshot.cn/v1.
/// FoundryLocal uses OpenAI-compatible API at a local endpoint.
pub fn create_provider(
    provider: &str,
    api_key: &str,
    model: &str,
    ollama_base_url: &str,
) -> Arc<dyn LlmProvider> {
    match LlmProviderType::from_settings_name(provider) {
        LlmProviderType::Anthropic => {
            Arc::new(AnthropicProvider::new(api_key.into(), model.into()))
        }
        LlmProviderType::OpenAi => {
            Arc::new(OpenAiProvider::new(api_key.into(), model.into()))
        }
        LlmProviderType::Google => {
            Arc::new(GoogleProvider::new(api_key.into(), model.into()))
        }
        LlmProviderType::Kimi => {
            Arc::new(OpenAiProvider::with_base_url(
                api_key.into(),
                model.into(),
                "https://api.moonshot.cn/v1/chat/completions".into(),
                "kimi",
            ))
        }
        LlmProviderType::Ollama => {
            let url = if ollama_base_url.is_empty() {
                None
            } else {
                Some(ollama_base_url.into())
            };
            Arc::new(OllamaProvider::new(model.into(), url))
        }
        LlmProviderType::FoundryLocal => {
            Arc::new(OpenAiProvider::with_base_url(
                String::new(),
                model.into(),
                format!("{ollama_base_url}/v1/chat/completions"),
                "foundry",
            ))
        }
    }
}
