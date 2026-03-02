//! Chat context features — @-mentions, conversation history, vault actions, title generation.
//!
//! [MAC] Ported from ChatCoordinator.swift (533 lines).
//!
//! This module provides pure logic functions. DB access is handled by the caller
//! (Tauri commands) which passes resolved data to these functions.

use regex::Regex;
use std::sync::LazyLock;

// ── @-Mention Parsing ────────────────────────────────────────────────

/// An @-mention reference found in a query, e.g. `@[My Note Title]`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mention {
    /// The note title extracted from the mention brackets.
    pub title: String,
    /// Byte range of the full `@[...]` syntax in the original query.
    pub range: std::ops::Range<usize>,
}

static MENTION_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"@\[([^\]]+)\]").expect("mention regex")
});

/// Parse @-mentions from a query string.
/// Returns the mentions found and a cleaned query with `@[Title]` replaced by just `Title`.
pub fn parse_mentions(query: &str) -> (Vec<Mention>, String) {
    let mut mentions = Vec::new();
    let mut cleaned = query.to_string();

    // Collect matches in reverse order so replacements don't shift indices
    let matches: Vec<_> = MENTION_RE.captures_iter(query).collect();
    for cap in matches.iter().rev() {
        let full_match = cap.get(0).expect("full match");
        let title = cap.get(1).expect("title group").as_str().to_string();
        cleaned.replace_range(full_match.start()..full_match.end(), &title);
        mentions.push(Mention {
            range: full_match.start()..full_match.end(),
            title,
        });
    }

    mentions.reverse(); // Restore original order
    (mentions, cleaned.trim().to_string())
}

// ── Conversation History ─────────────────────────────────────────────

/// A message for history formatting.
#[derive(Debug, Clone)]
pub struct HistoryMessage {
    pub role: String,
    pub content: String,
}

/// Build conversation history context from prior messages.
///
/// Takes the last `max_messages` messages, trims each to `max_content_len` chars.
/// Returns `None` if no prior messages exist.
pub fn build_conversation_history(
    messages: &[HistoryMessage],
    max_messages: usize,
    max_content_len: usize,
) -> Option<String> {
    if messages.is_empty() {
        return None;
    }

    let recent = if messages.len() > max_messages {
        &messages[messages.len() - max_messages..]
    } else {
        messages
    };

    let lines: Vec<String> = recent
        .iter()
        .map(|msg| {
            let role = if msg.role == "user" { "User" } else { "Assistant" };
            let content = if msg.content.chars().count() > max_content_len {
                let truncated: String = msg.content.chars().take(max_content_len).collect();
                format!("{truncated}…")
            } else {
                msg.content.clone()
            };
            format!("{role}: {content}")
        })
        .collect();

    Some(lines.join("\n\n"))
}

// ── Vault Briefing ───────────────────────────────────────────────────

/// Check if a query is a vault briefing request.
pub fn is_vault_briefing(query: &str) -> bool {
    query.trim() == "[VAULT_BRIEFING]"
}

/// The vault briefing query that replaces the user's placeholder.
pub const VAULT_BRIEFING_QUERY: &str =
    "Analyze my vault and provide a briefing: find cross-note connections, \
     recurring themes, contradictions, topic gaps, stale notes worth revisiting, \
     and notes that could be merged or split. Be specific — reference notes by title.";

// ── Vault Actions ────────────────────────────────────────────────────

/// Actions that can be embedded in LLM responses for vault mutations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultAction {
    /// Tag the active page with these tags. `[ACTION:TAG tag1, tag2]`
    Tag(Vec<String>),
    /// Move the active page to a folder. `[ACTION:MOVE folder_name]`
    Move(String),
    /// Create a new page. `[ACTION:CREATE title]`
    Create(String),
}

static TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[ACTION:TAG\s+(.+?)\]").expect("tag action regex")
});

static MOVE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[ACTION:MOVE\s+(.+?)\]").expect("move action regex")
});

static CREATE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[ACTION:CREATE\s+(.+?)\]").expect("create action regex")
});

/// Parse vault actions from an LLM response.
/// Returns the actions found and the cleaned response with action markers removed.
pub fn parse_vault_actions(response: &str) -> (Vec<VaultAction>, String) {
    let mut actions = Vec::new();
    let mut cleaned = response.to_string();

    // TAG action
    if let Some(cap) = TAG_RE.captures(response) {
        let raw = cap.get(1).expect("tag value").as_str();
        let tags: Vec<String> = raw
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty() && s.len() < 30)
            .collect();
        if !tags.is_empty() {
            actions.push(VaultAction::Tag(tags));
        }
        if let Some(full) = cap.get(0) {
            cleaned = cleaned.replace(full.as_str(), "");
        }
    }

    // MOVE action
    if let Some(cap) = MOVE_RE.captures(response) {
        let folder = cap.get(1).expect("folder name").as_str().trim().to_string();
        if !folder.is_empty() {
            actions.push(VaultAction::Move(folder));
        }
        if let Some(full) = cap.get(0) {
            cleaned = cleaned.replace(full.as_str(), "");
        }
    }

    // CREATE action
    if let Some(cap) = CREATE_RE.captures(response) {
        let title = cap.get(1).expect("page title").as_str().trim().to_string();
        if !title.is_empty() {
            actions.push(VaultAction::Create(title));
        }
        if let Some(full) = cap.get(0) {
            cleaned = cleaned.replace(full.as_str(), "");
        }
    }

    (actions, cleaned.trim().to_string())
}

// ── Chat Title Generation ────────────────────────────────────────────

/// Build the prompt for LLM-powered chat title generation.
pub fn title_generation_prompt(query: &str) -> (String, &'static str) {
    let prompt = format!(
        "Generate a very short title (2-6 words) for a chat conversation that starts with \
         this query. Return ONLY the title, no quotes, no punctuation at the end, no explanation. \
         Examples: \"Quantum entanglement basics\", \"Fix SwiftUI layout bug\", \
         \"Essay on stoicism\", \"React vs Vue comparison\", \"Morning routine ideas\"\n\n\
         Query: {query}"
    );
    let system = "You generate concise chat titles. Return only the title text, nothing else.";
    (prompt, system)
}

/// Clean up a generated chat title.
pub fn clean_title(raw: &str) -> Option<String> {
    let cleaned = raw
        .trim()
        .trim_matches(|c: char| c == '"' || c == '\'' || c == '\u{201C}' || c == '\u{201D}')
        .trim_end_matches(['.', '!'])
        .trim()
        .to_string();
    if cleaned.is_empty() { None } else { Some(cleaned) }
}

// ── Notes Context Builder ────────────────────────────────────────────

/// A resolved note reference for building context.
#[derive(Debug, Clone)]
pub struct ResolvedNote {
    pub page_id: String,
    pub title: String,
    pub body: String,
}

/// Build the notes context string from resolved note references.
/// `manifest` is an optional vault manifest (page titles/metadata summary).
/// `mentioned_notes` are notes explicitly referenced via @-mentions.
/// `previously_loaded` are notes from prior turns in the conversation.
pub fn build_notes_context(
    manifest: Option<&str>,
    mentioned_notes: &[ResolvedNote],
    previously_loaded: &[ResolvedNote],
) -> Option<String> {
    let mut parts = Vec::new();

    if let Some(m) = manifest {
        if !m.is_empty() {
            parts.push(m.to_string());
        }
    }

    for note in mentioned_notes {
        parts.push(format!("### Referenced Note: {}\n{}", note.title, note.body));
    }

    for note in previously_loaded {
        // Don't duplicate notes already in mentioned_notes
        let already_mentioned = mentioned_notes.iter().any(|m| m.page_id == note.page_id);
        if !already_mentioned {
            parts.push(format!("### Previously Referenced: {}\n{}", note.title, note.body));
        }
    }

    if parts.is_empty() { None } else { Some(parts.join("\n\n")) }
}

// ── Evidence Grade ───────────────────────────────────────────────────

/// Maps confidence score to letter grade (matches macOS gradeFromConfidence).
pub fn grade_from_confidence(confidence: f64) -> &'static str {
    match confidence {
        c if c >= 0.85 => "A",
        c if c >= 0.70 => "B",
        c if c >= 0.50 => "C",
        c if c >= 0.30 => "D",
        _ => "F",
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_single_mention() {
        let (mentions, cleaned) = parse_mentions("Tell me about @[Quantum Physics]");
        assert_eq!(mentions.len(), 1);
        assert_eq!(mentions[0].title, "Quantum Physics");
        assert_eq!(cleaned, "Tell me about Quantum Physics");
    }

    #[test]
    fn parse_multiple_mentions() {
        let (mentions, cleaned) = parse_mentions("Compare @[Note A] with @[Note B]");
        assert_eq!(mentions.len(), 2);
        assert_eq!(mentions[0].title, "Note A");
        assert_eq!(mentions[1].title, "Note B");
        assert_eq!(cleaned, "Compare Note A with Note B");
    }

    #[test]
    fn parse_no_mentions() {
        let (mentions, cleaned) = parse_mentions("Just a regular query");
        assert!(mentions.is_empty());
        assert_eq!(cleaned, "Just a regular query");
    }

    #[test]
    fn conversation_history_basic() {
        let msgs = vec![
            HistoryMessage { role: "user".into(), content: "What is AI?".into() },
            HistoryMessage { role: "assistant".into(), content: "AI is...".into() },
        ];
        let history = build_conversation_history(&msgs, 10, 2000);
        assert!(history.is_some());
        let h = history.unwrap();
        assert!(h.contains("User: What is AI?"));
        assert!(h.contains("Assistant: AI is..."));
    }

    #[test]
    fn conversation_history_truncates_long_content() {
        let msgs = vec![
            HistoryMessage { role: "user".into(), content: "x".repeat(3000) },
        ];
        let history = build_conversation_history(&msgs, 10, 100).unwrap();
        assert!(history.len() < 200);
        assert!(history.contains('…'));
    }

    #[test]
    fn conversation_history_empty_returns_none() {
        let history = build_conversation_history(&[], 10, 2000);
        assert!(history.is_none());
    }

    #[test]
    fn vault_briefing_detection() {
        assert!(is_vault_briefing("[VAULT_BRIEFING]"));
        assert!(is_vault_briefing("  [VAULT_BRIEFING]  "));
        assert!(!is_vault_briefing("Tell me about my vault"));
    }

    #[test]
    fn parse_tag_action() {
        let (actions, cleaned) = parse_vault_actions(
            "Here's my analysis. [ACTION:TAG philosophy, ethics, AI]"
        );
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0], VaultAction::Tag(vec![
            "philosophy".into(), "ethics".into(), "ai".into()
        ]));
        assert!(!cleaned.contains("[ACTION:"));
    }

    #[test]
    fn parse_move_action() {
        let (actions, cleaned) = parse_vault_actions(
            "Done! [ACTION:MOVE Research Notes]"
        );
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0], VaultAction::Move("Research Notes".into()));
        assert_eq!(cleaned, "Done!");
    }

    #[test]
    fn parse_create_action() {
        let (actions, cleaned) = parse_vault_actions(
            "Let me create that. [ACTION:CREATE My New Note]"
        );
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0], VaultAction::Create("My New Note".into()));
        assert!(!cleaned.contains("[ACTION:"));
    }

    #[test]
    fn parse_multiple_actions() {
        let text = "Analysis done. [ACTION:TAG ai, research] [ACTION:CREATE Follow-Up]";
        let (actions, _) = parse_vault_actions(text);
        assert_eq!(actions.len(), 2);
    }

    #[test]
    fn parse_no_actions() {
        let (actions, cleaned) = parse_vault_actions("Just a normal response.");
        assert!(actions.is_empty());
        assert_eq!(cleaned, "Just a normal response.");
    }

    #[test]
    fn title_generation_prompt_contains_query() {
        let (prompt, system) = title_generation_prompt("What is consciousness?");
        assert!(prompt.contains("What is consciousness?"));
        assert!(!system.is_empty());
    }

    #[test]
    fn clean_title_strips_quotes_and_punctuation() {
        assert_eq!(clean_title("\"My Title\""), Some("My Title".into()));
        assert_eq!(clean_title("My Title."), Some("My Title".into()));
        assert_eq!(clean_title("  "), None);
        assert_eq!(clean_title(""), None);
    }

    #[test]
    fn grade_from_confidence_ranges() {
        assert_eq!(grade_from_confidence(0.90), "A");
        assert_eq!(grade_from_confidence(0.85), "A");
        assert_eq!(grade_from_confidence(0.75), "B");
        assert_eq!(grade_from_confidence(0.60), "C");
        assert_eq!(grade_from_confidence(0.40), "D");
        assert_eq!(grade_from_confidence(0.10), "F");
    }

    #[test]
    fn build_notes_context_with_mentions() {
        let notes = vec![ResolvedNote {
            page_id: "p1".into(),
            title: "Test Note".into(),
            body: "Some content".into(),
        }];
        let ctx = build_notes_context(Some("Vault: 5 notes"), &notes, &[]);
        assert!(ctx.is_some());
        let c = ctx.unwrap();
        assert!(c.contains("Vault: 5 notes"));
        assert!(c.contains("### Referenced Note: Test Note"));
    }

    #[test]
    fn build_notes_context_empty() {
        let ctx = build_notes_context(None, &[], &[]);
        assert!(ctx.is_none());
    }

    // ── UTF-8 safety tests ──

    #[test]
    fn conversation_history_truncates_multibyte_safely() {
        // CJK characters are 3 bytes each. Truncation must not split mid-character.
        let content = "你好世界".repeat(600); // 2400 CJK chars = 7200 bytes
        let msgs = vec![HistoryMessage { role: "user".into(), content }];
        let history = build_conversation_history(&msgs, 10, 100).unwrap();
        // Should truncate at char boundary, not panic
        assert!(history.contains('…'));
        // Verify it's valid UTF-8 (implicit — if we got here it is)
        assert!(history.len() < 1000);
    }

    #[test]
    fn conversation_history_truncates_emoji_safely() {
        // Emoji are 4 bytes each
        let content = "🔥".repeat(500);
        let msgs = vec![HistoryMessage { role: "user".into(), content }];
        let history = build_conversation_history(&msgs, 10, 50).unwrap();
        assert!(history.contains('…'));
    }

    // ── Mention edge cases ──

    #[test]
    fn parse_mention_with_special_chars() {
        let (mentions, cleaned) = parse_mentions("About @[Note: A & B (2024)]");
        assert_eq!(mentions.len(), 1);
        assert_eq!(mentions[0].title, "Note: A & B (2024)");
        assert_eq!(cleaned, "About Note: A & B (2024)");
    }

    #[test]
    fn parse_mention_empty_brackets_ignored() {
        // Empty brackets should not match the regex pattern (requires [^\]]+)
        let (mentions, _) = parse_mentions("@[]");
        assert!(mentions.is_empty());
    }

    // ── Vault action edge cases ──

    #[test]
    fn tag_action_rejects_very_long_tags() {
        let long_tag = "a".repeat(50);
        let text = format!("[ACTION:TAG {long_tag}]");
        let (actions, _) = parse_vault_actions(&text);
        // Tags > 30 chars are filtered out
        assert!(actions.is_empty() || matches!(&actions[0], VaultAction::Tag(t) if t.is_empty()));
    }

    #[test]
    fn clean_title_handles_smart_quotes() {
        assert_eq!(clean_title("\u{201C}My Title\u{201D}"), Some("My Title".into()));
    }

    // ── Notes context deduplication ──

    #[test]
    fn build_notes_context_deduplicates_mentioned_and_loaded() {
        let note = ResolvedNote {
            page_id: "p1".into(),
            title: "Same Note".into(),
            body: "Same body".into(),
        };
        let ctx = build_notes_context(None, std::slice::from_ref(&note), std::slice::from_ref(&note)).unwrap();
        // "Same Note" should appear only once (as mentioned, not as previously loaded)
        let count = ctx.matches("Same Note").count();
        assert_eq!(count, 1, "duplicate note should be deduplicated");
    }

    // ── Grade boundary tests ──

    #[test]
    fn grade_boundary_values() {
        assert_eq!(grade_from_confidence(0.8499), "B"); // just below A threshold
        assert_eq!(grade_from_confidence(0.6999), "C"); // just below B threshold
        assert_eq!(grade_from_confidence(0.4999), "D"); // just below C threshold
        assert_eq!(grade_from_confidence(0.2999), "F"); // just below D threshold
        assert_eq!(grade_from_confidence(0.0), "F");
        assert_eq!(grade_from_confidence(1.0), "A");
    }
}
