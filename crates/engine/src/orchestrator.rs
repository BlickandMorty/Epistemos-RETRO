//! 3-pass pipeline orchestrator.
//!
//! Coordinates Pass 1 (streaming), Pass 2 (epistemic lens), and Pass 3 (consolidated JSON).
//! Uses `tokio::broadcast` so multiple subscribers receive pipeline events.
//!
//! Architecture:
//! - Pass 1 streams immediately (user sees answer in real time)
//! - Passes 2+3 run concurrently in background (survive Pass 1 cancellation)
//! - Fallbacks fire if any pass fails or times out

use std::sync::Arc;
use std::time::Duration;
use futures::StreamExt;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

use crate::llm::LlmProvider;
use crate::pipeline::*;
use crate::prompts;
use crate::query_analyzer::QueryAnalysis;
use crate::signals::{GeneratedSignals, PipelineControls};
use crate::soar;

/// Timeouts matching macOS pipeline.
const PASS2_TIMEOUT: Duration = Duration::from_secs(180);
const PASS3_TIMEOUT: Duration = Duration::from_secs(300);

/// Pipeline event sender. Clone and subscribe for multiple consumers.
pub type PipelineTx = broadcast::Sender<PipelineEvent>;

/// Create a new pipeline event channel.
pub fn channel() -> (PipelineTx, broadcast::Receiver<PipelineEvent>) {
    broadcast::channel(256)
}

/// Optional context injected into the pipeline from the chat coordinator.
#[derive(Debug, Clone, Default)]
pub struct PipelineContext {
    /// Conversation history (formatted prior turns).
    pub conversation_history: Option<String>,
    /// Notes/vault context (resolved @-mentions, manifest).
    pub notes_context: Option<String>,
}

/// Run the full 3-pass pipeline.
///
/// Pass 1 streams the direct answer. When it completes, Pass 2 and Pass 3
/// run concurrently in the background. All events are sent through `tx`.
///
/// This function returns after Pass 1 completes. Passes 2-3 continue
/// in spawned tasks and emit Enriched or Error events when done.
pub async fn run(
    tx: PipelineTx,
    provider: Arc<dyn LlmProvider>,
    query: &str,
    qa: &QueryAnalysis,
    sigs: &GeneratedSignals,
    controls: &PipelineControls,
) {
    run_with_context(tx, provider, query, qa, sigs, controls, PipelineContext::default(), CancellationToken::new()).await;
}

/// Run the full 3-pass pipeline with optional conversation/notes context.
///
/// The `cancel` token can abort background enrichment (Pass 2/3) when a new
/// query supersedes this one. Pass 1 streaming is NOT cancelled — the user
/// already saw the answer.
#[allow(clippy::too_many_arguments)]
pub async fn run_with_context(
    tx: PipelineTx,
    provider: Arc<dyn LlmProvider>,
    query: &str,
    qa: &QueryAnalysis,
    sigs: &GeneratedSignals,
    controls: &PipelineControls,
    ctx: PipelineContext,
    cancel: CancellationToken,
) {
    // ── 10-stage visual pipeline ─────────────────────────────
    emit_stages(&tx, qa.complexity, &sigs.mode);

    // ── Pass 1: Streaming direct answer ──────────────────────
    let system_prompt = prompts::pass1_system_prompt(qa, sigs);
    let mut user_prompt = prompts::pass1_user_prompt(query, sigs, controls);

    // Inject conversation history before the query
    if let Some(history) = &ctx.conversation_history {
        user_prompt = format!(
            "## Conversation History\n\n{history}\n\n---\n\n{user_prompt}"
        );
    }

    // Inject notes context
    if let Some(notes) = &ctx.notes_context {
        user_prompt = format!(
            "## Vault Context\n\n{notes}\n\n---\n\n{user_prompt}"
        );
    }

    let mut direct_answer = String::new();

    match provider.stream(&user_prompt, Some(&system_prompt), 4096).await {
        Ok(mut stream) => {
            let mut in_thinking = false;

            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(text) => {
                        if text.is_empty() {
                            continue;
                        }

                        // Parse <thinking> tags
                        if text.contains("<thinking>") {
                            in_thinking = true;
                        }
                        if text.contains("</thinking>") {
                            in_thinking = false;
                            continue;
                        }

                        direct_answer.push_str(&text);

                        if in_thinking {
                            let _ = tx.send(PipelineEvent::DeliberationDelta(text));
                        } else {
                            let _ = tx.send(PipelineEvent::TextDelta(text));
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(PipelineEvent::Error(e.user_message()));
                        return;
                    }
                }
            }
        }
        Err(e) => {
            let _ = tx.send(PipelineEvent::Error(e.user_message()));
            return;
        }
    }

    // Guard: reject empty or trivially short responses (matches macOS ≥10 chars)
    if direct_answer.trim().len() < 10 {
        let _ = tx.send(PipelineEvent::Error(
            "No response received — check your API key in Settings.".into()
        ));
        return;
    }

    // Extract [CONCEPTS: ...] tag if present
    let concepts = extract_concepts(&direct_answer);

    // Emit Pass 1 completion
    let _ = tx.send(PipelineEvent::Completed(CompletedData {
        direct_answer: direct_answer.clone(),
        concepts,
    }));

    // ── SOAR: Probe learnability after Pass 1 ──────────────
    let probe = soar::probe_learnability(qa, sigs);
    let at_edge = probe.at_edge;
    let _ = tx.send(PipelineEvent::Soar(soar::SoarEvent::ProbeComplete(probe)));

    if at_edge {
        let session = soar::build_session(qa, sigs);
        let _ = tx.send(PipelineEvent::Soar(soar::SoarEvent::TeachingStart {
            stone_count: session.stones.len(),
        }));
        for (i, stone) in session.stones.iter().enumerate() {
            let _ = tx.send(PipelineEvent::Soar(soar::SoarEvent::StonePresented {
                index: i,
                stone: stone.clone(),
            }));
        }
    }

    // ── Passes 2+3: Background enrichment ────────────────────
    // Clone what the background tasks need
    let tx2 = tx.clone();
    let provider2 = provider.clone();
    let query_owned = query.to_string();
    let qa_clone = qa.clone();
    let sigs_clone = sigs.clone();

    tokio::spawn(async move {
        // Check cancellation before starting expensive enrichment
        if cancel.is_cancelled() {
            return;
        }

        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                // New query superseded this one — abort enrichment silently
            }
            enriched = run_enrichment(
                &tx2,
                &provider2,
                &query_owned,
                &direct_answer,
                &qa_clone,
                &sigs_clone,
            ) => {
                match enriched {
                    Ok(data) => {
                        let _ = tx2.send(PipelineEvent::Enriched(Box::new(data)));
                    }
                    Err(msg) => {
                        // Fallback: generate signal-derived results
                        let dual = DualMessage {
                            raw_analysis: String::new(),
                            epistemic_tags: EpistemicTagCounts::default(),
                            layman_summary: Some(fallback_layman_summary(&qa_clone, &sigs_clone)),
                            reflection: Some(fallback_reflection(&sigs_clone)),
                            arbitration: Some(fallback_arbitration(&sigs_clone)),
                        };
                        let truth = fallback_truth_assessment(&sigs_clone);

                        let _ = tx2.send(PipelineEvent::Error(msg));
                        let _ = tx2.send(PipelineEvent::Enriched(Box::new(EnrichedData {
                            dual_message: dual,
                            truth_assessment: truth,
                        })));
                    }
                }
            }
        }
    });
}

/// Run Pass 2 + Pass 3 sequentially (Pass 3 depends on Pass 2 output).
async fn run_enrichment(
    tx: &PipelineTx,
    provider: &Arc<dyn LlmProvider>,
    query: &str,
    direct_answer: &str,
    qa: &QueryAnalysis,
    sigs: &GeneratedSignals,
) -> Result<EnrichedData, String> {
    // ── Pass 2: Epistemic Lens ───────────────────────────────
    let _ = tx.send(PipelineEvent::StageAdvanced(StageResult {
        stage: PipelineStage::Synthesis,
        status: StageStatus::Running,
        detail: "Running epistemic lens analysis (Pass 2)…".into(),
    }));

    let pass2_system = prompts::pass2_system_prompt(qa, sigs);
    let pass2_user = prompts::pass2_user_prompt(query, direct_answer);

    let raw_analysis = match tokio::time::timeout(
        PASS2_TIMEOUT,
        provider.generate(&pass2_user, Some(&pass2_system), 6000),
    ).await {
        Ok(Ok(response)) => response.text,
        Ok(Err(e)) => return Err(format!("Pass 2 LLM error: {}", e.user_message())),
        Err(_) => return Err("Pass 2 timed out (180s)".into()),
    };

    // Count epistemic tags in the analysis
    let tags = EpistemicTagCounts::from_text(&raw_analysis);

    // ── Pass 3: Consolidated JSON ────────────────────────────
    let _ = tx.send(PipelineEvent::StageAdvanced(StageResult {
        stage: PipelineStage::Calibration,
        status: StageStatus::Running,
        detail: "Generating consolidated assessment (Pass 3)…".into(),
    }));

    let pass3_system = prompts::pass3_system_prompt(qa, sigs, &tags);
    let pass3_user = prompts::pass3_user_prompt(query, &raw_analysis);

    let pass3_text = match tokio::time::timeout(
        PASS3_TIMEOUT,
        provider.generate(&pass3_user, Some(&pass3_system), 4000),
    ).await {
        Ok(Ok(response)) => response.text,
        Ok(Err(e)) => return Err(format!("Pass 3 LLM error: {}", e.user_message())),
        Err(_) => return Err("Pass 3 timed out (300s)".into()),
    };

    // Parse consolidated JSON
    let consolidated = parse_consolidated(&pass3_text)?;

    // Apply calibration rules to truth assessment
    let mut truth = consolidated.truth_assessment;
    truth.apply_calibration_rules(consolidated.arbitration.as_ref(), &tags);

    Ok(EnrichedData {
        dual_message: DualMessage {
            raw_analysis,
            epistemic_tags: tags,
            layman_summary: consolidated.layman_summary,
            reflection: consolidated.reflection,
            arbitration: consolidated.arbitration,
        },
        truth_assessment: truth,
    })
}

// ── Helpers ──────────────────────────────────────────────────────────

/// Extract [CONCEPTS: a, b, c] from LLM response.
fn extract_concepts(text: &str) -> Vec<String> {
    if let Some(start) = text.find("[CONCEPTS:") {
        if let Some(end) = text[start..].find(']') {
            let inner = &text[start + 10..start + end];
            return inner
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        }
    }
    Vec::new()
}

/// Emit all 10 pipeline stages with generated details.
fn emit_stages(tx: &PipelineTx, complexity: f64, mode: &crate::signals::AnalysisMode) {
    for stage in PipelineStage::ALL {
        let detail = stage_detail(stage, complexity, mode);

        // Running state
        let _ = tx.send(PipelineEvent::StageAdvanced(StageResult {
            stage,
            status: StageStatus::Running,
            detail: detail.clone(),
        }));

        // Completed state
        let _ = tx.send(PipelineEvent::StageAdvanced(StageResult {
            stage,
            status: StageStatus::Completed,
            detail,
        }));
    }
}

/// Intermediate structure for parsing Pass 3 consolidated JSON.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConsolidatedJson {
    layman_summary: Option<LaymanSummaryJson>,
    reflection: Option<ReflectionResult>,
    arbitration: Option<ArbitrationResult>,
    truth_assessment: Option<TruthAssessment>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaymanSummaryJson {
    what_was_tried: Option<SummarySection>,
    what_is_likely_true: Option<SummarySection>,
    confidence_explanation: Option<SummarySection>,
    what_could_change: Option<SummarySection>,
    who_should_trust: Option<SummarySection>,
}

#[derive(Debug)]
struct ParsedConsolidated {
    layman_summary: Option<LaymanSummary>,
    reflection: Option<ReflectionResult>,
    arbitration: Option<ArbitrationResult>,
    truth_assessment: TruthAssessment,
}

/// Parse the Pass 3 consolidated JSON response.
fn parse_consolidated(text: &str) -> Result<ParsedConsolidated, String> {
    let cleaned = strip_markdown_fences(text);

    let json: ConsolidatedJson = serde_json::from_str(&cleaned)
        .map_err(|e| format!("Pass 3 JSON parse error: {e}"))?;

    let layman_summary = json.layman_summary.map(|ls| LaymanSummary {
        what_was_tried: ls.what_was_tried.unwrap_or(SummarySection {
            label: "Approach".into(),
            content: String::new(),
        }),
        what_is_likely_true: ls.what_is_likely_true.unwrap_or(SummarySection {
            label: "Likely true".into(),
            content: String::new(),
        }),
        confidence_explanation: ls.confidence_explanation.unwrap_or(SummarySection {
            label: "Confidence".into(),
            content: String::new(),
        }),
        what_could_change: ls.what_could_change.unwrap_or(SummarySection {
            label: "Could change".into(),
            content: String::new(),
        }),
        who_should_trust: ls.who_should_trust.unwrap_or(SummarySection {
            label: "Who should trust".into(),
            content: String::new(),
        }),
    });

    let truth_assessment = json.truth_assessment.unwrap_or(TruthAssessment {
        signal_interpretation: String::new(),
        overall_truth_likelihood: 0.51,
        weaknesses: vec![],
        improvements: vec![],
        blind_spots: vec![],
        confidence_calibration: String::new(),
        data_vs_model_balance: String::new(),
        recommended_actions: vec![],
    });

    Ok(ParsedConsolidated {
        layman_summary,
        reflection: json.reflection,
        arbitration: json.arbitration,
        truth_assessment,
    })
}

/// Strip markdown code fences from LLM JSON output.
fn strip_markdown_fences(s: &str) -> String {
    let trimmed = s.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        if let Some(inner) = rest.strip_suffix("```") {
            return inner.trim().to_string();
        }
    }
    if let Some(rest) = trimmed.strip_prefix("```") {
        if let Some(inner) = rest.strip_suffix("```") {
            return inner.trim().to_string();
        }
    }
    trimmed.to_string()
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_concepts_basic() {
        let text = "Here is the analysis. [CONCEPTS: quantum mechanics, consciousness, free will] More text.";
        let concepts = extract_concepts(text);
        assert_eq!(concepts, vec!["quantum mechanics", "consciousness", "free will"]);
    }

    #[test]
    fn extract_concepts_none() {
        assert!(extract_concepts("no concepts here").is_empty());
    }

    #[test]
    fn strip_fences_json() {
        assert_eq!(strip_markdown_fences("```json\n{\"a\":1}\n```"), "{\"a\":1}");
    }

    #[test]
    fn strip_fences_plain() {
        assert_eq!(strip_markdown_fences("```\n{\"a\":1}\n```"), "{\"a\":1}");
    }

    #[test]
    fn strip_fences_none() {
        assert_eq!(strip_markdown_fences("{\"a\":1}"), "{\"a\":1}");
    }

    #[test]
    fn parse_consolidated_basic() {
        let json = r#"{
            "laymanSummary": {
                "whatWasTried": {"label": "Approach", "content": "We analyzed..."},
                "whatIsLikelyTrue": {"label": "Findings", "content": "The evidence suggests..."},
                "confidenceExplanation": {"label": "Confidence", "content": "Moderate..."},
                "whatCouldChange": {"label": "Limitations", "content": "New data..."},
                "whoShouldTrust": {"label": "Relevance", "content": "Researchers..."}
            },
            "reflection": {
                "selfCriticalQuestions": ["Is this robust?"],
                "adjustments": ["Claim X → lowered confidence → insufficient replication"],
                "leastDefensibleClaim": "Effect size estimate",
                "precisionVsEvidenceCheck": "Moderate precision, limited evidence"
            },
            "arbitration": {
                "consensus": true,
                "votes": [
                    {"engine": "statistical", "position": "supports", "reasoning": "Strong p-values", "confidence": 0.8}
                ],
                "disagreements": [],
                "resolution": "Engines agree"
            },
            "truthAssessment": {
                "signalInterpretation": "Evidence points toward...",
                "overallTruthLikelihood": 0.72,
                "weaknesses": ["Small sample"],
                "improvements": ["Larger RCT needed"],
                "blindSpots": ["Cultural bias"],
                "confidenceCalibration": "Anchored at probable range",
                "dataVsModelBalance": "60% data, 30% model, 10% heuristic",
                "recommendedActions": ["[INVESTIGATE] Replicate study"]
            }
        }"#;

        let result = parse_consolidated(json).expect("parse");
        assert!(result.layman_summary.is_some());
        assert!(result.reflection.is_some());
        assert!(result.arbitration.is_some());
        assert!((result.truth_assessment.overall_truth_likelihood - 0.72).abs() < 0.01);
    }

    #[test]
    fn parse_consolidated_missing_sections() {
        let json = r#"{"truthAssessment": {"overallTruthLikelihood": 0.55}}"#;
        let result = parse_consolidated(json).expect("parse partial");
        assert!(result.layman_summary.is_none());
        assert!(result.reflection.is_none());
        assert!((result.truth_assessment.overall_truth_likelihood - 0.55).abs() < 0.01);
    }

    // ── Additional JSON parsing edge cases ──

    #[test]
    fn parse_consolidated_with_markdown_fences() {
        let json = "```json\n{\"truthAssessment\": {\"overallTruthLikelihood\": 0.73}}\n```";
        let result = parse_consolidated(json).expect("should strip fences and parse");
        assert!((result.truth_assessment.overall_truth_likelihood - 0.73).abs() < 0.01);
    }

    #[test]
    fn parse_consolidated_with_extra_whitespace() {
        let json = "\n\n  {\"truthAssessment\": {\"overallTruthLikelihood\": 0.61}}  \n\n";
        let result = parse_consolidated(json).expect("should handle whitespace");
        assert!((result.truth_assessment.overall_truth_likelihood - 0.61).abs() < 0.01);
    }

    #[test]
    fn parse_consolidated_full_layman_summary() {
        let json = r#"{
            "laymanSummary": {
                "whatWasTried": {"label": "Approach", "content": "We tested..."},
                "whatIsLikelyTrue": {"label": "Likely", "content": "Evidence shows..."},
                "confidenceExplanation": {"label": "Confidence", "content": "High..."},
                "whatCouldChange": {"label": "Changes", "content": "New studies..."},
                "whoShouldTrust": {"label": "Trust", "content": "Researchers..."}
            },
            "truthAssessment": {"overallTruthLikelihood": 0.85}
        }"#;
        let result = parse_consolidated(json).expect("full summary");
        let summary = result.layman_summary.expect("should have summary");
        assert_eq!(summary.what_was_tried.label, "Approach");
        assert_eq!(summary.what_is_likely_true.content, "Evidence shows...");
        assert_eq!(summary.who_should_trust.label, "Trust");
    }

    #[test]
    fn parse_consolidated_partial_layman_fills_defaults() {
        let json = r#"{
            "laymanSummary": {
                "whatWasTried": {"label": "Approach", "content": "We tested..."}
            },
            "truthAssessment": {"overallTruthLikelihood": 0.55}
        }"#;
        let result = parse_consolidated(json).expect("partial summary");
        let summary = result.layman_summary.expect("should have summary");
        assert_eq!(summary.what_was_tried.label, "Approach");
        // Missing sections get defaults
        assert_eq!(summary.what_is_likely_true.label, "Likely true");
        assert!(summary.confidence_explanation.content.is_empty());
    }

    #[test]
    fn parse_consolidated_invalid_json_returns_error() {
        let result = parse_consolidated("not json at all");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("parse error"));
    }

    #[test]
    fn parse_consolidated_empty_object_uses_defaults() {
        let json = "{}";
        let result = parse_consolidated(json).expect("empty object");
        assert!(result.layman_summary.is_none());
        assert!(result.reflection.is_none());
        assert!(result.arbitration.is_none());
        // Truth assessment should get default value
        assert!((result.truth_assessment.overall_truth_likelihood - 0.51).abs() < 0.01);
    }

    // ── Concept extraction edge cases ──

    #[test]
    fn extract_concepts_with_whitespace() {
        let text = "[CONCEPTS:  quantum ,  consciousness  ,  ethics  ]";
        let concepts = extract_concepts(text);
        assert_eq!(concepts, vec!["quantum", "consciousness", "ethics"]);
    }

    #[test]
    fn extract_concepts_single() {
        let text = "Some text [CONCEPTS: neuroscience] more text";
        let concepts = extract_concepts(text);
        assert_eq!(concepts, vec!["neuroscience"]);
    }

    #[test]
    fn extract_concepts_empty_brackets() {
        let text = "[CONCEPTS: ]";
        let concepts = extract_concepts(text);
        assert!(concepts.is_empty());
    }
}
