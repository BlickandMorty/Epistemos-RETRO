use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use storage::ids::PageId;
use crate::error::AppError;
use crate::state::AppState;

use super::graph::build_triaged_provider;

/// Research stage progression:
///   0 = none (no research started)
///   1 = gathering (collecting sources and evidence)
///   2 = analyzing (deep analysis of gathered material)
///   3 = synthesizing (cross-referencing and consolidating)
///   4 = complete (research cycle finished)
const STAGE_GATHERING: i32 = 1;
const STAGE_ANALYZING: i32 = 2;
const STAGE_SYNTHESIZING: i32 = 3;
const STAGE_COMPLETE: i32 = 4;

fn stage_name(stage: i32) -> &'static str {
    match stage {
        0 => "none",
        1 => "gathering",
        2 => "analyzing",
        3 => "synthesizing",
        4 => "complete",
        _ => "unknown",
    }
}

#[derive(Clone, Serialize, specta::Type)]
pub struct ResearchStatus {
    pub page_id: String,
    pub stage: i32,
    pub stage_name: String,
    pub title: String,
}

/// Start research mode on a page. Sets stage to "gathering".
#[tauri::command]
#[specta::specta]
pub async fn start_research(
    state: State<'_, AppState>,
    page_id: String,
    topic: Option<String>,
) -> Result<ResearchStatus, AppError> {
    let pid: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;

    let db = state.lock_db()?;
    let mut page = db.get_page(pid)?;

    // If a topic is provided and the page has no summary, set it
    if let Some(t) = topic {
        if page.summary.is_empty() {
            page.summary = t;
            db.update_page(&page)?;
        }
    }

    db.set_research_stage(pid, STAGE_GATHERING)?;

    Ok(ResearchStatus {
        page_id: page.id.to_string(),
        stage: STAGE_GATHERING,
        stage_name: stage_name(STAGE_GATHERING).into(),
        title: page.title,
    })
}

/// Advance research to the next stage. Each transition runs an LLM analysis
/// pass appropriate for that stage.
#[tauri::command]
#[specta::specta]
pub async fn advance_research(
    app: AppHandle,
    state: State<'_, AppState>,
    page_id: String,
) -> Result<ResearchStatus, AppError> {
    let pid: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;

    let (page, body, current_stage) = {
        let db = state.lock_db()?;
        let page = db.get_page(pid)?;
        let body = db.load_body(pid)?;
        let stage = page.research_stage;
        (page, body, stage)
    };

    let next_stage = match current_stage {
        s if s < STAGE_GATHERING => STAGE_GATHERING,
        STAGE_GATHERING => STAGE_ANALYZING,
        STAGE_ANALYZING => STAGE_SYNTHESIZING,
        STAGE_SYNTHESIZING => STAGE_COMPLETE,
        _ => return Err(AppError::Internal("research already complete".into())),
    };

    // Build prompt for this stage transition
    let prompt = match next_stage {
        STAGE_ANALYZING => format!(
            "Analyze the following note deeply. Identify key claims, evidence quality, \
             gaps in reasoning, and potential biases. Be specific and cite sections.\n\n\
             Title: {}\n\nContent:\n{}",
            page.title, body
        ),
        STAGE_SYNTHESIZING => format!(
            "Synthesize and consolidate the analysis of this note. Cross-reference claims, \
             identify tensions or contradictions, and produce a structured summary with \
             confidence levels for each major conclusion.\n\n\
             Title: {}\n\nContent:\n{}",
            page.title, body
        ),
        STAGE_COMPLETE => format!(
            "Produce a final research verdict for this note. Rate overall evidence quality \
             (A-F), list the 3 strongest and 3 weakest claims, and suggest concrete next \
             steps for further investigation.\n\n\
             Title: {}\n\nContent:\n{}",
            page.title, body
        ),
        _ => String::new(),
    };

    // Run LLM analysis if we have a prompt
    if !prompt.is_empty() {
        let (provider, _) = build_triaged_provider(&state, &prompt)?;
        let system = "You are Epistemos, a research-grade analytical engine. \
                      Provide rigorous, evidence-based analysis. Distinguish what is \
                      known from what is assumed. Rate confidence honestly.";

        let db_state = state.inner().clone();
        let app_clone = app.clone();
        let page_id_clone = page_id.clone();

        // Spawn analysis in background — emit result as event.
        // 5-minute timeout prevents hung LLM calls from blocking forever.
        tokio::spawn(async move {
            let result = tokio::time::timeout(
                std::time::Duration::from_secs(300),
                provider.generate(&prompt, Some(system), 4096),
            ).await;

            match result {
                Ok(Ok(response)) => {
                    if let Err(e) = app_clone.emit("research://analysis", serde_json::json!({
                        "page_id": page_id_clone,
                        "stage": next_stage,
                        "stage_name": stage_name(next_stage),
                        "analysis": response.text,
                    })) {
                        eprintln!("[research] failed to emit analysis event: {e}");
                    }

                    // Append analysis to page summary
                    match db_state.lock_db() {
                        Ok(db) => {
                            let separator = format!("\n\n---\n## {} Analysis\n\n", stage_name(next_stage));
                            if let Err(e) = db.set_page_summary(pid, &format!("{separator}{}", response.text)) {
                                eprintln!("[research] failed to persist analysis for page {pid}: {e}");
                            }
                        }
                        Err(e) => {
                            eprintln!("[research] failed to lock DB for page {pid}: {e}");
                        }
                    }
                }
                Ok(Err(e)) => {
                    let _ = app_clone.emit("research://error", serde_json::json!({
                        "page_id": page_id_clone,
                        "error": e.user_message(),
                    }));
                }
                Err(_) => {
                    let _ = app_clone.emit("research://error", serde_json::json!({
                        "page_id": page_id_clone,
                        "error": "Research analysis timed out after 5 minutes",
                    }));
                }
            }
        });
    }

    // Update stage in DB
    {
        let db = state.lock_db()?;
        db.set_research_stage(pid, next_stage)?;
    }

    Ok(ResearchStatus {
        page_id: page.id.to_string(),
        stage: next_stage,
        stage_name: stage_name(next_stage).into(),
        title: page.title,
    })
}

/// Get the current research status for a page.
#[tauri::command]
#[specta::specta]
pub async fn get_research_status(
    state: State<'_, AppState>,
    page_id: String,
) -> Result<ResearchStatus, AppError> {
    let pid: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    let db = state.lock_db()?;
    let page = db.get_page(pid)?;

    Ok(ResearchStatus {
        page_id: page.id.to_string(),
        stage: page.research_stage,
        stage_name: stage_name(page.research_stage).into(),
        title: page.title,
    })
}
