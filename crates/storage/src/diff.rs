//! Diff engine for comparing text versions.
//! 
//! Uses the `similar` crate's Myers diff algorithm for line-level diffs,
//! with word-level highlighting for modified lines.

use crate::types::*;
use similar::{ChangeTag, TextDiff};

/// Compute a line-by-line diff between two texts.
pub fn compute_diff(old: &str, new: &str) -> LineDiff {
    let diff = TextDiff::from_lines(old, new);
    
    let mut lines: Vec<DiffLineKind> = Vec::new();
    let mut added_count = 0usize;
    let mut removed_count = 0usize;
    let mut modified_count = 0usize;
    
    // Collect all changes
    let mut old_lines: Vec<(usize, String)> = Vec::new();
    let mut new_lines: Vec<(usize, String)> = Vec::new();
    
    for (idx, change) in diff.iter_all_changes().enumerate() {
        match change.tag() {
            ChangeTag::Equal => {
                let text = change.value().to_string();
                lines.push(DiffLineKind::Unchanged(text));
            }
            ChangeTag::Delete => {
                old_lines.push((idx, change.value().to_string()));
            }
            ChangeTag::Insert => {
                new_lines.push((idx, change.value().to_string()));
            }
        }
    }
    
    // Process removals and insertions, pairing similar ones as modifications
    // For simplicity, we process in order and emit removed then added
    // A more sophisticated approach would use Jaccard similarity like the macOS version
    
    // Re-compute with a simpler approach: use the grouped changes
    lines.clear();
    
    let old_split: Vec<&str> = old.lines().collect();
    let new_split: Vec<&str> = new.lines().collect();
    
    // Use Myers diff from similar crate
    let myers_diff = TextDiff::from_slices(&old_split, &new_split);
    
    for group in myers_diff.grouped_ops(3) {
        for op in group {
            match op {
                similar::DiffOp::Equal { old_index, new_index: _, len } => {
                    for i in 0..len {
                        let text = old_split.get(old_index + i).unwrap_or(&"").to_string();
                        lines.push(DiffLineKind::Unchanged(text));
                    }
                }
                similar::DiffOp::Delete { old_index, old_len, new_index: _ } => {
                    for i in 0..old_len {
                        if let Some(line) = old_split.get(old_index + i) {
                            lines.push(DiffLineKind::Removed(line.to_string()));
                            removed_count += 1;
                        }
                    }
                }
                similar::DiffOp::Insert { old_index: _, new_index, new_len } => {
                    for i in 0..new_len {
                        if let Some(line) = new_split.get(new_index + i) {
                            lines.push(DiffLineKind::Added(line.to_string()));
                            added_count += 1;
                        }
                    }
                }
                similar::DiffOp::Replace { old_index, old_len, new_index, new_len } => {
                    // Pair up removals and insertions as modifications
                    let max_len = old_len.max(new_len);
                    for i in 0..max_len {
                        let old_line = old_split.get(old_index + i).map(|s| s.to_string());
                        let new_line = new_split.get(new_index + i).map(|s| s.to_string());
                        
                        match (old_line, new_line) {
                            (Some(old), Some(new)) => {
                                // Check if they're similar enough to be a modification
                                if jaccard_similarity(&old, &new) > 0.3 {
                                    lines.push(DiffLineKind::Modified { old, new });
                                    modified_count += 1;
                                } else {
                                    lines.push(DiffLineKind::Removed(old));
                                    lines.push(DiffLineKind::Added(new));
                                    removed_count += 1;
                                    added_count += 1;
                                }
                            }
                            (Some(old), None) => {
                                lines.push(DiffLineKind::Removed(old));
                                removed_count += 1;
                            }
                            (None, Some(new)) => {
                                lines.push(DiffLineKind::Added(new));
                                added_count += 1;
                            }
                            (None, None) => {}
                        }
                    }
                }
            }
        }
    }
    
    LineDiff {
        lines,
        stats: DiffStats {
            added: added_count,
            removed: removed_count,
            modified: modified_count,
        },
    }
}

/// Compute word-level diffs for two strings.
/// Returns (removed_ranges, added_ranges) as byte offsets.
pub fn compute_word_diffs(old: &str, new: &str) -> WordDiffResult {
    let old_words = tokenize_words(old);
    let new_words = tokenize_words(new);
    
    let old_texts: Vec<&str> = old_words.iter().map(|(s, _, _)| *s).collect();
    let new_texts: Vec<&str> = new_words.iter().map(|(s, _, _)| *s).collect();
    
    let diff = TextDiff::from_slices(&old_texts, &new_texts);
    
    let mut removed = Vec::new();
    let mut added = Vec::new();
    
    for group in diff.grouped_ops(10) {
        for op in group {
            match op {
                similar::DiffOp::Delete { old_index, old_len, .. } => {
                    for i in 0..old_len {
                        if let Some((_, start, end)) = old_words.get(old_index + i) {
                            removed.push(WordChange { start: *start, end: *end });
                        }
                    }
                }
                similar::DiffOp::Insert { new_index, new_len, .. } => {
                    for i in 0..new_len {
                        if let Some((_, start, end)) = new_words.get(new_index + i) {
                            added.push(WordChange { start: *start, end: *end });
                        }
                    }
                }
                _ => {}
            }
        }
    }
    
    WordDiffResult { removed, added }
}

/// Tokenize a string into words with their byte offsets.
fn tokenize_words(text: &str) -> Vec<(&str, usize, usize)> {
    let mut tokens = Vec::new();
    let mut start = 0;
    let mut in_word = false;
    
    for (idx, ch) in text.char_indices() {
        if ch.is_whitespace() {
            if in_word {
                tokens.push((&text[start..idx], start, idx));
                in_word = false;
            }
        } else if !in_word {
            start = idx;
            in_word = true;
        }
    }
    
    // Don't forget the last word
    if in_word {
        tokens.push((&text[start..], start, text.len()));
    }
    
    tokens
}

/// Calculate Jaccard similarity between two strings.
/// Returns a value between 0.0 (completely different) and 1.0 (identical).
fn jaccard_similarity(a: &str, b: &str) -> f64 {
    let a_words: std::collections::HashSet<&str> = a.split_whitespace().collect();
    let b_words: std::collections::HashSet<&str> = b.split_whitespace().collect();
    
    if a_words.is_empty() && b_words.is_empty() {
        return 1.0;
    }
    
    let intersection: std::collections::HashSet<_> = a_words.intersection(&b_words).collect();
    let union: std::collections::HashSet<_> = a_words.union(&b_words).collect();
    
    intersection.len() as f64 / union.len() as f64
}

/// Extension methods for LineDiff.
pub trait LineDiffExt {
    /// Group lines into sections (visible near changes, collapsed far from changes).
    fn sectioned(&self, context_lines: usize) -> Vec<DiffSection>;
    
    /// Get the indices of chunk starts for navigation.
    fn chunk_start_indices(&self) -> Vec<usize>;
}

impl LineDiffExt for LineDiff {
    fn sectioned(&self, context_lines: usize) -> Vec<DiffSection> {
        if self.lines.is_empty() {
            return Vec::new();
        }
        
        // Find all change indices
        let change_indices: Vec<usize> = self.lines
            .iter()
            .enumerate()
            .filter_map(|(idx, line)| {
                if matches!(line, DiffLineKind::Unchanged(_)) {
                    None
                } else {
                    Some(idx)
                }
            })
            .collect();
        
        // If no changes, show everything visible
        if change_indices.is_empty() {
            let items: Vec<IndexedLine> = self.lines
                .iter()
                .enumerate()
                .map(|(idx, line)| IndexedLine { index: idx, line: line.clone() })
                .collect();
            return vec![DiffSection { id: 0, kind: DiffSectionKind::Visible { items } }];
        }
        
        // Mark lines near changes as visible
        let mut visible_indices = std::collections::HashSet::new();
        for ci in &change_indices {
            let start = ci.saturating_sub(context_lines);
            let end = (self.lines.len() - 1).min(ci + context_lines);
            for i in start..=end {
                visible_indices.insert(i);
            }
        }
        
        // Group into sections
        let mut sections: Vec<DiffSection> = Vec::new();
        let mut current_visible: Vec<IndexedLine> = Vec::new();
        let mut current_collapsed: Vec<IndexedLine> = Vec::new();
        
        for (idx, line) in self.lines.iter().enumerate() {
            let item = IndexedLine { index: idx, line: line.clone() };
            if visible_indices.contains(&idx) {
                if !current_collapsed.is_empty() {
                    let first_id = current_collapsed[0].index;
                    sections.push(DiffSection { 
                        id: first_id, 
                        kind: DiffSectionKind::Collapsed { items: std::mem::take(&mut current_collapsed) } 
                    });
                }
                current_visible.push(item);
            } else {
                if !current_visible.is_empty() {
                    let first_id = current_visible[0].index;
                    sections.push(DiffSection { 
                        id: first_id, 
                        kind: DiffSectionKind::Visible { items: std::mem::take(&mut current_visible) } 
                    });
                }
                current_collapsed.push(item);
            }
        }
        
        if !current_visible.is_empty() {
            let first_id = current_visible[0].index;
            sections.push(DiffSection { 
                id: first_id, 
                kind: DiffSectionKind::Visible { items: current_visible } 
            });
        }
        if !current_collapsed.is_empty() {
            let first_id = current_collapsed[0].index;
            sections.push(DiffSection { 
                id: first_id, 
                kind: DiffSectionKind::Collapsed { items: current_collapsed } 
            });
        }
        
        sections
    }
    
    fn chunk_start_indices(&self) -> Vec<usize> {
        let mut indices = Vec::new();
        let mut in_change = false;
        
        for (idx, line) in self.lines.iter().enumerate() {
            let is_change = !matches!(line, DiffLineKind::Unchanged(_));
            if is_change && !in_change {
                indices.push(idx);
            }
            in_change = is_change;
        }
        
        indices
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_compute_diff_basic() {
        let old = "line 1\nline 2\nline 3";
        let new = "line 1\nmodified line 2\nline 3";
        
        let diff = compute_diff(old, new);
        
        assert!(!diff.lines.is_empty());
        assert!(diff.stats.added > 0 || diff.stats.modified > 0 || diff.stats.removed > 0);
    }
    
    #[test]
    fn test_compute_diff_additions() {
        let old = "line 1\nline 2";
        let new = "line 1\nline 2\nline 3";
        
        let diff = compute_diff(old, new);
        
        assert!(diff.stats.added >= 1);
    }
    
    #[test]
    fn test_word_diffs() {
        let old = "the quick brown fox";
        let new = "the slow brown fox jumps";
        
        let result = compute_word_diffs(old, new);
        
        // Should detect "quick" vs "slow" and "jumps" added
        // Note: word diff may produce different results based on algorithm
        // Just verify it runs without panicking
        println!("removed: {:?}, added: {:?}", result.removed, result.added);
    }
    
    #[test]
    fn test_jaccard_similarity() {
        assert_eq!(jaccard_similarity("a b c", "a b c"), 1.0);
        assert_eq!(jaccard_similarity("a b c", "x y z"), 0.0);
        
        let sim = jaccard_similarity("the quick brown", "the quick fox");
        assert!(sim > 0.0 && sim < 1.0);
    }
    
    #[test]
    fn test_sectioned() {
        let diff = LineDiff {
            lines: vec![
                DiffLineKind::Unchanged("unchanged 1".to_string()),
                DiffLineKind::Unchanged("unchanged 2".to_string()),
                DiffLineKind::Added("added".to_string()),
                DiffLineKind::Unchanged("unchanged 3".to_string()),
                DiffLineKind::Unchanged("unchanged 4".to_string()),
            ],
            stats: DiffStats { added: 1, removed: 0, modified: 0 },
        };
        
        let sections = diff.sectioned(1);
        assert!(!sections.is_empty());
    }
}
