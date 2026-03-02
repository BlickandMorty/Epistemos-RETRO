use serde::{Deserialize, Serialize};
use crate::ids::*;

// ---- Page ----

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Page {
    pub id: PageId,
    pub title: String,
    pub summary: String,
    pub emoji: Option<String>,
    pub research_stage: i32,
    pub tags: Vec<String>,
    pub word_count: i32,
    pub is_pinned: bool,
    pub is_archived: bool,
    pub is_favorite: bool,
    pub is_journal: bool,
    pub is_locked: bool,
    pub sort_order: i32,
    pub journal_date: Option<String>,
    pub front_matter_data: Option<String>,
    pub ideas_data: Option<String>,
    pub needs_vault_sync: bool,
    pub last_synced_body_hash: Option<String>,
    pub last_synced_at: Option<i64>,
    pub file_path: Option<String>,
    pub subfolder: Option<String>,
    pub parent_page_id: Option<PageId>,
    pub folder_id: Option<FolderId>,
    pub template_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---- Block ----

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Block {
    pub id: BlockId,
    pub page_id: PageId,
    pub parent_block_id: Option<BlockId>,
    pub order: i32,
    pub depth: i32,
    pub content: String,
    pub is_collapsed: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---- Chat ----

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Chat {
    pub id: ChatId,
    pub title: String,
    pub chat_type: String,
    pub page_context_id: Option<PageId>,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---- Message ----

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Message {
    pub id: MessageId,
    pub chat_id: ChatId,
    pub role: String,
    pub content: String,
    pub dual_message_data: Option<String>,
    pub truth_assessment_data: Option<String>,
    /// Confidence score (0.0–1.0) from truth assessment. None for user messages.
    pub confidence_score: Option<f64>,
    /// Evidence grade letter: "A", "B", "C", "D", "F". None for user messages.
    pub evidence_grade: Option<String>,
    /// Inference mode used: "research", "moderate", etc. None for user messages.
    pub inference_mode: Option<String>,
    pub is_streaming: bool,
    pub created_at: i64,
}

// ---- Graph ----

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq, Hash)]
pub enum GraphNodeType {
    Note, Chat, Idea, Source, Folder, Quote, Tag, Block,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
pub enum GraphEdgeType {
    Reference, Contains, Tagged, Mentions, Cites, Authored,
    Related, Quotes, Supports, Contradicts, Expands, Questions,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct GraphNode {
    pub id: GraphNodeId,
    pub node_type: GraphNodeType,
    pub label: String,
    pub source_id: String,
    pub weight: f64,
    pub metadata_json: Option<String>,
    pub is_manual: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct GraphEdge {
    pub id: GraphEdgeId,
    pub source_node_id: GraphNodeId,
    pub target_node_id: GraphNodeId,
    pub edge_type: GraphEdgeType,
    pub weight: f64,
    pub metadata_json: Option<String>,
    pub is_manual: bool,
    pub created_at: i64,
}

// ---- Folder ----

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Folder {
    pub id: FolderId,
    pub name: String,
    pub emoji: Option<String>,
    pub sort_order: i32,
    pub is_collection: bool,
    pub parent_folder_id: Option<FolderId>,
    pub created_at: i64,
}

// ---- PageVersion ----

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PageVersion {
    pub id: String,
    pub page_id: PageId,
    pub hash: String,
    pub parent_hash: Option<String>,
    pub timestamp: i64,
    pub changes_summary: Option<String>,
}

// ---- Search ----

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SearchResult {
    pub page_id: PageId,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

// ---- Inference Config ----

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct InferenceConfig {
    pub api_provider: String,
    pub model: String,
    pub ollama_base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

// ---- GraphData (returned from get_graph) ----

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

// ---- Enum ↔ i32 conversions (matches macOS Rust engine numbering) ----

impl GraphNodeType {
    pub fn to_i32(self) -> i32 {
        match self {
            Self::Note => 0, Self::Chat => 1, Self::Idea => 2, Self::Source => 3,
            Self::Folder => 4, Self::Quote => 5, Self::Tag => 6, Self::Block => 7,
        }
    }
    pub fn from_i32(v: i32) -> Self {
        match v {
            0 => Self::Note, 1 => Self::Chat, 2 => Self::Idea, 3 => Self::Source,
            4 => Self::Folder, 5 => Self::Quote, 6 => Self::Tag, 7 => Self::Block,
            _ => Self::Note,
        }
    }
}

impl GraphEdgeType {
    pub fn to_i32(self) -> i32 {
        match self {
            Self::Reference => 0, Self::Contains => 1, Self::Tagged => 2,
            Self::Mentions => 3, Self::Cites => 4, Self::Authored => 5,
            Self::Related => 6, Self::Quotes => 7, Self::Supports => 8,
            Self::Contradicts => 9, Self::Expands => 10, Self::Questions => 11,
        }
    }
    pub fn from_i32(v: i32) -> Self {
        match v {
            0 => Self::Reference, 1 => Self::Contains, 2 => Self::Tagged,
            3 => Self::Mentions, 4 => Self::Cites, 5 => Self::Authored,
            6 => Self::Related, 7 => Self::Quotes, 8 => Self::Supports,
            9 => Self::Contradicts, 10 => Self::Expands, 11 => Self::Questions,
            _ => Self::Reference,
        }
    }
}

// ---- Constructors ----

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

impl Page {
    pub fn new(title: String) -> Self {
        let now = now_ms();
        Self {
            id: PageId::new(), title, summary: String::new(), emoji: None,
            research_stage: 0, tags: vec![], word_count: 0,
            is_pinned: false, is_archived: false, is_favorite: false,
            is_journal: false, is_locked: false, sort_order: 0,
            journal_date: None, front_matter_data: None, ideas_data: None,
            needs_vault_sync: false, last_synced_body_hash: None, last_synced_at: None,
            file_path: None, subfolder: None, parent_page_id: None,
            folder_id: None, template_id: None,
            created_at: now, updated_at: now,
        }
    }

    pub fn mock(id: PageId) -> Self {
        let now = now_ms();
        Self {
            id, title: "Untitled".into(), summary: String::new(), emoji: None,
            research_stage: 0, tags: vec![], word_count: 0,
            is_pinned: false, is_archived: false, is_favorite: false,
            is_journal: false, is_locked: false, sort_order: 0,
            journal_date: None, front_matter_data: None, ideas_data: None,
            needs_vault_sync: false, last_synced_body_hash: None, last_synced_at: None,
            file_path: None, subfolder: None, parent_page_id: None,
            folder_id: None, template_id: None,
            created_at: now, updated_at: now,
        }
    }
}

impl Block {
    pub fn new(page_id: PageId, content: String, order: i32, depth: i32) -> Self {
        let now = now_ms();
        Self {
            id: BlockId::new(), page_id, parent_block_id: None,
            order, depth, content, is_collapsed: false,
            created_at: now, updated_at: now,
        }
    }
}

impl Chat {
    pub fn new(title: String) -> Self {
        let now = now_ms();
        Self {
            id: ChatId::new(), title, chat_type: "general".into(),
            page_context_id: None, created_at: now, updated_at: now,
        }
    }

    pub fn mock(id: ChatId) -> Self {
        let now = now_ms();
        Self {
            id, title: "New Chat".into(), chat_type: "general".into(),
            page_context_id: None, created_at: now, updated_at: now,
        }
    }
}

impl Message {
    pub fn new(chat_id: ChatId, role: String, content: String) -> Self {
        Self {
            id: MessageId::new(), chat_id, role, content,
            dual_message_data: None, truth_assessment_data: None,
            confidence_score: None, evidence_grade: None, inference_mode: None,
            is_streaming: false, created_at: now_ms(),
        }
    }
}

impl Folder {
    pub fn new(name: String) -> Self {
        Self {
            id: FolderId::new(), name, emoji: None,
            sort_order: 0, is_collection: false,
            parent_folder_id: None, created_at: now_ms(),
        }
    }
}
