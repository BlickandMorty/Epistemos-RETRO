use serde::Serialize;
use tauri::State;
use storage::types::{Page, SearchResult};
use storage::ids::PageId;
use crate::error::AppError;
use crate::state::AppState;
use engine::query::{self, QueryError, SavedQuery};

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

// =============================================================================
// Structured Query System Commands
// =============================================================================

/// Execute a structured search query with the advanced query language.
///
/// Query syntax:
/// - Field filters: `tag:work`, `created:>2024-01-01`, `title:"hello world"`
/// - Boolean operators: `AND`, `OR`, `NOT`
/// - Comparison: `=`, `!=`, `<`, `>`, `<=`, `>=`, `~` (contains)
/// - Grouping: `(tag:work OR tag:urgent) AND created:>2024-01-01`
/// - Tag shorthand: `#work` is equivalent to `tag:work`
///
/// # Examples
/// - `tag:work AND created:>2024-01-01`
/// - `(title:"Project" OR tag:urgent) AND NOT is_archived:true`
/// - `word_count:>500 AND updated:>last_week`
#[tauri::command]
#[specta::specta]
pub async fn structured_search(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<Page>, AppError> {
    let db = state.lock_db()?;
    
    let runtime = query::QueryRuntime::new(&db);
    let pages = runtime.query_pages(&query)?;
    
    // Apply additional limit if specified
    let max = limit.map(|l| l as usize).unwrap_or(pages.len());
    let mut result = pages;
    if result.len() > max {
        result.truncate(max);
    }
    
    Ok(result)
}

/// Validate a structured query without executing it.
/// Returns Ok if valid, or an error with position info.
#[tauri::command]
#[specta::specta]
pub async fn validate_query(
    query: String,
) -> Result<(), QueryError> {
    query::validate(&query)
}

/// Get all saved queries.
#[tauri::command]
#[specta::specta]
pub async fn get_saved_queries(
    state: State<'_, AppState>,
) -> Result<Vec<SavedQuery>, AppError> {
    let db = state.lock_db()?;
    Ok(query::get_saved_queries(&db)?)
}

/// Save a query with a name.
#[tauri::command]
#[specta::specta]
pub async fn save_query(
    state: State<'_, AppState>,
    name: String,
    query_str: String,
) -> Result<SavedQuery, AppError> {
    let db = state.lock_db()?;
    Ok(query::save_query(&db, name, query_str)?)
}

/// Delete a saved query by name.
#[tauri::command]
#[specta::specta]
pub async fn delete_query(
    state: State<'_, AppState>,
    name: String,
) -> Result<(), AppError> {
    let db = state.lock_db()?;
    Ok(query::delete_query(&db, &name)?)
}

/// Execute a saved query by name.
/// Increments the use count and updates last_used_at.
#[tauri::command]
#[specta::specta]
pub async fn execute_saved_query(
    state: State<'_, AppState>,
    name: String,
    limit: Option<u32>,
) -> Result<Vec<Page>, AppError> {
    let db = state.lock_db()?;
    
    // Get the saved query
    let saved = query::get_saved_query(&db, &name)?
        .ok_or_else(|| AppError::Internal(format!("Saved query '{}' not found", name)))?;
    
    // Record usage
    query::record_query_use(&db, &name)?;
    
    // Execute the query
    let runtime = query::QueryRuntime::new(&db);
    let pages = runtime.query_pages(&saved.query)?;
    
    // Apply limit
    let max = limit.map(|l| l as usize).unwrap_or(pages.len());
    let mut result = pages;
    if result.len() > max {
        result.truncate(max);
    }
    
    Ok(result)
}

/// Rename a saved query.
#[tauri::command]
#[specta::specta]
pub async fn rename_query(
    state: State<'_, AppState>,
    old_name: String,
    new_name: String,
) -> Result<SavedQuery, AppError> {
    let db = state.lock_db()?;
    Ok(query::rename_query(&db, &old_name, new_name)?)
}

/// Get the most frequently used queries.
#[tauri::command]
#[specta::specta]
pub async fn get_popular_queries(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<SavedQuery>, AppError> {
    let db = state.lock_db()?;
    let max = limit.map(|l| l as usize).unwrap_or(10);
    Ok(query::get_popular_queries(&db, max)?)
}

/// Get recently used queries.
#[tauri::command]
#[specta::specta]
pub async fn get_recent_queries(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<SavedQuery>, AppError> {
    let db = state.lock_db()?;
    let max = limit.map(|l| l as usize).unwrap_or(10);
    Ok(query::get_recent_queries(&db, max)?)
}

/// Search result from structured query execution.
#[derive(Clone, Serialize, specta::Type)]
pub struct StructuredSearchResult {
    pub pages: Vec<Page>,
    pub total_count: usize,
    pub execution_time_ms: u64,
}

/// Execute a structured search and return detailed results including metadata.
#[tauri::command]
#[specta::specta]
pub async fn structured_search_detailed(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<StructuredSearchResult, AppError> {
    let db = state.lock_db()?;
    
    let runtime = query::QueryRuntime::new(&db);
    let expr = query::parse(&query)?;
    let compiled = query::compile(&expr)?;
    
    let start = std::time::Instant::now();
    let query_result = runtime.execute(&compiled)?;
    let execution_time_ms = start.elapsed().as_millis() as u64;
    
    // Fetch full pages for the results
    let mut pages = Vec::with_capacity(query_result.page_ids.len());
    for page_id_str in &query_result.page_ids {
        if let Ok(page_id) = page_id_str.parse::<PageId>() {
            if let Ok(page) = db.get_page(page_id) {
                pages.push(page);
            }
        }
    }
    
    // Apply additional limit
    let max = limit.map(|l| l as usize).unwrap_or(pages.len());
    if pages.len() > max {
        pages.truncate(max);
    }
    
    Ok(StructuredSearchResult {
        pages,
        total_count: query_result.total_count,
        execution_time_ms,
    })
}
