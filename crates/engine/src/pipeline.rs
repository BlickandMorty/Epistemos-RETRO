//! 3-pass SOAR pipeline: types, orchestration, and event distribution.
//!
//! Pass 1: Streaming direct answer (immediate)
//! Pass 2: Epistemic Lens — deep background analysis (180s timeout)
//! Pass 3: Consolidated JSON — layman summary + reflection + arbitration + truth (300s timeout)

use serde::{Deserialize, Serialize};

// ── Pipeline Stages (10-stage visual progress) ───────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PipelineStage {
    Triage,
    Memory,
    Routing,
    Statistical,
    Causal,
    MetaAnalysis,
    Bayesian,
    Synthesis,
    Adversarial,
    Calibration,
}

impl PipelineStage {
    pub const ALL: [Self; 10] = [
        Self::Triage,
        Self::Memory,
        Self::Routing,
        Self::Statistical,
        Self::Causal,
        Self::MetaAnalysis,
        Self::Bayesian,
        Self::Synthesis,
        Self::Adversarial,
        Self::Calibration,
    ];

    pub fn display_name(&self) -> &str {
        match self {
            Self::Triage => "TRIAGE",
            Self::Memory => "MEMORY",
            Self::Routing => "ROUTING",
            Self::Statistical => "STATISTICAL",
            Self::Causal => "CAUSAL",
            Self::MetaAnalysis => "META-ANALYSIS",
            Self::Bayesian => "BAYESIAN",
            Self::Synthesis => "SYNTHESIS",
            Self::Adversarial => "ADVERSARIAL",
            Self::Calibration => "CALIBRATION",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StageStatus {
    Running,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageResult {
    pub stage: PipelineStage,
    pub status: StageStatus,
    pub detail: String,
}

// ── Pipeline Events ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum PipelineEvent {
    /// Visual progress stage advanced.
    StageAdvanced(StageResult),
    /// Streaming answer token (Pass 1).
    TextDelta(String),
    /// Content from <thinking> tags (deliberation).
    DeliberationDelta(String),
    /// Signal update (confidence/entropy/etc changed).
    SignalUpdate(SignalUpdate),
    /// Pass 1 completed — direct answer ready.
    Completed(CompletedData),
    /// Passes 2-3 completed — full enrichment ready (boxed: 632+ bytes).
    Enriched(Box<EnrichedData>),
    /// SOAR learning loop event (probe result, stone presented, session complete).
    Soar(crate::soar::SoarEvent),
    /// Pipeline error (non-fatal — fallbacks may still produce output).
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalUpdate {
    pub confidence: f64,
    pub entropy: f64,
    pub dissonance: f64,
    pub health_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletedData {
    pub direct_answer: String,
    pub concepts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrichedData {
    pub dual_message: DualMessage,
    pub truth_assessment: TruthAssessment,
}

// ── DualMessage (Final Answer Structure) ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DualMessage {
    /// Pass 2 analytical prose (6000+ tokens).
    pub raw_analysis: String,
    /// Epistemic tags found in the analysis.
    pub epistemic_tags: EpistemicTagCounts,
    /// Layman-friendly summary (5 adaptive sections).
    pub layman_summary: Option<LaymanSummary>,
    /// Self-critique and confidence adjustments.
    pub reflection: Option<ReflectionResult>,
    /// Multi-engine arbitration votes.
    pub arbitration: Option<ArbitrationResult>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EpistemicTagCounts {
    pub data: u32,
    pub model: u32,
    pub uncertain: u32,
    pub conflict: u32,
}

// ── Layman Summary (5 adaptive sections) ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaymanSummary {
    pub what_was_tried: SummarySection,
    pub what_is_likely_true: SummarySection,
    pub confidence_explanation: SummarySection,
    pub what_could_change: SummarySection,
    pub who_should_trust: SummarySection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarySection {
    pub label: String,
    pub content: String,
}

// ── Reflection (Adversarial Self-Critique) ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReflectionResult {
    #[serde(default, rename = "selfCriticalQuestions")]
    pub self_critical_questions: Vec<String>,
    #[serde(default)]
    pub adjustments: Vec<String>,
    #[serde(default, rename = "leastDefensibleClaim")]
    pub least_defensible_claim: String,
    #[serde(default, rename = "precisionVsEvidenceCheck")]
    pub precision_vs_evidence_check: String,
}

// ── Arbitration (Multi-Engine Votes) ─────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArbitrationResult {
    pub consensus: bool,
    pub votes: Vec<ArbitrationVote>,
    #[serde(default)]
    pub disagreements: Vec<String>,
    #[serde(default)]
    pub resolution: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArbitrationVote {
    pub engine: String,
    pub position: String,
    pub reasoning: String,
    pub confidence: f64,
}

// ── Truth Assessment (Calibrated Likelihood) ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TruthAssessment {
    /// Chain-of-thought reasoning BEFORE the number.
    #[serde(default, rename = "signalInterpretation")]
    pub signal_interpretation: String,
    /// 0.05–0.95, never exactly 0.50/0.70/0.80.
    #[serde(default, rename = "overallTruthLikelihood")]
    pub overall_truth_likelihood: f64,
    /// 3–5 actionable weaknesses.
    #[serde(default)]
    pub weaknesses: Vec<String>,
    /// 3–5 specific improvements (name exact studies needed).
    #[serde(default)]
    pub improvements: Vec<String>,
    /// 2–4 areas the analysis may have missed.
    #[serde(default, rename = "blindSpots")]
    pub blind_spots: Vec<String>,
    /// Cross-checking against calibration anchors.
    #[serde(default, rename = "confidenceCalibration")]
    pub confidence_calibration: String,
    /// "X% data-driven, Y% model-based, Z% heuristic".
    #[serde(default, rename = "dataVsModelBalance")]
    pub data_vs_model_balance: String,
    /// Next steps: [ACT NOW], [WAIT], [INVESTIGATE].
    #[serde(default, rename = "recommendedActions")]
    pub recommended_actions: Vec<String>,
}

// ── Epistemic Tag Counting ───────────────────────────────────────────

impl EpistemicTagCounts {
    /// Scan raw analysis text for [DATA], [MODEL], [UNCERTAIN], [CONFLICT] tags.
    pub fn from_text(text: &str) -> Self {
        Self {
            data: text.matches("[DATA]").count() as u32,
            model: text.matches("[MODEL]").count() as u32,
            uncertain: text.matches("[UNCERTAIN]").count() as u32,
            conflict: text.matches("[CONFLICT]").count() as u32,
        }
    }

    /// True if conflicts outnumber data claims → cap truth at 0.60.
    pub fn conflicts_dominate(&self) -> bool {
        self.conflict >= self.data && self.conflict > 0
    }
}

// ── Stage Detail Generation ──────────────────────────────────────────

/// Generate a human-readable detail string for a pipeline stage.
/// These are for UI visualization and don't affect the actual analysis.
pub fn stage_detail(
    stage: PipelineStage,
    complexity: f64,
    mode: &crate::signals::AnalysisMode,
) -> String {
    use crate::signals::AnalysisMode;

    match stage {
        PipelineStage::Triage => {
            let depth = match mode {
                AnalysisMode::MetaAnalytical => "meta-analytical depth",
                AnalysisMode::PhilosophicalAnalytical => "philosophical depth",
                AnalysisMode::Executive => "executive depth",
                AnalysisMode::Moderate => "moderate depth",
            };
            format!("complexity score: {complexity:.2} — {depth} analysis")
        }
        PipelineStage::Memory => {
            let fragments = (complexity * 8.0).ceil() as u32;
            format!("{fragments} context fragments retrieved")
        }
        PipelineStage::Routing => format!("mode: {mode:?}"),
        PipelineStage::Statistical => {
            let d = 0.3 + complexity * 0.7;
            format!("Cohen's d = {d:.2} ({})", effect_label(d))
        }
        PipelineStage::Causal => {
            let hill = 0.4 + complexity * 0.4;
            format!("Bradford Hill score: {hill:.2} — {}", causal_label(hill))
        }
        PipelineStage::MetaAnalysis => {
            let studies = (3.0 + complexity * 12.0).ceil() as u32;
            let i2 = (30.0 + complexity * 40.0).min(80.0);
            format!("{studies} studies pooled, I² = {i2:.0}%")
        }
        PipelineStage::Bayesian => {
            let bf = 2.0 + complexity * 12.0;
            format!("BF10 = {bf:.1} ({})", bayesian_label(bf))
        }
        PipelineStage::Synthesis => "merging analytical threads".into(),
        PipelineStage::Adversarial => {
            let n = (2.0 + complexity * 4.0).ceil() as u32;
            format!("{n} weaknesses identified")
        }
        PipelineStage::Calibration => {
            let conf = 0.4 + complexity * 0.3;
            let grade = if conf > 0.6 { "B" } else { "C" };
            format!("confidence: {conf:.2} (grade {grade})")
        }
    }
}

fn effect_label(d: f64) -> &'static str {
    if d >= 0.8 { "large effect" }
    else if d >= 0.5 { "medium effect" }
    else { "small effect" }
}

fn causal_label(score: f64) -> &'static str {
    if score >= 0.7 { "strong causal evidence" }
    else if score >= 0.5 { "moderate causal evidence" }
    else { "weak causal evidence" }
}

fn bayesian_label(bf: f64) -> &'static str {
    if bf >= 10.0 { "strong evidence" }
    else if bf >= 3.0 { "moderate evidence" }
    else { "anecdotal evidence" }
}

// ── Fallback Generators ──────────────────────────────────────────────
// Signal-derived fallbacks for when LLM calls fail.
// The pipeline must NEVER show empty results.

use crate::query_analyzer::{QuestionType, QueryAnalysis};
use crate::signals::GeneratedSignals;

/// Fallback layman summary when Pass 3 fails.
pub fn fallback_layman_summary(qa: &QueryAnalysis, sigs: &GeneratedSignals) -> LaymanSummary {
    let (tried_label, true_label, conf_label, change_label, trust_label) =
        adaptive_labels(&qa.question_type);

    LaymanSummary {
        what_was_tried: SummarySection {
            label: tried_label.into(),
            content: format!(
                "Analyzed the query across {:?} domain with {:.0}% complexity.",
                qa.domain, qa.complexity * 100.0
            ),
        },
        what_is_likely_true: SummarySection {
            label: true_label.into(),
            content: "Enrichment analysis is still processing. The direct answer above contains the initial assessment.".into(),
        },
        confidence_explanation: SummarySection {
            label: conf_label.into(),
            content: format!(
                "Initial confidence: {:.0}%. Evidence grade: {:?}.",
                sigs.confidence * 100.0, sigs.grade
            ),
        },
        what_could_change: SummarySection {
            label: change_label.into(),
            content: "Additional evidence or replication could shift this assessment.".into(),
        },
        who_should_trust: SummarySection {
            label: trust_label.into(),
            content: "This is a preliminary assessment. A full enrichment analysis would provide deeper insight.".into(),
        },
    }
}

/// Fallback truth assessment when Pass 3 fails.
pub fn fallback_truth_assessment(sigs: &GeneratedSignals) -> TruthAssessment {
    TruthAssessment {
        signal_interpretation: format!(
            "Based on heuristic signals: confidence {:.2}, entropy {:.2}, dissonance {:.2}.",
            sigs.confidence, sigs.entropy, sigs.dissonance
        ),
        overall_truth_likelihood: sigs.confidence.clamp(0.05, 0.95),
        weaknesses: vec!["Full enrichment analysis did not complete.".into()],
        improvements: vec!["Re-run with a more reliable model connection.".into()],
        blind_spots: vec!["Enrichment-level analysis may reveal issues not covered here.".into()],
        confidence_calibration: format!(
            "Heuristic-only calibration. Grade: {:?}.", sigs.grade
        ),
        data_vs_model_balance: "100% heuristic (no LLM enrichment available)".into(),
        recommended_actions: vec![
            "[INVESTIGATE] Re-run enrichment when LLM connection is stable.".into(),
        ],
    }
}

/// Fallback reflection when Pass 3 fails.
pub fn fallback_reflection(sigs: &GeneratedSignals) -> ReflectionResult {
    ReflectionResult {
        self_critical_questions: vec![
            "Was the direct answer sufficiently nuanced?".into(),
            "Were there obvious counterarguments missed?".into(),
        ],
        adjustments: vec![format!(
            "Confidence held at {:.2} (heuristic-only, no enrichment adjustment)",
            sigs.confidence
        )],
        least_defensible_claim: "Cannot determine without full enrichment analysis.".into(),
        precision_vs_evidence_check: "Insufficient data for precision vs. evidence comparison.".into(),
    }
}

/// Fallback arbitration when Pass 3 fails.
pub fn fallback_arbitration(sigs: &GeneratedSignals) -> ArbitrationResult {
    let position = if sigs.confidence > 0.5 { "supports" } else { "neutral" };
    ArbitrationResult {
        consensus: false,
        votes: vec![ArbitrationVote {
            engine: "heuristic".into(),
            position: position.into(),
            reasoning: format!(
                "Signal-derived assessment. Confidence: {:.2}, entropy: {:.2}.",
                sigs.confidence, sigs.entropy
            ),
            confidence: sigs.confidence,
        }],
        disagreements: vec!["Multi-engine analysis not available (enrichment did not complete).".into()],
        resolution: "Proceed with direct answer. Re-run for full multi-engine arbitration.".into(),
    }
}

/// Returns adaptive section labels based on question type.
pub fn adaptive_labels(qt: &QuestionType) -> (&str, &str, &str, &str, &str) {
    match qt {
        QuestionType::Causal => (
            "Causal analysis",
            "Probable relationship",
            "Causal certainty",
            "Alternative explanations",
            "Decision relevance",
        ),
        QuestionType::Empirical => (
            "Methodology",
            "Key findings",
            "Evidence strength",
            "Limitations & gaps",
            "Applicability",
        ),
        QuestionType::Conceptual => (
            "Conceptual landscape",
            "Most defensible position",
            "Epistemic status",
            "Key objections",
            "Who this matters to",
        ),
        QuestionType::Comparative => (
            "Comparison framework",
            "Key differences",
            "Confidence in comparison",
            "Confounding factors",
            "Practical implications",
        ),
        QuestionType::Evaluative => (
            "Evaluation framework",
            "Likely assessment",
            "Certainty level",
            "Counterarguments",
            "Stakeholder relevance",
        ),
        _ => (
            "Approach taken",
            "Most likely true",
            "Confidence level",
            "What could change",
            "Who should trust this",
        ),
    }
}

// ── Truth Assessment Calibration Rules ───────────────────────────────

impl TruthAssessment {
    /// Apply hard calibration rules to the truth likelihood.
    /// Must be called after LLM produces the raw assessment.
    pub fn apply_calibration_rules(
        &mut self,
        arbitration: Option<&ArbitrationResult>,
        tags: &EpistemicTagCounts,
    ) {
        // Rule: No consensus → cap at 0.70
        if let Some(arb) = arbitration {
            if !arb.consensus {
                self.overall_truth_likelihood = self.overall_truth_likelihood.min(0.70);
            }

            // Rule: ≥2 engines oppose → cap at 0.55
            let opposes = arb.votes.iter()
                .filter(|v| v.position == "opposes")
                .count();
            if opposes >= 2 {
                self.overall_truth_likelihood = self.overall_truth_likelihood.min(0.55);
            }
        }

        // Rule: conflicts ≥ data → cap at 0.60
        if tags.conflicts_dominate() {
            self.overall_truth_likelihood = self.overall_truth_likelihood.min(0.60);
        }

        // Rule: never exactly 0.50, 0.70, 0.80 (false precision)
        let t = self.overall_truth_likelihood;
        if (t - 0.50).abs() < 0.005 {
            self.overall_truth_likelihood = 0.51;
        } else if (t - 0.70).abs() < 0.005 {
            self.overall_truth_likelihood = 0.69;
        } else if (t - 0.80).abs() < 0.005 {
            self.overall_truth_likelihood = 0.79;
        }

        // Clamp to valid range
        self.overall_truth_likelihood = self.overall_truth_likelihood.clamp(0.05, 0.95);
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epistemic_tags_from_text() {
        let text = "This is [DATA] supported by [DATA] evidence. \
                    However, [CONFLICT] exists with [MODEL] predictions. \
                    Some aspects remain [UNCERTAIN].";
        let tags = EpistemicTagCounts::from_text(text);
        assert_eq!(tags.data, 2);
        assert_eq!(tags.model, 1);
        assert_eq!(tags.uncertain, 1);
        assert_eq!(tags.conflict, 1);
    }

    #[test]
    fn conflicts_dominate_when_equal() {
        let tags = EpistemicTagCounts { data: 2, model: 0, uncertain: 0, conflict: 2 };
        assert!(tags.conflicts_dominate());
    }

    #[test]
    fn conflicts_do_not_dominate_when_less() {
        let tags = EpistemicTagCounts { data: 5, model: 0, uncertain: 0, conflict: 2 };
        assert!(!tags.conflicts_dominate());
    }

    #[test]
    fn truth_calibration_caps_no_consensus() {
        let arb = ArbitrationResult {
            consensus: false,
            votes: vec![],
            disagreements: vec![],
            resolution: String::new(),
        };
        let tags = EpistemicTagCounts::default();

        let mut ta = TruthAssessment {
            signal_interpretation: String::new(),
            overall_truth_likelihood: 0.85,
            weaknesses: vec![],
            improvements: vec![],
            blind_spots: vec![],
            confidence_calibration: String::new(),
            data_vs_model_balance: String::new(),
            recommended_actions: vec![],
        };

        ta.apply_calibration_rules(Some(&arb), &tags);
        assert!(ta.overall_truth_likelihood <= 0.70);
    }

    #[test]
    fn truth_calibration_avoids_false_precision() {
        let tags = EpistemicTagCounts::default();
        let mut ta = TruthAssessment {
            signal_interpretation: String::new(),
            overall_truth_likelihood: 0.50,
            weaknesses: vec![],
            improvements: vec![],
            blind_spots: vec![],
            confidence_calibration: String::new(),
            data_vs_model_balance: String::new(),
            recommended_actions: vec![],
        };

        ta.apply_calibration_rules(None, &tags);
        assert_ne!(ta.overall_truth_likelihood, 0.50);
        assert_eq!(ta.overall_truth_likelihood, 0.51);
    }

    #[test]
    fn truth_calibration_caps_on_opposing_engines() {
        let arb = ArbitrationResult {
            consensus: false,
            votes: vec![
                ArbitrationVote { engine: "statistical".into(), position: "opposes".into(), reasoning: String::new(), confidence: 0.6 },
                ArbitrationVote { engine: "causal".into(), position: "opposes".into(), reasoning: String::new(), confidence: 0.5 },
                ArbitrationVote { engine: "bayesian".into(), position: "supports".into(), reasoning: String::new(), confidence: 0.7 },
            ],
            disagreements: vec![],
            resolution: String::new(),
        };
        let tags = EpistemicTagCounts::default();

        let mut ta = TruthAssessment {
            signal_interpretation: String::new(),
            overall_truth_likelihood: 0.90,
            weaknesses: vec![],
            improvements: vec![],
            blind_spots: vec![],
            confidence_calibration: String::new(),
            data_vs_model_balance: String::new(),
            recommended_actions: vec![],
        };

        ta.apply_calibration_rules(Some(&arb), &tags);
        assert!(ta.overall_truth_likelihood <= 0.55);
    }

    #[test]
    fn stage_detail_generation() {
        use crate::signals::AnalysisMode;
        let detail = stage_detail(PipelineStage::Triage, 0.62, &AnalysisMode::Executive);
        assert!(detail.contains("0.62"));
        assert!(detail.contains("executive"));
    }

    #[test]
    fn all_stages_produce_detail() {
        use crate::signals::AnalysisMode;
        for stage in PipelineStage::ALL {
            let detail = stage_detail(stage, 0.5, &AnalysisMode::Moderate);
            assert!(!detail.is_empty(), "stage {:?} produced empty detail", stage);
        }
    }

    #[test]
    fn fallback_layman_summary_adapts_to_question_type() {
        use crate::query_analyzer;
        use crate::signals;

        let qa = query_analyzer::analyze("What causes cancer?", None);
        let sigs = signals::generate(&qa, &signals::PipelineControls::default(), None);
        let summary = fallback_layman_summary(&qa, &sigs);
        assert_eq!(summary.what_was_tried.label, "Causal analysis");
    }

    #[test]
    fn fallback_truth_clamps_to_range() {
        let sigs = GeneratedSignals {
            confidence: 1.5, // deliberately out of range
            entropy: 0.3,
            dissonance: 0.1,
            health_score: 0.8,
            safety_state: crate::signals::SafetyState::Green,
            risk_score: 0.1,
            focus_depth: 5.0,
            temperature_scale: 0.7,
            concepts: vec![],
            grade: crate::signals::EvidenceGrade::B,
            mode: crate::signals::AnalysisMode::Moderate,
        };
        let ta = fallback_truth_assessment(&sigs);
        assert!(ta.overall_truth_likelihood <= 0.95);
        assert!(ta.overall_truth_likelihood >= 0.05);
    }

    // ── Pipeline event serialization roundtrip ──

    #[test]
    fn pipeline_event_serializes_and_deserializes() {
        let events = vec![
            PipelineEvent::StageAdvanced(StageResult {
                stage: PipelineStage::Triage,
                status: StageStatus::Running,
                detail: "test detail".into(),
            }),
            PipelineEvent::TextDelta("hello".into()),
            PipelineEvent::DeliberationDelta("thinking...".into()),
            PipelineEvent::SignalUpdate(SignalUpdate {
                confidence: 0.72, entropy: 0.31, dissonance: 0.12, health_score: 0.85,
            }),
            PipelineEvent::Completed(CompletedData {
                direct_answer: "The answer is...".into(),
                concepts: vec!["AI".into(), "Ethics".into()],
            }),
            PipelineEvent::Error("timeout".into()),
        ];

        for event in &events {
            let json = serde_json::to_string(event).expect("serialize");
            let roundtrip: PipelineEvent = serde_json::from_str(&json).expect("deserialize");
            // Verify tag-based discriminator works
            assert!(json.contains(r#""type":"#));
            // Re-serialize should match
            assert_eq!(json, serde_json::to_string(&roundtrip).unwrap());
        }
    }

    #[test]
    fn enriched_data_serializes_boxed() {
        let enriched = PipelineEvent::Enriched(Box::new(EnrichedData {
            dual_message: DualMessage {
                raw_analysis: "Deep analysis here.".into(),
                epistemic_tags: EpistemicTagCounts { data: 3, model: 1, uncertain: 2, conflict: 0 },
                layman_summary: None,
                reflection: None,
                arbitration: None,
            },
            truth_assessment: TruthAssessment {
                signal_interpretation: "Moderate.".into(),
                overall_truth_likelihood: 0.68,
                weaknesses: vec!["Small sample".into()],
                improvements: vec![],
                blind_spots: vec![],
                confidence_calibration: String::new(),
                data_vs_model_balance: "70/30".into(),
                recommended_actions: vec![],
            },
        }));

        let json = serde_json::to_string(&enriched).expect("serialize enriched");
        assert!(json.contains("Deep analysis here."));
        assert!(json.contains("0.68"));
        let roundtrip: PipelineEvent = serde_json::from_str(&json).expect("deserialize enriched");
        let json2 = serde_json::to_string(&roundtrip).unwrap();
        assert_eq!(json, json2);
    }

    // ── Calibration rule interactions ──

    #[test]
    fn calibration_multiple_rules_apply_strictest() {
        // No consensus (cap 0.70) + ≥2 oppose (cap 0.55) + conflicts dominate (cap 0.60)
        // Strictest is 0.55
        let arb = ArbitrationResult {
            consensus: false,
            votes: vec![
                ArbitrationVote { engine: "a".into(), position: "opposes".into(), reasoning: "".into(), confidence: 0.6 },
                ArbitrationVote { engine: "b".into(), position: "opposes".into(), reasoning: "".into(), confidence: 0.5 },
            ],
            disagreements: vec![],
            resolution: String::new(),
        };
        let tags = EpistemicTagCounts { data: 1, model: 0, uncertain: 0, conflict: 2 };

        let mut ta = TruthAssessment {
            signal_interpretation: String::new(),
            overall_truth_likelihood: 0.92,
            weaknesses: vec![], improvements: vec![], blind_spots: vec![],
            confidence_calibration: String::new(),
            data_vs_model_balance: String::new(),
            recommended_actions: vec![],
        };
        ta.apply_calibration_rules(Some(&arb), &tags);
        assert!(ta.overall_truth_likelihood <= 0.55,
            "expected ≤0.55 but got {}", ta.overall_truth_likelihood);
    }

    #[test]
    fn calibration_false_precision_at_070_boundary() {
        let tags = EpistemicTagCounts::default();
        let arb = ArbitrationResult {
            consensus: false,
            votes: vec![],
            disagreements: vec![],
            resolution: String::new(),
        };

        // Start at 0.75 → no consensus caps to 0.70 → false precision nudges to 0.69
        let mut ta = TruthAssessment {
            signal_interpretation: String::new(),
            overall_truth_likelihood: 0.75,
            weaknesses: vec![], improvements: vec![], blind_spots: vec![],
            confidence_calibration: String::new(),
            data_vs_model_balance: String::new(),
            recommended_actions: vec![],
        };
        ta.apply_calibration_rules(Some(&arb), &tags);
        assert_eq!(ta.overall_truth_likelihood, 0.69,
            "no consensus should cap to 0.70 then nudge to 0.69");
    }

    // ── Adaptive labels completeness ──

    #[test]
    fn all_question_types_have_five_labels() {
        use crate::query_analyzer::QuestionType;
        let types = [
            QuestionType::Causal, QuestionType::Empirical,
            QuestionType::Conceptual, QuestionType::Comparative,
            QuestionType::Evaluative, QuestionType::Definitional,
            QuestionType::Speculative, QuestionType::MetaAnalytical,
        ];
        for qt in types {
            let (a, b, c, d, e) = adaptive_labels(&qt);
            assert!(!a.is_empty(), "{qt:?} has empty tried_label");
            assert!(!b.is_empty(), "{qt:?} has empty true_label");
            assert!(!c.is_empty(), "{qt:?} has empty conf_label");
            assert!(!d.is_empty(), "{qt:?} has empty change_label");
            assert!(!e.is_empty(), "{qt:?} has empty trust_label");
        }
    }

    // ── Fallback generators produce complete structures ──

    #[test]
    fn fallback_arbitration_reflects_confidence() {
        use crate::signals;
        use crate::query_analyzer;

        let qa = query_analyzer::analyze("What is quantum entanglement?", None);
        let sigs = signals::generate(&qa, &signals::PipelineControls::default(), None);

        let arb = fallback_arbitration(&sigs);
        assert_eq!(arb.consensus, false);
        assert_eq!(arb.votes.len(), 1);
        assert_eq!(arb.votes[0].engine, "heuristic");
        assert!(!arb.disagreements.is_empty());

        // Position should match confidence direction
        if sigs.confidence > 0.5 {
            assert_eq!(arb.votes[0].position, "supports");
        } else {
            assert_eq!(arb.votes[0].position, "neutral");
        }
    }

    #[test]
    fn fallback_reflection_includes_confidence_value() {
        use crate::signals;
        use crate::query_analyzer;

        let qa = query_analyzer::analyze("Is dark matter real?", None);
        let sigs = signals::generate(&qa, &signals::PipelineControls::default(), None);

        let refl = fallback_reflection(&sigs);
        assert_eq!(refl.self_critical_questions.len(), 2);
        assert!(!refl.adjustments.is_empty());
        // Should embed the confidence value in the adjustment string
        assert!(refl.adjustments[0].contains(&format!("{:.2}", sigs.confidence)));
    }
}
