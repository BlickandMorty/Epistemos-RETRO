use tauri::{AppHandle, Emitter, State};
use storage::ids::PageId;
use storage::types::{Block, Page};
use crate::error::AppError;
use crate::state::AppState;
use super::parse_id;

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
