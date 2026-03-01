use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
pub enum LlmError {
    #[error("API error {status}: {body}")]
    Api { status: u16, body: String },

    #[error("network error: {0}")]
    Network(String),

    #[error("parse error: {0}")]
    Parse(String),

    #[error("provider not configured: {0}")]
    NotConfigured(String),

    #[error("stream ended unexpectedly")]
    StreamEnded,
}

impl LlmError {
    pub fn api_error(status: u16, body: String) -> Self {
        Self::Api { status, body }
    }

    /// Transient errors that warrant retry: 429, 502, 503, 529
    pub fn is_transient(&self) -> bool {
        matches!(self, Self::Api { status, .. }
            if *status == 429 || *status == 502 || *status == 503 || *status == 529)
    }

    /// Auth errors: 401, 403
    pub fn is_auth_error(&self) -> bool {
        matches!(self, Self::Api { status, .. } if *status == 401 || *status == 403)
    }

    pub fn user_message(&self) -> String {
        match self {
            Self::Api { status, body } => match status {
                429 => "Rate-limited. Wait and retry.".into(),
                529 => "Service overloaded. Try in a few seconds.".into(),
                503 => "Service unavailable. Try shortly.".into(),
                502 => "Bad gateway. Try again.".into(),
                401 => "Invalid API key. Check Settings.".into(),
                403 => "Access denied. May lack permissions.".into(),
                400 => format!("Bad request: {}", body.chars().take(200).collect::<String>()),
                _ => format!("API error {status}. Check connection."),
            },
            Self::Network(msg) => format!("Network error: {msg}"),
            Self::Parse(msg) => format!("Response parse error: {msg}"),
            Self::NotConfigured(p) => format!("Provider {p} not configured. Set API key in Settings."),
            Self::StreamEnded => "Stream ended unexpectedly.".into(),
        }
    }
}
