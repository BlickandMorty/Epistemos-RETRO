// NOTE: Transclusion commands are public API endpoints registered in lib.rs.
// The "never used" warnings will resolve once frontend integration is complete.
#![allow(dead_code)]

use tauri::{AppHandle, Emitter, State};
use storage::ids::{PageId, BlockId, TransclusionId};
use storage::types::{Block, DiffSection, LineDiff, Page, PageVersion, Transclusion};
use storage::diff::{compute_diff, LineDiffExt};
use crate::error::AppError;
use crate::state::AppState;
use super::parse_id;

// Maximum number of versions to keep per page
const MAX_VERSIONS_PER_PAGE: usize = 50;

#[tauri::command]
#[specta::specta]
pub async fn create_page(state: State<'_, AppState>, title: String) -> Result<Page, AppError> {
    let page = Page::new(title);
    let db = state.lock_db()?;
    db.insert_page(&page)?;
    Ok(page)
}

#[tauri::command]
#[specta::specta]
pub async fn get_page(state: State<'_, AppState>, page_id: String) -> Result<Page, AppError> {
    let id: PageId = parse_id(&page_id)?;
    let db = state.lock_db()?;
    Ok(db.get_page(id)?)
}

#[tauri::command]
#[specta::specta]
pub async fn list_pages(state: State<'_, AppState>) -> Result<Vec<Page>, AppError> {
    let db = state.lock_db()?;
    Ok(db.list_pages()?)
}

#[tauri::command]
#[specta::specta]
pub async fn update_page(state: State<'_, AppState>, page: Page) -> Result<(), AppError> {
    let db = state.lock_db()?;
    db.update_page(&page)?;
    // Sync FTS5 index with updated title/tags.
    // Best-effort: don't fail the save on index error, but log loudly.
    // If this fails, search results will be stale until next rebuild_search_index().
    match db.load_body(page.id) {
        Ok(body) => {
            let tags = page.tags.join(", ");
            if let Err(e) = db.upsert_search_index(page.id, &page.title, &body, &tags) {
                eprintln!("[WARN][notes] search index update failed for {} — search may be stale: {e}", page.id);
            }
        }
        Err(e) => {
            eprintln!("[WARN][notes] could not load body for index sync of {} — search may be stale: {e}", page.id);
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_page(state: State<'_, AppState>, page_id: String) -> Result<(), AppError> {
    let id: PageId = parse_id(&page_id)?;
    let db = state.lock_db()?;
    if let Err(e) = db.delete_search_index(id) {
        eprintln!("[WARN][notes] search index delete failed for {id} — orphaned index entry: {e}");
    }
    db.delete_page(id)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn load_body(state: State<'_, AppState>, page_id: String) -> Result<String, AppError> {
    let id: PageId = parse_id(&page_id)?;
    let db = state.lock_db()?;
    Ok(db.load_body(id)?)
}

#[tauri::command]
#[specta::specta]
pub async fn save_body(state: State<'_, AppState>, page_id: String, content: String) -> Result<(), AppError> {
    let id: PageId = parse_id(&page_id)?;
    let db = state.lock_db()?;
    db.save_body(id, &content)?;

    // Update word count on page metadata (best-effort — don't fail the save)
    let word_count = content.split_whitespace().count() as i32;
    if let Err(e) = db.update_word_count(id, word_count) {
        eprintln!("[WARN][notes] word count update failed for {id}: {e}");
    }

    // Sync FTS5 search index with updated content.
    // Best-effort: stale index is rebuilt on next rebuild_search_index() call.
    match db.get_page(id) {
        Ok(page) => {
            let tags = page.tags.join(", ");
            if let Err(e) = db.upsert_search_index(id, &page.title, &content, &tags) {
                eprintln!("[WARN][notes] search index update failed for {id} — search may be stale: {e}");
            }
        }
        Err(e) => {
            eprintln!("[WARN][notes] could not load page for index sync of {id}: {e}");
        }
    }

    // Reconcile blocks from markdown (keeps block entities in sync).
    // Best-effort: block structure will be stale until next save.
    if let Err(e) = sync::block_reconciler::reconcile(&db, id, &content) {
        eprintln!("[WARN][notes] block reconciliation failed for {id} — block structure may be stale: {e}");
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_blocks(state: State<'_, AppState>, page_id: String) -> Result<Vec<Block>, AppError> {
    let id: PageId = parse_id(&page_id)?;
    let db = state.lock_db()?;
    Ok(db.get_blocks_for_page(id)?)
}

/// Generate AI content for a note. Streams tokens back via `note-ai-stream` events.
///
/// The frontend sends a prompt (e.g., "expand this section", "summarize")
/// along with the page context. The response streams back incrementally.
#[tauri::command]
#[specta::specta]
pub async fn generate_note_ai(
    app: AppHandle,
    state: State<'_, AppState>,
    page_id: String,
    prompt: String,
) -> Result<(), AppError> {
    use futures::StreamExt;
    use super::graph::build_triaged_provider;

    let id: PageId = parse_id(&page_id)?;

    // Load note context for the prompt
    let (title, body) = {
        let db = state.lock_db()?;
        let page = db.get_page(id)?;
        let body = db.load_body(id)?;
        (page.title, body)
    };

    let (provider, _) = build_triaged_provider(&state, &prompt)?;

    let system = format!(
        "You are a writing assistant for the note titled \"{title}\". \
         The user wants help with their note content. \
         Be clear, concise, and match the existing writing style. \
         Current note content:\n\n{body}"
    );

    // Cancel any previous note AI task before starting a new one.
    let cancel_token = {
        use tokio_util::sync::CancellationToken;
        let new_token = CancellationToken::new();
        if let Ok(mut guard) = state.note_ai_cancel.lock() {
            if let Some(old) = guard.take() {
                old.cancel();
            }
            *guard = Some(new_token.clone());
        }
        new_token
    };

    let app_clone = app.clone();
    let page_id_clone = page_id.clone();

    state.spawn_tracked("note_ai", async move {
        match provider.stream(&prompt, Some(&system), 2048).await {
            Ok(mut stream) => {
                loop {
                    tokio::select! {
                        chunk = stream.next() => {
                            match chunk {
                                Some(Ok(text)) if !text.is_empty() => {
                                    let _ = app_clone.emit("note-ai-stream", serde_json::json!({
                                        "page_id": page_id_clone,
                                        "text": text,
                                        "done": false,
                                    }));
                                }
                                Some(Err(e)) => {
                                    let _ = app_clone.emit("note-ai-stream", serde_json::json!({
                                        "page_id": page_id_clone,
                                        "text": e.user_message(),
                                        "done": true,
                                        "error": true,
                                    }));
                                    break;
                                }
                                None => break,
                                _ => {}
                            }
                        }
                        _ = cancel_token.cancelled() => {
                            break;
                        }
                    }
                }
                let _ = app_clone.emit("note-ai-stream", serde_json::json!({
                    "page_id": page_id_clone,
                    "text": "",
                    "done": true,
                }));
            }
            Err(e) => {
                let _ = app_clone.emit("note-ai-stream", serde_json::json!({
                    "page_id": page_id_clone,
                    "text": e.user_message(),
                    "done": true,
                    "error": true,
                }));
            }
        }
    });

    Ok(())
}

// ──────────────────────────────────────────────
// Version & Diff Commands
// ──────────────────────────────────────────────

/// Get all versions for a page, ordered by timestamp descending (newest first).
#[tauri::command]
#[specta::specta]
pub async fn get_page_versions(
    state: State<'_, AppState>,
    page_id: String,
) -> Result<Vec<PageVersion>, AppError> {
    let id: PageId = parse_id(&page_id)?;
    let db = state.lock_db()?;
    Ok(db.get_page_versions(id)?)
}

/// Get a specific version by ID.
#[tauri::command]
#[specta::specta]
pub async fn get_version(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<PageVersion, AppError> {
    let db = state.lock_db()?;
    Ok(db.get_version(&version_id)?)
}

/// Restore a page to a specific version.
/// The current state is automatically saved as a new version before restoring.
#[tauri::command]
#[specta::specta]
pub async fn restore_version(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<PageVersion, AppError> {
    let db = state.lock_db()?;

    // Get the version to restore
    let version = db.get_version(&version_id)?;
    let page_id = version.page_id;

    // Save current state as a new version (for undo capability)
    let current_page = db.get_page(page_id)?;
    let current_body = db.load_body(page_id)?;
    let current_version = PageVersion::new(
        page_id,
        current_page.title.clone(),
        current_body,
    );
    db.save_page_version(&current_version)?;

    // Prune if needed
    let count = db.get_page_version_count(page_id)?;
    if count > MAX_VERSIONS_PER_PAGE as i64 {
        let _ = db.prune_old_versions(page_id, MAX_VERSIONS_PER_PAGE);
    }

    // Restore the selected version
    db.restore_version(&version_id)?;

    Ok(version)
}

/// Compare two versions and return the diff.
#[tauri::command]
#[specta::specta]
pub async fn compare_versions(
    state: State<'_, AppState>,
    version_a_id: String,
    version_b_id: String,
) -> Result<LineDiff, AppError> {
    let db = state.lock_db()?;

    let version_a = db.get_version(&version_a_id)?;
    let version_b = db.get_version(&version_b_id)?;

    let diff = compute_diff(&version_a.body, &version_b.body);
    Ok(diff)
}

/// Compare a specific version with the current page content.
#[tauri::command]
#[specta::specta]
pub async fn compare_version_with_current(
    state: State<'_, AppState>,
    page_id: String,
    version_id: String,
) -> Result<LineDiff, AppError> {
    let id: PageId = parse_id(&page_id)?;
    let db = state.lock_db()?;

    let version = db.get_version(&version_id)?;
    let current_body = db.load_body(id)?;

    let diff = compute_diff(&version.body, &current_body);
    Ok(diff)
}

/// Save a manual version snapshot.
#[tauri::command]
#[specta::specta]
pub async fn save_manual_version(
    state: State<'_, AppState>,
    page_id: String,
    description: Option<String>,
) -> Result<PageVersion, AppError> {
    let id: PageId = parse_id(&page_id)?;
    let db = state.lock_db()?;

    let page = db.get_page(id)?;
    let body = db.load_body(id)?;

    // Get the latest version's hash to set as parent
    let parent_hash = db.get_latest_version(id)?.map(|v| v.hash);

    let mut version = PageVersion::new(id, page.title, body);
    version.changes_summary = description;
    version.parent_hash = parent_hash;

    db.save_page_version(&version)?;

    // Prune old versions if over limit
    let count = db.get_page_version_count(id)?;
    if count > MAX_VERSIONS_PER_PAGE as i64 {
        let _ = db.prune_old_versions(id, MAX_VERSIONS_PER_PAGE);
    }

    Ok(version)
}

/// Get sectioned diff for UI rendering with context folding.
#[tauri::command]
#[specta::specta]
pub async fn get_sectioned_diff(
    state: State<'_, AppState>,
    version_a_id: String,
    version_b_id: String,
    context_lines: Option<usize>,
) -> Result<(LineDiff, Vec<DiffSection>), AppError> {
    let db = state.lock_db()?;

    let version_a = db.get_version(&version_a_id)?;
    let version_b = db.get_version(&version_b_id)?;

    let diff = compute_diff(&version_a.body, &version_b.body);
    let sections = diff.sectioned(context_lines.unwrap_or(3));

    Ok((diff, sections))
}

/// Delete a specific version.
#[tauri::command]
#[specta::specta]
pub async fn delete_version(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<(), AppError> {
    let db = state.lock_db()?;
    db.delete_version(&version_id)?;
    Ok(())
}

// ──────────────────────────────────────────────
// Transclusion Commands
// ──────────────────────────────────────────────
// NOTE: These are public API endpoints that will be registered in lib.rs
// when frontend integration is complete. Currently marked as allow(dead_code).

/// Create a transclusion (block reference).
/// Embeds content from target_page/target_block into source_page.
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn create_transclusion(
    state: State<'_, AppState>,
    source_page_id: String,
    target_page_id: String,
    target_block_id: Option<String>,
) -> Result<Transclusion, AppError> {
    let source_id: PageId = parse_id(&source_page_id)?;
    let target_id: PageId = parse_id(&target_page_id)?;
    let target_block = target_block_id.as_deref().map(parse_id::<BlockId>).transpose()?;

    let db = state.lock_db()?;

    // Check for circular transclusion
    if db.would_create_circular_transclusion(source_id, target_id)? {
        return Err(AppError::Storage(storage::error::StorageError::CircularTransclusion));
    }

    let transclusion = db.create_transclusion(source_id, target_id, target_block)?;
    Ok(transclusion)
}

/// Get all transclusions for a page (blocks this page has transcluded).
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn get_transclusions_for_page(
    state: State<'_, AppState>,
    page_id: String,
) -> Result<Vec<Transclusion>, AppError> {
    let id: PageId = parse_id(&page_id)?;
    let db = state.lock_db()?;
    Ok(db.get_transclusions_for_page(id)?)
}

/// Delete a transclusion by ID.
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn delete_transclusion(
    state: State<'_, AppState>,
    transclusion_id: String,
) -> Result<(), AppError> {
    let id: TransclusionId = parse_id(&transclusion_id)?;
    let db = state.lock_db()?;
    db.delete_transclusion(id)?;
    Ok(())
}

/// Get all pages that transclude a specific block.
/// Used for "backlinks" view and live sync notifications.
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn get_pages_transcluding_block(
    state: State<'_, AppState>,
    block_id: String,
) -> Result<Vec<String>, AppError> {
    let id: BlockId = parse_id(&block_id)?;
    let db = state.lock_db()?;
    let pages = db.get_pages_transcluding_block(id)?;
    Ok(pages.into_iter().map(|p| p.to_string()).collect())
}

/// Result type for transclusion search
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct TransclusionSearchResult {
    pub block_id: String,
    pub block_content: String,
    pub page_id: String,
    pub page_title: String,
}

/// Result type for block reference autocomplete
/// Triggered by typing `((` in the block editor
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct BlockSearchResult {
    pub block_id: String,
    pub preview_text: String,
    pub page_title: String,
    pub page_id: String,
}

/// Search blocks for transclusion autocomplete.
/// Returns blocks matching the query with their parent page info.
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn search_blocks_for_transclusion(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<TransclusionSearchResult>, AppError> {
    let db = state.lock_db()?;
    let limit = limit.unwrap_or(10);
    let results = db.search_blocks_for_transclusion(&query, limit)?;

    let mapped = results
        .into_iter()
        .map(|(block, page)| TransclusionSearchResult {
            block_id: block.id.to_string(),
            block_content: strip_html(&block.content).chars().take(100).collect(),
            page_id: page.id.to_string(),
            page_title: page.title,
        })
        .collect();

    Ok(mapped)
}

/// Helper function to strip HTML for preview text
#[allow(dead_code)]
fn strip_html(html: &str) -> String {
    html.replace(['<', '>'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Get the content of a transcluded block.
/// Used by the frontend to render transcluded content inline.
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn get_transcluded_block(
    state: State<'_, AppState>,
    block_id: String,
) -> Result<Option<Block>, AppError> {
    let id: BlockId = parse_id(&block_id)?;
    let db = state.lock_db()?;

    match db.get_block(id) {
        Ok(block) => Ok(Some(block)),
        Err(storage::error::StorageError::BlockNotFound(_)) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Notify that a block has been updated.
/// Emits events to all pages that transclude this block so they can refresh.
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn notify_block_updated(
    app: AppHandle,
    state: State<'_, AppState>,
    block_id: String,
) -> Result<Vec<String>, AppError> {
    let id: BlockId = parse_id(&block_id)?;
    let db = state.lock_db()?;

    // Get all pages that transclude this block
    let pages = db.get_pages_transcluding_block(id)?;
    let page_ids: Vec<String> = pages.iter().map(|p| p.to_string()).collect();

    // Emit event to each page
    for page_id in &page_ids {
        let _ = app.emit("transclusion-refresh", serde_json::json!({
            "page_id": page_id,
            "block_id": block_id,
        }));
    }

    Ok(page_ids)
}

// ═══════════════════════════════════════════════════════════════════
// Block Reference Autocomplete Commands (triggered by typing (( )
// ═══════════════════════════════════════════════════════════════════

/// Search blocks for block reference autocomplete.
/// Triggered when user types `((` in the block editor.
/// Returns fuzzy search results with block preview and page context.
#[tauri::command]
#[specta::specta]
pub async fn search_blocks(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<BlockSearchResult>, AppError> {
    let db = state.lock_db()?;
    let limit = limit.map(|l| l as usize).unwrap_or(10);
    
    let results = db.search_blocks(&query, limit)?;
    
    let mapped: Vec<BlockSearchResult> = results
        .into_iter()
        .map(|(block, page)| BlockSearchResult {
            block_id: block.id.to_string(),
            preview_text: strip_html(&block.content).chars().take(120).collect(),
            page_title: page.title,
            page_id: page.id.to_string(),
        })
        .collect();

    Ok(mapped)
}
