//! Three-lane inference router — CPU, GPU (CUDA/TensorRT), NPU (DirectML).
//!
//! [NEW] — Hardware-specific processor separation for Dell XPS 16 9640.
//!
//! Each processor gets a dedicated inference lane with the appropriate
//! threading model. This is critical because ONNX Runtime execution providers
//! have different thread-safety guarantees:
//!
//! | Lane | Hardware                  | Threading Model              | Why                              |
//! |------|---------------------------|------------------------------|----------------------------------|
//! | NPU  | Intel Core Ultra 7 155H   | Dedicated OS thread + mpsc   | DirectML forbids concurrent Run  |
//! | GPU  | NVIDIA RTX 4060 50W       | Mutex<Session>, any thread   | CUDA supports concurrent Run     |
//! | CPU  | 16 cores (6P+8E+2LP)      | Mutex<Session>, any thread   | CPU EP is thread-safe            |
//!
//! **Auto-detection**: Probes compiled features + hardware at startup.
//! **Triage routing**:
//! - Single embedding: NPU (sub-ms) > GPU > CPU
//! - Batch embedding: GPU (CUDA parallelism) > CPU (more threads) > NPU (serialized)

/// Which hardware processor to target for inference.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProcessorKind {
    /// Intel NPU via DirectML — sub-ms embeddings, single-threaded only.
    Npu,
    /// NVIDIA GPU via CUDA/TensorRT — multi-threaded, best for batch.
    Gpu,
    /// CPU fallback — always available, uses physical cores.
    Cpu,
}

impl std::fmt::Display for ProcessorKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Npu => write!(f, "NPU (DirectML)"),
            Self::Gpu => write!(f, "GPU (CUDA/TensorRT)"),
            Self::Cpu => write!(f, "CPU"),
        }
    }
}

/// Result of hardware probe at startup.
#[derive(Debug, Clone)]
pub struct ProbeResult {
    pub available_lanes: Vec<ProcessorKind>,
    pub npu_available: bool,
    pub gpu_available: bool,
    pub cpu_threads: usize,
}

// ═══════════════════════════════════════════════════════════════════════
//  ONNX Runtime code — requires `onnx` feature
// ═══════════════════════════════════════════════════════════════════════

#[cfg(feature = "onnx")]
use crate::error::EmbeddingError;
#[cfg(feature = "onnx")]
use std::path::Path;
#[cfg(feature = "onnx")]
use std::sync::{Arc, Mutex};

#[cfg(feature = "onnx")]
use ndarray::Array2;
#[cfg(feature = "onnx")]
use ort::session::Session;
#[cfg(feature = "onnx")]
use ort::value::TensorRef;
#[cfg(feature = "onnx")]
use tokenizers::Tokenizer;

#[cfg(feature = "onnx")]
use crate::onnx::{Embedder, DEFAULT_DIM};

// ── Helpers ─────────────────────────────────────────────────────────────

#[cfg(feature = "onnx")]
fn ort_err(e: impl std::fmt::Display) -> EmbeddingError {
    EmbeddingError::OnnxRuntime(e.to_string())
}

#[cfg(feature = "onnx")]
fn load_tokenizer(model_dir: &Path) -> Result<Tokenizer, EmbeddingError> {
    let path = model_dir.join("tokenizer.json");
    if !path.exists() {
        return Err(EmbeddingError::ModelNotFound(path.display().to_string()));
    }
    Tokenizer::from_file(&path)
        .map_err(|e| EmbeddingError::Tokenizer(format!("{e}")))
}

/// Optimal intra-op thread count for CPU inference.
/// Heuristic: half of logical cores (accounts for hyperthreading on P/E arch).
#[cfg(feature = "onnx")]
fn optimal_cpu_threads() -> usize {
    let logical = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    (logical / 2).max(4)
}

// ── Shared Inference Logic ──────────────────────────────────────────────

/// Run embedding inference on a session. Shared across all lanes.
///
/// Pipeline: tokenize → tensor → session.run() → mean pool → L2 normalize
#[cfg(feature = "onnx")]
fn run_embedding(
    session: &mut Session,
    tokenizer: &Tokenizer,
    text: &str,
) -> Result<Vec<f32>, EmbeddingError> {
    let encoding = tokenizer
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
        .map_err(|e| ort_err(format!("shape: {e}")))?;
    let mask = Array2::from_shape_vec((1, seq_len), attention_mask)
        .map_err(|e| ort_err(format!("shape: {e}")))?;
    let types = Array2::from_shape_vec((1, seq_len), token_type_ids)
        .map_err(|e| ort_err(format!("shape: {e}")))?;

    // Build input tensors
    let ids_ref = TensorRef::from_array_view(ids.view()).map_err(ort_err)?;
    let mask_ref = TensorRef::from_array_view(mask.view()).map_err(ort_err)?;
    let types_ref = TensorRef::from_array_view(types.view()).map_err(ort_err)?;

    let outputs = session
        .run(ort::inputs![
            "input_ids" => ids_ref,
            "attention_mask" => mask_ref,
            "token_type_ids" => types_ref,
        ])
        .map_err(ort_err)?;

    // Extract output and mean-pool
    let (shape, data) = outputs[0].try_extract_tensor::<f32>().map_err(ort_err)?;

    let hidden_dim = *shape.last().unwrap_or(&0) as usize;
    let tokens = if shape.len() == 3 {
        shape[1] as usize
    } else {
        1
    };

    if hidden_dim == 0 {
        return Err(EmbeddingError::OnnxRuntime(
            "model output has zero dimensions".into(),
        ));
    }

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

// ── NPU Lane (DirectML) ────────────────────────────────────────────────
//
// DirectML EP does NOT support concurrent Run() on the same session.
// We enforce this by routing ALL NPU inference through a single dedicated
// OS thread, communicating via mpsc channels.

#[cfg(all(feature = "onnx", feature = "directml"))]
struct NpuRequest {
    text: String,
    response_tx: std::sync::mpsc::Sender<Result<Vec<f32>, EmbeddingError>>,
}

#[cfg(all(feature = "onnx", feature = "directml"))]
struct NpuLane {
    request_tx: std::sync::mpsc::Sender<NpuRequest>,
}

#[cfg(all(feature = "onnx", feature = "directml"))]
impl NpuLane {
    fn new(model_dir: &Path, tokenizer: Arc<Tokenizer>) -> Result<Self, EmbeddingError> {
        let model_path = model_dir.join("model.onnx");
        if !model_path.exists() {
            return Err(EmbeddingError::ModelNotFound(
                model_path.display().to_string(),
            ));
        }

        // Load model into memory for ort API
        let model_bytes = std::fs::read(&model_path)
            .map_err(|e| EmbeddingError::IoError(format!("failed to read model: {e}")))?;

        // Create DirectML session — intra_threads=1 (single-threaded constraint)
        let mut session = Session::builder()
            .map_err(ort_err)?
            .with_execution_providers([ort::ep::DirectML::default()
                .with_device_id(0)
                .build()])
            .map_err(ort_err)?
            .with_intra_threads(1)
            .map_err(ort_err)?
            .commit_from_memory(&model_bytes)
            .map_err(ort_err)?;

        let (request_tx, request_rx) = std::sync::mpsc::channel::<NpuRequest>();

        // Dedicated OS thread — all DirectML inference runs here
        std::thread::Builder::new()
            .name("epistemos-npu".into())
            .spawn(move || {
                while let Ok(req) = request_rx.recv() {
                    let result = run_embedding(&mut session, &tokenizer, &req.text);
                    let _ = req.response_tx.send(result);
                }
                // Channel closed → router was dropped, thread exits
            })
            .map_err(|e| ort_err(format!("NPU thread spawn: {e}")))?;

        Ok(Self { request_tx })
    }

    fn embed(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        let (response_tx, response_rx) = std::sync::mpsc::channel();
        self.request_tx
            .send(NpuRequest {
                text: text.to_owned(),
                response_tx,
            })
            .map_err(|_| EmbeddingError::LaneUnavailable("NPU thread exited".into()))?;

        response_rx
            .recv()
            .map_err(|_| EmbeddingError::LaneUnavailable("NPU response channel closed".into()))?
    }
}

// ── GPU Lane (CUDA / TensorRT) ──────────────────────────────────────────
//
// CUDA EP supports concurrent Run(). TensorRT sits on top of CUDA.
// When both features are enabled, TensorRT is preferred (50% faster on RTX).
// Mutex ensures correctness if session.run() needs &mut self.

#[cfg(all(feature = "onnx", any(feature = "cuda", feature = "tensorrt")))]
struct GpuLane {
    session: Mutex<Session>,
    tokenizer: Arc<Tokenizer>,
}

#[cfg(all(feature = "onnx", any(feature = "cuda", feature = "tensorrt")))]
impl GpuLane {
    fn new(model_dir: &Path, tokenizer: Arc<Tokenizer>) -> Result<Self, EmbeddingError> {
        let model_path = model_dir.join("model.onnx");
        if !model_path.exists() {
            return Err(EmbeddingError::ModelNotFound(
                model_path.display().to_string(),
            ));
        }

        // Load model into memory for ort API
        let model_bytes = std::fs::read(&model_path)
            .map_err(|e| EmbeddingError::IoError(format!("failed to read model: {e}")))?;

        let mut providers = Vec::new();

        // TensorRT first (50% faster than raw CUDA on NVIDIA GPUs)
        #[cfg(feature = "tensorrt")]
        {
            providers.push(
                ort::ep::TensorRT::default()
                    .with_device_id(0)
                    .with_fp16(true) // FP16 for Ada Lovelace — excellent perf/accuracy
                    .build(),
            );
        }

        // CUDA as fallback (or primary if TensorRT not compiled)
        #[cfg(feature = "cuda")]
        {
            providers.push(
                ort::ep::CUDA::default()
                    .with_device_id(0)
                    .with_tf32(true) // TensorFloat-32 on Ada Lovelace
                    .build(),
            );
        }

        // 4 host-side threads — GPU does the heavy lifting
        let session = Session::builder()
            .map_err(ort_err)?
            .with_execution_providers(providers)
            .map_err(ort_err)?
            .with_intra_threads(4)
            .map_err(ort_err)?
            .commit_from_memory(&model_bytes)
            .map_err(ort_err)?;

        Ok(Self {
            session: Mutex::new(session),
            tokenizer,
        })
    }

    fn embed(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| EmbeddingError::OnnxRuntime("GPU session lock poisoned".into()))?;
        run_embedding(&mut session, &self.tokenizer, text)
    }
}

// ── CPU Lane ────────────────────────────────────────────────────────────
//
// Always available fallback. Uses intra_op_threads = physical cores
// for maximum throughput on the P/E core architecture.

#[cfg(feature = "onnx")]
struct CpuLane {
    session: Mutex<Session>,
    tokenizer: Arc<Tokenizer>,
    threads: usize,
}

#[cfg(feature = "onnx")]
impl CpuLane {
    fn new(model_dir: &Path, tokenizer: Arc<Tokenizer>) -> Result<Self, EmbeddingError> {
        let model_path = model_dir.join("model.onnx");
        if !model_path.exists() {
            return Err(EmbeddingError::ModelNotFound(
                model_path.display().to_string(),
            ));
        }

        // Load model into memory for ort API
        let model_bytes = std::fs::read(&model_path)
            .map_err(|e| EmbeddingError::IoError(format!("failed to read model: {e}")))?;

        let threads = optimal_cpu_threads();

        let session = Session::builder()
            .map_err(ort_err)?
            .with_intra_threads(threads)
            .map_err(ort_err)?
            .commit_from_memory(&model_bytes)
            .map_err(ort_err)?;

        Ok(Self {
            session: Mutex::new(session),
            tokenizer,
            threads,
        })
    }

    fn embed(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| EmbeddingError::OnnxRuntime("CPU session lock poisoned".into()))?;
        run_embedding(&mut session, &self.tokenizer, text)
    }
}

// ── Inference Router ────────────────────────────────────────────────────
//
// Owns all available lanes. Auto-detects hardware at startup.
// Routes inference to the best available lane based on task type.

#[cfg(feature = "onnx")]
pub struct InferenceRouter {
    #[cfg(feature = "directml")]
    npu: Option<NpuLane>,
    #[cfg(any(feature = "cuda", feature = "tensorrt"))]
    gpu: Option<GpuLane>,
    cpu: Option<CpuLane>,
    dim: usize,
}

// Safety: NpuLane communicates via mpsc (Send). GpuLane/CpuLane use Mutex<Session>.
// All fields are Send + Sync, so InferenceRouter is too.
#[cfg(feature = "onnx")]
unsafe impl Send for InferenceRouter {}
#[cfg(feature = "onnx")]
unsafe impl Sync for InferenceRouter {}

#[cfg(feature = "onnx")]
impl InferenceRouter {
    /// Auto-detect available hardware and create inference lanes.
    ///
    /// Probes each compiled execution provider. Lanes that fail to initialize
    /// (missing hardware, driver issues) are logged and skipped.
    pub fn auto_detect(model_dir: &Path) -> Result<Self, EmbeddingError> {
        let tokenizer = Arc::new(load_tokenizer(model_dir)?);

        // ── NPU lane (DirectML) ──
        #[cfg(feature = "directml")]
        let npu = match NpuLane::new(model_dir, Arc::clone(&tokenizer)) {
            Ok(lane) => {
                eprintln!("[embeddings] NPU lane: active (DirectML, dedicated thread)");
                Some(lane)
            }
            Err(e) => {
                eprintln!("[embeddings] NPU lane: unavailable ({e})");
                None
            }
        };

        // ── GPU lane (CUDA / TensorRT) ──
        #[cfg(any(feature = "cuda", feature = "tensorrt"))]
        let gpu = match GpuLane::new(model_dir, Arc::clone(&tokenizer)) {
            Ok(lane) => {
                eprintln!("[embeddings] GPU lane: active (CUDA/TensorRT, multi-threaded)");
                Some(lane)
            }
            Err(e) => {
                eprintln!("[embeddings] GPU lane: unavailable ({e})");
                None
            }
        };

        // ── CPU lane (always available if model exists) ──
        let cpu = match CpuLane::new(model_dir, Arc::clone(&tokenizer)) {
            Ok(lane) => {
                eprintln!(
                    "[embeddings] CPU lane: active ({} intra-op threads)",
                    lane.threads
                );
                Some(lane)
            }
            Err(e) => {
                eprintln!("[embeddings] CPU lane: unavailable ({e})");
                None
            }
        };

        Ok(Self {
            #[cfg(feature = "directml")]
            npu,
            #[cfg(any(feature = "cuda", feature = "tensorrt"))]
            gpu,
            cpu,
            dim: DEFAULT_DIM,
        })
    }

    /// Probe which lanes are available.
    pub fn probe(&self) -> ProbeResult {
        let mut available = Vec::new();
        let mut npu_available = false;
        let mut gpu_available = false;

        #[cfg(feature = "directml")]
        if self.npu.is_some() {
            available.push(ProcessorKind::Npu);
            npu_available = true;
        }

        #[cfg(any(feature = "cuda", feature = "tensorrt"))]
        if self.gpu.is_some() {
            available.push(ProcessorKind::Gpu);
            gpu_available = true;
        }

        if self.cpu.is_some() {
            available.push(ProcessorKind::Cpu);
        }

        let cpu_threads = self.cpu.as_ref().map(|c| c.threads).unwrap_or(0);

        ProbeResult {
            available_lanes: available,
            npu_available,
            gpu_available,
            cpu_threads,
        }
    }

    /// Check if any inference lane is available.
    pub fn has_any_lane(&self) -> bool {
        let mut has = self.cpu.is_some();

        #[cfg(feature = "directml")]
        {
            has = has || self.npu.is_some();
        }

        #[cfg(any(feature = "cuda", feature = "tensorrt"))]
        {
            has = has || self.gpu.is_some();
        }

        has
    }

    /// Embed using a specific processor lane.
    pub fn embed_on(
        &self,
        kind: ProcessorKind,
        text: &str,
    ) -> Result<Vec<f32>, EmbeddingError> {
        match kind {
            ProcessorKind::Npu => {
                #[cfg(feature = "directml")]
                if let Some(ref npu) = self.npu {
                    return npu.embed(text);
                }
                Err(EmbeddingError::LaneUnavailable(
                    "NPU (DirectML) not available".into(),
                ))
            }
            ProcessorKind::Gpu => {
                #[cfg(any(feature = "cuda", feature = "tensorrt"))]
                if let Some(ref gpu) = self.gpu {
                    return gpu.embed(text);
                }
                Err(EmbeddingError::LaneUnavailable(
                    "GPU (CUDA/TensorRT) not available".into(),
                ))
            }
            ProcessorKind::Cpu => {
                if let Some(ref cpu) = self.cpu {
                    return cpu.embed(text);
                }
                Err(EmbeddingError::LaneUnavailable(
                    "CPU lane not available".into(),
                ))
            }
        }
    }

    /// Route to the best available lane for single-text embedding.
    /// Priority: NPU (sub-ms on Intel NPU) > GPU > CPU
    fn embed_auto(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        #[cfg(feature = "directml")]
        if let Some(ref npu) = self.npu {
            return npu.embed(text);
        }

        #[cfg(any(feature = "cuda", feature = "tensorrt"))]
        if let Some(ref gpu) = self.gpu {
            return gpu.embed(text);
        }

        if let Some(ref cpu) = self.cpu {
            return cpu.embed(text);
        }

        Err(EmbeddingError::LaneUnavailable(
            "no inference lane available".into(),
        ))
    }

    /// Route batch to the best lane for throughput.
    /// Priority: GPU (parallel CUDA) > CPU (threaded) > NPU (serialized)
    fn embed_batch_auto(
        &self,
        texts: &[&str],
    ) -> Result<Vec<Vec<f32>>, EmbeddingError> {
        // GPU best for batch — CUDA can pipeline requests
        #[cfg(any(feature = "cuda", feature = "tensorrt"))]
        if let Some(ref gpu) = self.gpu {
            return texts.iter().map(|t| gpu.embed(t)).collect();
        }

        // CPU next — more threads than NPU's single thread
        if let Some(ref cpu) = self.cpu {
            return texts.iter().map(|t| cpu.embed(t)).collect();
        }

        // NPU last for batch — serialized through single thread
        #[cfg(feature = "directml")]
        if let Some(ref npu) = self.npu {
            return texts.iter().map(|t| npu.embed(t)).collect();
        }

        Err(EmbeddingError::LaneUnavailable(
            "no inference lane available".into(),
        ))
    }
}

#[cfg(feature = "onnx")]
impl Embedder for InferenceRouter {
    fn embed(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        self.embed_auto(text)
    }

    fn embed_batch(
        &self,
        texts: &[&str],
    ) -> Result<Vec<Vec<f32>>, EmbeddingError> {
        self.embed_batch_auto(texts)
    }

    fn dim(&self) -> usize {
        self.dim
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn processor_kind_display() {
        assert_eq!(ProcessorKind::Npu.to_string(), "NPU (DirectML)");
        assert_eq!(ProcessorKind::Gpu.to_string(), "GPU (CUDA/TensorRT)");
        assert_eq!(ProcessorKind::Cpu.to_string(), "CPU");
    }

    #[test]
    fn processor_kind_equality() {
        assert_eq!(ProcessorKind::Npu, ProcessorKind::Npu);
        assert_ne!(ProcessorKind::Npu, ProcessorKind::Gpu);
        assert_ne!(ProcessorKind::Gpu, ProcessorKind::Cpu);
    }

    #[test]
    fn processor_kind_hash() {
        use std::collections::HashSet;
        let mut set = HashSet::new();
        set.insert(ProcessorKind::Npu);
        set.insert(ProcessorKind::Gpu);
        set.insert(ProcessorKind::Cpu);
        assert_eq!(set.len(), 3);
    }

    #[test]
    fn probe_result_construction() {
        let probe = ProbeResult {
            available_lanes: vec![ProcessorKind::Cpu],
            npu_available: false,
            gpu_available: false,
            cpu_threads: 8,
        };
        assert_eq!(probe.available_lanes.len(), 1);
        assert!(!probe.npu_available);
        assert!(!probe.gpu_available);
        assert_eq!(probe.cpu_threads, 8);
    }

    #[test]
    fn probe_result_all_lanes() {
        let probe = ProbeResult {
            available_lanes: vec![
                ProcessorKind::Npu,
                ProcessorKind::Gpu,
                ProcessorKind::Cpu,
            ],
            npu_available: true,
            gpu_available: true,
            cpu_threads: 8,
        };
        assert_eq!(probe.available_lanes.len(), 3);
        assert!(probe.npu_available);
        assert!(probe.gpu_available);
    }

    #[cfg(feature = "onnx")]
    #[test]
    fn optimal_cpu_threads_reasonable() {
        let threads = optimal_cpu_threads();
        assert!(threads >= 4, "should have at least 4 threads, got {threads}");
        assert!(
            threads <= 64,
            "should not exceed 64 threads, got {threads}"
        );
    }
}
