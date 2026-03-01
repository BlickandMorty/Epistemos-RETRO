use serde::{Deserialize, Serialize};
use crate::ids::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page {
    pub id: PageId,
    pub title: String,
    pub summary: String,
    pub research_stage: i32,
    pub tags: Vec<String>,
    pub file_path: Option<String>,
    pub subfolder: Option<String>,
    pub parent_page_id: Option<PageId>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub id: BlockId,
    pub page_id: PageId,
    pub parent_block_id: Option<BlockId>,
    pub order: i32,
    pub depth: i32,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chat {
    pub id: ChatId,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: MessageId,
    pub chat_id: ChatId,
    pub role: String,
    pub content: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub page_id: PageId,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceConfig {
    pub api_provider: String,
    pub model: String,
    pub ollama_base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GraphNodeType { Note, Chat, Idea, Source, Folder, Quote, Tag, Block }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GraphEdgeType {
    Reference, Contains, Tagged, Mentions, Cites, Authored,
    Related, Quotes, Supports, Contradicts, Expands, Questions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NodeSource {
    Page(PageId),
    Chat(ChatId),
    Folder(FolderId),
    Block(BlockId),
    Idea { origin_page: PageId, index: usize },
    Tag(String),
    Quote { origin_page: PageId },
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: GraphNodeId,
    pub node_type: GraphNodeType,
    pub label: String,
    pub source: NodeSource,
    pub weight: f64,
    pub is_manual: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: GraphEdgeId,
    pub source_node_id: GraphNodeId,
    pub target_node_id: GraphNodeId,
    pub edge_type: GraphEdgeType,
    pub weight: f64,
    pub is_manual: bool,
}

// Mock constructors for stub phase
impl Page {
    pub fn mock(id: PageId) -> Self {
        let now = now_ms();
        Self { id, title: "Untitled".into(), summary: String::new(), research_stage: 0,
               tags: vec![], file_path: None, subfolder: None, parent_page_id: None,
               created_at: now, updated_at: now }
    }
}

impl Chat {
    pub fn mock(id: ChatId) -> Self {
        let now = now_ms();
        Self { id, title: "New Chat".into(), created_at: now, updated_at: now }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
