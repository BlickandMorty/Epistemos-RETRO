use tauri::{AppHandle, Emitter, State};
use storage::ids::ChatId;
use storage::types::{Chat, Message};
use crate::error::AppError;
use crate::state::AppState;
use super::parse_id;

use engine::chat_context;
use engine::citations;
use engine::cost::TokenUsage;
use engine::llm::LlmProviderType;
use engine::orchestrator::{self, PipelineContext};
use engine::pipeline::PipelineEvent;
use engine::query_analyzer;
use engine::signals;
use serde::Serialize;

use super::graph::build_triaged_provider;

#[derive(Clone, Serialize, specta::Type)]
pub struct StreamChunk {
    pub chat_id: String,
    pub text: String,
    pub done: bool,
}

#[derive(Clone, Serialize, specta::Type)]
pub struct PipelineStageEvent {
    pub chat_id: String,
    pub stage: String,
    pub status: String,
    pub detail: String,
}

#[derive(Clone, Serialize, specta::Type)]
pub struct CitationEvent {
    pub title: String,
    pub doi: Option<String>,
    pub url: Option<String>,
    pub source: String,
}

#[derive(Clone, Serialize, specta::Type)]
pub struct TriageEvent {
    pub provider: String,
    pub tier: String,
}

#[tauri::command]
#[specta::specta]
pub async fn create_chat(state: State<'_, AppState>, title: Option<String>) -> Result<Chat, AppError> {
    let chat = Chat::new(title.unwrap_or_else(|| "New Chat".into()));
    let db = state.lock_db()?;
    db.insert_chat(&chat)?;
    Ok(chat)
}

#[tauri::command]
#[specta::specta]
pub async fn list_chats(state: State<'_, AppState>) -> Result<Vec<Chat>, AppError> {
    let db = state.lock_db()?;
    Ok(db.list_chats()?)
}

#[tauri::command]
#[specta::specta]
pub async fn get_messages(state: State<'_, AppState>, chat_id: String) -> Result<Vec<Message>, AppError> {
    let id: ChatId = parse_id(&chat_id)?;
    let db = state.lock_db()?;
    Ok(db.get_messages_for_chat(id)?)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_chat(state: State<'_, AppState>, chat_id: String) -> Result<(), AppError> {
    let id: ChatId = parse_id(&chat_id)?;
    let db = state.lock_db()?;
    db.delete_chat(id)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn submit_query(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_id: String,
    query: String,
) -> Result<(), AppError> {
    let id: ChatId = parse_id(&chat_id)?;

    // ── Vault briefing mode ──────────────────────────────────
    let is_briefing = chat_context::is_vault_briefing(&query);
    let effective_query = if is_briefing {
        chat_context::VAULT_BRIEFING_QUERY.to_string()
    } else {
        query.clone()
    };

    // ── @-mention resolution ─────────────────────────────────
    let (mentions, cleaned_query) = chat_context::parse_mentions(&effective_query);
    let mut mentioned_notes = Vec::new();

    if !mentions.is_empty() {
        let db = state.lock_db()?;
        for mention in &mentions {
            let pages = db.search_pages_by_title(&mention.title)?;
            for page in pages {
                let body = db.load_body(page.id)?;
                mentioned_notes.push(chat_context::ResolvedNote {
                    page_id: page.id.to_string(),
                    title: page.title.clone(),
                    body,
                });
            }
        }
    }

    // ── Notes context (manifest + mentions) ──────────────────
    let vault_manifest = {
        let db = state.lock_db()?;
        let pages = db.list_pages()?;
        if pages.is_empty() {
            None
        } else {
            let manifest_lines: Vec<String> = pages.iter()
                .filter(|p| !p.is_archived)
                .take(50) // cap for token budget
                .map(|p| {
                    let tags = if p.tags.is_empty() {
                        String::new()
                    } else {
                        format!(" [{}]", p.tags.join(", "))
                    };
                    format!("- {}{}", p.title, tags)
                })
                .collect();
            Some(format!("Your vault contains {} notes:\n{}", pages.len(), manifest_lines.join("\n")))
        }
    };
    let notes_context = chat_context::build_notes_context(
        vault_manifest.as_deref(),
        &mentioned_notes,
        &[],
    );

    // ── Conversation history ─────────────────────────────────
    let conversation_history = {
        let db = state.lock_db()?;
        let messages = db.get_messages_for_chat(id)?;
        let history_msgs: Vec<_> = messages.into_iter()
            .map(|m| chat_context::HistoryMessage {
                role: m.role,
                content: m.content,
            })
            .collect();
        chat_context::build_conversation_history(&history_msgs, 10, 2000)
    };

    // Store user message (after reading history, before pipeline)
    let user_msg = Message::new(id, "user".into(), query.clone());
    {
        let db = state.lock_db()?;
        db.insert_message(&user_msg)?;
    }

    // ── Budget enforcement ─────────────────────────────────
    // Check BEFORE making any LLM calls — macOS does the same.
    {
        if let Ok(ct) = state.lock_cost_tracker() {
            if ct.budget_exceeded() {
                return Err(AppError::Internal(
                    "Daily spending budget exceeded. Increase your budget in Settings or wait until tomorrow.".into()
                ));
            }
        }
    }

    // Build LLM provider via triage routing (NPU → GPU → Cloud)
    let (provider, provider_name) = build_triaged_provider(&state, &cleaned_query)?;
    let tier = if provider_name.contains("foundry") { "npu" }
        else if provider_name.contains("ollama") { "gpu" }
        else { "cloud" };
    let _ = app.emit("pipeline://triage", TriageEvent {
        provider: provider_name.clone(),
        tier: tier.to_string(),
    });
    let provider_type = LlmProviderType::from_settings_name(&provider_name);
    let model_name = {
        let db = state.lock_db()?;
        db.get_setting("inference_config")
            .ok()
            .flatten()
            .and_then(|s| serde_json::from_str::<storage::types::InferenceConfig>(&s).ok())
            .map(|c| c.model)
            .unwrap_or_else(|| "unknown".into())
    };

    // Run query analysis (pure Rust, no LLM)
    let qa = query_analyzer::analyze(&cleaned_query, None);
    let controls = signals::PipelineControls::default();
    let sigs = signals::generate(&qa, &controls, None);

    // Emit initial signals
    let _ = app.emit("pipeline://signals", serde_json::to_value(&sigs).unwrap_or_default());

    // Cancel any previous enrichment pipeline.
    // Extract old token under lock, cancel OUTSIDE lock to avoid holding
    // the mutex during potentially slow cancellation propagation.
    let cancel_token = {
        use tokio_util::sync::CancellationToken;
        let new_token = CancellationToken::new();
        let old_token = if let Ok(mut guard) = state.enrichment_cancel.lock() {
            let old = guard.take();
            *guard = Some(new_token.clone());
            old
        } else {
            None
        };
        if let Some(old) = old_token {
            old.cancel();
        }
        new_token
    };

    // Build pipeline context
    let pipeline_ctx = PipelineContext {
        conversation_history,
        notes_context,
    };

    // Create broadcast channel for pipeline events
    let (tx, mut rx) = orchestrator::channel();

    // Spawn event forwarder: broadcast → Tauri events
    // Consolidate clones for the spawned task boundary
    let app_fwd = app.clone();
    let chat_id_fwd = chat_id;
    let db_state = state.inner().clone();
    let provider_for_title = provider.clone();
    let cost_provider_type = provider_type;
    let cost_model_name = model_name;
    let query_for_cost = query;

    state.spawn_tracked("pipeline_forward", async move {
        let mut full_response = String::new();
        let mut is_first_chat = false;

        while let Ok(event) = rx.recv().await {
            match event {
                PipelineEvent::StageAdvanced(result) => {
                    let _ = app_fwd.emit("pipeline://stage", PipelineStageEvent {
                        chat_id: chat_id_fwd.clone(),
                        stage: result.stage.display_name().into(),
                        status: format!("{:?}", result.status),
                        detail: result.detail,
                    });
                }
                PipelineEvent::TextDelta(text) => {
                    full_response.push_str(&text);
                    let _ = app_fwd.emit("chat-stream", StreamChunk {
                        chat_id: chat_id_fwd.clone(),
                        text,
                        done: false,
                    });
                }
                PipelineEvent::DeliberationDelta(text) => {
                    let _ = app_fwd.emit("pipeline://deliberation", StreamChunk {
                        chat_id: chat_id_fwd.clone(),
                        text,
                        done: false,
                    });
                }
                PipelineEvent::SignalUpdate(update) => {
                    let _ = app_fwd.emit("pipeline://signals", serde_json::to_value(&update).unwrap_or_default());
                }
                PipelineEvent::Completed(data) => {
                    // Done streaming — emit done marker
                    let _ = app_fwd.emit("chat-stream", StreamChunk {
                        chat_id: chat_id_fwd.clone(),
                        text: String::new(),
                        done: true,
                    });

                    // ── Vault action execution ───────────────────
                    let response_to_persist = if !full_response.is_empty() {
                        let (actions, cleaned) = chat_context::parse_vault_actions(&full_response);
                        if !actions.is_empty() {
                            execute_vault_actions(&db_state, &actions);
                        }
                        if cleaned != full_response {
                            // Emit the cleaned response (action markers removed)
                            let _ = app_fwd.emit("chat-stream-replace", StreamChunk {
                                chat_id: chat_id_fwd.clone(),
                                text: cleaned.clone(),
                                done: true,
                            });
                        }
                        cleaned
                    } else {
                        full_response.clone()
                    };

                    // Persist assistant message — critical for conversation history
                    if !response_to_persist.is_empty() {
                        let assistant_msg = Message::new(id, "assistant".into(), response_to_persist.clone());
                        if let Ok(db) = db_state.lock_db() {
                            if let Err(e) = db.insert_message(&assistant_msg) {
                                eprintln!("[chat] CRITICAL: failed to persist assistant message: {e}");
                                let _ = app_fwd.emit("pipeline://error",
                                    &format!("Warning: response may not be saved to history ({e})"));
                            }
                        } else {
                            eprintln!("[chat] CRITICAL: db lock failed when persisting assistant message");
                        }
                    }

                    // ── Cost recording (Pass 1 — estimate from text length) ──
                    {
                        // ~4 chars per token is a reasonable heuristic for English
                        let est_output = (full_response.len() as u32) / 4;
                        let est_input = (query_for_cost.len() as u32) / 4 + 500; // query + system prompt overhead
                        let usage = TokenUsage {
                            input_tokens: est_input,
                            output_tokens: est_output,
                            provider: cost_provider_type.clone(),
                            model: cost_model_name.clone(),
                        };
                        if let Ok(mut ct) = db_state.lock_cost_tracker() {
                            ct.record(&usage);
                            if let Ok(json) = ct.to_json() {
                                drop(ct);
                                if let Ok(db) = db_state.lock_db() {
                                    let _ = db.set_setting("cost_tracker", &json);
                                }
                            }
                        }
                    }

                    // ── Citation extraction ──────────────────────
                    let extracted = citations::extract(&full_response, "chat");
                    if !extracted.is_empty() {
                        let _ = app_fwd.emit("pipeline://citations", &citation_events(&extracted));
                    }

                    // Emit concepts
                    if !data.concepts.is_empty() {
                        let _ = app_fwd.emit("pipeline://concepts", &data.concepts);
                    }

                    // Check if this is the first exchange (for title generation)
                    if let Ok(db) = db_state.lock_db() {
                        if let Ok(chat) = db.get_chat(id) {
                            is_first_chat = chat.title == "New Chat" || chat.title.is_empty();
                        }
                    }
                }
                PipelineEvent::Enriched(data) => {
                    // Emit full enrichment result
                    let _ = app_fwd.emit("pipeline://enriched", serde_json::to_value(&*data).unwrap_or_default());

                    // Persist full enrichment metadata on the assistant message
                    let confidence = data.truth_assessment.overall_truth_likelihood;
                    let grade = chat_context::grade_from_confidence(confidence);
                    if let (Ok(dual_json), Ok(truth_json)) = (
                        serde_json::to_string(&data.dual_message),
                        serde_json::to_string(&data.truth_assessment),
                    ) {
                        if let Ok(db) = db_state.lock_db() {
                            if let Err(e) = db.update_message_enrichment(
                                id, &dual_json, &truth_json, confidence, grade,
                            ) {
                                eprintln!("[chat] failed to persist enrichment metadata: {e}");
                            }
                        }
                    }

                    // Extract citations from deep analysis too
                    let extracted = citations::extract(&data.dual_message.raw_analysis, "research");
                    if !extracted.is_empty() {
                        let _ = app_fwd.emit("pipeline://citations", &citation_events(&extracted));
                    }

                    // ── Cost recording (Pass 2/3 — estimate from enrichment text) ──
                    {
                        let analysis_len = data.dual_message.raw_analysis.len();
                        let est_output = (analysis_len as u32) / 4;
                        // Pass 2+3 send full context + response for enrichment
                        let est_input = est_output + 1000;
                        let usage = TokenUsage {
                            input_tokens: est_input,
                            output_tokens: est_output,
                            provider: cost_provider_type.clone(),
                            model: cost_model_name.clone(),
                        };
                        if let Ok(mut ct) = db_state.lock_cost_tracker() {
                            ct.record(&usage);
                            if let Ok(json) = ct.to_json() {
                                drop(ct);
                                if let Ok(db) = db_state.lock_db() {
                                    let _ = db.set_setting("cost_tracker", &json);
                                }
                            }
                        }
                    }

                    let _ = app_fwd.emit("pipeline://stage", PipelineStageEvent {
                        chat_id: chat_id_fwd.clone(),
                        stage: "complete".into(),
                        status: "completed".into(),
                        detail: "enrichment complete".into(),
                    });
                }
                PipelineEvent::Soar(soar_event) => {
                    let _ = app_fwd.emit("pipeline://soar", serde_json::to_value(&soar_event).unwrap_or_default());
                }
                PipelineEvent::Error(msg) => {
                    let _ = app_fwd.emit("pipeline://error", &msg);
                }
            }
        }

        // ── Auto title generation (after pipeline completes) ─
        if is_first_chat {
            generate_chat_title(
                &app_fwd,
                &provider_for_title,
                &query_for_cost,
                &chat_id_fwd,
                &db_state,
            ).await;
        }
    });

    // Run the full 3-pass pipeline (spawn_tracked, NOT JS workers)
    let query_owned = cleaned_query;
    state.spawn_tracked("pipeline_run", async move {
        orchestrator::run_with_context(tx, provider, &query_owned, &qa, &sigs, &controls, pipeline_ctx, cancel_token).await;
    });

    Ok(())
}

/// Execute a SOAR teaching stone by running its prompt through the LLM.
///
/// The frontend calls this when the user clicks a stone. Streams the
/// LLM response back as `chat-stream` events tagged with the chat_id.
#[tauri::command]
#[specta::specta]
pub async fn run_soar_stone(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_id: String,
    stone_prompt: String,
) -> Result<(), AppError> {
    use futures::StreamExt;

    let (provider, _) = build_triaged_provider(&state, &stone_prompt)?;

    let system = "You are Epistemos, a research-grade analytical engine. \
                  The user is exploring a teaching stone — a guided learning step \
                  designed to deepen understanding. Be clear, rigorous, and educational. \
                  Use concrete examples. Acknowledge uncertainty honestly.";

    // Cancel any previous SOAR stone task before starting a new one.
    let cancel_token = {
        use tokio_util::sync::CancellationToken;
        let new_token = CancellationToken::new();
        if let Ok(mut guard) = state.soar_cancel.lock() {
            if let Some(old) = guard.take() {
                old.cancel();
            }
            *guard = Some(new_token.clone());
        }
        new_token
    };

    let app_clone = app.clone();
    let chat_id_clone = chat_id.clone();

    state.spawn_tracked("soar_stone", async move {
        match provider.stream(&stone_prompt, Some(system), 4096).await {
            Ok(mut stream) => {
                loop {
                    tokio::select! {
                        chunk = stream.next() => {
                            match chunk {
                                Some(Ok(text)) if !text.is_empty() => {
                                    let _ = app_clone.emit("chat-stream", StreamChunk {
                                        chat_id: chat_id_clone.clone(),
                                        text,
                                        done: false,
                                    });
                                }
                                Some(Err(e)) => {
                                    let _ = app_clone.emit("pipeline://error", &e.user_message());
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
                let _ = app_clone.emit("chat-stream", StreamChunk {
                    chat_id: chat_id_clone,
                    text: String::new(),
                    done: true,
                });
            }
            Err(e) => {
                let _ = app_clone.emit("pipeline://error", &e.user_message());
            }
        }
    });

    Ok(())
}

/// Cancel the currently running enrichment pipeline (Passes 2+3).
///
/// Called from the frontend abort button. Pass 1 streaming may already
/// be complete, but this ensures background enrichment stops immediately.
#[tauri::command]
#[specta::specta]
pub async fn cancel_query(state: State<'_, AppState>) -> Result<(), AppError> {
    let old_token = if let Ok(mut guard) = state.enrichment_cancel.lock() {
        guard.take()
    } else {
        None
    };
    if let Some(token) = old_token {
        token.cancel();
    }
    Ok(())
}

// ── Helpers ──────────────────────────────────────────────────────────

/// Convert extracted citations to CitationEvent payloads.
fn citation_events(extracted: &[citations::ExtractedCitation]) -> Vec<CitationEvent> {
    extracted.iter().map(|c| CitationEvent {
        title: c.title.clone(),
        doi: c.doi.clone(),
        url: c.url.clone(),
        source: c.source.clone(),
    }).collect()
}

/// Execute parsed vault actions against the database.
fn execute_vault_actions(state: &AppState, actions: &[chat_context::VaultAction]) {
    let Ok(db) = state.lock_db() else { return; };
    for action in actions {
        match action {
            chat_context::VaultAction::Tag(tags) => {
                // Tag the most recently updated page
                if let Ok(pages) = db.list_pages() {
                    if let Some(page) = pages.first() {
                        let mut updated = page.clone();
                        let new_tags: Vec<_> = tags.iter()
                            .filter(|t| !updated.tags.contains(t))
                            .cloned()
                            .collect();
                        updated.tags.extend(new_tags);
                        let _ = db.update_page(&updated);
                    }
                }
            }
            chat_context::VaultAction::Create(title) => {
                let page = storage::types::Page::new(title.clone());
                let _ = db.insert_page(&page);
            }
            chat_context::VaultAction::Move(_folder_name) => {
                // Move requires folder lookup — deferred until folder system is more mature
            }
        }
    }
}

/// Generate an LLM-powered chat title and persist it.
async fn generate_chat_title(
    app: &AppHandle,
    provider: &std::sync::Arc<dyn engine::llm::LlmProvider>,
    query: &str,
    chat_id: &str,
    state: &AppState,
) {
    let (prompt, system) = chat_context::title_generation_prompt(query);

    match provider.generate(&prompt, Some(system), 30).await {
        Ok(response) => {
            if let Some(title) = chat_context::clean_title(&response.text) {
                // Persist the title
                if let Ok(cid) = chat_id.parse::<ChatId>() {
                    if let Ok(db) = state.lock_db() {
                        let _ = db.update_chat_title(cid, &title);
                    }
                }
                // Notify frontend
                let _ = app.emit("chat-title-update", serde_json::json!({
                    "chat_id": chat_id,
                    "title": title,
                }));
            }
        }
        Err(_) => {
            // Title generation is best-effort — don't fail the pipeline
        }
    }
}
