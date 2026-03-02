//! FST-backed fuzzy search over graph node labels.
//!
//! [MAC] — Port of graph-engine/src/search.rs
//!
//! Two-phase search combining FST Levenshtein automaton with 5-tier scoring:
//! 1. FST Levenshtein — typo-tolerant matching (O(|query|) in automaton size)
//! 2. Linear scan — 5-tier ranking: exact (1.0) > prefix (0.9) > word-start (0.8)
//!    > contains (0.6) > subsequence (0.3)
//!
//! FST hits get a 0.25 bonus if not already matched by linear scoring,
//! so typo corrections like "quantm" → "quantum" surface in results.

use fst::automaton::Levenshtein;
use fst::{IntoStreamer, Set, SetBuilder, Streamer};
use rustc_hash::FxHashMap;

use storage::types::GraphNodeType;

use crate::store::{NodeRecord, SearchHit};

/// FST-backed search index over graph node labels.
/// Rebuilt after each graph commit for sub-1ms query performance.
pub struct SearchIndex {
    /// FST set of lowercased labels for Levenshtein automaton queries.
    fst_set: Option<Set<Vec<u8>>>,
    /// Reverse index: lowercased label → list of entry indices.
    label_to_entries: FxHashMap<String, Vec<usize>>,
    /// All searchable entries (parallel to NodeRecord).
    entries: Vec<SearchEntry>,
}

struct SearchEntry {
    node_id: String,
    label: String,
    label_lower: String,
    node_type: GraphNodeType,
}

impl Default for SearchIndex {
    fn default() -> Self {
        Self::new()
    }
}

impl SearchIndex {
    pub fn new() -> Self {
        Self {
            fst_set: None,
            label_to_entries: FxHashMap::default(),
            entries: Vec::new(),
        }
    }

    /// Rebuild the index from current graph nodes.
    /// Call after graph commit or load.
    pub fn build<'a>(&mut self, nodes: impl Iterator<Item = &'a NodeRecord>) {
        self.entries.clear();
        self.label_to_entries.clear();

        for node in nodes {
            if !node.is_visible {
                continue;
            }
            let label_lower = node.label.to_lowercase();
            let idx = self.entries.len();
            self.label_to_entries
                .entry(label_lower.clone())
                .or_default()
                .push(idx);
            self.entries.push(SearchEntry {
                node_id: node.id.clone(),
                label: node.label.clone(),
                label_lower,
                node_type: node.node_type,
            });
        }

        // Build FST set from deduplicated, sorted labels.
        let mut labels: Vec<&str> = self.label_to_entries.keys().map(|s| s.as_str()).collect();
        labels.sort_unstable();

        let mut builder = SetBuilder::memory();
        for label in &labels {
            let _ = builder.insert(label);
        }

        self.fst_set = Some(builder.into_set());
    }

    /// Search for nodes matching the query. Returns up to `limit` results.
    /// Combines FST Levenshtein matching with 5-tier scoring.
    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchHit> {
        if query.is_empty() {
            return Vec::new();
        }

        let query_lower = query.to_lowercase();

        // Phase 1: FST Levenshtein hits for typo-tolerant matching.
        let mut fst_hits: FxHashMap<usize, f32> = FxHashMap::default();
        if let Some(ref fst) = self.fst_set {
            // Edit distance: 1 for short queries (≤4 chars), 2 for longer.
            let max_dist = if query_lower.len() <= 4 { 1u32 } else { 2 };
            if let Ok(lev) = Levenshtein::new(&query_lower, max_dist) {
                let mut stream = fst.search(&lev).into_stream();
                while let Some(key) = stream.next() {
                    if let Ok(label) = std::str::from_utf8(key) {
                        if let Some(indices) = self.label_to_entries.get(label) {
                            for &idx in indices {
                                fst_hits.insert(idx, 0.25);
                            }
                        }
                    }
                }
            }
        }

        // Phase 2: Linear scan with 5-tier scoring.
        let mut scored: Vec<(usize, f32)> = Vec::with_capacity(limit.min(self.entries.len()));

        for (i, entry) in self.entries.iter().enumerate() {
            let mut score = score_match(&entry.label_lower, &query_lower);

            // Boost from FST Levenshtein if not already matched by linear scoring.
            if let Some(&fst_bonus) = fst_hits.get(&i) {
                if score == 0.0 {
                    score = fst_bonus;
                }
            }

            if score > 0.0 {
                scored.push((i, score));
            }
        }

        // Sort by score descending, then alphabetically for ties.
        scored.sort_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    self.entries[a.0]
                        .label_lower
                        .cmp(&self.entries[b.0].label_lower)
                })
        });
        scored.truncate(limit);

        scored
            .iter()
            .map(|(i, score)| {
                let entry = &self.entries[*i];
                SearchHit {
                    node_id: entry.node_id.clone(),
                    label: entry.label.clone(),
                    node_type: entry.node_type,
                    score: *score,
                }
            })
            .collect()
    }

    /// Returns the number of indexed entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Returns true if the index is empty.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

/// 5-tier scoring: exact (1.0) > prefix (0.9) > word-start (0.8) > contains (0.6) > subsequence (0.3).
fn score_match(label: &str, query: &str) -> f32 {
    if label == query {
        return 1.0;
    }
    if label.starts_with(query) {
        return 0.9;
    }
    if word_start_match(query, label) {
        return 0.8;
    }
    if label.contains(query) {
        return 0.6;
    }
    if is_subsequence(query, label) {
        return 0.3;
    }
    0.0
}

/// Check if query characters match the start of words in the label.
/// "ml" matches "machine learning" (M-achine L-earning).
fn word_start_match(query: &str, label: &str) -> bool {
    let query_chars: Vec<char> = query.chars().collect();
    if query_chars.len() < 2 {
        return false;
    }
    let words: Vec<&str> = label.split_whitespace().collect();
    let mut qi = 0;
    for word in &words {
        if qi < query_chars.len() {
            if let Some(first) = word.chars().next() {
                if first == query_chars[qi] {
                    qi += 1;
                }
            }
        }
    }
    qi == query_chars.len()
}

/// Check if all query characters appear in order in the label.
fn is_subsequence(needle: &str, haystack: &str) -> bool {
    let mut needle_chars = needle.chars();
    let mut current = needle_chars.next();
    for h in haystack.chars() {
        if let Some(n) = current {
            if h == n {
                current = needle_chars.next();
            }
        } else {
            return true;
        }
    }
    current.is_none()
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::NodeRecord;

    fn make_node(id: &str, label: &str, node_type: GraphNodeType) -> NodeRecord {
        NodeRecord {
            id: id.to_string(),
            node_type,
            label: label.to_string(),
            source_id: String::new(),
            metadata_json: None,
            weight: 1.0,
            created_at: 0,
            x: 0.0,
            y: 0.0,
            z: 0.0,
            vx: 0.0,
            vy: 0.0,
            vz: 0.0,
            is_visible: true,
            is_pinned: false,
        }
    }

    #[test]
    fn empty_query_returns_nothing() {
        let nodes = [make_node("a", "Hello", GraphNodeType::Note)];
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        assert!(idx.search("", 10).is_empty());
    }

    #[test]
    fn exact_match_scores_highest() {
        let nodes = [make_node("a", "Machine Learning", GraphNodeType::Note),
            make_node("b", "Deep Learning", GraphNodeType::Note)];
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        let results = idx.search("machine learning", 10);
        assert!(!results.is_empty());
        assert_eq!(results[0].node_id, "a");
        assert!(results[0].score > 0.9);
    }

    #[test]
    fn prefix_match_works() {
        let nodes = [make_node("a", "Quantum Computing", GraphNodeType::Idea),
            make_node("b", "Classical Music", GraphNodeType::Note)];
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        let results = idx.search("quant", 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].node_id, "a");
        assert!((results[0].score - 0.9).abs() < f32::EPSILON);
    }

    #[test]
    fn substring_match_works() {
        let nodes = [make_node("a", "Deep Reinforcement Learning", GraphNodeType::Note)];
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        let results = idx.search("reinforcement", 10);
        assert_eq!(results.len(), 1);
        assert!((results[0].score - 0.6).abs() < f32::EPSILON);
    }

    #[test]
    fn fuzzy_subsequence_match_works() {
        let nodes = [make_node("a", "Machine Learning", GraphNodeType::Note)];
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        let results = idx.search("mchn", 10);
        assert_eq!(results.len(), 1);
        assert!(results[0].score > 0.0);
    }

    #[test]
    fn invisible_nodes_excluded() {
        let mut node = make_node("a", "Hidden Note", GraphNodeType::Note);
        node.is_visible = false;
        let nodes = [node];
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        assert!(idx.search("hidden", 10).is_empty());
    }

    #[test]
    fn limit_respected() {
        let nodes: Vec<NodeRecord> = (0..20)
            .map(|i| make_node(&format!("n{i}"), &format!("Note {i}"), GraphNodeType::Note))
            .collect();
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        let results = idx.search("note", 5);
        assert_eq!(results.len(), 5);
    }

    #[test]
    fn word_start_match_scores_correctly() {
        let nodes = [make_node("a", "machine learning", GraphNodeType::Idea),
            make_node("b", "music library", GraphNodeType::Note)];
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        let results = idx.search("ml", 10);
        // Both match word-start
        assert_eq!(results.len(), 2);
        assert!((results[0].score - 0.8).abs() < f32::EPSILON);
    }

    #[test]
    fn score_ordering_correct() {
        let nodes = [make_node("exact", "rust", GraphNodeType::Note),
            make_node("prefix", "rust programming", GraphNodeType::Note),
            make_node("contains", "why rust matters", GraphNodeType::Note),
            make_node("subseq", "xrxuxsxt", GraphNodeType::Note)];
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        let results = idx.search("rust", 10);
        assert!(results.len() >= 3);
        assert_eq!(results[0].node_id, "exact");
        assert_eq!(results[1].node_id, "prefix");
        assert_eq!(results[2].node_id, "contains");
        assert_eq!(results[3].node_id, "subseq");
    }

    #[test]
    fn fst_levenshtein_matches_typos() {
        let nodes = [make_node("a", "Quantum Computing", GraphNodeType::Note),
            make_node("b", "Machine Learning", GraphNodeType::Note),
            make_node("c", "Neural Networks", GraphNodeType::Note)];
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        // "quantm" is edit distance 1 from "quantum" — FST should catch it
        let results = idx.search("quantm", 10);
        assert!(
            !results.is_empty(),
            "FST Levenshtein should match 'quantm' → 'quantum computing'"
        );
        assert_eq!(results[0].node_id, "a");
    }

    #[test]
    fn fst_levenshtein_edit_distance_2() {
        let nodes = [make_node(
            "a",
            "reinforcement learning",
            GraphNodeType::Note,
        )];
        let mut idx = SearchIndex::new();
        idx.build(nodes.iter());
        // "reinfrcement" has 2 edits from "reinforcement"
        let results = idx.search("reinfrcement", 10);
        assert!(
            !results.is_empty(),
            "FST Levenshtein dist=2 should match longer queries"
        );
    }

    #[test]
    fn len_and_is_empty() {
        let mut idx = SearchIndex::new();
        assert!(idx.is_empty());
        assert_eq!(idx.len(), 0);

        let nodes = [make_node("a", "First", GraphNodeType::Note),
            make_node("b", "Second", GraphNodeType::Note)];
        idx.build(nodes.iter());
        assert!(!idx.is_empty());
        assert_eq!(idx.len(), 2);
    }
}
