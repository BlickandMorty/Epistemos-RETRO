//! BlockReconciler — keeps Block entities in sync with markdown text.
//!
//! [MAC] — Port of Epistemos/Sync/BlockReconciler.swift
//!
//! Algorithm:
//!   1. Parse the current markdown into [ParsedBlock] via block_parser::parse().
//!   2. Fetch existing blocks for this page from the database, sorted by order.
//!   3. Bipartite match: pair parsed blocks to existing blocks by Jaccard similarity.
//!      - Unchanged: content matches exactly — keep UUID (stable block references).
//!      - Modified: Jaccard > 0.4 — update content/depth/order, keep UUID.
//!      - Inserted: no match — create new block with fresh UUID.
//!      - Deleted: existing block has no match — delete from DB.
//!
//! Performance: O(n × m) worst case, practically O(n) for typical sequential edits.
//! For a 200-block note, reconciliation takes under 1ms.

use std::collections::HashSet;

use storage::db::Database;
use storage::ids::PageId;
use storage::types::Block;

use crate::block_parser;
use crate::error::SyncError;

/// Result of a reconciliation pass.
#[derive(Debug, Clone, PartialEq)]
pub struct ReconcileResult {
    pub created: usize,
    pub updated: usize,
    pub deleted: usize,
    pub unchanged: usize,
}

/// Minimum Jaccard similarity threshold for matching blocks.
const JACCARD_THRESHOLD: f64 = 0.4;

/// Reconcile markdown text with existing Block entities in the database.
///
/// Call after saving the page body. This keeps the block table in sync
/// with the editor's markdown without destroying stable block IDs.
pub fn reconcile(
    db: &Database,
    page_id: PageId,
    markdown: &str,
) -> Result<ReconcileResult, SyncError> {
    let parsed = block_parser::parse(markdown);
    let existing = db.get_blocks_for_page(page_id)?;
    let parent_indices = block_parser::compute_parent_indices(&parsed);

    // Two-pass bipartite matching: collect all candidate pairs above threshold,
    // sort by score descending, then greedily assign best matches first.
    let mut candidates: Vec<(usize, usize, f64)> = Vec::with_capacity(parsed.len().min(existing.len()));

    for (pi, parsed_block) in parsed.iter().enumerate() {
        for (ei, existing_block) in existing.iter().enumerate() {
            let score = jaccard_similarity(&parsed_block.content, &existing_block.content);
            if score > JACCARD_THRESHOLD {
                candidates.push((pi, ei, score));
            }
        }
    }

    // Sort by score descending — best matches assigned first
    candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    let mut used_parsed = HashSet::with_capacity(parsed.len());
    let mut used_existing = HashSet::with_capacity(existing.len());
    let mut matches: Vec<Option<usize>> = vec![None; parsed.len()];

    for (pi, ei, _score) in &candidates {
        if used_parsed.contains(pi) || used_existing.contains(ei) {
            continue;
        }
        used_parsed.insert(*pi);
        used_existing.insert(*ei);
        matches[*pi] = Some(*ei);
    }

    // Apply changes
    let mut created = 0;
    let mut updated = 0;
    let mut unchanged = 0;
    let mut index_to_block_id: Vec<Option<String>> = vec![None; parsed.len()];

    for (parsed_idx, existing_idx) in matches.iter().enumerate() {
        let parsed_block = &parsed[parsed_idx];
        let block_order = parsed_block.order * 1000;

        if let Some(ei) = existing_idx {
            let existing_block = &existing[*ei];
            let block_id_str = existing_block.id.to_string();
            index_to_block_id[parsed_idx] = Some(block_id_str.clone());

            if existing_block.content == parsed_block.content
                && existing_block.depth == parsed_block.depth
                && existing_block.order == block_order
            {
                unchanged += 1;
            } else {
                db.update_block_fields(
                    &block_id_str,
                    &parsed_block.content,
                    parsed_block.depth,
                    block_order,
                )?;
                updated += 1;
            }
        } else {
            let block = Block::new(page_id, parsed_block.content.clone(), block_order, parsed_block.depth);
            let block_id_str = block.id.to_string();
            db.insert_block(&block)?;
            index_to_block_id[parsed_idx] = Some(block_id_str);
            created += 1;
        }
    }

    // Set parent IDs (second pass)
    for (parsed_idx, parent_parsed_idx) in parent_indices.iter().enumerate() {
        let parent_block_id = parent_parsed_idx.and_then(|pi| index_to_block_id[pi].as_deref());
        if let Some(block_id) = &index_to_block_id[parsed_idx] {
            db.set_block_parent(block_id, parent_block_id)?;
        }
    }

    // Delete unmatched existing blocks
    let mut deleted = 0;
    for (ei, existing_block) in existing.iter().enumerate() {
        if !used_existing.contains(&ei) {
            db.delete_block(&existing_block.id.to_string())?;
            deleted += 1;
        }
    }

    Ok(ReconcileResult {
        created,
        updated,
        deleted,
        unchanged,
    })
}

/// Initial population: create Block entities from markdown for a page that has none.
/// Called lazily on first page open.
pub fn initial_populate(
    db: &Database,
    page_id: PageId,
    markdown: &str,
) -> Result<ReconcileResult, SyncError> {
    let parsed = block_parser::parse(markdown);
    if parsed.is_empty() {
        return Ok(ReconcileResult {
            created: 0,
            updated: 0,
            deleted: 0,
            unchanged: 0,
        });
    }

    let parent_indices = block_parser::compute_parent_indices(&parsed);
    let mut index_to_block_id: Vec<String> = Vec::with_capacity(parsed.len());

    for p in &parsed {
        let block = Block::new(page_id, p.content.clone(), p.order * 1000, p.depth);
        let block_id_str = block.id.to_string();
        db.insert_block(&block)?;
        index_to_block_id.push(block_id_str);
    }

    // Set parent IDs
    for (i, parent_idx) in parent_indices.iter().enumerate() {
        if let Some(pi) = parent_idx {
            let parent_id = &index_to_block_id[*pi];
            db.set_block_parent(&index_to_block_id[i], Some(parent_id))?;
        }
    }

    Ok(ReconcileResult {
        created: parsed.len(),
        updated: 0,
        deleted: 0,
        unchanged: 0,
    })
}

/// Jaccard similarity between two strings (word-level).
fn jaccard_similarity(a: &str, b: &str) -> f64 {
    let a_words: HashSet<&str> = a.split_whitespace().collect();
    let b_words: HashSet<&str> = b.split_whitespace().collect();

    if a_words.is_empty() && b_words.is_empty() {
        return 1.0;
    }

    let intersection = a_words.intersection(&b_words).count();
    let union = a_words.union(&b_words).count();

    if union == 0 {
        return 0.0;
    }

    intersection as f64 / union as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jaccard_identical() {
        assert!((jaccard_similarity("hello world", "hello world") - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn jaccard_completely_different() {
        assert!((jaccard_similarity("hello world", "foo bar")).abs() < f64::EPSILON);
    }

    #[test]
    fn jaccard_partial_overlap() {
        let score = jaccard_similarity("hello world foo", "hello world bar");
        assert!((score - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn jaccard_empty_strings() {
        assert!((jaccard_similarity("", "") - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn reconcile_empty_markdown() {
        let db = Database::open_in_memory().expect("open db");
        let page_id = PageId::new();
        let result = reconcile(&db, page_id, "").expect("reconcile");
        assert_eq!(result.created, 0);
    }

    #[test]
    fn initial_populate_creates_blocks() {
        let db = Database::open_in_memory().expect("open db");
        let page_id = PageId::new();

        let md = "- first item\n- second item\n  - nested";
        let result = initial_populate(&db, page_id, md).expect("populate");
        assert_eq!(result.created, 3);

        let blocks = db.get_blocks_for_page(page_id).expect("get blocks");
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].content, "first item");
        assert_eq!(blocks[1].content, "second item");
        assert_eq!(blocks[2].content, "nested");
        assert_eq!(blocks[2].depth, 1);
    }

    #[test]
    fn reconcile_preserves_stable_ids() {
        let db = Database::open_in_memory().expect("open db");
        let page_id = PageId::new();

        // Initial populate
        let md = "- alpha\n- beta\n- gamma";
        initial_populate(&db, page_id, md).expect("populate");
        let original_blocks = db.get_blocks_for_page(page_id).expect("get");
        let original_ids: Vec<String> = original_blocks.iter().map(|b| b.id.to_string()).collect();

        // Reconcile with same content — IDs should be preserved
        let result = reconcile(&db, page_id, md).expect("reconcile");
        assert_eq!(result.unchanged, 3);
        assert_eq!(result.created, 0);
        assert_eq!(result.deleted, 0);

        let after_blocks = db.get_blocks_for_page(page_id).expect("get");
        let after_ids: Vec<String> = after_blocks.iter().map(|b| b.id.to_string()).collect();
        assert_eq!(original_ids, after_ids);
    }

    #[test]
    fn reconcile_detects_modifications() {
        let db = Database::open_in_memory().expect("open db");
        let page_id = PageId::new();

        initial_populate(&db, page_id, "- hello world foo bar").expect("populate");

        // Modify slightly — should match by Jaccard > 0.4
        let result = reconcile(&db, page_id, "- hello world foo baz").expect("reconcile");
        assert_eq!(result.updated, 1);
        assert_eq!(result.created, 0);
        assert_eq!(result.deleted, 0);
    }

    #[test]
    fn reconcile_handles_deletions() {
        let db = Database::open_in_memory().expect("open db");
        let page_id = PageId::new();

        initial_populate(&db, page_id, "- one\n- two\n- three").expect("populate");

        let result = reconcile(&db, page_id, "- one\n- three").expect("reconcile");
        // "one" stays at order 0 → unchanged
        // "three" moves from order 2→1 (position shifted) → updated
        // "two" has no match → deleted
        assert_eq!(result.unchanged, 1);
        assert_eq!(result.updated, 1);
        assert_eq!(result.deleted, 1);

        let blocks = db.get_blocks_for_page(page_id).expect("get");
        assert_eq!(blocks.len(), 2);
    }

    #[test]
    fn reconcile_handles_insertions() {
        let db = Database::open_in_memory().expect("open db");
        let page_id = PageId::new();

        initial_populate(&db, page_id, "- one\n- two").expect("populate");

        let result = reconcile(&db, page_id, "- one\n- two\n- three").expect("reconcile");
        assert_eq!(result.unchanged, 2);
        assert_eq!(result.created, 1);

        let blocks = db.get_blocks_for_page(page_id).expect("get");
        assert_eq!(blocks.len(), 3);
    }
}
