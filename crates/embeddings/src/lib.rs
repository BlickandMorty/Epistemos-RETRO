//! Embeddings crate — vector embedding generation, storage, and semantic search.
//!
//! Core components:
//! - `store::EmbeddingStore` — SIMD-accelerated cosine similarity + KNN
//! - `onnx::Embedder` trait — text → vector with OnnxEmbedder and BagOfWordsEmbedder
//! - `processor::InferenceRouter` — three-lane hardware router (NPU/GPU/CPU)
//!
//! The store is always available. ONNX model support requires the `onnx` feature flag.
//! Without it, `BagOfWordsEmbedder` provides basic semantic similarity using feature hashing.
//!
//! For Dell XPS 16 9640 with Intel Core Ultra 7 155H + NVIDIA RTX 4060:
//! - Enable `onnx,cuda,tensorrt,directml` for full hardware acceleration
//! - The `InferenceRouter` auto-detects available hardware and routes to the best lane

pub mod error;
pub mod onnx;
pub mod processor;
pub mod store;
