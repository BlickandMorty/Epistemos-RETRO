//! ONNX Runtime embedder — generates text embeddings using a local model.
//!
//! [NEW] — No macOS equivalent. macOS uses NLEmbedding (Apple framework).
//!
//! Default model: all-MiniLM-L6-v2 (384-dim, 22MB, fast on CPU/NPU/GPU).
//! Falls back to bag-of-words averaging if model file is missing.
//!
//! Provides two embedders:
//! - `OnnxEmbedder` — single ONNX session, simple usage (requires `onnx` feature)
//! - `BagOfWordsEmbedder` — feature hashing fallback, no model needed (always available)
//!
//! For hardware-optimized multi-lane inference, use `processor::InferenceRouter` instead.

#[cfg(feature = "onnx")]
use ndarray::Array2;
#[cfg(feature = "onnx")]
use ort::session::Session;
#[cfg(feature = "onnx")]
use ort::value::TensorRef;
#[cfg(feature = "onnx")]
use tokenizers::Tokenizer;

use crate::error::EmbeddingError;

/// Dimension of the default model (all-MiniLM-L6-v2).
pub const DEFAULT_DIM: usize = 384;

/// Trait for text → embedding conversion.
pub trait Embedder: Send + Sync {
    /// Embed a single text string into a float vector.
    fn embed(&self, text: &str) -> Result<Vec<f32>, EmbeddingError>;

    /// Embed multiple texts (batch). Default falls back to sequential.
    fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, EmbeddingError> {
        texts.iter().map(|t| self.embed(t)).collect()
    }

    /// Vector dimension.
    fn dim(&self) -> usize;
}

// ── ONNX Runtime Embedder (single session, simple usage) ────────────────

#[cfg(feature = "onnx")]
pub struct OnnxEmbedder {
    session: std::sync::Mutex<Session>,
    tokenizer: Tokenizer,
    dim: usize,
}

#[cfg(feature = "onnx")]
impl OnnxEmbedder {
    /// Load ONNX model and tokenizer from a directory.
    /// Expected files: `model.onnx` and `tokenizer.json`.
    pub fn load(model_dir: &std::path::Path) -> Result<Self, EmbeddingError> {
        let model_path = model_dir.join("model.onnx");
        let tokenizer_path = model_dir.join("tokenizer.json");

        if !model_path.exists() {
            return Err(EmbeddingError::ModelNotFound(
                model_path.display().to_string(),
            ));
        }
        if !tokenizer_path.exists() {
            return Err(EmbeddingError::ModelNotFound(
                tokenizer_path.display().to_string(),
            ));
        }

        let session = Session::builder()
            .map_err(|e| EmbeddingError::OnnxRuntime(format!("{e}")))?
            .commit_from_file(&model_path)
            .map_err(|e| EmbeddingError::OnnxRuntime(format!("{e}")))?;

        let tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| EmbeddingError::Tokenizer(format!("{e}")))?;

        Ok(Self {
            session: std::sync::Mutex::new(session),
            tokenizer,
            dim: DEFAULT_DIM,
        })
    }
}

#[cfg(feature = "onnx")]
impl Embedder for OnnxEmbedder {
    fn embed(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| EmbeddingError::Tokenizer(format!("{e}")))?;

        let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&x| x as i64).collect();
        let attention_mask: Vec<i64> = encoding
            .get_attention_mask()
            .iter()
            .map(|&x| x as i64)
            .collect();
        let token_type_ids: Vec<i64> = encoding
            .get_type_ids()
            .iter()
            .map(|&x| x as i64)
            .collect();
        let seq_len = input_ids.len();

        let ids = Array2::from_shape_vec((1, seq_len), input_ids)
            .map_err(|e| EmbeddingError::OnnxRuntime(format!("shape: {e}")))?;
        let mask = Array2::from_shape_vec((1, seq_len), attention_mask)
            .map_err(|e| EmbeddingError::OnnxRuntime(format!("shape: {e}")))?;
        let types = Array2::from_shape_vec((1, seq_len), token_type_ids)
            .map_err(|e| EmbeddingError::OnnxRuntime(format!("shape: {e}")))?;

        let ids_ref = TensorRef::from_array_view(ids.view())
            .map_err(|e| EmbeddingError::OnnxRuntime(format!("{e}")))?;
        let mask_ref = TensorRef::from_array_view(mask.view())
            .map_err(|e| EmbeddingError::OnnxRuntime(format!("{e}")))?;
        let types_ref = TensorRef::from_array_view(types.view())
            .map_err(|e| EmbeddingError::OnnxRuntime(format!("{e}")))?;

        let mut session = self
            .session
            .lock()
            .map_err(|_| EmbeddingError::OnnxRuntime("session lock poisoned".into()))?;

        let outputs = session
            .run(ort::inputs![
                "input_ids" => ids_ref,
                "attention_mask" => mask_ref,
                "token_type_ids" => types_ref,
            ])
            .map_err(|e| EmbeddingError::OnnxRuntime(format!("{e}")))?;

        let (shape, data) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| EmbeddingError::OnnxRuntime(format!("extract: {e}")))?;

        let hidden_dim = *shape.last().unwrap_or(&0) as usize;
        let tokens = if shape.len() == 3 {
            shape[1] as usize
        } else {
            1
        };

        // Mean pooling over token dimension
        let mut pooled = vec![0.0f32; hidden_dim];
        for t in 0..tokens {
            let offset = t * hidden_dim;
            for d in 0..hidden_dim {
                pooled[d] += data[offset + d];
            }
        }
        let scale = 1.0 / tokens as f32;
        for v in &mut pooled {
            *v *= scale;
        }

        // L2 normalize
        let norm: f32 = pooled.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for v in &mut pooled {
                *v /= norm;
            }
        }

        Ok(pooled)
    }

    fn dim(&self) -> usize {
        self.dim
    }
}

// ── Bag-of-Words Fallback Embedder ────────────────────────────────────

/// Simple bag-of-words embedder using character n-gram hashing.
/// No model files required. Fixed 384-dim output.
/// Provides basic semantic similarity (better than nothing, worse than BERT).
pub struct BagOfWordsEmbedder {
    dim: usize,
}

impl BagOfWordsEmbedder {
    pub fn new() -> Self {
        Self { dim: DEFAULT_DIM }
    }
}

impl Default for BagOfWordsEmbedder {
    fn default() -> Self {
        Self::new()
    }
}

impl Embedder for BagOfWordsEmbedder {
    fn embed(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        let mut vec = vec![0.0f32; self.dim];
        let lowered = text.to_lowercase();
        let words: Vec<&str> = lowered
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| w.len() > 1)
            .collect();

        if words.is_empty() {
            return Ok(vec);
        }

        // Hash each word into multiple dimensions (feature hashing)
        let mut count = 0u32;
        for word in &words {
            let bytes = word.as_bytes();
            // Use multiple hash seeds for better distribution
            for seed in 0..3u32 {
                let mut h = seed.wrapping_mul(2654435761); // Knuth's multiplicative hash
                for &b in bytes {
                    h = h.wrapping_mul(31).wrapping_add(b as u32);
                }
                let idx = (h as usize) % self.dim;
                let sign = if (h >> 16) & 1 == 0 { 1.0 } else { -1.0 };
                vec[idx] += sign;
            }
            count += 1;
        }

        // Average and L2 normalize
        if count > 0 {
            let scale = 1.0 / count as f32;
            for v in &mut vec {
                *v *= scale;
            }
        }
        let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for v in &mut vec {
                *v /= norm;
            }
        }

        Ok(vec)
    }

    fn dim(&self) -> usize {
        self.dim
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bow_embed_produces_correct_dim() {
        let embedder = BagOfWordsEmbedder::new();
        let vec = embedder.embed("hello world").unwrap();
        assert_eq!(vec.len(), DEFAULT_DIM);
    }

    #[test]
    fn bow_embed_empty_text() {
        let embedder = BagOfWordsEmbedder::new();
        let vec = embedder.embed("").unwrap();
        assert_eq!(vec.len(), DEFAULT_DIM);
        assert!(vec.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn bow_similar_texts_have_higher_similarity() {
        let embedder = BagOfWordsEmbedder::new();
        let v1 = embedder
            .embed("machine learning neural networks")
            .unwrap();
        let v2 = embedder
            .embed("machine learning deep neural networks")
            .unwrap();
        let v3 = embedder.embed("cooking recipes italian pasta").unwrap();

        let sim_similar = crate::store::dot_product(&v1, &v2);
        let sim_different = crate::store::dot_product(&v1, &v3);

        assert!(
            sim_similar > sim_different,
            "similar texts should have higher similarity: {sim_similar} vs {sim_different}"
        );
    }

    #[test]
    fn bow_is_normalized() {
        let embedder = BagOfWordsEmbedder::new();
        let vec = embedder.embed("knowledge graph embeddings").unwrap();
        let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!(
            (norm - 1.0).abs() < 1e-5,
            "output should be L2 normalized, got norm={norm}"
        );
    }
}
