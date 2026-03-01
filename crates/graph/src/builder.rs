use rustc_hash::{FxHashMap, FxHashSet};
use std::sync::LazyLock;

use regex::Regex;
use storage::db::Database;
use storage::ids::*;
use storage::types::*;

/// Pre-compiled regex for `((blockRef))` patterns — avoids recompilation on every build().
static BLOCK_REF_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\(\(([^)]+)\)\)").expect("valid regex"));

/// Result of a graph build: nodes and edges ready for persistence.
pub struct BuildResult {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// Builds the structural knowledge graph from database entities.
/// No AI calls — purely deterministic edges from pages, folders, blocks, chats, and tags.
/// Run on first load or manual refresh to give the graph an immediate skeleton
/// before AI entity extraction fills in semantic links.
pub struct GraphBuilder;

impl GraphBuilder {
    /// Scan all structured data and return graph nodes + edges.
    pub fn build(db: &Database) -> Result<BuildResult, storage::error::StorageError> {
        // Pre-allocate based on estimated sizes to avoid repeated reallocations.
        let page_count_hint = db.page_count_hint().unwrap_or(64);
        let mut nodes: Vec<GraphNode> = Vec::with_capacity(page_count_hint * 3);
        let mut edges: Vec<GraphEdge> = Vec::with_capacity(page_count_hint * 4);

        // Track sourceId keys already emitted to prevent duplicates.
        let mut existing_source_ids: FxHashSet<String> = FxHashSet::default();
        // Quick lookup: source key → GraphNodeId for edge wiring.
        // Stores Copy-able GraphNodeId directly — no string roundtrip.
        let mut source_to_node: FxHashMap<String, GraphNodeId> = FxHashMap::default();

        // ────────────────────────────────────────────
        // 1. Notes (non-archived pages)
        // ────────────────────────────────────────────
        let pages = db.list_pages()?;
        let active_pages: Vec<&Page> = pages.iter().filter(|p| !p.is_archived).collect();

        for page in &active_pages {
            let page_key = format!("note-{}", page.id);
            if !existing_source_ids.insert(page_key) {
                continue;
            }

            let label = if page.title.is_empty() {
                "Untitled".to_string()
            } else {
                page.title.clone()
            };
            let weight = (page.word_count / 100).max(1) as f64;

            let node_id = GraphNodeId::new();
            let node = GraphNode {
                id: node_id,
                node_type: GraphNodeType::Note,
                label,
                source_id: page.id.to_string(),
                weight,
                metadata_json: None,
                is_manual: false,
                created_at: page.created_at,
            };
            source_to_node.insert(page.id.to_string(), node_id);
            nodes.push(node);

            // Tags
            for tag in &page.tags {
                let tag_key = format!("tag-{}", tag.to_lowercase());
                if existing_source_ids.insert(tag_key.clone()) {
                    let tag_nid = GraphNodeId::new();
                    let tag_node = GraphNode {
                        id: tag_nid,
                        node_type: GraphNodeType::Tag,
                        label: tag.clone(),
                        source_id: tag_key.clone(),
                        weight: 1.0,
                        metadata_json: None,
                        is_manual: false,
                        created_at: page.created_at,
                    };
                    source_to_node.insert(tag_key.clone(), tag_nid);
                    nodes.push(tag_node);
                }
                if let Some(&tag_nid) = source_to_node.get(&tag_key) {
                    edges.push(GraphEdge {
                        id: GraphEdgeId::new(),
                        source_node_id: node_id,
                        target_node_id: tag_nid,
                        edge_type: GraphEdgeType::Tagged,
                        weight: 1.0,
                        metadata_json: None,
                        is_manual: false,
                        created_at: page.created_at,
                    });
                }
            }
        }

        // ────────────────────────────────────────────
        // 1b. Blocks (substantial content > 20 chars)
        // ────────────────────────────────────────────
        for page in &active_pages {
            let note_nid = match source_to_node.get(&page.id.to_string()) {
                Some(&id) => id,
                None => continue,
            };

            let blocks = db.get_blocks_for_page(page.id)?;
            for block in &blocks {
                if block.content.len() <= 20 {
                    continue;
                }
                let block_key = format!("block-{}", block.id);
                if !existing_source_ids.insert(block_key) {
                    continue;
                }

                let label = if block.content.chars().count() > 60 {
                    let truncated: String = block.content.chars().take(60).collect();
                    format!("{truncated}…")
                } else {
                    block.content.clone()
                };

                let block_nid = GraphNodeId::new();
                let block_node = GraphNode {
                    id: block_nid,
                    node_type: GraphNodeType::Block,
                    label,
                    source_id: block.id.to_string(),
                    weight: 1.0,
                    metadata_json: None,
                    is_manual: false,
                    created_at: block.created_at,
                };
                source_to_node.insert(block.id.to_string(), block_nid);
                nodes.push(block_node);

                edges.push(GraphEdge {
                    id: GraphEdgeId::new(),
                    source_node_id: note_nid,
                    target_node_id: block_nid,
                    edge_type: GraphEdgeType::Contains,
                    weight: 1.0,
                    metadata_json: None,
                    is_manual: false,
                    created_at: block.created_at,
                });
            }
        }

        // ────────────────────────────────────────────
        // 1c. Block references — ((blockId)) in page bodies
        // ────────────────────────────────────────────
        for page in &active_pages {
            let note_nid = match source_to_node.get(&page.id.to_string()) {
                Some(&id) => id,
                None => continue,
            };

            let body = db.load_body(page.id).unwrap_or_default();
            if body.is_empty() {
                continue;
            }

            for cap in BLOCK_REF_RE.captures_iter(&body) {
                let ref_id = cap[1].trim();
                if ref_id.is_empty() {
                    continue;
                }

                if let Some(&target_nid) = source_to_node.get(ref_id) {
                    edges.push(GraphEdge {
                        id: GraphEdgeId::new(),
                        source_node_id: note_nid,
                        target_node_id: target_nid,
                        edge_type: GraphEdgeType::Reference,
                        weight: 1.0,
                        metadata_json: None,
                        is_manual: false,
                        created_at: page.created_at,
                    });
                }
            }
        }

        // ────────────────────────────────────────────
        // 2. Folders
        // ────────────────────────────────────────────
        let folders = db.list_folders()?;

        // Build parent→children map for recursive page count
        let mut folder_children: FxHashMap<String, Vec<String>> = FxHashMap::default();
        for folder in &folders {
            if let Some(ref parent_id) = folder.parent_folder_id {
                folder_children.entry(parent_id.to_string())
                    .or_default()
                    .push(folder.id.to_string());
            }
        }

        // Count pages per folder
        let mut folder_page_count: FxHashMap<String, i32> = FxHashMap::default();
        for page in &active_pages {
            if let Some(folder_id) = page.folder_id {
                *folder_page_count.entry(folder_id.to_string()).or_insert(0) += 1;
            }
        }

        // Recursive content count (iterative BFS to avoid stack overflow)
        let folder_ids: Vec<String> = folders.iter().map(|f| f.id.to_string()).collect();
        let mut content_counts: FxHashMap<String, i32> = FxHashMap::default();
        for fid in &folder_ids {
            if content_counts.contains_key(fid) {
                continue;
            }
            let mut stack = vec![fid.clone()];
            let mut order = Vec::new();
            let mut visited = FxHashSet::default();
            while let Some(id) = stack.pop() {
                if !visited.insert(id.clone()) {
                    continue;
                }
                order.push(id.clone());
                if let Some(children) = folder_children.get(&id) {
                    for child in children {
                        stack.push(child.clone());
                    }
                }
            }
            for id in order.into_iter().rev() {
                let direct = folder_page_count.get(&id).copied().unwrap_or(0);
                let child_sum: i32 = folder_children
                    .get(&id)
                    .map(|children| {
                        children.iter()
                            .map(|c| content_counts.get(c).copied().unwrap_or(0))
                            .sum()
                    })
                    .unwrap_or(0);
                content_counts.insert(id, direct + child_sum);
            }
        }

        for folder in &folders {
            let folder_key = format!("folder-{}", folder.id);
            if !existing_source_ids.insert(folder_key) {
                continue;
            }

            let content_count = content_counts.get(&folder.id.to_string()).copied().unwrap_or(1);
            let folder_nid = GraphNodeId::new();
            let node = GraphNode {
                id: folder_nid,
                node_type: GraphNodeType::Folder,
                label: folder.name.clone(),
                source_id: folder.id.to_string(),
                weight: content_count.max(1) as f64,
                metadata_json: None,
                is_manual: false,
                created_at: folder.created_at,
            };
            source_to_node.insert(folder.id.to_string(), folder_nid);
            nodes.push(node);
        }

        // ────────────────────────────────────────────
        // 3. Folder → Subfolder edges (contains)
        // ────────────────────────────────────────────
        for folder in &folders {
            if let Some(ref parent_id) = folder.parent_folder_id {
                if let (Some(&parent_nid), Some(&child_nid)) = (
                    source_to_node.get(&parent_id.to_string()),
                    source_to_node.get(&folder.id.to_string()),
                ) {
                    edges.push(GraphEdge {
                        id: GraphEdgeId::new(),
                        source_node_id: parent_nid,
                        target_node_id: child_nid,
                        edge_type: GraphEdgeType::Contains,
                        weight: 3.0,
                        metadata_json: None,
                        is_manual: false,
                        created_at: folder.created_at,
                    });
                }
            }
        }

        // ────────────────────────────────────────────
        // 4. Note → Folder edges (contains)
        // ────────────────────────────────────────────
        for page in &active_pages {
            if let Some(folder_id) = page.folder_id {
                if let (Some(&folder_nid), Some(&note_nid)) = (
                    source_to_node.get(&folder_id.to_string()),
                    source_to_node.get(&page.id.to_string()),
                ) {
                    edges.push(GraphEdge {
                        id: GraphEdgeId::new(),
                        source_node_id: folder_nid,
                        target_node_id: note_nid,
                        edge_type: GraphEdgeType::Contains,
                        weight: 3.0,
                        metadata_json: None,
                        is_manual: false,
                        created_at: page.created_at,
                    });
                }
            }
        }

        // ────────────────────────────────────────────
        // 5. Nested pages (reference to parent)
        // ────────────────────────────────────────────
        for page in &active_pages {
            if let Some(parent_id) = page.parent_page_id {
                if let (Some(&child_nid), Some(&parent_nid)) = (
                    source_to_node.get(&page.id.to_string()),
                    source_to_node.get(&parent_id.to_string()),
                ) {
                    edges.push(GraphEdge {
                        id: GraphEdgeId::new(),
                        source_node_id: child_nid,
                        target_node_id: parent_nid,
                        edge_type: GraphEdgeType::Reference,
                        weight: 1.0,
                        metadata_json: None,
                        is_manual: false,
                        created_at: page.created_at,
                    });
                }
            }
        }

        // ────────────────────────────────────────────
        // 6. Chats
        // ────────────────────────────────────────────
        let chats = db.list_chats()?;

        for chat in &chats {
            let chat_key = format!("chat-{}", chat.id);
            if !existing_source_ids.insert(chat_key) {
                continue;
            }

            let chat_nid = GraphNodeId::new();
            let node = GraphNode {
                id: chat_nid,
                node_type: GraphNodeType::Chat,
                label: chat.title.clone(),
                source_id: chat.id.to_string(),
                weight: 1.0,
                metadata_json: None,
                is_manual: false,
                created_at: chat.created_at,
            };
            source_to_node.insert(chat.id.to_string(), chat_nid);
            nodes.push(node);
        }

        Ok(BuildResult { nodes, edges })
    }

    /// Persist a build result: clear auto-generated nodes/edges, then batch insert.
    pub fn persist(db: &Database, result: &BuildResult) -> Result<(), storage::error::StorageError> {
        db.delete_auto_graph_edges()?;
        db.delete_auto_graph_nodes()?;
        db.insert_graph_nodes_batch(&result.nodes)?;
        db.insert_graph_edges_batch(&result.edges)?;
        Ok(())
    }
}
