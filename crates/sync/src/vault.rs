//! Vault sync — import/export .md files with YAML front-matter.
//!
//! [MAC] — Port of Epistemos/Sync/VaultSyncService.swift + VaultIndexActor.swift
//! [NEW] — notify crate for file watching (replaces macOS DispatchSource)
//!
//! Design:
//!   - SwiftData (SQLite) is the sole source of truth during editing.
//!   - Vault .md files are an import/export target, not a live sync partner.
//!   - Import is incremental: compares file mtime vs page.updated_at.
//!   - Export writes YAML front-matter + body to .md files.
//!   - File watcher uses `notify` crate with 2-second debounce.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Maximum file size for vault import (50 MB). Files larger than this are
/// skipped to prevent OOM on malicious or accidental large files.
const MAX_IMPORT_FILE_SIZE: u64 = 50 * 1024 * 1024;

use storage::db::Database;
use storage::ids::PageId;
use storage::types::{now_ms, Folder, Page};

use crate::error::SyncError;

/// Stats from a vault import operation.
#[derive(Debug, Clone, Default)]
pub struct ImportStats {
    pub imported: usize,
    pub updated: usize,
    pub skipped: usize,
    pub errors: usize,
}

/// Stats from a vault export operation.
#[derive(Debug, Clone, Default)]
pub struct ExportStats {
    pub exported: usize,
    pub errors: usize,
}

// ── Front-Matter Parsing ────────────────────────────────────────────

/// Parse YAML front-matter from a markdown file.
///
/// Returns (front_matter_map, body_text).
/// If no front-matter is present, returns empty map and full content.
pub fn parse_front_matter(content: &str) -> (HashMap<String, String>, String) {
    if !content.starts_with("---") {
        return (HashMap::new(), content.to_string());
    }

    let lines: Vec<&str> = content.lines().collect();
    let mut front_matter = HashMap::new();
    let mut end_index = None;

    for (i, line) in lines.iter().enumerate().skip(1) {
        let trimmed = line.trim();
        if trimmed == "---" {
            end_index = Some(i);
            break;
        }

        if let Some(colon_pos) = trimmed.find(':') {
            let key = trimmed[..colon_pos].trim().to_string();
            let mut value = trimmed[colon_pos + 1..].trim().to_string();

            // Strip YAML double-quote wrapping
            if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 {
                value = value[1..value.len() - 1].replace("\\\"", "\"");
            }

            // Strip surrounding brackets for array values like [swift, ios]
            if value.starts_with('[') && value.ends_with(']') && value.len() >= 2 {
                value = value[1..value.len() - 1].to_string();
            }

            front_matter.insert(key, value);
        }
    }

    if let Some(idx) = end_index {
        let body = lines[idx + 1..]
            .join("\n")
            .trim()
            .to_string();
        (front_matter, body)
    } else {
        (HashMap::new(), content.to_string())
    }
}

/// Build a markdown file with YAML front-matter from page data.
pub fn build_markdown(page: &Page, body: &str) -> String {
    let mut lines = vec!["---".to_string()];
    lines.push(format!("id: {}", page.id));
    lines.push(format!("title: {}", yaml_escape_title(&page.title)));

    if !page.tags.is_empty() {
        lines.push(format!("tags: [{}]", page.tags.join(", ")));
    }
    if let Some(emoji) = &page.emoji {
        if !emoji.is_empty() {
            lines.push(format!("icon: {}", emoji));
        }
    }
    if page.is_journal {
        lines.push("journal: true".to_string());
    }
    if let Some(parent) = page.parent_page_id {
        lines.push(format!("parent: {}", parent));
    }
    if let Some(template) = &page.template_id {
        if !template.is_empty() {
            lines.push(format!("template: {}", template));
        }
    }

    lines.push("---".to_string());
    lines.push(String::new());
    lines.push(body.to_string());

    lines.join("\n")
}

/// Escape a title for YAML front-matter.
fn yaml_escape_title(title: &str) -> String {
    let needs_quoting = title.contains(':')
        || title.contains('"')
        || title.contains('#')
        || title.starts_with(' ')
        || title.ends_with(' ')
        || title.contains('\'')
        || title.contains('[')
        || title.contains(']');

    if needs_quoting {
        let escaped = title.replace('"', "\\\"");
        format!("\"{}\"", escaped)
    } else {
        title.to_string()
    }
}

/// Parse tags from front-matter value. Handles "tag1, tag2" and "tag1,tag2".
fn parse_tags(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

// ── Vault Import ────────────────────────────────────────────────────

/// Import all .md files from a vault directory into the database.
///
/// Incremental: skips files whose mtime is older than the page's updated_at.
/// Creates folder hierarchy from directory structure.
pub fn import_vault(db: &Database, vault_path: &Path) -> Result<ImportStats, SyncError> {
    if !vault_path.is_dir() {
        return Err(SyncError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("vault directory not found: {}", vault_path.display()),
        )));
    }

    let mut stats = ImportStats::default();

    // Build a lookup of existing pages by file_path for incremental sync
    let existing_pages = db.list_pages()?;
    let mut path_to_page: HashMap<String, Page> = HashMap::new();
    for page in &existing_pages {
        if let Some(fp) = &page.file_path {
            path_to_page.insert(fp.clone(), page.clone());
        }
    }

    // Walk the vault directory recursively
    let md_files = collect_md_files(vault_path)?;

    for file_path in &md_files {
        match import_file_incremental(db, file_path, vault_path, &path_to_page) {
            Ok(ImportAction::Created) => stats.imported += 1,
            Ok(ImportAction::Updated) => stats.updated += 1,
            Ok(ImportAction::Skipped) => stats.skipped += 1,
            Err(_e) => stats.errors += 1,
        }
    }

    // Synthesize folder hierarchy from directory structure
    synthesize_folders(db, vault_path, &md_files)?;

    Ok(stats)
}

enum ImportAction {
    Created,
    Updated,
    Skipped,
}

fn import_file_incremental(
    db: &Database,
    file_path: &Path,
    vault_path: &Path,
    existing: &HashMap<String, Page>,
) -> Result<ImportAction, SyncError> {
    let file_path_str = file_path.to_string_lossy().to_string();
    // Guard: skip files larger than MAX_IMPORT_FILE_SIZE to prevent OOM
    let file_size = std::fs::metadata(file_path)?.len();
    if file_size > MAX_IMPORT_FILE_SIZE {
        eprintln!("[WARN][vault] skipping oversized file ({file_size} bytes, limit {MAX_IMPORT_FILE_SIZE}): {file_path_str}");
        return Ok(ImportAction::Skipped);
    }
    let content = std::fs::read_to_string(file_path)?;
    let (front_matter, body) = parse_front_matter(&content);

    // Get file modification time
    let file_mtime = std::fs::metadata(file_path)?
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let file_mtime_ms = file_mtime
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    // Extract metadata from front-matter
    let title = front_matter
        .get("title")
        .cloned()
        .unwrap_or_else(|| {
            file_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        });

    let tags = front_matter
        .get("tags")
        .map(|t| parse_tags(t))
        .unwrap_or_default();

    let emoji = front_matter.get("icon").cloned();

    let is_journal = front_matter
        .get("journal")
        .map(|v| v == "true")
        .unwrap_or(false);

    let subfolder = file_path
        .parent()
        .and_then(|p| p.strip_prefix(vault_path).ok())
        .map(|p| p.to_string_lossy().to_string())
        .filter(|s| !s.is_empty());

    // Check if page exists by file_path
    if let Some(existing_page) = existing.get(&file_path_str) {
        // Skip if file hasn't changed since last import
        if file_mtime_ms <= existing_page.updated_at {
            return Ok(ImportAction::Skipped);
        }

        // Update existing page
        let mut updated = existing_page.clone();
        updated.title = title;
        updated.tags = tags;
        updated.emoji = emoji;
        updated.is_journal = is_journal;
        updated.word_count = body.split_whitespace().count() as i32;
        updated.updated_at = now_ms();
        db.update_page(&updated)?;
        db.save_body(updated.id, &body)?;

        return Ok(ImportAction::Updated);
    }

    // Check if front-matter has an ID we should preserve
    let page_id = front_matter
        .get("id")
        .and_then(|s| s.parse::<PageId>().ok())
        .unwrap_or_else(PageId::new);

    // Create new page
    let now = now_ms();
    let page = Page {
        id: page_id,
        title,
        summary: String::new(),
        emoji,
        research_stage: 0,
        tags,
        word_count: body.split_whitespace().count() as i32,
        is_pinned: false,
        is_archived: false,
        is_favorite: false,
        is_journal,
        is_locked: false,
        sort_order: 0,
        journal_date: None,
        front_matter_data: None,
        ideas_data: None,
        needs_vault_sync: false,
        last_synced_body_hash: None,
        last_synced_at: None,
        file_path: Some(file_path_str),
        subfolder,
        parent_page_id: front_matter
            .get("parent")
            .and_then(|s| s.parse().ok()),
        folder_id: None,
        template_id: front_matter.get("template").cloned(),
        created_at: now,
        updated_at: now,
    };

    db.insert_page(&page)?;
    db.save_body(page.id, &body)?;

    Ok(ImportAction::Created)
}

/// Collect all .md files under a directory, recursively.
/// Canonicalizes all paths to prevent directory traversal via symlinks.
fn collect_md_files(dir: &Path) -> Result<Vec<PathBuf>, SyncError> {
    let canonical_root = dir.canonicalize()?;
    let mut files = Vec::new();
    collect_md_files_recursive(&canonical_root, &canonical_root, &mut files)?;
    Ok(files)
}

fn collect_md_files_recursive(
    dir: &Path,
    vault_root: &Path,
    out: &mut Vec<PathBuf>,
) -> Result<(), SyncError> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        // Skip hidden files/directories
        if path
            .file_name()
            .is_some_and(|n| n.to_string_lossy().starts_with('.'))
        {
            continue;
        }

        // Canonicalize to resolve symlinks, then verify path stays within vault
        let canonical = match path.canonicalize() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[WARN][vault] skipping non-canonical path (broken symlink?): {} — {e}", path.display());
                continue;
            }
        };
        if !canonical.starts_with(vault_root) {
            eprintln!("[WARN][vault] skipping path outside vault root (path traversal blocked): {}", path.display());
            continue;
        }

        if canonical.is_dir() {
            collect_md_files_recursive(&canonical, vault_root, out)?;
        } else if canonical.extension().is_some_and(|e| e == "md") {
            out.push(canonical);
        }
    }
    Ok(())
}

/// Synthesize folder hierarchy from directory structure.
fn synthesize_folders(
    db: &Database,
    vault_path: &Path,
    md_files: &[PathBuf],
) -> Result<(), SyncError> {
    let mut unique_dirs: std::collections::HashSet<String> = std::collections::HashSet::new();

    for file_path in md_files {
        if let Some(parent) = file_path.parent() {
            if let Ok(relative) = parent.strip_prefix(vault_path) {
                let rel_str = relative.to_string_lossy().to_string();
                if !rel_str.is_empty() {
                    // Add all ancestor paths too
                    let segments: Vec<&str> = rel_str.split('/').filter(|s| !s.is_empty()).collect();
                    let mut current = String::new();
                    for seg in segments {
                        current = if current.is_empty() {
                            seg.to_string()
                        } else {
                            format!("{}/{}", current, seg)
                        };
                        unique_dirs.insert(current.clone());
                    }
                }
            }
        }
    }

    // Create folders — skip if they already exist (check by name for simplicity)
    let existing_folders = db.list_folders()?;
    let existing_names: std::collections::HashSet<String> =
        existing_folders.iter().map(|f| f.name.clone()).collect();

    for dir_path in &unique_dirs {
        let name = dir_path.rsplit('/').next().unwrap_or(dir_path);
        if !existing_names.contains(name) {
            let folder = Folder::new(name.to_string());
            db.insert_folder(&folder)?;
        }
    }

    Ok(())
}

/// Import a single .md file into the database.
/// Public API for the vault watcher — self-contained, queries DB for existing page.
pub fn import_single_file(db: &Database, file_path: &Path) -> Result<(), SyncError> {
    let file_path_str = file_path.to_string_lossy().to_string();
    // Guard: reject files larger than MAX_IMPORT_FILE_SIZE to prevent OOM
    let file_size = std::fs::metadata(file_path)?.len();
    if file_size > MAX_IMPORT_FILE_SIZE {
        return Err(SyncError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("file too large ({file_size} bytes, max {MAX_IMPORT_FILE_SIZE}): {file_path_str}"),
        )));
    }
    let content = std::fs::read_to_string(file_path)?;
    let (front_matter, body) = parse_front_matter(&content);

    let file_mtime = std::fs::metadata(file_path)?
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let file_mtime_ms = file_mtime
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let title = front_matter
        .get("title")
        .cloned()
        .unwrap_or_else(|| {
            file_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        });

    let tags = front_matter
        .get("tags")
        .map(|t| parse_tags(t))
        .unwrap_or_default();

    let emoji = front_matter.get("icon").cloned();

    let is_journal = front_matter
        .get("journal")
        .map(|v| v == "true")
        .unwrap_or(false);

    // Check if a page with this file_path already exists
    let existing = db
        .list_pages()?
        .into_iter()
        .find(|p| p.file_path.as_deref() == Some(&file_path_str));

    if let Some(mut page) = existing {
        // Skip if file hasn't changed
        if file_mtime_ms <= page.updated_at {
            return Ok(());
        }
        page.title = title;
        page.tags = tags;
        page.emoji = emoji;
        page.is_journal = is_journal;
        page.word_count = body.split_whitespace().count() as i32;
        page.updated_at = now_ms();
        db.update_page(&page)?;
        db.save_body(page.id, &body)?;
    } else {
        let page_id = front_matter
            .get("id")
            .and_then(|s| s.parse::<PageId>().ok())
            .unwrap_or_else(PageId::new);

        let now = now_ms();
        let page = Page {
            id: page_id,
            title,
            summary: String::new(),
            emoji,
            research_stage: 0,
            tags,
            word_count: body.split_whitespace().count() as i32,
            is_pinned: false,
            is_archived: false,
            is_favorite: false,
            is_journal,
            is_locked: false,
            sort_order: 0,
            journal_date: None,
            front_matter_data: None,
            ideas_data: None,
            needs_vault_sync: false,
            last_synced_body_hash: None,
            last_synced_at: None,
            file_path: Some(file_path_str),
            subfolder: None,
            parent_page_id: front_matter.get("parent").and_then(|s| s.parse().ok()),
            folder_id: None,
            template_id: front_matter.get("template").cloned(),
            created_at: now,
            updated_at: now,
        };
        db.insert_page(&page)?;
        db.save_body(page.id, &body)?;
    }

    Ok(())
}

// ── Vault Export ────────────────────────────────────────────────────

/// Export a single page to a .md file in the vault directory.
pub fn export_page(
    db: &Database,
    page_id: PageId,
    vault_path: &Path,
) -> Result<PathBuf, SyncError> {
    let page = db.get_page(page_id)?;
    let body = db.load_body(page_id)?;
    let markdown = build_markdown(&page, &body);

    // Determine file path
    let file_name = sanitize_filename(&page.title);
    let file_path = if let Some(subfolder) = &page.subfolder {
        let dir = vault_path.join(subfolder);
        std::fs::create_dir_all(&dir)?;
        dir.join(format!("{}.md", file_name))
    } else {
        vault_path.join(format!("{}.md", file_name))
    };

    // Atomic write: write to temp file, then rename
    let temp_path = file_path.with_extension("md.tmp");
    std::fs::write(&temp_path, &markdown)?;
    std::fs::rename(&temp_path, &file_path)?;

    Ok(file_path)
}

/// Export all pages to the vault directory.
pub fn export_all(db: &Database, vault_path: &Path) -> Result<ExportStats, SyncError> {
    let pages = db.list_pages()?;
    let mut stats = ExportStats::default();

    for page in &pages {
        if page.is_archived {
            continue;
        }
        match export_page(db, page.id, vault_path) {
            Ok(_) => stats.exported += 1,
            Err(_) => stats.errors += 1,
        }
    }

    Ok(stats)
}

/// Sanitize a page title for use as a filename.
fn sanitize_filename(title: &str) -> String {
    let sanitized: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect();

    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_front_matter_basic() {
        let content = "---\ntitle: Hello World\ntags: [rust, wasm]\n---\n\nBody text here.";
        let (fm, body) = parse_front_matter(content);
        assert_eq!(fm.get("title").unwrap(), "Hello World");
        assert_eq!(fm.get("tags").unwrap(), "rust, wasm");
        assert_eq!(body, "Body text here.");
    }

    #[test]
    fn parse_front_matter_no_front_matter() {
        let content = "Just a regular document.";
        let (fm, body) = parse_front_matter(content);
        assert!(fm.is_empty());
        assert_eq!(body, "Just a regular document.");
    }

    #[test]
    fn parse_front_matter_quoted_title() {
        let content = "---\ntitle: \"Hello: World\"\n---\n\nBody";
        let (fm, body) = parse_front_matter(content);
        assert_eq!(fm.get("title").unwrap(), "Hello: World");
        assert_eq!(body, "Body");
    }

    #[test]
    fn parse_front_matter_empty_body() {
        let content = "---\ntitle: Empty\n---\n";
        let (fm, body) = parse_front_matter(content);
        assert_eq!(fm.get("title").unwrap(), "Empty");
        assert!(body.is_empty());
    }

    #[test]
    fn build_markdown_roundtrip() {
        let page = Page::new("Test Note".into());
        let body = "# Hello\n\nThis is content.";
        let md = build_markdown(&page, body);

        assert!(md.starts_with("---\n"));
        assert!(md.contains("title: Test Note"));
        assert!(md.contains(&page.id.to_string()));
        assert!(md.ends_with(body));

        // Parse it back
        let (fm, parsed_body) = parse_front_matter(&md);
        assert_eq!(fm.get("title").unwrap(), "Test Note");
        assert_eq!(parsed_body, body);
    }

    #[test]
    fn yaml_escape_special_chars() {
        assert_eq!(yaml_escape_title("Simple"), "Simple");
        assert_eq!(yaml_escape_title("Has: colon"), "\"Has: colon\"");
        assert_eq!(
            yaml_escape_title("Has \"quotes\""),
            "\"Has \\\"quotes\\\"\""
        );
    }

    #[test]
    fn parse_tags_basic() {
        assert_eq!(parse_tags("rust, wasm, tauri"), vec!["rust", "wasm", "tauri"]);
        assert_eq!(parse_tags("single"), vec!["single"]);
        assert_eq!(parse_tags(""), Vec::<String>::new());
    }

    #[test]
    fn sanitize_filename_basic() {
        assert_eq!(sanitize_filename("Hello World"), "Hello World");
        assert_eq!(sanitize_filename("File/With:Bad*Chars"), "File_With_Bad_Chars");
        assert_eq!(sanitize_filename(""), "Untitled");
    }

    #[test]
    fn import_vault_nonexistent_dir() {
        let db = Database::open_in_memory().expect("open db");
        let result = import_vault(&db, Path::new("/nonexistent/path"));
        assert!(result.is_err());
    }

    #[test]
    fn import_export_roundtrip() {
        let db = Database::open_in_memory().expect("open db");
        let temp_dir = std::env::temp_dir().join(format!("epistemos_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");

        // Create a page and export it
        let page = Page::new("Roundtrip Test".into());
        db.insert_page(&page).expect("insert page");
        db.save_body(page.id, "# Content\n\nBody text.").expect("save body");

        let export_path = export_page(&db, page.id, &temp_dir).expect("export");
        assert!(export_path.exists());

        // Read the exported file and verify
        let exported = std::fs::read_to_string(&export_path).expect("read exported");
        assert!(exported.contains("title: Roundtrip Test"));
        assert!(exported.contains("# Content"));
        assert!(exported.contains("Body text."));

        // Clean up
        std::fs::remove_dir_all(&temp_dir).ok();
    }
}
