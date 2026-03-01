use rustc_hash::FxHashMap;
use serde::Serialize;
use std::sync::Arc;
use futures::stream::{self, StreamExt};
use tauri::{AppHandle, Emitter, State};
use storage::ids::GraphNodeId;
use storage::types::{GraphData, GraphEdgeType, GraphNodeType};
use graph::builder::GraphBuilder;
use graph::extractor;
use engine::llm;
use embeddings::onnx::Embedder; // Trait needed for BagOfWordsEmbedder::embed()
use crate::error::AppError;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_graph(state: State<'_, AppState>) -> Result<GraphData, AppError> {
    let db = state.lock_db()?;
    let nodes = db.get_all_graph_nodes()?;
    let edges = db.get_all_graph_edges()?;
    Ok(GraphData { nodes, edges })
}

/// Rebuild graph from all pages — runs on spawn_blocking (CPU-bound).
#[tauri::command]
#[specta::specta]
pub async fn rebuild_graph(state: State<'_, AppState>) -> Result<GraphData, AppError> {
    let app_state = state.inner().clone();

    tokio::task::spawn_blocking(move || {
        // Build + persist graph while holding db lock, then release it.
        // Lock ordering: db (1) must be dropped before graph (2) / physics (4).
        let (nodes, edges) = {
            let db = app_state.lock_db()?;
            let result = GraphBuilder::build(&db)
                .map_err(|e| AppError::Internal(format!("graph build: {e}")))?;
            GraphBuilder::persist(&db, &result)
                .map_err(|e| AppError::Internal(format!("graph persist: {e}")))?;

            let n = db.get_all_graph_nodes()?;
            let e = db.get_all_graph_edges()?;
            (n, e)
        }; // db lock dropped here

        // Reload cached graph store with new data
        // Lock order: graph (2) → physics (4) — canonical
        let mut store = app_state.lock_graph()?;
        store.load(&nodes, &edges);

        let mut physics = app_state.lock_physics()?;
        physics.load_from_graph(&store);

        // Drop graph + physics locks before acquiring embeddings lock
        drop(store);
        drop(physics);

        // Auto-populate BagOfWords embeddings for semantic search
        populate_embeddings(&app_state);

        Ok::<GraphData, AppError>(GraphData { nodes, edges })
    })
    .await
    .map_err(|e| AppError::Internal(format!("task join: {e}")))?
}

/// Search result with fuzzy relevance score.
#[derive(Clone, Serialize, specta::Type)]
pub struct GraphSearchHit {
    pub node_id: String,
    pub label: String,
    pub node_type: storage::types::GraphNodeType,
    pub score: f32,
}

#[tauri::command]
#[specta::specta]
pub async fn search_graph(state: State<'_, AppState>, query: String) -> Result<Vec<GraphSearchHit>, AppError> {
    let store = state.lock_graph()?;
    let hits = store.search_fst(&query, 20);
    Ok(hits.into_iter().map(|h| GraphSearchHit {
        node_id: h.node_id,
        label: h.label,
        node_type: h.node_type,
        score: h.score,
    }).collect())
}

/// Progress event emitted during entity extraction.
#[derive(Clone, Serialize, specta::Type)]
pub struct ExtractionProgress {
    pub phase: String,
    pub current: usize,
    pub total: usize,
}

/// Build an LLM provider from settings stored in the database.
pub fn build_provider_from_settings(
    state: &AppState,
) -> Result<(Arc<dyn llm::LlmProvider>, String), AppError> {
    let db = state.lock_db()?;
    let config_json = db.get_setting("inference_config")
        .map_err(|e| AppError::Internal(format!("{e}")))?;
    let config: storage::types::InferenceConfig = config_json
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(storage::types::InferenceConfig {
            api_provider: "anthropic".into(),
            model: "claude-sonnet-4-20250514".into(),
            ollama_base_url: None,
        });

    let api_key = db.get_setting(&format!("{}_api_key", config.api_provider))
        .map_err(|e| AppError::Internal(format!("{e}")))?
        .unwrap_or_default();

    let base_url = config.ollama_base_url.clone();
    let model = config.model.clone();

    let provider: Arc<dyn llm::LlmProvider> = match config.api_provider.as_str() {
        "openai" => Arc::new(llm::openai::OpenAiProvider::new(api_key, model)),
        "google" => Arc::new(llm::google::GoogleProvider::new(api_key, model)),
        "ollama" => Arc::new(llm::ollama::OllamaProvider::new(model, base_url)),
        "kimi" => Arc::new(llm::openai::OpenAiProvider::with_base_url(
            api_key, model,
            "https://api.moonshot.ai/v1/chat/completions".into(),
            "kimi",
        )),
        "foundry" => Arc::new(llm::openai::OpenAiProvider::with_base_url(
            String::new(), model,
            base_url.unwrap_or_else(|| "http://localhost:5272/v1/chat/completions".into()),
            "foundry",
        )),
        _ => Arc::new(llm::anthropic::AnthropicProvider::new(api_key, model)),
    };

    Ok((provider, config.api_provider))
}

/// Build an LLM provider based on triage routing.
///
/// Uses cached `InferenceAvailability` to select the optimal tier:
/// - NPU-ideal → Foundry Local (if available)
/// - GPU-ideal → Ollama (if available)
/// - Cloud → user's configured provider
///
/// Falls back through the triage cascade when preferred tier is unavailable.
pub fn build_triaged_provider(
    state: &AppState,
    query: &str,
) -> Result<(Arc<dyn llm::LlmProvider>, String), AppError> {
    use engine::triage::{self, GeneralOperation, TriageTier};

    let availability = state.inference_availability.lock()
        .map(|a| *a)
        .unwrap_or(triage::InferenceAvailability {
            has_npu: false, has_gpu: false, has_cloud: true,
        });

    let tier = triage::triage_general_3tier(
        GeneralOperation::ChatResponse,
        Some(query),
        availability,
    );

    let db = state.lock_db()?;

    match tier {
        TriageTier::Npu => {
            // Foundry Local — OpenAI-compatible API on NPU
            let model = db.get_setting("foundry_model")
                .ok().flatten()
                .unwrap_or_else(|| "phi-3.5-mini".into());
            let url = db.get_setting("foundry_base_url")
                .ok().flatten()
                .unwrap_or_else(|| "http://localhost:5272/v1/chat/completions".into());
            let provider: Arc<dyn llm::LlmProvider> = Arc::new(
                llm::openai::OpenAiProvider::with_base_url(String::new(), model, url, "foundry"),
            );
            Ok((provider, "foundry".into()))
        }
        TriageTier::Gpu => {
            // Ollama on GPU
            let model = db.get_setting("ollama_model")
                .ok().flatten()
                .unwrap_or_else(|| "llama3.2:3b".into());
            let base_url = db.get_setting("ollama_base_url").ok().flatten();
            let provider: Arc<dyn llm::LlmProvider> = Arc::new(
                llm::ollama::OllamaProvider::new(model, base_url),
            );
            Ok((provider, "ollama".into()))
        }
        TriageTier::Cloud => {
            // Fall through to user's configured cloud provider
            drop(db);
            build_provider_from_settings(state)
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn extract_entities(
    app: AppHandle,
    state: State<'_, AppState>,
    force: Option<bool>,
) -> Result<(), AppError> {
    let force_rebuild = force.unwrap_or(false);
    // Snapshot provider via triage routing (NPU → GPU → Cloud)
    let (provider, _provider_name) = build_triaged_provider(&state, "entity extraction batch")?;

    // Load all pages, bodies, blocks, and chats — then drop the lock
    let (notes, chat_batches, title_to_node_id) = {
        let db = state.lock_db()?;
        let pages = db.list_pages()?;

        // Build title→node_id map from existing graph nodes
        let existing_nodes = db.get_all_graph_nodes()?;
        let mut title_map: FxHashMap<String, GraphNodeId> = FxHashMap::default();
        for node in &existing_nodes {
            title_map.insert(node.label.to_lowercase(), node.id);
            title_map.insert(node.source_id.clone(), node.id);
        }

        // Prepare note content batches — skip pages whose content hash hasn't changed
        let mut notes: Vec<extractor::NoteContent> = Vec::new();
        let mut skipped_count: usize = 0;
        for page in &pages {
            if page.is_archived || page.word_count < 10 {
                continue;
            }
            let body = db.load_body(page.id).unwrap_or_default();
            if body.is_empty() {
                continue;
            }

            // Diff-based skip: compare content hash against stored entity_hash
            if !force_rebuild {
                let new_hash = extractor::content_hash(&page.title, &body);
                if let Ok(Some(old_hash)) = db.get_entity_hash(page.id) {
                    if old_hash == new_hash {
                        skipped_count += 1;
                        continue;
                    }
                }
            }

            let blocks = db.get_blocks_for_page(page.id).unwrap_or_default();
            let block_annotations: Vec<extractor::BlockAnnotation> = blocks.iter()
                .enumerate()
                .map(|(i, b)| extractor::BlockAnnotation {
                    block_id: b.id,
                    line_number: i,
                })
                .collect();

            notes.push(extractor::NoteContent {
                page_id: page.id,
                title: page.title.clone(),
                body,
                block_annotations,
            });
        }

        if skipped_count > 0 {
            eprintln!("[entities] skipped {skipped_count} unchanged pages (hash match)");
        }

        // Prepare chat batches
        let chats = db.list_chats()?;
        let mut chat_data: Vec<(storage::types::Chat, Vec<(String, String)>)> = Vec::new();
        for chat in chats {
            let messages = db.get_messages_for_chat(chat.id).unwrap_or_default();
            if messages.len() < 2 {
                continue;
            }
            let msg_pairs: Vec<(String, String)> = messages.iter()
                .map(|m| (m.role.clone(), m.content.clone()))
                .collect();
            chat_data.push((chat, msg_pairs));
        }

        (notes, chat_data, title_map)
    };

    let total_note_batches = notes.len().div_ceil(extractor::BATCH_SIZE);
    let total_work = total_note_batches + chat_batches.len();

    // Spawn background task (tokio::spawn, not JS workers)
    let db_state = state.inner().clone();
    tokio::spawn(async move {
        let mut all_nodes = Vec::new();
        let mut all_edges = Vec::new();

        // Phase 1: Note entity extraction — 3 concurrent LLM calls (buffer_unordered)
        let title_map = Arc::new(title_to_node_id);
        let note_batches: Vec<Vec<extractor::NoteContent>> = notes
            .chunks(extractor::BATCH_SIZE)
            .map(|c| c.to_vec())
            .collect();
        let batch_count = note_batches.len();

        let batch_results: Vec<_> = stream::iter(note_batches.into_iter().enumerate())
            .map(|(batch_idx, batch)| {
                let provider = provider.clone();
                let app_ref = app.clone();
                let db_ref = db_state.clone();
                let tmap = title_map.clone();
                async move {
                    let _ = app_ref.emit("extraction://progress", ExtractionProgress {
                        phase: "notes".into(),
                        current: batch_idx + 1,
                        total: total_work,
                    });

                    let prompt = extractor::build_note_prompt(&batch);
                    match provider.generate(
                        &prompt,
                        Some("Extract entities and relationships from the provided notes. Return ONLY valid JSON."),
                        extractor::EXTRACTION_MAX_TOKENS,
                    ).await {
                        Ok(response) => {
                            let mut nodes = Vec::new();
                            let mut edges = Vec::new();
                            if let Ok(result) = extractor::parse_note_response(&response.text) {
                                for note in &batch {
                                    let note_node_id = tmap.get(&note.title.to_lowercase())
                                        .copied()
                                        .unwrap_or_else(GraphNodeId::new);

                                    let (n, e) = extractor::build_note_entities(
                                        &result, note_node_id, &tmap,
                                    );
                                    nodes.extend(n);
                                    edges.extend(e);

                                    // Update entity_hash so this page is skipped next time
                                    let hash = extractor::content_hash(&note.title, &note.body);
                                    if let Ok(db) = db_ref.lock_db() {
                                        if let Err(e) = db.set_entity_hash(note.page_id, &hash) {
                                            eprintln!("[entities] failed to save entity_hash for page {}: {e}", note.page_id);
                                        }
                                    }
                                }
                            }
                            (nodes, edges)
                        }
                        Err(e) => {
                            eprintln!("Entity extraction LLM error (notes batch): {}", e.user_message());
                            (Vec::new(), Vec::new())
                        }
                    }
                }
            })
            .buffer_unordered(3)
            .collect()
            .await;

        for (nodes, edges) in batch_results {
            all_nodes.extend(nodes);
            all_edges.extend(edges);
        }

        // Phase 2: Chat insight extraction (one per chat)
        let mut work_done = batch_count;
        for (chat, messages) in &chat_batches {
            let prompt = extractor::build_chat_prompt(&chat.title, messages);

            let _ = app.emit("extraction://progress", ExtractionProgress {
                phase: "chats".into(),
                current: work_done + 1,
                total: total_work,
            });

            let chat_node_id = title_map.get(&chat.title.to_lowercase())
                .copied()
                .unwrap_or_else(GraphNodeId::new);

            match provider.generate(
                &prompt,
                Some("Extract key ideas from this conversation. Return ONLY valid JSON."),
                extractor::EXTRACTION_MAX_TOKENS,
            ).await {
                Ok(response) => {
                    if let Ok(result) = extractor::parse_chat_response(&response.text) {
                        let (nodes, edges) = extractor::build_chat_entities(
                            &result, chat_node_id, &chat.id.to_string(),
                        );
                        all_nodes.extend(nodes);
                        all_edges.extend(edges);
                    }
                }
                Err(e) => {
                    eprintln!("Entity extraction LLM error (chat): {}", e.user_message());
                }
            }

            work_done += 1;
        }

        // Persist extracted entities (batch insert — 1 IPC, not 100)
        if !all_nodes.is_empty() || !all_edges.is_empty() {
            if let Ok(db) = db_state.lock_db() {
                if let Err(e) = db.insert_graph_nodes_batch(&all_nodes) {
                    eprintln!("Failed to persist extracted nodes: {e}");
                }
                if let Err(e) = db.insert_graph_edges_batch(&all_edges) {
                    eprintln!("Failed to persist extracted edges: {e}");
                }
            }
        }

        // Reload cached graph store with newly extracted entities
        if let Err(e) = db_state.reload_graph() {
            eprintln!("Failed to reload graph after extraction: {e}");
        }

        // Reload physics world to match new graph topology
        // Lock order: graph (2) → physics (4) — canonical
        if let (Ok(store), Ok(mut physics)) = (db_state.lock_graph(), db_state.lock_physics()) {
            physics.load_from_graph(&store);
        }

        // Auto-populate BagOfWords embeddings for new/updated nodes
        populate_embeddings(&db_state);

        let _ = app.emit("extraction://progress", ExtractionProgress {
            phase: "complete".into(),
            current: total_work,
            total: total_work,
        });
    });

    Ok(())
}

// ── Node Inspector Commands ───────────────────────────────────────────

/// Neighbor info returned by get_node_details.
#[derive(Clone, Serialize, specta::Type)]
pub struct NeighborInfo {
    pub node_id: String,
    pub label: String,
    pub node_type: GraphNodeType,
    pub edge_type: GraphEdgeType,
}

/// Full details for a selected node — matches macOS NodeInspectorState.
#[derive(Clone, Serialize, specta::Type)]
pub struct NodeDetails {
    pub node_id: String,
    pub label: String,
    pub node_type: GraphNodeType,
    pub source_id: String,
    pub weight: f64,
    pub link_count: u32,
    pub neighbors: Vec<NeighborInfo>,
    /// Page body or assembled context (truncated to 3000 chars).
    pub content_preview: String,
}

/// Get detailed info for a graph node including neighbors and content.
/// [MAC] — Port of NodeInspectorState.selectNode() + fetchContent().
#[tauri::command]
#[specta::specta]
pub async fn get_node_details(
    state: State<'_, AppState>,
    node_id: String,
) -> Result<NodeDetails, AppError> {
    let store = state.lock_graph()?;

    let node = store.nodes.get(&node_id)
        .ok_or_else(|| AppError::Internal(format!("node not found: {node_id}")))?;

    // Collect neighbors with their connecting edge types
    let edges = store.edges_for(&node_id);
    let mut neighbors = Vec::new();
    for edge in &edges {
        let other_id = if edge.source_node_id == node_id {
            &edge.target_node_id
        } else {
            &edge.source_node_id
        };
        if let Some(other) = store.nodes.get(other_id) {
            neighbors.push(NeighborInfo {
                node_id: other.id.clone(),
                label: other.label.clone(),
                node_type: other.node_type,
                edge_type: edge.edge_type,
            });
        }
    }

    let link_count = store.link_count(&node_id);
    let source_id = node.source_id.clone();
    let label = node.label.clone();
    let node_type = node.node_type;
    let weight = node.weight;
    let metadata_json = node.metadata_json.clone();

    // Drop graph lock before touching DB (canonical order: db before graph)
    drop(store);

    // Fetch content based on node type (mirrors macOS fetchContent)
    let content_preview = fetch_node_content(
        &state, node_type, &source_id, &label, metadata_json.as_deref(), &neighbors,
    )?;

    Ok(NodeDetails {
        node_id,
        label,
        node_type,
        source_id,
        weight,
        link_count,
        neighbors,
        content_preview,
    })
}

/// Fetch content for a node, varying strategy by type.
/// [MAC] — Port of NodeInspectorState.fetchContent().
fn fetch_node_content(
    state: &AppState,
    node_type: GraphNodeType,
    source_id: &str,
    label: &str,
    metadata_json: Option<&str>,
    neighbors: &[NeighborInfo],
) -> Result<String, AppError> {
    let db = state.lock_db()?;

    match node_type {
        GraphNodeType::Note | GraphNodeType::Source => {
            if let Ok(page_id) = source_id.parse::<storage::ids::PageId>() {
                let body = db.load_body(page_id).unwrap_or_default();
                if !body.is_empty() {
                    return Ok(truncate(&body, 3000));
                }
            }
            Ok(label.to_string())
        }
        GraphNodeType::Chat => {
            if let Ok(chat_id) = source_id.parse::<storage::ids::ChatId>() {
                let messages = db.get_messages_for_chat(chat_id).unwrap_or_default();
                let mut parts = Vec::new();
                for msg in messages.iter().rev().take(10).rev() {
                    parts.push(format!("{}: {}", msg.role, truncate(&msg.content, 300)));
                }
                if !parts.is_empty() {
                    return Ok(parts.join("\n"));
                }
            }
            Ok(label.to_string())
        }
        GraphNodeType::Quote => {
            if let Some(json) = metadata_json {
                if let Ok(meta) = serde_json::from_str::<serde_json::Value>(json) {
                    if let Some(text) = meta.get("quoteText").and_then(|v| v.as_str()) {
                        return Ok(text.to_string());
                    }
                }
            }
            Ok(label.to_string())
        }
        GraphNodeType::Folder => {
            let mut parts = vec![format!("Folder: {label}\n")];
            for child in neighbors.iter().filter(|n| n.node_type != GraphNodeType::Folder).take(15) {
                parts.push(format!("- {}", child.label));
            }
            Ok(parts.join("\n"))
        }
        GraphNodeType::Tag => {
            let mut parts = vec![format!("Tag: {label}\nRelated nodes:")];
            for rel in neighbors.iter().take(12) {
                parts.push(format!("- {} ({:?})", rel.label, rel.node_type));
            }
            Ok(parts.join("\n"))
        }
        _ => {
            Ok(label.to_string())
        }
    }
}

// ── Semantic / Embedding Commands ──────────────────────────────────────

/// A semantic neighbor hit (cosine similarity above threshold).
#[derive(Clone, Serialize, specta::Type)]
pub struct SemanticHit {
    pub node_id: String,
    pub label: String,
    pub node_type: GraphNodeType,
    pub similarity: f32,
}

/// Set a node's embedding vector (e.g. after BagOfWords or ONNX inference).
#[tauri::command]
#[specta::specta]
pub async fn set_node_embedding(
    state: State<'_, AppState>,
    node_index: u32,
    vector: Vec<f32>,
) -> Result<(), AppError> {
    let mut store = state.lock_embeddings()?;
    store.set(node_index, &vector);
    Ok(())
}

/// Find K nearest semantic neighbors for a given node.
/// Returns nodes with cosine similarity >= threshold, sorted by similarity.
/// Lock ordering: graph (2) before embeddings (3) — prevents deadlock.
#[tauri::command]
#[specta::specta]
pub async fn semantic_neighbors(
    state: State<'_, AppState>,
    node_index: u32,
    k: usize,
    threshold: f32,
) -> Result<Vec<SemanticHit>, AppError> {
    // Canonical lock order: graph (2) then embeddings (3)
    let graph_store = state.lock_graph()?;
    let emb_store = state.lock_embeddings()?;

    let hits = emb_store.knn(node_index, k, threshold);

    // Build reverse index (u32 → node_id) for O(1) lookup instead of O(n) scan per hit.
    let index_to_node: FxHashMap<u32, &str> = graph_store.nodes.keys()
        .map(|id| (node_id_to_index(id), id.as_str()))
        .collect();

    Ok(hits
        .into_iter()
        .filter_map(|hit| {
            let node_id = index_to_node.get(&hit.node_index)?;
            let n = graph_store.nodes.get(*node_id)?;
            Some(SemanticHit {
                node_id: n.id.clone(),
                label: n.label.clone(),
                node_type: n.node_type,
                similarity: hit.similarity,
            })
        })
        .collect())
}

/// Compute semantic similarity between two nodes.
#[tauri::command]
#[specta::specta]
pub async fn semantic_similarity(
    state: State<'_, AppState>,
    node_a: u32,
    node_b: u32,
) -> Result<f32, AppError> {
    let store = state.lock_embeddings()?;
    Ok(store.cosine_similarity(node_a, node_b))
}

/// Deterministic hash of node_id string → u32 index for EmbeddingStore.
/// Uses SipHash (DefaultHasher) for better distribution than a simple polynomial.
/// Collision probability: ~0.001% at 10K nodes (birthday bound in u32 space).
pub fn node_id_to_index(node_id: &str) -> u32 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    node_id.hash(&mut hasher);
    hasher.finish() as u32
}

/// Populate EmbeddingStore with BagOfWords vectors for all graph nodes.
/// Uses labels as input text — always available, no model files needed.
/// Lock ordering: graph (2) then embeddings (3).
fn populate_embeddings(state: &AppState) {
    let embedder = embeddings::onnx::BagOfWordsEmbedder::new();

    // Snapshot node labels from graph store, then drop graph lock
    let node_labels: Vec<(u32, String)> = {
        let Ok(store) = state.lock_graph() else {
            eprintln!("[embeddings] failed to lock graph store — skipping embedding population");
            return;
        };
        store.nodes.values()
            .map(|n| (node_id_to_index(&n.id), n.label.clone()))
            .collect()
    }; // graph lock dropped

    // Generate and store embeddings (lock ordering: embeddings = 3)
    let Ok(mut emb_store) = state.lock_embeddings() else {
        eprintln!("[embeddings] failed to lock embedding store — skipping embedding population");
        return;
    };
    let mut count = 0usize;
    for (idx, label) in &node_labels {
        if let Ok(vec) = embedder.embed(label) {
            emb_store.set(*idx, &vec);
            count += 1;
        }
    }
    if count > 0 {
        eprintln!("[embeddings] populated {count}/{} nodes with BagOfWords vectors", node_labels.len());
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let end = s.char_indices()
            .nth(max)
            .map_or(s.len(), |(i, _)| i);
        format!("{}...", &s[..end])
    }
}

/// Event payload for streamed node summary.
#[derive(Clone, Serialize, specta::Type)]
pub struct NodeSummaryEvent {
    pub node_id: String,
    pub text: String,
    pub is_complete: bool,
}

/// Generate an AI summary of a node's content.
/// Streams progress via `node://summary` Tauri events.
/// [MAC] — Port of NodeInspectorState.summarizeNode().
#[tauri::command]
#[specta::specta]
pub async fn summarize_node(
    app: AppHandle,
    state: State<'_, AppState>,
    node_id: String,
) -> Result<(), AppError> {
    let (node_type, label, content) = {
        let store = state.lock_graph()?;
        let node = store.nodes.get(&node_id)
            .ok_or_else(|| AppError::Internal(format!("node not found: {node_id}")))?;
        let neighbors: Vec<NeighborInfo> = store.edges_for(&node_id).iter().filter_map(|edge| {
            let other_id = if edge.source_node_id == node_id {
                &edge.target_node_id
            } else {
                &edge.source_node_id
            };
            store.nodes.get(other_id).map(|n| NeighborInfo {
                node_id: n.id.clone(),
                label: n.label.clone(),
                node_type: n.node_type,
                edge_type: edge.edge_type,
            })
        }).collect();

        let nt = node.node_type;
        let lbl = node.label.clone();
        let src = node.source_id.clone();
        let meta = node.metadata_json.clone();
        drop(store);

        let content = fetch_node_content(&state, nt, &src, &lbl, meta.as_deref(), &neighbors)?;
        (nt, lbl, content)
    };

    if content.is_empty() || content == label {
        let _ = app.emit("node://summary", NodeSummaryEvent {
            node_id,
            text: "No content available for this node.".into(),
            is_complete: true,
        });
        return Ok(());
    }

    let trimmed = truncate(&content, 2000);
    let prompt = match node_type {
        GraphNodeType::Folder => format!(
            "Summarize this folder's contents. What themes connect these items?\n\n{trimmed}"
        ),
        GraphNodeType::Quote => format!(
            "What is the author saying in this quote, and why does it matter?\n\n\"{trimmed}\""
        ),
        GraphNodeType::Tag => format!(
            "This tag connects multiple notes. What patterns emerge across the related content?\n\n{trimmed}"
        ),
        _ => format!(
            "Summarize this note — cover the main arguments, key insights, and implications:\n\n{trimmed}"
        ),
    };

    let system_prompt = "Summarize this note concisely. Cover the main ideas, key arguments, \
        and any notable connections. Write 3-5 sentences. Be analytical, not surface-level.";

    let (provider, _) = build_triaged_provider(&state, &trimmed)?;

    let nid = node_id.clone();
    tokio::spawn(async move {
        match provider.generate(&prompt, Some(system_prompt), 512).await {
            Ok(response) => {
                let text = response.text.trim().to_string();
                let _ = app.emit("node://summary", NodeSummaryEvent {
                    node_id: nid,
                    text,
                    is_complete: true,
                });
            }
            Err(e) => {
                let fallback = truncate(&content, 300);
                eprintln!("Node summary LLM error: {}", e.user_message());
                let _ = app.emit("node://summary", NodeSummaryEvent {
                    node_id: nid,
                    text: fallback,
                    is_complete: true,
                });
            }
        }
    });

    Ok(())
}
