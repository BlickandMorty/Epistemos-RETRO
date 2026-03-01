//! Citation extractor — parses DOIs, academic URLs, and reference sections from LLM output.
//!
//! [MAC] Ported from CitationExtractor.swift (287 lines).
//!
//! Strategy (priority order):
//! 1. Structured reference sections (## Sources & References, ## References, etc.)
//! 2. Numbered/bulleted reference lists
//! 3. Inline DOIs (doi.org/... or DOI: ...)
//! 4. Inline URLs to known academic domains (arxiv, scholar, pubmed, etc.)

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::LazyLock;

// ── Types ────────────────────────────────────────────────────────────

/// An extracted citation/paper reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedCitation {
    pub title: String,
    pub authors: String,
    pub year: Option<String>,
    pub doi: Option<String>,
    pub url: Option<String>,
    pub source: String,
}

// ── Compiled Regexes ─────────────────────────────────────────────────

static HEADING_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?mi)^(?:#{1,3}\s+|\*\*)(?:Sources?\s*(?:&|and)\s*References?|References?|Bibliography|Works?\s*Cited)(?:\*\*)?[:\s]*$").expect("heading regex")
});

static NEXT_HEADING_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\n#{1,3}\s+").expect("next heading regex")
});

static DOI_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:https?://(?:dx\.)?doi\.org/|DOI:\s*|doi:\s*)(10\.\d{4,}/[^\s,;\]\)]+)").expect("doi regex")
});

static URL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"https?://[^\s\)\]>,"']+"#).expect("url regex")
});

static YEAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(19|20)\d{2}\b").expect("year regex")
});

static MARKDOWN_LINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[([^\]]+)\]\(([^\)]+)\)").expect("markdown link regex")
});

static QUOTED_TITLE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"[""\u{201C}]([^""\u{201D}]+)[""\u{201D}]"#).expect("quoted title regex")
});

static LIST_MARKER_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[\d]+[.)]\s*").expect("list marker regex")
});

const ACADEMIC_DOMAINS: &[&str] = &[
    "arxiv.org", "scholar.google", "pubmed.ncbi", "doi.org",
    "semanticscholar.org", "jstor.org", "springer.com", "nature.com",
    "sciencedirect.com", "wiley.com", "researchgate.net", "ssrn.com",
    "ncbi.nlm.nih.gov", "ieee.org", "acm.org", "plos.org",
];

// ── Public API ───────────────────────────────────────────────────────

/// Extract citations from text. `source` identifies origin: "chat", "research", "note-scan".
pub fn extract(text: &str, source: &str) -> Vec<ExtractedCitation> {
    let mut results = Vec::new();

    // 1. Parse structured reference section
    results.extend(parse_reference_section(text, source));

    // 2. Extract standalone DOIs not already captured
    let doi_papers = extract_dois(text, source);
    for paper in doi_papers {
        if !results.iter().any(|r| r.doi == paper.doi) {
            results.push(paper);
        }
    }

    // 3. Extract academic URLs not already captured
    let url_papers = extract_academic_urls(text, source);
    for paper in url_papers {
        if !results.iter().any(|r| r.url == paper.url) {
            results.push(paper);
        }
    }

    // Deduplicate by normalized title
    let mut seen = HashSet::new();
    results.retain(|p| {
        let key = p.title.trim().to_lowercase();
        if key.is_empty() || seen.contains(&key) {
            false
        } else {
            seen.insert(key);
            true
        }
    });

    results
}

// ── Reference Section Parser ─────────────────────────────────────────

fn parse_reference_section(text: &str, source: &str) -> Vec<ExtractedCitation> {
    let heading_match = match HEADING_RE.find(text) {
        Some(m) => m,
        None => return Vec::new(),
    };

    let after_heading = &text[heading_match.end()..];
    let section = match NEXT_HEADING_RE.find(after_heading) {
        Some(m) => &after_heading[..m.start()],
        None => after_heading,
    };

    section.lines()
        .map(|line| line.trim())
        .filter(|line| {
            !line.is_empty() && (line.starts_with('-') || line.starts_with('*')
                || line.starts_with('•') || line.chars().next().is_some_and(|c| c.is_ascii_digit()))
        })
        .map(|line| {
            let content = strip_list_marker(line);
            parse_reference_line(&content, source)
        })
        .collect()
}

fn strip_list_marker(line: &str) -> String {
    let trimmed = line.trim();
    if let Some(m) = LIST_MARKER_RE.find(trimmed) {
        trimmed[m.end()..].to_string()
    } else if trimmed.starts_with('-') || trimmed.starts_with('*') || trimmed.starts_with('•') {
        trimmed[1..].trim_start().to_string()
    } else {
        trimmed.to_string()
    }
}

fn parse_reference_line(line: &str, source: &str) -> ExtractedCitation {
    let mut title = String::new();
    let mut authors = String::new();
    let mut year = None;
    let mut doi = None;
    let mut url = None;

    // Extract URL
    if let Some(m) = URL_RE.find(line) {
        url = Some(m.as_str().trim_end_matches(['.', ',', ';']).to_string());
        if let Some(u) = &url {
            if let Some(dm) = DOI_RE.captures(u) {
                doi = dm.get(1).map(|m| m.as_str().to_string());
            }
        }
    }

    // Extract standalone DOI
    if doi.is_none() {
        if let Some(caps) = DOI_RE.captures(line) {
            doi = caps.get(1).map(|m| m.as_str().to_string());
        }
    }

    // Extract year
    if let Some(m) = YEAR_RE.find(line) {
        year = Some(m.as_str().to_string());
    }

    // Try markdown link: [Title](URL)
    if let Some(caps) = MARKDOWN_LINK_RE.captures(line) {
        if let Some(t) = caps.get(1) {
            title = t.as_str().to_string();
        }
        if url.is_none() {
            if let Some(u) = caps.get(2) {
                url = Some(u.as_str().to_string());
            }
        }
    }

    // Try quoted title
    if title.is_empty() {
        if let Some(caps) = QUOTED_TITLE_RE.captures(line) {
            if let Some(t) = caps.get(1) {
                title = t.as_str().to_string();
            }
        }
    }

    // Fallback: clean the line and use as title
    if title.is_empty() {
        let mut cleaned = line.to_string();
        if let Some(u) = &url {
            cleaned = cleaned.replace(u, "");
        }
        // Remove markdown link syntax
        cleaned = MARKDOWN_LINK_RE.replace_all(&cleaned, "$1").to_string();
        cleaned = cleaned.trim_matches(|c: char| c.is_whitespace() || ".,;-–—".contains(c)).to_string();
        if cleaned.is_empty() {
            title = line.to_string();
        } else {
            title = cleaned;
        }
    }

    // Extract authors: text before title
    if !title.is_empty() {
        if let Some(idx) = line.find(&title) {
            let before = &line[..idx];
            let candidate = before.trim_matches(|c: char| c.is_whitespace() || ".,;-–—()".contains(c));
            // Remove year from candidate
            let candidate = YEAR_RE.replace_all(candidate, "").trim().to_string();
            if !candidate.is_empty() && candidate.len() < 200 {
                authors = candidate;
            }
        }
    }

    // Clean title
    title = title.trim_matches(|c: char| c.is_whitespace() || ".,;\"'*".contains(c)).to_string();

    ExtractedCitation {
        title,
        authors,
        year,
        doi,
        url,
        source: source.to_string(),
    }
}

// ── DOI Extraction ───────────────────────────────────────────────────

fn extract_dois(text: &str, source: &str) -> Vec<ExtractedCitation> {
    DOI_RE.captures_iter(text)
        .filter_map(|caps| {
            let doi = caps.get(1)?.as_str().to_string();
            Some(ExtractedCitation {
                title: format!("DOI: {doi}"),
                authors: String::new(),
                year: None,
                doi: Some(doi.clone()),
                url: Some(format!("https://doi.org/{doi}")),
                source: source.to_string(),
            })
        })
        .collect()
}

// ── Academic URL Extraction ──────────────────────────────────────────

fn extract_academic_urls(text: &str, source: &str) -> Vec<ExtractedCitation> {
    URL_RE.find_iter(text)
        .filter_map(|m| {
            let url_str = m.as_str().trim_end_matches(['.', ',', ';']);
            if !ACADEMIC_DOMAINS.iter().any(|d| url_str.contains(d)) {
                return None;
            }
            let title = readable_title_from_url(url_str).unwrap_or_else(|| url_str.to_string());
            Some(ExtractedCitation {
                title,
                authors: String::new(),
                year: None,
                doi: None,
                url: Some(url_str.to_string()),
                source: source.to_string(),
            })
        })
        .collect()
}

fn readable_title_from_url(url: &str) -> Option<String> {
    let path = url.rsplit('/').next()?;
    if path.is_empty() || path == "/" { return None; }
    let mut title = path.replace(['-', '_'], " ");
    // Remove file extension
    if let Some(dot) = title.rfind('.') {
        if title.len() - dot <= 5 {
            title.truncate(dot);
        }
    }
    if title.is_empty() { None } else { Some(title) }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_from_reference_section() {
        let text = r#"Here is some analysis.

## Sources & References

- Smith et al. (2023). "Effect of meditation on cortisol." Journal of Neuroscience.
- [Mindfulness meta-analysis](https://pubmed.ncbi.nlm.nih.gov/12345)
- DOI: 10.1038/s41586-023-00001-1

## Next Section

More text here.
"#;
        let citations = extract(text, "chat");
        assert!(citations.len() >= 2, "should extract >= 2 citations, got {}", citations.len());
    }

    #[test]
    fn extract_doi_standalone() {
        let text = "See DOI: 10.1234/test-paper-2024 for details.";
        let citations = extract(text, "research");
        assert!(!citations.is_empty(), "should extract DOI");
        assert!(citations[0].doi.is_some());
    }

    #[test]
    fn extract_academic_url() {
        let text = "For more see https://arxiv.org/abs/2301.12345";
        let citations = extract(text, "chat");
        assert!(!citations.is_empty(), "should extract arxiv URL");
        assert!(citations[0].url.as_ref().unwrap().contains("arxiv"));
    }

    #[test]
    fn non_academic_url_ignored() {
        let text = "Visit https://example.com/page for details.";
        let citations = extract(text, "chat");
        assert!(citations.is_empty(), "non-academic URL should be ignored");
    }

    #[test]
    fn deduplication_by_title() {
        let text = r#"## References
- "My Paper Title." Smith, 2023.
- "My Paper Title." Jones, 2024.
"#;
        let citations = extract(text, "chat");
        assert_eq!(citations.len(), 1, "duplicate titles should be deduplicated");
    }

    #[test]
    fn year_extraction() {
        let text = r#"## References
- Author (2024). "Paper Title." Journal.
"#;
        let citations = extract(text, "chat");
        assert!(!citations.is_empty());
        assert_eq!(citations[0].year.as_deref(), Some("2024"));
    }

    #[test]
    fn markdown_link_extraction() {
        let text = r#"## References
- [Deep Learning Review](https://nature.com/articles/deep-learning)
"#;
        let citations = extract(text, "chat");
        assert!(!citations.is_empty());
        assert_eq!(citations[0].title, "Deep Learning Review");
        assert!(citations[0].url.is_some());
    }

    #[test]
    fn empty_text_returns_empty() {
        let citations = extract("", "chat");
        assert!(citations.is_empty());
    }

    #[test]
    fn no_reference_section_still_extracts_dois() {
        let text = "The study (DOI: 10.1000/xyz-2024) showed positive results.";
        let citations = extract(text, "note-scan");
        assert!(!citations.is_empty());
        assert!(citations[0].doi.is_some());
    }
}
