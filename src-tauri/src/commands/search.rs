use serde::Serialize;
use tauri::State;
use storage::types::SearchResult;
use crate::error::AppError;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn search_pages(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, AppError> {
    let db = state.lock_db()?;
    let max = limit.unwrap_or(20);
    Ok(db.search_fts5(&query, max)?)
}

/// Rebuild the FTS5 search index from all pages + bodies.
/// Called on first launch or when the user triggers a manual re-index.
/// Runs in spawn_blocking because full reindex is O(pages) sync I/O.
#[tauri::command]
#[specta::specta]
pub async fn rebuild_search_index(state: State<'_, AppState>) -> Result<u32, AppError> {
    let app_state = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let db = app_state.lock_db()?;
        let count = db.rebuild_search_index()?;
        Ok::<u32, AppError>(count as u32)
    })
    .await
    .map_err(|e| AppError::Internal(format!("task join: {e}")))?
}

/// A unified search result from both FTS5 and FST layers.
#[derive(Clone, Serialize, specta::Type)]
pub struct HybridSearchResult {
    pub page_id: String,
    pub title: String,
    pub snippet: String,
    pub score: f32,
    /// "fts5" | "fst" | "both"
    pub source: String,
}

/// Dual-layer hybrid search: FTS5 full-text + FST graph labels, merged by score.
/// Engineering standards mandate: "FST + FTS5, single query merges both."
#[tauri::command]
#[specta::specta]
pub async fn search_hybrid(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<HybridSearchResult>, AppError> {
    let max = limit.unwrap_or(20);

    // Layer 1: FTS5 full-text search (pages)
    let fts_results = {
        let db = state.lock_db()?;
        db.search_fts5(&query, max)?
    };

    // Layer 2: FST graph label search (uses cached GraphStore)
    let fst_results = {
        let store = state.lock_graph()?;
        store.search_fst(&query, max)
    };

    // Merge: deduplicate by ID string, combine scores
    let mut seen: std::collections::HashMap<String, HybridSearchResult> =
        std::collections::HashMap::new();

    for fts in &fts_results {
        let id = fts.page_id.to_string();
        seen.insert(id.clone(), HybridSearchResult {
            page_id: id,
            title: fts.title.clone(),
            snippet: fts.snippet.clone(),
            score: fts.score as f32,
            source: "fts5".into(),
        });
    }

    for hit in &fst_results {
        if let Some(existing) = seen.get_mut(&hit.node_id) {
            existing.score = existing.score.max(hit.score);
            existing.source = "both".into();
        } else {
            seen.insert(hit.node_id.clone(), HybridSearchResult {
                page_id: hit.node_id.clone(),
                title: hit.label.clone(),
                snippet: String::new(),
                score: hit.score,
                source: "fst".into(),
            });
        }
    }

    let mut results: Vec<HybridSearchResult> = seen.into_values().collect();
    // NaN-safe sort: treat NaN scores as lowest priority
    results.sort_by(|a, b| {
        b.score.partial_cmp(&a.score).unwrap_or_else(|| {
            // One or both is NaN — push NaN to the end
            if a.score.is_nan() && b.score.is_nan() {
                std::cmp::Ordering::Equal
            } else if a.score.is_nan() {
                std::cmp::Ordering::Greater // a goes after b
            } else {
                std::cmp::Ordering::Less // b goes after a
            }
        })
    });
    results.truncate(max);

    Ok(results)
}
