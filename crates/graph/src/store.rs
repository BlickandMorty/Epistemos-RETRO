use rustc_hash::{FxHashMap, FxHashSet};

use storage::types::{GraphEdge, GraphEdgeType, GraphNode, GraphNodeType};

// ── In-Memory Records ──────────────────────────────────────────────────

/// In-memory node with position + velocity for force layout.
#[derive(Debug, Clone)]
pub struct NodeRecord {
    pub id: String,
    pub node_type: GraphNodeType,
    pub label: String,
    pub source_id: String,
    pub metadata_json: Option<String>,
    pub weight: f64,
    pub created_at: i64,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub vx: f32,
    pub vy: f32,
    pub vz: f32,
    pub is_visible: bool,
    pub is_pinned: bool,
}

/// In-memory edge record.
#[derive(Debug, Clone)]
pub struct EdgeRecord {
    pub id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub edge_type: GraphEdgeType,
    pub weight: f64,
    pub created_at: i64,
}

/// A fuzzy search hit with relevance score.
#[derive(Debug, Clone)]
pub struct SearchHit {
    pub node_id: String,
    pub label: String,
    pub node_type: GraphNodeType,
    pub score: f32,
}

// ── GraphStore ─────────────────────────────────────────────────────────

/// In-memory adjacency list for the knowledge graph.
/// Loaded from storage `GraphNode`/`GraphEdge` at startup.
/// Physics simulation reads/writes positions each frame.
///
/// Uses FxHashMap (rustc-hash) for 2-6x faster hashing than std HashMap.
/// Node IDs are strings at the API boundary but FxHash reduces per-lookup
/// cost from ~15-25ns (SipHash) to ~3-5ns for string keys.
pub struct GraphStore {
    /// All nodes keyed by ID.
    pub nodes: FxHashMap<String, NodeRecord>,
    /// All edges keyed by ID.
    pub edges: FxHashMap<String, EdgeRecord>,
    /// Undirected adjacency: nodeId → set of neighbor nodeIds.
    adjacency: FxHashMap<String, FxHashSet<String>>,
    /// Reverse index: nodeId → set of edgeIds touching that node.
    edges_by_node: FxHashMap<String, FxHashSet<String>>,
    /// Secondary index: (source_id, node_type) → node_id for O(1) source lookups.
    source_index: FxHashMap<(String, GraphNodeType), String>,
    /// FST-backed search index for typo-tolerant label matching.
    search_index: crate::search::SearchIndex,
}

impl GraphStore {
    pub fn new() -> Self {
        Self {
            nodes: FxHashMap::default(),
            edges: FxHashMap::default(),
            adjacency: FxHashMap::default(),
            edges_by_node: FxHashMap::default(),
            source_index: FxHashMap::default(),
            search_index: crate::search::SearchIndex::new(),
        }
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }

    /// Load from storage types. Assigns phyllotaxis spiral positions.
    pub fn load(&mut self, graph_nodes: &[GraphNode], graph_edges: &[GraphEdge]) {
        self.nodes.clear();
        self.edges.clear();
        self.adjacency.clear();
        self.edges_by_node.clear();
        self.source_index.clear();

        // Pre-allocate maps for known sizes
        self.nodes.reserve(graph_nodes.len());
        self.adjacency.reserve(graph_nodes.len());
        self.edges_by_node.reserve(graph_nodes.len());
        self.source_index.reserve(graph_nodes.len());

        let golden = std::f32::consts::PI * (3.0 - 5.0_f32.sqrt());

        for (i, gn) in graph_nodes.iter().enumerate() {
            let r = 120.0 * (i as f32).sqrt();
            let theta = i as f32 * golden;

            let id = gn.id.to_string();
            let source_id = gn.source_id.clone();
            let node_type = gn.node_type;

            // Build source index for O(1) lookups (replaces O(n) scan)
            self.source_index.insert(
                (source_id.clone(), node_type),
                id.clone(),
            );

            let record = NodeRecord {
                id: id.clone(),
                node_type,
                label: gn.label.clone(),
                source_id,
                metadata_json: gn.metadata_json.clone(),
                weight: gn.weight,
                created_at: gn.created_at,
                x: r * theta.cos(),
                y: r * theta.sin(),
                z: 0.0,
                vx: 0.0,
                vy: 0.0,
                vz: 0.0,
                is_visible: true,
                is_pinned: false,
            };
            // One clone for the map key, record moves in
            self.adjacency.entry(id.clone()).or_default();
            self.edges_by_node.entry(id.clone()).or_default();
            self.nodes.insert(id, record);
        }

        self.ingest_edges(graph_edges);
        self.rebuild_search_index();
    }

    fn ingest_edges(&mut self, graph_edges: &[GraphEdge]) {
        self.edges.reserve(graph_edges.len());

        for ge in graph_edges {
            let src = ge.source_node_id.to_string();
            let tgt = ge.target_node_id.to_string();

            // Only add if both endpoints exist
            if !self.nodes.contains_key(&src) || !self.nodes.contains_key(&tgt) {
                continue;
            }

            let eid = ge.id.to_string();

            // Undirected adjacency — 2 clones each for src/tgt (into both directions)
            self.adjacency.entry(src.clone()).or_default().insert(tgt.clone());
            self.adjacency.entry(tgt.clone()).or_default().insert(src.clone());

            // Edge reverse index — eid cloned once, src/tgt moved
            self.edges_by_node.entry(src.clone()).or_default().insert(eid.clone());
            self.edges_by_node.entry(tgt.clone()).or_default().insert(eid.clone());

            // Record takes ownership of src/tgt, eid cloned for map key
            let record = EdgeRecord {
                id: eid.clone(),
                source_node_id: src,
                target_node_id: tgt,
                edge_type: ge.edge_type,
                weight: ge.weight,
                created_at: ge.created_at,
            };
            self.edges.insert(eid, record);
        }
    }

    // ── Queries ────────────────────────────────────────────────────────

    /// All neighbor records for a given node.
    pub fn neighbors(&self, node_id: &str) -> Vec<&NodeRecord> {
        self.adjacency.get(node_id)
            .map(|ids| ids.iter().filter_map(|id| self.nodes.get(id)).collect())
            .unwrap_or_default()
    }

    /// All edges touching a given node.
    pub fn edges_for(&self, node_id: &str) -> Vec<&EdgeRecord> {
        self.edges_by_node.get(node_id)
            .map(|ids| ids.iter().filter_map(|id| self.edges.get(id)).collect())
            .unwrap_or_default()
    }

    /// All nodes of a specific type.
    pub fn nodes_of_type(&self, node_type: GraphNodeType) -> Vec<&NodeRecord> {
        self.nodes.values().filter(|n| n.node_type == node_type).collect()
    }

    /// Find a node by its sourceId and type. O(1) via secondary index.
    pub fn node_by_source(&self, source_id: &str, node_type: GraphNodeType) -> Option<&NodeRecord> {
        self.source_index
            .get(&(source_id.to_owned(), node_type))
            .and_then(|id| self.nodes.get(id))
    }

    /// Number of edges touching a node (degree).
    pub fn link_count(&self, node_id: &str) -> u32 {
        self.adjacency.get(node_id).map_or(0, |s| s.len() as u32)
    }

    /// BFS from a starting node, returning all reachable node IDs within max_depth.
    pub fn connected(&self, node_id: &str, max_depth: usize) -> FxHashSet<String> {
        let mut visited = FxHashSet::default();
        if !self.adjacency.contains_key(node_id) {
            return visited;
        }

        // Separate ID and depth vectors avoid cloning tuples on each iteration.
        let mut queue: Vec<String> = Vec::with_capacity(64);
        let mut depths: Vec<usize> = Vec::with_capacity(64);
        queue.push(node_id.to_owned());
        depths.push(0);
        visited.insert(node_id.to_owned());
        let mut head = 0;

        while head < queue.len() {
            let depth = depths[head];
            head += 1;
            if depth >= max_depth {
                continue;
            }
            // Borrow queue[head-1] after reading depth to satisfy borrow checker
            let current_id = &queue[head - 1];

            if let Some(neighbors) = self.adjacency.get(current_id) {
                for neighbor_id in neighbors {
                    if visited.insert(neighbor_id.clone()) {
                        queue.push(neighbor_id.clone());
                        depths.push(depth + 1);
                    }
                }
            }
        }

        visited
    }

    /// BFS shortest path returning ordered path of node IDs (inclusive).
    pub fn shortest_path(&self, from: &str, to: &str, max_hops: usize) -> Vec<String> {
        if !self.nodes.contains_key(from) || !self.nodes.contains_key(to) {
            return vec![];
        }
        if from == to {
            return vec![from.to_owned()];
        }

        let mut visited = FxHashSet::default();
        visited.insert(from.to_owned());
        // predecessor maps node_id → index into queue (avoids cloning parent IDs)
        let mut parent_idx: FxHashMap<String, usize> = FxHashMap::default();
        let mut queue: Vec<String> = Vec::with_capacity(64);
        let mut depths: Vec<usize> = Vec::with_capacity(64);
        queue.push(from.to_owned());
        depths.push(0);
        let mut head = 0;

        while head < queue.len() {
            let depth = depths[head];
            let current_idx = head;
            head += 1;
            if depth >= max_hops {
                continue;
            }

            let current_id = &queue[current_idx];
            if let Some(neighbors) = self.adjacency.get(current_id) {
                for neighbor_id in neighbors {
                    if neighbor_id.as_str() == to {
                        // Reconstruct path by walking parent_idx back to `from`
                        let mut path = Vec::with_capacity(depth + 2);
                        path.push(to.to_owned());
                        let mut idx = current_idx;
                        loop {
                            path.push(queue[idx].clone());
                            if queue[idx] == from {
                                break;
                            }
                            idx = match parent_idx.get(&queue[idx]) {
                                Some(&i) => i,
                                None => break, // shouldn't happen
                            };
                        }
                        path.reverse();
                        return path;
                    }
                    if visited.insert(neighbor_id.clone()) {
                        let new_idx = queue.len();
                        parent_idx.insert(neighbor_id.clone(), current_idx);
                        queue.push(neighbor_id.clone());
                        depths.push(depth + 1);
                        let _ = new_idx; // used by parent_idx on next iteration
                    }
                }
            }
        }

        vec![] // No path found
    }

    /// Nodes linked to `node_id` via edges of the given type (either direction).
    pub fn nodes_linked_by(&self, edge_type: GraphEdgeType, node_id: &str) -> Vec<&NodeRecord> {
        self.edges_for(node_id)
            .into_iter()
            .filter(|e| e.edge_type == edge_type)
            .filter_map(|e| {
                let other = if e.source_node_id == node_id {
                    &e.target_node_id
                } else {
                    &e.source_node_id
                };
                self.nodes.get(other)
            })
            .collect()
    }

    // ── Fuzzy Search ───────────────────────────────────────────────────

    /// 5-tier fuzzy search matching the Rust FST scoring:
    /// exact (1.0) > prefix (0.9) > word-start (0.8) > contains (0.6) > subsequence (0.3).
    pub fn fuzzy_search(&self, query: &str, limit: usize) -> Vec<SearchHit> {
        let q = query.to_lowercase();
        if q.is_empty() {
            return vec![];
        }

        // Collect scored hits — use a struct to avoid re-lowercasing during sort
        struct ScoredHit<'a> {
            node: &'a NodeRecord,
            score: f32,
            label_lower: String,
        }

        let mut scored: Vec<ScoredHit<'_>> = Vec::with_capacity(limit.min(self.nodes.len()));
        for node in self.nodes.values() {
            let label_lower = node.label.to_lowercase();
            let score = if label_lower == q {
                1.0
            } else if label_lower.starts_with(&q) {
                0.9
            } else if word_start_match(&q, &label_lower) {
                0.8
            } else if label_lower.contains(&q) {
                0.6
            } else if subsequence_match(&q, &label_lower) {
                0.3
            } else {
                continue;
            };
            scored.push(ScoredHit { node, score, label_lower });
        }

        // Sort by score descending, then alphabetically (label_lower already cached)
        scored.sort_by(|a, b| {
            b.score.partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.label_lower.cmp(&b.label_lower))
        });

        scored.truncate(limit);
        scored
            .into_iter()
            .map(|h| SearchHit {
                node_id: h.node.id.clone(),
                label: h.node.label.clone(),
                node_type: h.node.node_type,
                score: h.score,
            })
            .collect()
    }

    /// FST-backed search with Levenshtein typo tolerance.
    /// Prefer this over `fuzzy_search()` — same 5-tier scoring plus typo correction.
    pub fn search_fst(&self, query: &str, limit: usize) -> Vec<SearchHit> {
        self.search_index.search(query, limit)
    }

    /// Rebuild the FST search index from current nodes.
    /// Called automatically after `load()`. Call manually after batch mutations.
    pub fn rebuild_search_index(&mut self) {
        self.search_index.build(self.nodes.values());
    }

    // ── Mutators ───────────────────────────────────────────────────────

    /// Add a node to the store. Maintains source_index for O(1) lookups.
    pub fn add_node(&mut self, node: NodeRecord) {
        let id = node.id.clone();
        self.source_index.insert(
            (node.source_id.clone(), node.node_type),
            id.clone(),
        );
        self.adjacency.entry(id.clone()).or_default();
        self.edges_by_node.entry(id.clone()).or_default();
        self.nodes.insert(id, node);
    }

    /// Add an edge. Both endpoints must exist.
    pub fn add_edge(&mut self, edge: EdgeRecord) {
        if !self.nodes.contains_key(&edge.source_node_id)
            || !self.nodes.contains_key(&edge.target_node_id)
        {
            return;
        }
        // Clone src/tgt for adjacency + edge index (4 entries need owned copies)
        let src = edge.source_node_id.clone();
        let tgt = edge.target_node_id.clone();
        let eid = edge.id.clone();

        self.adjacency.entry(src.clone()).or_default().insert(tgt.clone());
        self.adjacency.entry(tgt.clone()).or_default().insert(src.clone());
        self.edges_by_node.entry(src).or_default().insert(eid.clone());
        self.edges_by_node.entry(tgt).or_default().insert(eid.clone());
        self.edges.insert(eid, edge);
    }

    /// Remove a node and all its edges. Maintains source_index.
    pub fn remove_node(&mut self, node_id: &str) {
        // Remove from source_index before dropping the node record
        if let Some(node) = self.nodes.get(node_id) {
            self.source_index.remove(&(node.source_id.clone(), node.node_type));
        }

        // Take the edge set to avoid borrowing edges_by_node while mutating edges
        let touching = self.edges_by_node.remove(node_id).unwrap_or_default();

        for edge_id in &touching {
            if let Some(edge) = self.edges.remove(edge_id) {
                let other = if edge.source_node_id == node_id {
                    &edge.target_node_id
                } else {
                    &edge.source_node_id
                };
                if let Some(adj) = self.adjacency.get_mut(other) {
                    adj.remove(node_id);
                }
                if let Some(ebn) = self.edges_by_node.get_mut(other) {
                    ebn.remove(edge_id);
                }
            }
        }

        self.nodes.remove(node_id);
        self.adjacency.remove(node_id);
    }

    /// Remove a single edge.
    pub fn remove_edge(&mut self, edge_id: &str) {
        if let Some(edge) = self.edges.remove(edge_id) {
            if let Some(adj) = self.adjacency.get_mut(&edge.source_node_id) {
                adj.remove(&edge.target_node_id);
            }
            if let Some(adj) = self.adjacency.get_mut(&edge.target_node_id) {
                adj.remove(&edge.source_node_id);
            }
            if let Some(ebn) = self.edges_by_node.get_mut(&edge.source_node_id) {
                ebn.remove(edge_id);
            }
            if let Some(ebn) = self.edges_by_node.get_mut(&edge.target_node_id) {
                ebn.remove(edge_id);
            }
        }
    }
}

impl Default for GraphStore {
    fn default() -> Self {
        Self::new()
    }
}

// ── Helper Functions ───────────────────────────────────────────────────

/// Check if query characters match the start of words in the label.
/// "gst" matches "Graph Store Tests" (G-raph S-tore T-ests).
fn word_start_match(query: &str, label: &str) -> bool {
    let initials: String = label
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .filter_map(|w| w.chars().next())
        .map(|c| c.to_lowercase().next().unwrap_or(c))
        .collect();
    initials.contains(query)
}

/// Check if all query characters appear in order in the label.
fn subsequence_match(query: &str, label: &str) -> bool {
    let mut label_chars = label.chars();
    for qc in query.chars() {
        loop {
            match label_chars.next() {
                Some(lc) if lc == qc => break,
                Some(_) => continue,
                None => return false,
            }
        }
    }
    true
}
