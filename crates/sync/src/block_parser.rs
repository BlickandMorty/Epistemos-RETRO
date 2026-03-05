//! BlockParser — bidirectional conversion between markdown text and block tree.
//!
//! [MAC] — Port of Epistemos/Sync/BlockParser.swift
//!
//! Parsing rules:
//!   - Lines starting with `- `, `* `, or ordered list markers (`1. `) are list-item blocks.
//!     Their leading whitespace determines depth (each tab or 2 spaces = +1 depth).
//!   - Non-list paragraphs (separated by blank lines) are blocks at depth 0.
//!   - Headings (`# `, `## `, etc.) are blocks at depth 0.
//!   - Fenced code blocks (``` ... ```) are treated as a single block.
//!   - Blockquotes (`> `) preserve their markers in content.
//!   - Blank lines are not blocks — they serve as paragraph separators.
//!
//! Performance: O(n) single-pass parsing where n = character count.

use std::ops::Range;
use storage::types::BlockType;

/// A parsed block from markdown text.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedBlock {
    /// Text content of the block (without leading indent/list markers).
    pub content: String,
    /// Raw line text including markers (for serialization roundtrip).
    pub raw_content: String,
    /// Indentation depth (0 = top-level).
    pub depth: i32,
    /// Sequential position among all blocks in the document.
    pub order: i32,
    /// Byte range in the original markdown for O(1) mapping back to source.
    pub byte_range: Range<usize>,
    /// Semantic type inferred from markdown syntax.
    pub block_type: BlockType,
    /// Whether a todo block is checked (- [x]).
    pub is_checked: bool,
}

/// Parse markdown into a flat, ordered list of blocks.
///
/// O(n) single-pass. Handles fenced code blocks, list items, headings,
/// and paragraph continuation lines.
pub fn parse(markdown: &str) -> Vec<ParsedBlock> {
    if markdown.is_empty() {
        return Vec::new();
    }

    let lines: Vec<&str> = markdown.split('\n').collect();
    let mut blocks = Vec::new();
    let mut block_order: i32 = 0;
    let mut line_index = 0;
    let mut byte_offset = 0;

    while line_index < lines.len() {
        let line = lines[line_index];
        let line_byte_len = line.len();

        // Skip blank lines (paragraph separators)
        if line.chars().all(|c| c.is_whitespace()) {
            byte_offset += line_byte_len + 1; // +1 for \n
            line_index += 1;
            continue;
        }

        // Fenced code block: consume until closing fence
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            let fence_start = byte_offset;
            let mut fence_content = line.to_string();
            line_index += 1;
            byte_offset += line_byte_len + 1;

            while line_index < lines.len() {
                let fence_line = lines[line_index];
                let fence_line_len = fence_line.len();
                fence_content.push('\n');
                fence_content.push_str(fence_line);
                line_index += 1;
                byte_offset += fence_line_len + 1;

                if fence_line.trim().starts_with("```") {
                    break;
                }
            }

            let end = byte_offset.saturating_sub(1).min(markdown.len());
            blocks.push(ParsedBlock {
                content: fence_content.clone(),
                raw_content: fence_content,
                depth: 0,
                order: block_order,
                byte_range: fence_start..end,
                block_type: BlockType::Code,
                is_checked: false,
            });
            block_order += 1;
            continue;
        }

        // Determine indent depth and content
        let (depth, stripped) = measure_indent(line);

        // Check for list item markers
        let (is_list_item, content_after_marker) = strip_list_marker(stripped);

        let content = if is_list_item {
            content_after_marker
        } else {
            stripped.to_string()
        };

        // For non-list, non-heading lines: accumulate continuation lines
        let is_heading = stripped.starts_with('#');
        let mut full_content = content;
        let mut full_raw = line.to_string();
        let start_byte = byte_offset;
        byte_offset += line_byte_len + 1;
        line_index += 1;

        if !is_list_item && !is_heading {
            // Paragraph: accumulate continuation lines
            while line_index < lines.len() {
                let next_line = lines[line_index];
                let next_trimmed = next_line.trim();

                // Stop on blank line, list item, heading, or fence
                if next_trimmed.is_empty() {
                    break;
                }
                if next_trimmed.starts_with("```") {
                    break;
                }
                if next_trimmed.starts_with('#') {
                    break;
                }

                let (_, next_stripped) = measure_indent(next_line);
                let (next_is_list, _) = strip_list_marker(next_stripped);
                if next_is_list {
                    break;
                }

                let next_byte_len = next_line.len();
                full_content.push('\n');
                full_content.push_str(next_line);
                full_raw.push('\n');
                full_raw.push_str(next_line);
                byte_offset += next_byte_len + 1;
                line_index += 1;
            }
        } else if is_list_item {
            // List item: accumulate indented continuation lines
            while line_index < lines.len() {
                let next_line = lines[line_index];
                let next_trimmed = next_line.trim();

                if next_trimmed.is_empty() {
                    break;
                }
                if next_trimmed.starts_with("```") {
                    break;
                }

                let (next_depth, next_stripped) = measure_indent(next_line);
                let (next_is_list, _) = strip_list_marker(next_stripped);

                // Only accumulate if deeper indent and not a new list item
                if next_depth <= depth || next_is_list {
                    break;
                }

                let next_byte_len = next_line.len();
                full_content.push('\n');
                full_content.push_str(next_line.trim_start());
                full_raw.push('\n');
                full_raw.push_str(next_line);
                byte_offset += next_byte_len + 1;
                line_index += 1;
            }
        }

        let end = byte_offset.saturating_sub(1).min(markdown.len());
        let (block_type, is_checked) = infer_block_type(stripped, is_list_item, is_heading, &full_content);
        blocks.push(ParsedBlock {
            content: full_content,
            raw_content: full_raw,
            depth,
            order: block_order,
            byte_range: start_byte..end,
            block_type,
            is_checked,
        });
        block_order += 1;
    }

    blocks
}

/// Serialize a list of parsed blocks back to markdown.
/// Inverse of parse() — uses raw_content for roundtrip fidelity.
pub fn serialize(blocks: &[ParsedBlock]) -> String {
    let mut result = String::new();
    for (i, block) in blocks.iter().enumerate() {
        if i > 0 {
            result.push('\n');
        }
        result.push_str(&block.raw_content);
    }
    result
}

/// Compute parent indices for each parsed block.
/// For block at depth D, parent is the closest preceding block at depth D-1.
pub fn compute_parent_indices(blocks: &[ParsedBlock]) -> Vec<Option<usize>> {
    let mut parents = vec![None; blocks.len()];
    // Stack of (depth, index) — tracks most recent block at each depth
    let mut depth_stack: Vec<(i32, usize)> = Vec::new();

    for (i, block) in blocks.iter().enumerate() {
        // Pop stack entries at depth >= current (they can't be parents)
        while depth_stack
            .last()
            .is_some_and(|(d, _)| *d >= block.depth)
        {
            depth_stack.pop();
        }

        // Parent is top of stack (closest preceding block at depth - 1)
        if block.depth > 0 {
            if let Some(&(_, parent_idx)) = depth_stack.last() {
                parents[i] = Some(parent_idx);
            }
        }

        depth_stack.push((block.depth, i));
    }

    parents
}

/// Infer block type from markdown syntax.
fn infer_block_type(stripped: &str, is_list_item: bool, is_heading: bool, content: &str) -> (BlockType, bool) {
    // Headings: # / ## / ###
    if is_heading {
        if stripped.starts_with("### ") {
            return (BlockType::Heading3, false);
        } else if stripped.starts_with("## ") {
            return (BlockType::Heading2, false);
        } else if stripped.starts_with("# ") {
            return (BlockType::Heading1, false);
        }
    }

    // Divider: ---, ***, ___
    let trimmed = stripped.trim();
    if trimmed == "---" || trimmed == "***" || trimmed == "___" {
        return (BlockType::Divider, false);
    }

    // Math block: $$ ... $$
    if trimmed.starts_with("$$") {
        return (BlockType::Math, false);
    }

    // Blockquote: > ...
    if trimmed.starts_with("> ") || trimmed == ">" {
        // Callout: > [!tip], > [!note], > [!warning], etc.
        if trimmed.len() > 2 && trimmed[2..].trim_start().starts_with("[!") {
            return (BlockType::Callout, false);
        }
        return (BlockType::Quote, false);
    }

    // Todo: - [ ] or - [x]
    if is_list_item {
        if content.starts_with("[ ] ") || content.starts_with("[ ]") {
            return (BlockType::Todo, false);
        }
        if content.starts_with("[x] ") || content.starts_with("[x]")
            || content.starts_with("[X] ") || content.starts_with("[X]")
        {
            return (BlockType::Todo, true);
        }

        // Ordered list: content_after_marker comes from strip_list_marker,
        // but we check `stripped` which still has the marker
        if stripped.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
            return (BlockType::NumberedList, false);
        }
        return (BlockType::BulletList, false);
    }

    (BlockType::Paragraph, false)
}

/// Measure indent depth: each tab = +1, each 2 spaces = +1.
/// Returns (depth, string with leading whitespace removed).
fn measure_indent(line: &str) -> (i32, &str) {
    let mut depth: i32 = 0;
    let mut space_count = 0;
    let mut consumed = 0;

    for ch in line.chars() {
        match ch {
            '\t' => {
                depth += 1;
                space_count = 0;
                consumed += 1;
            }
            ' ' => {
                space_count += 1;
                consumed += 1;
                if space_count == 2 {
                    depth += 1;
                    space_count = 0;
                }
            }
            _ => break,
        }
    }

    (depth, &line[consumed..])
}

/// Strip list item marker (`- `, `* `, `1. `, etc.) from the start of a string.
/// Returns (is_list_item, content_after_marker).
fn strip_list_marker(s: &str) -> (bool, String) {
    // Unordered: "- " or "* "
    if let Some(rest) = s.strip_prefix("- ") {
        return (true, rest.to_string());
    }
    if let Some(rest) = s.strip_prefix("* ") {
        return (true, rest.to_string());
    }

    // Ordered: "1. ", "2. ", "10. ", etc.
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i > 0 && i < bytes.len() && bytes[i] == b'.' {
        let after_dot = i + 1;
        if after_dot < bytes.len() && bytes[after_dot] == b' ' {
            return (true, s[after_dot + 1..].to_string());
        }
    }

    (false, s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_empty() {
        assert!(parse("").is_empty());
    }

    #[test]
    fn parse_single_paragraph() {
        let blocks = parse("Hello world");
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].content, "Hello world");
        assert_eq!(blocks[0].depth, 0);
    }

    #[test]
    fn parse_two_paragraphs() {
        let blocks = parse("First paragraph\n\nSecond paragraph");
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].content, "First paragraph");
        assert_eq!(blocks[1].content, "Second paragraph");
    }

    #[test]
    fn parse_unordered_list() {
        let md = "- item one\n- item two\n- item three";
        let blocks = parse(md);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].content, "item one");
        assert_eq!(blocks[1].content, "item two");
        assert_eq!(blocks[2].content, "item three");
        assert!(blocks.iter().all(|b| b.depth == 0));
    }

    #[test]
    fn parse_nested_list() {
        let md = "- top\n  - nested\n    - deep";
        let blocks = parse(md);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].depth, 0);
        assert_eq!(blocks[0].content, "top");
        assert_eq!(blocks[1].depth, 1);
        assert_eq!(blocks[1].content, "nested");
        assert_eq!(blocks[2].depth, 2);
        assert_eq!(blocks[2].content, "deep");
    }

    #[test]
    fn parse_ordered_list() {
        let md = "1. first\n2. second\n10. tenth";
        let blocks = parse(md);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].content, "first");
        assert_eq!(blocks[2].content, "tenth");
    }

    #[test]
    fn parse_heading() {
        let md = "# Title\n\nBody paragraph";
        let blocks = parse(md);
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].content, "# Title");
        assert_eq!(blocks[0].depth, 0);
    }

    #[test]
    fn parse_fenced_code_block() {
        let md = "Before\n\n```rust\nfn main() {}\n```\n\nAfter";
        let blocks = parse(md);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].content, "Before");
        assert!(blocks[1].content.contains("fn main()"));
        assert!(blocks[1].content.starts_with("```rust"));
        assert!(blocks[1].content.ends_with("```"));
        assert_eq!(blocks[2].content, "After");
    }

    #[test]
    fn parse_mixed_content() {
        let md = "# Heading\n\nA paragraph.\n\n- item 1\n- item 2\n\n```\ncode\n```";
        let blocks = parse(md);
        assert_eq!(blocks.len(), 5);
        assert_eq!(blocks[0].content, "# Heading");
        assert_eq!(blocks[1].content, "A paragraph.");
        assert_eq!(blocks[2].content, "item 1");
        assert_eq!(blocks[3].content, "item 2");
        assert!(blocks[4].content.contains("code"));
    }

    #[test]
    fn parse_tab_indent() {
        let md = "- top\n\t- nested";
        let blocks = parse(md);
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].depth, 0);
        assert_eq!(blocks[1].depth, 1);
    }

    #[test]
    fn serialize_roundtrip() {
        let md = "- top\n  - nested\n    - deep";
        let blocks = parse(md);
        let result = serialize(&blocks);
        assert_eq!(result, md);
    }

    #[test]
    fn parent_indices_flat() {
        let blocks = parse("- a\n- b\n- c");
        let parents = compute_parent_indices(&blocks);
        assert_eq!(parents, vec![None, None, None]);
    }

    #[test]
    fn parent_indices_nested() {
        let blocks = parse("- parent\n  - child\n    - grandchild\n  - sibling");
        let parents = compute_parent_indices(&blocks);
        assert_eq!(parents[0], None);        // parent
        assert_eq!(parents[1], Some(0));     // child → parent
        assert_eq!(parents[2], Some(1));     // grandchild → child
        assert_eq!(parents[3], Some(0));     // sibling → parent
    }

    #[test]
    fn blockquote_preserved() {
        let blocks = parse("> This is a quote");
        assert_eq!(blocks.len(), 1);
        assert!(blocks[0].content.starts_with("> "));
    }

    #[test]
    fn asterisk_list_marker() {
        let blocks = parse("* item");
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].content, "item");
    }

    #[test]
    fn paragraph_continuation_lines() {
        let md = "First line\ncontinuation\nmore text";
        let blocks = parse(md);
        assert_eq!(blocks.len(), 1);
        assert!(blocks[0].content.contains("continuation"));
    }

    #[test]
    fn orders_sequential() {
        let blocks = parse("- a\n- b\n- c");
        assert_eq!(blocks[0].order, 0);
        assert_eq!(blocks[1].order, 1);
        assert_eq!(blocks[2].order, 2);
    }
}
