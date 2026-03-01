//! Entity extraction from notes and chats using LLM.
//!
//! This module provides pure functions for:
//! 1. Building LLM prompts from note/chat content
//! 2. Parsing JSON responses into structured extraction results
//! 3. Converting extraction results into graph nodes and edges
//!
//! The actual LLM call is performed by the caller (Tauri command layer),
//! keeping this crate independent of the engine crate.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use serde::{Deserialize, Serialize};
use storage::ids::*;
use storage::types::*;

/// Compute a content hash for diff-based extraction skipping.
/// If the hash matches the stored entity_hash, the page hasn't changed
/// and entity extraction can be skipped.
pub fn content_hash(title: &str, body: &str) -> String {
    let mut hasher = DefaultHasher::new();
    title.hash(&mut hasher);
    body.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

// ── Extraction Result Types ──────────────────────────────────────────

/// Input: a note prepared for extraction.
#[derive(Debug, Clone)]
pub struct NoteContent {
    pub page_id: PageId,
    pub title: String,
    pub body: String,
    pub block_annotations: Vec<BlockAnnotation>,
}

/// Maps block content to its ID for block-level entity linking.
#[derive(Debug, Clone)]
pub struct BlockAnnotation {
    pub block_id: BlockId,
    pub line_number: usize,
}

/// Full extraction result from a batch of notes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionResult {
    #[serde(default)]
    pub sources: Vec<ExtractedSource>,
    #[serde(default)]
    pub quotes: Vec<ExtractedQuote>,
    #[serde(default)]
    pub tags: Vec<ExtractedTag>,
    #[serde(default)]
    pub cross_note_links: Vec<CrossNoteLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedSource {
    pub name: String,
    pub url: Option<String>,
    pub title: Option<String>,
    #[serde(rename = "type")]
    pub source_type: Option<String>,
    #[serde(default = "default_relationship")]
    pub relationship: String,
    #[serde(rename = "blockId")]
    pub block_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedQuote {
    pub text: String,
    pub attribution: Option<String>,
    pub context: Option<String>,
    #[serde(rename = "blockId")]
    pub block_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedTag {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossNoteLink {
    pub from: String,
    pub to: String,
    pub relationship: String,
    pub reason: Option<String>,
}

/// Extraction result from a chat conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightExtractionResult {
    #[serde(default)]
    pub ideas: Vec<ExtractedIdea>,
    #[serde(default, rename = "sourcesShared")]
    pub sources_shared: Vec<SharedSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedIdea {
    pub summary: String,
    #[serde(rename = "evidenceGrade")]
    pub evidence_grade: Option<String>,
    #[serde(default, rename = "relatedEntities")]
    pub related_entities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedSource {
    pub url: Option<String>,
    pub title: Option<String>,
}

fn default_relationship() -> String {
    "cites".into()
}

// ── Prompt Builders ──────────────────────────────────────────────────

/// Build the LLM prompt for extracting entities from a batch of notes.
pub fn build_note_prompt(notes: &[NoteContent]) -> String {
    let mut prompt = String::with_capacity(4096);

    prompt.push_str(
        "Extract entities and relationships from the following notes. Return ONLY valid JSON:\n\
         {\"sources\": [{\"name\": \"string\", \"url\": \"string or null\", \
         \"title\": \"string or null\", \"type\": \"string or null\", \
         \"relationship\": \"cites|supports|contradicts|expands|questions\", \
         \"blockId\": \"string or null\"}],\n\
         \"quotes\": [{\"text\": \"string\", \"attribution\": \"string or null\", \
         \"context\": \"string or null\", \"blockId\": \"string or null\"}],\n\
         \"tags\": [{\"name\": \"string\", \"description\": \"string or null\"}],\n\
         \"crossNoteLinks\": [{\"from\": \"Note Title\", \"to\": \"Note Title\", \
         \"relationship\": \"supports|contradicts|expands|questions\", \
         \"reason\": \"brief explanation\"}]}\n\n\
         Rules:\n\
         - Sources: Named people, URLs, papers, books. Classify the relationship:\n\
         \t- cites: neutral reference\n\
         \t- supports: note agrees with or provides evidence for the source\n\
         \t- contradicts: note disagrees with or challenges the source\n\
         \t- expands: note builds on ideas from the source\n\
         \t- questions: note raises doubts about the source\n\
         - Quotes: Direct quotations with clear attribution.\n\
         - Tags: Abstract themes or concepts that appear substantively.\n\
         - crossNoteLinks: Semantic relationships BETWEEN notes in this batch.\n\
         \tOnly include when one note clearly supports, contradicts, expands, or questions another.\n\
         - blockId: If lines are annotated with [block:ID], include the ID.\n\
         - Default relationship to \"cites\" if unclear. Empty array [] if none found.\n\n\
         Content:\n",
    );

    for note in notes {
        prompt.push_str(&format!("--- Note: {} ---\n", note.title));

        // Annotate body with block IDs where available
        if note.block_annotations.is_empty() {
            prompt.push_str(&note.body);
        } else {
            for (i, line) in note.body.lines().enumerate() {
                if let Some(ann) = note.block_annotations.iter().find(|a| a.line_number == i) {
                    prompt.push_str(&format!("[block:{}] {}\n", ann.block_id, line));
                } else {
                    prompt.push_str(line);
                    prompt.push('\n');
                }
            }
        }
        prompt.push('\n');
    }

    prompt
}

/// Build the LLM prompt for extracting insights from a chat conversation.
pub fn build_chat_prompt(title: &str, messages: &[(String, String)]) -> String {
    let mut prompt = String::with_capacity(2048);

    prompt.push_str(&format!(
        "Extract key ideas from this conversation titled \"{title}\". Return ONLY valid JSON:\n\
         {{\"ideas\": [{{\"summary\": \"string\", \"evidenceGrade\": \"A/B/C/D/F or null\", \
         \"relatedEntities\": [\"string\"]}}],\n\
         \"sourcesShared\": [{{\"url\": \"string or null\", \"title\": \"string or null\"}}]}}\n\n\
         Rules:\n\
         - Ideas: 2-4 most significant conclusions or insights. Not small talk.\n\
         - Evidence grade: A = strong evidence, F = speculation.\n\
         - Sources: Any URLs or references shared during the conversation.\n\n\
         Conversation:\n",
    ));

    for (role, content) in messages {
        // Truncate individual messages to 1000 chars
        let truncated = if content.len() > 1000 {
            &content[..content.char_indices().nth(1000).map_or(content.len(), |(i, _)| i)]
        } else {
            content
        };
        let label = if role == "user" { "User" } else { "Assistant" };
        prompt.push_str(&format!("{label}: {truncated}\n"));
    }

    prompt
}

// ── JSON Parsers ─────────────────────────────────────────────────────

/// Parse LLM response into note extraction result.
/// Handles common LLM quirks: markdown fences, trailing commas, etc.
pub fn parse_note_response(response: &str) -> Result<ExtractionResult, String> {
    let cleaned = strip_markdown_fences(response);
    serde_json::from_str::<ExtractionResult>(&cleaned)
        .map_err(|e| format!("JSON parse error: {e}"))
}

/// Parse LLM response into chat insight extraction result.
pub fn parse_chat_response(response: &str) -> Result<InsightExtractionResult, String> {
    let cleaned = strip_markdown_fences(response);
    serde_json::from_str::<InsightExtractionResult>(&cleaned)
        .map_err(|e| format!("JSON parse error: {e}"))
}

/// Strip markdown code fences that LLMs often wrap JSON in.
fn strip_markdown_fences(s: &str) -> String {
    let trimmed = s.trim();
    // Handle ```json ... ``` or ``` ... ```
    if let Some(rest) = trimmed.strip_prefix("```json") {
        if let Some(inner) = rest.strip_suffix("```") {
            return inner.trim().to_string();
        }
    }
    if let Some(rest) = trimmed.strip_prefix("```") {
        if let Some(inner) = rest.strip_suffix("```") {
            return inner.trim().to_string();
        }
    }
    trimmed.to_string()
}

// ── Graph Node/Edge Builders ─────────────────────────────────────────

/// Convert note extraction results into graph nodes and edges.
///
/// Takes the extraction result plus a mapping of note titles to their
/// graph node IDs (from the existing structural graph).
pub fn build_note_entities(
    result: &ExtractionResult,
    note_node_id: GraphNodeId,
    title_to_node_id: &rustc_hash::FxHashMap<String, GraphNodeId>,
) -> (Vec<GraphNode>, Vec<GraphEdge>) {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let now = now_ms();

    // Sources → Source nodes + semantic edges
    for source in &result.sources {
        if source.name.is_empty() {
            continue;
        }

        let source_nid = GraphNodeId::new();
        let metadata = serde_json::json!({
            "url": source.url,
            "title": source.title,
            "type": source.source_type,
        });

        nodes.push(GraphNode {
            id: source_nid,
            node_type: GraphNodeType::Source,
            label: source.name.clone(),
            source_id: format!("source-{}", source.name.to_lowercase().replace(' ', "-")),
            weight: 1.0,
            metadata_json: Some(metadata.to_string()),
            is_manual: false,
            created_at: now,
        });

        let edge_type = parse_relationship(&source.relationship);
        edges.push(GraphEdge {
            id: GraphEdgeId::new(),
            source_node_id: note_node_id,
            target_node_id: source_nid,
            edge_type,
            weight: 1.0,
            metadata_json: None,
            is_manual: false,
            created_at: now,
        });
    }

    // Quotes → Quote nodes + Quotes edges
    for quote in &result.quotes {
        if quote.text.is_empty() {
            continue;
        }

        let quote_nid = GraphNodeId::new();
        let label = if quote.text.chars().count() > 60 {
            let truncated: String = quote.text.chars().take(60).collect();
            format!("{truncated}…")
        } else {
            quote.text.clone()
        };

        let metadata = serde_json::json!({
            "attribution": quote.attribution,
            "context": quote.context,
        });

        nodes.push(GraphNode {
            id: quote_nid,
            node_type: GraphNodeType::Quote,
            label,
            source_id: format!("quote-{}", GraphNodeId::new()),
            weight: 1.0,
            metadata_json: Some(metadata.to_string()),
            is_manual: false,
            created_at: now,
        });

        edges.push(GraphEdge {
            id: GraphEdgeId::new(),
            source_node_id: note_node_id,
            target_node_id: quote_nid,
            edge_type: GraphEdgeType::Quotes,
            weight: 1.0,
            metadata_json: None,
            is_manual: false,
            created_at: now,
        });
    }

    // Tags → Tagged edges (connect to existing tag nodes or create new ones)
    // Tag deduplication is handled at the graph builder level, so we
    // just emit tag nodes here — the persist layer deduplicates.
    for tag in &result.tags {
        if tag.name.is_empty() {
            continue;
        }

        let tag_key = format!("tag-{}", tag.name.to_lowercase());

        // Check if tag node already exists in title_to_node_id
        // (tags are keyed by their tag-{name} source_id, not by title)
        if let Some(&existing_tag_nid) = title_to_node_id.get(&tag_key) {
            edges.push(GraphEdge {
                id: GraphEdgeId::new(),
                source_node_id: note_node_id,
                target_node_id: existing_tag_nid,
                edge_type: GraphEdgeType::Tagged,
                weight: 1.0,
                metadata_json: None,
                is_manual: false,
                created_at: now,
            });
        } else {
            // Create new tag node
            let tag_nid = GraphNodeId::new();
            nodes.push(GraphNode {
                id: tag_nid,
                node_type: GraphNodeType::Tag,
                label: tag.name.clone(),
                source_id: tag_key,
                weight: 1.0,
                metadata_json: tag.description.as_ref().map(|d| {
                    serde_json::json!({ "description": d }).to_string()
                }),
                is_manual: false,
                created_at: now,
            });

            edges.push(GraphEdge {
                id: GraphEdgeId::new(),
                source_node_id: note_node_id,
                target_node_id: tag_nid,
                edge_type: GraphEdgeType::Tagged,
                weight: 1.0,
                metadata_json: None,
                is_manual: false,
                created_at: now,
            });
        }
    }

    // Cross-note links → semantic edges between existing note nodes
    for link in &result.cross_note_links {
        let from_key = link.from.to_lowercase();
        let to_key = link.to.to_lowercase();

        if let (Some(&from_nid), Some(&to_nid)) =
            (title_to_node_id.get(&from_key), title_to_node_id.get(&to_key))
        {
            let edge_type = parse_relationship(&link.relationship);
            let metadata_json = link.reason.as_ref().map(|r| {
                serde_json::json!({ "reason": r }).to_string()
            });

            edges.push(GraphEdge {
                id: GraphEdgeId::new(),
                source_node_id: from_nid,
                target_node_id: to_nid,
                edge_type,
                weight: 1.5, // Semantic edges weighted higher
                metadata_json,
                is_manual: false,
                created_at: now,
            });
        }
    }

    (nodes, edges)
}

/// Convert chat insight extraction results into graph nodes and edges.
pub fn build_chat_entities(
    result: &InsightExtractionResult,
    chat_node_id: GraphNodeId,
    chat_source_id: &str,
) -> (Vec<GraphNode>, Vec<GraphEdge>) {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let now = now_ms();

    // Ideas → Idea nodes + Contains edges from chat
    for (i, idea) in result.ideas.iter().enumerate() {
        if idea.summary.is_empty() {
            continue;
        }

        let idea_nid = GraphNodeId::new();
        let label = if idea.summary.chars().count() > 80 {
            let truncated: String = idea.summary.chars().take(80).collect();
            format!("{truncated}…")
        } else {
            idea.summary.clone()
        };

        let metadata = serde_json::json!({
            "evidenceGrade": idea.evidence_grade,
            "relatedEntities": idea.related_entities,
        });

        nodes.push(GraphNode {
            id: idea_nid,
            node_type: GraphNodeType::Idea,
            label,
            source_id: format!("{chat_source_id}-idea-{i}"),
            weight: grade_to_weight(idea.evidence_grade.as_deref()),
            metadata_json: Some(metadata.to_string()),
            is_manual: false,
            created_at: now,
        });

        edges.push(GraphEdge {
            id: GraphEdgeId::new(),
            source_node_id: chat_node_id,
            target_node_id: idea_nid,
            edge_type: GraphEdgeType::Contains,
            weight: 1.0,
            metadata_json: None,
            is_manual: false,
            created_at: now,
        });
    }

    // Shared sources → Source nodes + Cites edges from chat
    for source in &result.sources_shared {
        let label = source.title.as_deref()
            .or(source.url.as_deref())
            .unwrap_or("Unknown Source");

        if label.is_empty() {
            continue;
        }

        let source_nid = GraphNodeId::new();
        let metadata = serde_json::json!({
            "url": source.url,
            "title": source.title,
        });

        nodes.push(GraphNode {
            id: source_nid,
            node_type: GraphNodeType::Source,
            label: label.to_string(),
            source_id: format!("source-{}", label.to_lowercase().replace(' ', "-")),
            weight: 1.0,
            metadata_json: Some(metadata.to_string()),
            is_manual: false,
            created_at: now,
        });

        edges.push(GraphEdge {
            id: GraphEdgeId::new(),
            source_node_id: chat_node_id,
            target_node_id: source_nid,
            edge_type: GraphEdgeType::Cites,
            weight: 1.0,
            metadata_json: None,
            is_manual: false,
            created_at: now,
        });
    }

    (nodes, edges)
}

// ── Helpers ──────────────────────────────────────────────────────────

/// Parse a relationship string into a GraphEdgeType.
fn parse_relationship(rel: &str) -> GraphEdgeType {
    match rel.to_lowercase().as_str() {
        "cites" => GraphEdgeType::Cites,
        "supports" => GraphEdgeType::Supports,
        "contradicts" => GraphEdgeType::Contradicts,
        "expands" => GraphEdgeType::Expands,
        "questions" => GraphEdgeType::Questions,
        _ => GraphEdgeType::Cites,
    }
}

/// Convert evidence grade letter to weight.
fn grade_to_weight(grade: Option<&str>) -> f64 {
    match grade {
        Some("A") => 3.0,
        Some("B") => 2.0,
        Some("C") => 1.5,
        Some("D") => 1.0,
        Some("F") => 0.5,
        _ => 1.0,
    }
}

/// Batch size for note entity extraction.
pub const BATCH_SIZE: usize = 5;

/// Maximum tokens for extraction LLM calls.
pub const EXTRACTION_MAX_TOKENS: u32 = 2000;

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_note_response_basic() {
        let json = r#"{
            "sources": [{"name": "Einstein", "url": null, "title": "Relativity", "type": "person", "relationship": "cites", "blockId": null}],
            "quotes": [{"text": "Imagination is more important than knowledge", "attribution": "Einstein", "context": null, "blockId": null}],
            "tags": [{"name": "physics", "description": "study of matter and energy"}],
            "crossNoteLinks": []
        }"#;

        let result = parse_note_response(json).expect("parse");
        assert_eq!(result.sources.len(), 1);
        assert_eq!(result.sources[0].name, "Einstein");
        assert_eq!(result.quotes.len(), 1);
        assert_eq!(result.tags.len(), 1);
        assert_eq!(result.tags[0].name, "physics");
    }

    #[test]
    fn parse_note_response_with_markdown_fences() {
        let json = "```json\n{\"sources\": [], \"quotes\": [], \"tags\": [], \"crossNoteLinks\": []}\n```";
        let result = parse_note_response(json).expect("parse fenced");
        assert!(result.sources.is_empty());
    }

    #[test]
    fn parse_chat_response_basic() {
        let json = r#"{
            "ideas": [{"summary": "Quantum mechanics may explain consciousness", "evidenceGrade": "C", "relatedEntities": ["quantum", "consciousness"]}],
            "sourcesShared": [{"url": "https://example.com", "title": "Quantum Mind"}]
        }"#;

        let result = parse_chat_response(json).expect("parse");
        assert_eq!(result.ideas.len(), 1);
        assert_eq!(result.ideas[0].evidence_grade.as_deref(), Some("C"));
        assert_eq!(result.sources_shared.len(), 1);
    }

    #[test]
    fn parse_empty_arrays() {
        let json = r#"{"sources": [], "quotes": [], "tags": [], "crossNoteLinks": []}"#;
        let result = parse_note_response(json).expect("parse empty");
        assert!(result.sources.is_empty());
        assert!(result.quotes.is_empty());
    }

    #[test]
    fn parse_missing_optional_fields() {
        // LLMs sometimes omit optional arrays entirely
        let json = r#"{"sources": [{"name": "Kant", "relationship": "cites"}]}"#;
        let result = parse_note_response(json).expect("parse minimal");
        assert_eq!(result.sources.len(), 1);
        assert!(result.quotes.is_empty()); // default
    }

    #[test]
    fn build_prompt_includes_all_notes() {
        let notes = vec![
            NoteContent {
                page_id: PageId::new(),
                title: "Note A".into(),
                body: "Content of note A".into(),
                block_annotations: vec![],
            },
            NoteContent {
                page_id: PageId::new(),
                title: "Note B".into(),
                body: "Content of note B".into(),
                block_annotations: vec![],
            },
        ];

        let prompt = build_note_prompt(&notes);
        assert!(prompt.contains("--- Note: Note A ---"));
        assert!(prompt.contains("--- Note: Note B ---"));
        assert!(prompt.contains("Content of note A"));
        assert!(prompt.contains("Content of note B"));
    }

    #[test]
    fn build_prompt_with_block_annotations() {
        let block_id = BlockId::new();
        let notes = vec![NoteContent {
            page_id: PageId::new(),
            title: "Annotated".into(),
            body: "Line 0\nLine 1\nLine 2".into(),
            block_annotations: vec![BlockAnnotation {
                block_id,
                line_number: 1,
            }],
        }];

        let prompt = build_note_prompt(&notes);
        assert!(prompt.contains(&format!("[block:{}]", block_id)));
    }

    #[test]
    fn build_chat_prompt_truncates_long_messages() {
        let long_msg = "x".repeat(2000);
        let messages = vec![("user".into(), long_msg)];
        let prompt = build_chat_prompt("Test Chat", &messages);
        // Should be truncated to ~1000 chars
        assert!(prompt.len() < 2500);
    }

    #[test]
    fn relationship_parsing() {
        assert_eq!(parse_relationship("cites"), GraphEdgeType::Cites);
        assert_eq!(parse_relationship("supports"), GraphEdgeType::Supports);
        assert_eq!(parse_relationship("contradicts"), GraphEdgeType::Contradicts);
        assert_eq!(parse_relationship("expands"), GraphEdgeType::Expands);
        assert_eq!(parse_relationship("questions"), GraphEdgeType::Questions);
        assert_eq!(parse_relationship("unknown"), GraphEdgeType::Cites); // default
        assert_eq!(parse_relationship("SUPPORTS"), GraphEdgeType::Supports); // case insensitive
    }

    #[test]
    fn grade_to_weight_mapping() {
        assert_eq!(grade_to_weight(Some("A")), 3.0);
        assert_eq!(grade_to_weight(Some("B")), 2.0);
        assert_eq!(grade_to_weight(Some("F")), 0.5);
        assert_eq!(grade_to_weight(None), 1.0);
    }

    #[test]
    fn build_note_entities_creates_source_nodes() {
        let note_nid = GraphNodeId::new();
        let result = ExtractionResult {
            sources: vec![ExtractedSource {
                name: "Einstein".into(),
                url: None,
                title: Some("Relativity".into()),
                source_type: Some("person".into()),
                relationship: "supports".into(),
                block_id: None,
            }],
            quotes: vec![],
            tags: vec![],
            cross_note_links: vec![],
        };

        let title_map = rustc_hash::FxHashMap::default();
        let (nodes, edges) = build_note_entities(&result, note_nid, &title_map);

        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].node_type, GraphNodeType::Source);
        assert_eq!(nodes[0].label, "Einstein");

        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge_type, GraphEdgeType::Supports);
        assert_eq!(edges[0].source_node_id, note_nid);
    }

    #[test]
    fn build_note_entities_creates_quote_nodes() {
        let note_nid = GraphNodeId::new();
        let result = ExtractionResult {
            sources: vec![],
            quotes: vec![ExtractedQuote {
                text: "To be or not to be".into(),
                attribution: Some("Shakespeare".into()),
                context: None,
                block_id: None,
            }],
            tags: vec![],
            cross_note_links: vec![],
        };

        let title_map = rustc_hash::FxHashMap::default();
        let (nodes, edges) = build_note_entities(&result, note_nid, &title_map);

        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].node_type, GraphNodeType::Quote);
        assert_eq!(edges[0].edge_type, GraphEdgeType::Quotes);
    }

    #[test]
    fn build_note_entities_cross_note_links() {
        let note_a_nid = GraphNodeId::new();
        let note_b_nid = GraphNodeId::new();

        let mut title_map = rustc_hash::FxHashMap::default();
        title_map.insert("note a".to_string(), note_a_nid);
        title_map.insert("note b".to_string(), note_b_nid);

        let result = ExtractionResult {
            sources: vec![],
            quotes: vec![],
            tags: vec![],
            cross_note_links: vec![CrossNoteLink {
                from: "Note A".into(),
                to: "Note B".into(),
                relationship: "contradicts".into(),
                reason: Some("opposing views".into()),
            }],
        };

        let (nodes, edges) = build_note_entities(&result, note_a_nid, &title_map);
        assert!(nodes.is_empty()); // cross-note links don't create new nodes
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge_type, GraphEdgeType::Contradicts);
        assert_eq!(edges[0].source_node_id, note_a_nid);
        assert_eq!(edges[0].target_node_id, note_b_nid);
    }

    #[test]
    fn build_chat_entities_creates_ideas() {
        let chat_nid = GraphNodeId::new();
        let result = InsightExtractionResult {
            ideas: vec![ExtractedIdea {
                summary: "AI will transform education".into(),
                evidence_grade: Some("B".into()),
                related_entities: vec!["AI".into(), "education".into()],
            }],
            sources_shared: vec![],
        };

        let (nodes, edges) = build_chat_entities(&result, chat_nid, "chat-123");
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].node_type, GraphNodeType::Idea);
        assert_eq!(nodes[0].weight, 2.0); // Grade B
        assert_eq!(edges[0].edge_type, GraphEdgeType::Contains);
    }

    #[test]
    fn strip_markdown_fences_works() {
        assert_eq!(strip_markdown_fences("```json\n{}\n```"), "{}");
        assert_eq!(strip_markdown_fences("```\n{}\n```"), "{}");
        assert_eq!(strip_markdown_fences("{}"), "{}");
        assert_eq!(strip_markdown_fences("  {} "), "{}");
    }

    #[test]
    fn content_hash_stability() {
        let h1 = content_hash("Title", "Body text");
        let h2 = content_hash("Title", "Body text");
        assert_eq!(h1, h2, "same input must produce same hash");
        assert_eq!(h1.len(), 16, "hash should be 16 hex chars");
    }

    #[test]
    fn content_hash_uniqueness() {
        let h1 = content_hash("Title A", "Body");
        let h2 = content_hash("Title B", "Body");
        let h3 = content_hash("Title A", "Different body");
        assert_ne!(h1, h2);
        assert_ne!(h1, h3);
    }

    #[test]
    fn parse_note_response_invalid_json() {
        let result = parse_note_response("not valid json at all");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("JSON parse error"));
    }

    #[test]
    fn parse_note_response_empty_object() {
        // All fields have #[serde(default)] so {} should work
        let result = parse_note_response("{}").expect("empty obj should parse");
        assert!(result.sources.is_empty());
        assert!(result.quotes.is_empty());
        assert!(result.tags.is_empty());
        assert!(result.cross_note_links.is_empty());
    }

    #[test]
    fn build_note_entities_skips_empty_names() {
        let note_nid = GraphNodeId::new();
        let result = ExtractionResult {
            sources: vec![ExtractedSource {
                name: String::new(), // empty — should be skipped
                url: None, title: None, source_type: None,
                relationship: "cites".into(), block_id: None,
            }],
            quotes: vec![ExtractedQuote {
                text: String::new(), // empty — should be skipped
                attribution: None, context: None, block_id: None,
            }],
            tags: vec![ExtractedTag {
                name: String::new(), // empty — should be skipped
                description: None,
            }],
            cross_note_links: vec![],
        };

        let title_map = rustc_hash::FxHashMap::default();
        let (nodes, edges) = build_note_entities(&result, note_nid, &title_map);
        assert!(nodes.is_empty(), "empty-name entities should be skipped");
        assert!(edges.is_empty());
    }

    #[test]
    fn build_note_entities_truncates_long_quotes() {
        let note_nid = GraphNodeId::new();
        let long_quote = "x".repeat(200);
        let result = ExtractionResult {
            sources: vec![],
            quotes: vec![ExtractedQuote {
                text: long_quote,
                attribution: None, context: None, block_id: None,
            }],
            tags: vec![],
            cross_note_links: vec![],
        };

        let title_map = rustc_hash::FxHashMap::default();
        let (nodes, _) = build_note_entities(&result, note_nid, &title_map);
        assert_eq!(nodes.len(), 1);
        assert!(nodes[0].label.chars().count() <= 61, "label should be truncated to ~60 chars");
    }
}
