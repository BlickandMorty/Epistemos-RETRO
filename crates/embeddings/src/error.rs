//! Embedding errors.

#[derive(Debug, thiserror::Error)]
pub enum EmbeddingError {
    #[error("model not found: {0}")]
    ModelNotFound(String),
    #[error("ONNX Runtime error: {0}")]
    OnnxRuntime(String),
    #[error("tokenizer error: {0}")]
    Tokenizer(String),
    #[error("inference lane unavailable: {0}")]
    LaneUnavailable(String),
}
