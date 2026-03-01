//! EmbeddingStore — in-memory vector storage with SIMD-accelerated similarity.
//!
//! [MAC] — Port of graph-engine/src/embedding.rs
//!
//! Stores node embeddings as dense f32 vectors with pre-computed L2 norms.
//! Provides cosine similarity, KNN search, and brute-force semantic search.
//!
//! SIMD acceleration:
//!   - aarch64: NEON 4-wide fma (matches macOS Accelerate path)
//!   - x86_64:  SSE2 4-wide mul+add (DirectML handles heavy work on Windows)
//!   - fallback: scalar loop (always correct)

use rustc_hash::FxHashMap;

/// A single embedding entry with pre-computed L2 norm.
#[derive(Debug, Clone)]
struct EmbeddingEntry {
    vector: Vec<f32>,
    norm: f32,
}

/// KNN search result.
#[derive(Debug, Clone)]
pub struct KnnHit {
    pub node_index: u32,
    pub similarity: f32,
}

/// In-memory embedding store. All vectors must share the same dimension.
pub struct EmbeddingStore {
    dim: usize,
    embeddings: FxHashMap<u32, EmbeddingEntry>,
}

impl EmbeddingStore {
    pub fn new(dim: usize) -> Self {
        Self {
            dim,
            embeddings: FxHashMap::default(),
        }
    }

    pub fn dim(&self) -> usize {
        self.dim
    }

    pub fn len(&self) -> usize {
        self.embeddings.len()
    }

    pub fn is_empty(&self) -> bool {
        self.embeddings.is_empty()
    }

    /// Store an embedding for a node. Vector length must equal `dim`.
    pub fn set(&mut self, node_index: u32, vector: &[f32]) {
        if vector.len() != self.dim {
            return;
        }
        let norm = l2_norm(vector);
        self.embeddings.insert(node_index, EmbeddingEntry {
            vector: vector.to_vec(),
            norm,
        });
    }

    /// Remove an embedding.
    pub fn remove(&mut self, node_index: u32) {
        self.embeddings.remove(&node_index);
    }

    /// Clear all stored embeddings.
    pub fn clear(&mut self) {
        self.embeddings.clear();
    }

    /// Cosine similarity between two stored embeddings.
    pub fn cosine_similarity(&self, a: u32, b: u32) -> f32 {
        let (Some(ea), Some(eb)) = (self.embeddings.get(&a), self.embeddings.get(&b)) else {
            return 0.0;
        };
        if ea.norm == 0.0 || eb.norm == 0.0 {
            return 0.0;
        }
        dot_product(&ea.vector, &eb.vector) / (ea.norm * eb.norm)
    }

    /// KNN search: find k nearest neighbors for a stored node.
    pub fn knn(&self, query_index: u32, k: usize, threshold: f32) -> Vec<KnnHit> {
        let Some(query) = self.embeddings.get(&query_index) else {
            return Vec::new();
        };
        if query.norm == 0.0 {
            return Vec::new();
        }

        let mut hits: Vec<KnnHit> = self.embeddings.iter()
            .filter(|(idx, _)| **idx != query_index)
            .filter_map(|(idx, entry)| {
                if entry.norm == 0.0 {
                    return None;
                }
                let sim = dot_product(&query.vector, &entry.vector) / (query.norm * entry.norm);
                if sim >= threshold {
                    Some(KnnHit { node_index: *idx, similarity: sim })
                } else {
                    None
                }
            })
            .collect();

        hits.sort_unstable_by(|a, b| {
            b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal)
        });
        hits.truncate(k);
        hits
    }

    /// Semantic search: find k nearest nodes to an arbitrary query vector.
    pub fn search(&self, query_vec: &[f32], k: usize, threshold: f32) -> Vec<KnnHit> {
        if query_vec.len() != self.dim {
            return Vec::new();
        }
        let query_norm = l2_norm(query_vec);
        if query_norm == 0.0 {
            return Vec::new();
        }

        let mut hits: Vec<KnnHit> = self.embeddings.iter()
            .filter_map(|(idx, entry)| {
                if entry.norm == 0.0 {
                    return None;
                }
                let sim = dot_product(query_vec, &entry.vector) / (query_norm * entry.norm);
                if sim >= threshold {
                    Some(KnnHit { node_index: *idx, similarity: sim })
                } else {
                    None
                }
            })
            .collect();

        hits.sort_unstable_by(|a, b| {
            b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal)
        });
        hits.truncate(k);
        hits
    }

    /// All KNN pairs for semantic force computation.
    /// Returns (node_a, node_b, similarity) for physics integration.
    pub fn all_knn_pairs(&self, k: usize, threshold: f32) -> Vec<(u32, u32, f32)> {
        let mut result = Vec::new();
        for &idx in self.embeddings.keys() {
            let neighbors = self.knn(idx, k, threshold);
            for hit in neighbors {
                // Only emit each pair once (a < b)
                if idx < hit.node_index {
                    result.push((idx, hit.node_index, hit.similarity));
                }
            }
        }
        result
    }

    /// Check if a node has a stored embedding.
    pub fn has(&self, node_index: u32) -> bool {
        self.embeddings.contains_key(&node_index)
    }

    /// Get the raw vector for a node (for serialization/debugging).
    pub fn get_vector(&self, node_index: u32) -> Option<&[f32]> {
        self.embeddings.get(&node_index).map(|e| e.vector.as_slice())
    }
}

// ── SIMD-Accelerated Math ─────────────────────────────────────────────

/// L2 norm of a vector.
#[inline]
fn l2_norm(v: &[f32]) -> f32 {
    dot_product(v, v).sqrt()
}

/// Dot product with platform-specific SIMD.
#[inline]
pub fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len());

    #[cfg(target_arch = "aarch64")]
    {
        dot_product_neon(a, b)
    }
    #[cfg(target_arch = "x86_64")]
    {
        dot_product_sse2(a, b)
    }
    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    {
        dot_product_scalar(a, b)
    }
}

/// NEON 4-wide fused multiply-add (aarch64).
/// [MAC] — Same intrinsics as graph-engine/src/embedding.rs.
#[cfg(target_arch = "aarch64")]
#[inline]
fn dot_product_neon(a: &[f32], b: &[f32]) -> f32 {
    use std::arch::aarch64::*;
    let len = a.len().min(b.len());
    let chunks = len / 4;
    let remainder = len % 4;

    // SAFETY: Pointer arithmetic stays within bounds — `chunks * 4 <= len`
    // and `len = a.len().min(b.len())`. NEON loads are 4-wide aligned reads.
    unsafe {
        let mut acc = vdupq_n_f32(0.0);
        for i in 0..chunks {
            let offset = i * 4;
            let va = vld1q_f32(a.as_ptr().add(offset));
            let vb = vld1q_f32(b.as_ptr().add(offset));
            acc = vfmaq_f32(acc, va, vb);
        }
        let mut sum = vaddvq_f32(acc);
        let base = chunks * 4;
        for i in 0..remainder {
            sum += a[base + i] * b[base + i];
        }
        sum
    }
}

/// SSE2 4-wide multiply + add (x86_64).
#[cfg(target_arch = "x86_64")]
#[inline]
fn dot_product_sse2(a: &[f32], b: &[f32]) -> f32 {
    use std::arch::x86_64::*;
    let len = a.len().min(b.len());
    let chunks = len / 4;
    let remainder = len % 4;

    // SAFETY: Pointer arithmetic stays within bounds — `chunks * 4 <= len`
    // and `len = a.len().min(b.len())`. SSE2 uses unaligned loads (`_mm_loadu_ps`).
    unsafe {
        let mut acc = _mm_setzero_ps();
        for i in 0..chunks {
            let offset = i * 4;
            let va = _mm_loadu_ps(a.as_ptr().add(offset));
            let vb = _mm_loadu_ps(b.as_ptr().add(offset));
            let prod = _mm_mul_ps(va, vb);
            acc = _mm_add_ps(acc, prod);
        }
        // Horizontal sum of 4 floats
        let shuf = _mm_movehdup_ps(acc); // [a1, a1, a3, a3]
        let sums = _mm_add_ps(acc, shuf); // [a0+a1, _, a2+a3, _]
        let shuf2 = _mm_movehl_ps(sums, sums); // [a2+a3, _, ...]
        let result = _mm_add_ss(sums, shuf2); // [a0+a1+a2+a3]
        let mut sum = _mm_cvtss_f32(result);
        let base = chunks * 4;
        for i in 0..remainder {
            sum += a[base + i] * b[base + i];
        }
        sum
    }
}

/// Scalar fallback.
#[inline]
#[allow(dead_code)]
fn dot_product_scalar(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

// ── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_store() -> EmbeddingStore {
        let mut store = EmbeddingStore::new(4);
        store.set(0, &[1.0, 0.0, 0.0, 0.0]);
        store.set(1, &[0.0, 1.0, 0.0, 0.0]);
        store.set(2, &[1.0, 1.0, 0.0, 0.0]); // 45 degrees from both
        store.set(3, &[1.0, 0.0, 0.0, 0.0]); // identical to 0
        store
    }

    #[test]
    fn dot_product_basic() {
        let a = [1.0, 2.0, 3.0, 4.0];
        let b = [5.0, 6.0, 7.0, 8.0];
        let result = dot_product(&a, &b);
        assert!((result - 70.0).abs() < 1e-5);
    }

    #[test]
    fn dot_product_zeros() {
        let a = [0.0; 4];
        let b = [1.0; 4];
        assert!((dot_product(&a, &b)).abs() < 1e-7);
    }

    #[test]
    fn dot_product_non_aligned() {
        // 5 elements — tests remainder handling
        let a = [1.0, 2.0, 3.0, 4.0, 5.0];
        let b = [2.0, 3.0, 4.0, 5.0, 6.0];
        let result = dot_product(&a, &b);
        assert!((result - 70.0).abs() < 1e-5);
    }

    #[test]
    fn l2_norm_unit() {
        assert!((l2_norm(&[1.0, 0.0, 0.0, 0.0]) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn l2_norm_45deg() {
        let norm = l2_norm(&[1.0, 1.0, 0.0, 0.0]);
        assert!((norm - std::f32::consts::SQRT_2).abs() < 1e-6);
    }

    #[test]
    fn cosine_identical() {
        let store = make_store();
        let sim = store.cosine_similarity(0, 3);
        assert!((sim - 1.0).abs() < 1e-6, "identical vectors should have similarity 1.0");
    }

    #[test]
    fn cosine_orthogonal() {
        let store = make_store();
        let sim = store.cosine_similarity(0, 1);
        assert!(sim.abs() < 1e-6, "orthogonal vectors should have similarity 0.0");
    }

    #[test]
    fn cosine_45_degrees() {
        let store = make_store();
        let sim = store.cosine_similarity(0, 2);
        // cos(45°) ≈ 0.7071
        assert!((sim - std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-5);
    }

    #[test]
    fn cosine_missing_node() {
        let store = make_store();
        assert!(store.cosine_similarity(0, 99).abs() < 1e-7);
    }

    #[test]
    fn knn_basic() {
        let store = make_store();
        let hits = store.knn(0, 2, 0.0);
        assert_eq!(hits.len(), 2);
        // Node 3 (identical) should be first, node 2 (45°) second
        assert_eq!(hits[0].node_index, 3);
        assert!((hits[0].similarity - 1.0).abs() < 1e-6);
        assert_eq!(hits[1].node_index, 2);
    }

    #[test]
    fn knn_with_threshold() {
        let store = make_store();
        let hits = store.knn(0, 10, 0.8);
        // Only node 3 (sim=1.0) passes 0.8 threshold; node 2 (sim≈0.707) doesn't
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].node_index, 3);
    }

    #[test]
    fn search_query_vector() {
        let store = make_store();
        let query = [1.0, 0.0, 0.0, 0.0]; // same as node 0 and 3
        let hits = store.search(&query, 3, 0.0);
        assert!(!hits.is_empty());
        assert!((hits[0].similarity - 1.0).abs() < 1e-6);
    }

    #[test]
    fn search_wrong_dim() {
        let store = make_store();
        let hits = store.search(&[1.0, 0.0], 5, 0.0);
        assert!(hits.is_empty(), "wrong dimension should return empty");
    }

    #[test]
    fn set_wrong_dim_ignored() {
        let mut store = EmbeddingStore::new(4);
        store.set(0, &[1.0, 2.0]); // wrong dim
        assert!(!store.has(0));
    }

    #[test]
    fn remove_and_has() {
        let mut store = make_store();
        assert!(store.has(0));
        store.remove(0);
        assert!(!store.has(0));
        assert_eq!(store.len(), 3);
    }

    #[test]
    fn all_knn_pairs_symmetric() {
        let store = make_store();
        let pairs = store.all_knn_pairs(2, 0.5);
        // Should contain (0, 2), (0, 3), (2, 3) — all above 0.5
        assert!(!pairs.is_empty());
        // Verify all pairs have a < b (no duplicates)
        for (a, b, _sim) in &pairs {
            assert!(a < b, "pairs should be ordered a < b");
        }
    }

    #[test]
    fn clear_empties_store() {
        let mut store = make_store();
        assert_eq!(store.len(), 4);
        store.clear();
        assert!(store.is_empty());
    }

    #[test]
    fn large_vector_simd() {
        // 512-dim test (realistic model dimension)
        let mut store = EmbeddingStore::new(512);
        let mut v1 = vec![0.0f32; 512];
        let mut v2 = vec![0.0f32; 512];
        for i in 0..512 {
            v1[i] = (i as f32 * 0.01).sin();
            v2[i] = (i as f32 * 0.01).cos();
        }
        store.set(0, &v1);
        store.set(1, &v2);
        let sim = store.cosine_similarity(0, 1);
        // sin and cos at small angles are roughly orthogonal
        assert!(sim.abs() < 0.5, "sin/cos vectors should have low similarity, got {sim}");
    }
}
