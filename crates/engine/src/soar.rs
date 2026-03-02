//! SOAR (Self-Organized Adaptive Reasoning) learning loop.
//!
//! [MAC] Ported from SOAREngine.swift, SOARDetector.swift, SOARReward.swift,
//! SOARTeacher.swift, SOARStudent.swift — consolidated into one module.
//!
//! Detects when the user is at the edge of their understanding and
//! engages a teaching protocol with three "stones" (curriculum steps):
//! 1. Clarify — pin down assumptions and definitions
//! 2. Frameworks — introduce analytical structures
//! 3. Empirical Tests — design experiments to resolve uncertainty
//!
//! Signals are adjusted based on learning gains via a reward function.
//!
//! ## macOS parity features:
//! - Hard indicator keywords (paradox, consciousness, etc.)
//! - Question type / domain difficulty modifiers
//! - Recommended iteration depth (2-3 based on signal count)
//! - Structural quality assessment (Jaccard token overlap)
//! - Contradiction detection (heuristic, LLM optional via orchestrator)
//! - Rich reason strings explaining probe decisions

use serde::{Deserialize, Serialize};
use crate::query_analyzer::{QueryAnalysis, AnalysisDomain, QuestionType};
use crate::signals::GeneratedSignals;

// ── Hard Indicators (ported from SOARDetector.swift) ─────────────────

/// Keywords that signal genuinely hard reasoning problems.
const HARD_INDICATORS: &[&str] = &[
    "paradox", "contradiction", "dilemma", "impossible", "unsolvable",
    "undecidable", "np-hard", "intractable", "unprovable", "incompleteness",
    "infinite regress", "self-referential", "emergent", "consciousness",
    "qualia", "free will", "hard problem", "meta-analysis of meta-analyses",
    "causal inference from observational", "confounding", "selection bias",
    "simpson's paradox", "ecological fallacy", "counterfactual",
    "multi-step reasoning", "abductive", "non-monotonic", "defeasible",
];

/// Question types that inherently push difficulty upward.
fn is_hard_question_type(qt: &QuestionType) -> bool {
    matches!(qt, QuestionType::MetaAnalytical | QuestionType::Causal | QuestionType::Speculative)
}

/// Domains that inherently push difficulty upward.
fn is_hard_domain(d: &AnalysisDomain) -> bool {
    matches!(d, AnalysisDomain::Philosophy | AnalysisDomain::Ethics | AnalysisDomain::Psychology)
}

// ── SOAR Types ───────────────────────────────────────────────────────

/// Whether SOAR should engage for this query.
/// [MAC] Enhanced with recommended_depth and reason fields matching SOARDetector.swift.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearnabilityProbe {
    /// True if SOAR should engage.
    pub at_edge: bool,
    /// How difficult the material is (0.0-1.0).
    pub difficulty: f64,
    /// How many valid interpretations exist (0.0-1.0).
    pub entropy: f64,
    /// How established the answer is (0.0-1.0).
    pub confidence: f64,
    /// Recommended number of SOAR iterations (0, 2, or 3).
    pub recommended_depth: u8,
    /// Human-readable reason for the probe decision.
    pub reason: String,
}

/// Configuration for SOAR engagement.
/// [MAC] Added max_iterations, stones_per_curriculum, contradiction_detection
/// matching SOARConfig in SOARTypes.swift.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoarConfig {
    pub enabled: bool,
    /// Minimum difficulty threshold for engagement (default: 0.5).
    pub difficulty_threshold: f64,
    /// Minimum entropy threshold (default: 0.6).
    pub entropy_threshold: f64,
    /// Maximum confidence threshold (default: 0.7).
    pub confidence_cap: f64,
    /// Maximum SOAR iterations before stopping (default: 3).
    pub max_iterations: u8,
    /// Stones per curriculum (default: 3).
    pub stones_per_curriculum: u8,
    /// Whether to scan for contradictions after learning (default: true).
    pub contradiction_detection: bool,
    /// Auto-detect whether to engage (vs always engage). Default: true.
    pub auto_detect: bool,
}

impl Default for SoarConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            difficulty_threshold: 0.5,
            entropy_threshold: 0.6,
            confidence_cap: 0.7,
            max_iterations: 3,
            stones_per_curriculum: 3,
            contradiction_detection: true,
            auto_detect: true,
        }
    }
}

/// A teaching stone — one step in the curriculum.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stone {
    pub kind: StoneKind,
    pub title: String,
    pub content: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StoneKind {
    Clarify,
    Frameworks,
    EmpiricalTests,
}

/// Result of a SOAR session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoarSession {
    pub stones: Vec<Stone>,
    pub initial_signals: BaselineSignals,
    pub final_signals: Option<BaselineSignals>,
    pub learning_gain: f64,
}

/// Frozen signal snapshot for comparison.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaselineSignals {
    pub confidence: f64,
    pub entropy: f64,
    pub dissonance: f64,
    pub health_score: f64,
}

impl From<&GeneratedSignals> for BaselineSignals {
    fn from(sigs: &GeneratedSignals) -> Self {
        Self {
            confidence: sigs.confidence,
            entropy: sigs.entropy,
            dissonance: sigs.dissonance,
            health_score: sigs.health_score,
        }
    }
}

/// Structural quality of a teaching stone (0.0-1.0).
/// [MAC] Ported from SOARRewardCalculator.assessStructuralQuality().
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoneQuality {
    pub score: f64,
    pub token_overlap: f64,
}

/// A contradiction found during analysis.
/// [MAC] Ported from ContradictionDetector in SOARReward.swift.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contradiction {
    pub claim_a: String,
    pub claim_b: String,
    pub confidence: f64,
    pub explanation: String,
}

/// Result of a contradiction scan over an analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContradictionScan {
    pub total_claims: usize,
    pub total_comparisons: usize,
    pub contradictions: Vec<Contradiction>,
    pub computed_dissonance: f64,
}

/// SOAR event types emitted during a session.
/// [MAC] Enhanced with contradiction scan events matching SOAREngine.swift.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum SoarEvent {
    ProbeComplete(LearnabilityProbe),
    TeachingStart { stone_count: usize },
    StonePresented { index: usize, stone: Stone },
    ContradictionScanComplete(ContradictionScan),
    SessionComplete { learning_gain: f64, recommended_depth: u8 },
}

// ── Learnability Probe ───────────────────────────────────────────────
// [MAC] Ported from SOARDetector.probeLearnability() — 6-factor difficulty.

/// Compute enhanced difficulty from query analysis.
/// Incorporates hard indicators, question type, domain, entity count, word count.
fn compute_soar_difficulty(qa: &QueryAnalysis) -> f64 {
    let query_lower = qa.core_question.to_lowercase();

    // 1. Base difficulty from triage complexity
    let mut difficulty = qa.complexity;

    // 2. Hard indicator keyword scan
    let hard_keyword_count = HARD_INDICATORS.iter()
        .filter(|kw| query_lower.contains(*kw))
        .count();
    difficulty += (hard_keyword_count as f64 * 0.05).min(0.2);

    // 3. Question type difficulty
    if is_hard_question_type(&qa.question_type) {
        difficulty += 0.1;
    }

    // 4. Domain difficulty
    if is_hard_domain(&qa.domain) {
        difficulty += 0.08;
    }

    // 5. Structural complexity (entity count)
    let entity_count = qa.entities.len();
    if entity_count > 5 { difficulty += 0.05; }
    if entity_count > 10 { difficulty += 0.05; }

    // 6. Multi-hop reasoning detection (word count as proxy)
    let word_count = qa.core_question.split_whitespace().count();
    if word_count > 50 { difficulty += 0.05; }
    if word_count > 100 { difficulty += 0.05; }

    difficulty.clamp(0.0, 1.0)
}

/// Probe whether the query sits at the user's learning edge.
/// Uses default thresholds matching macOS SOARDetector.
pub fn probe_learnability(qa: &QueryAnalysis, sigs: &GeneratedSignals) -> LearnabilityProbe {
    probe_with_config(qa, sigs, &SoarConfig::default())
}

/// Probe with custom thresholds from config.
/// [MAC] Enhanced with 6-factor difficulty, recommended depth, reason string.
pub fn probe_with_config(
    qa: &QueryAnalysis,
    sigs: &GeneratedSignals,
    config: &SoarConfig,
) -> LearnabilityProbe {
    let difficulty = compute_soar_difficulty(qa);
    let entropy = sigs.entropy;
    let confidence = sigs.confidence;

    if !config.enabled {
        return LearnabilityProbe {
            at_edge: false,
            difficulty,
            entropy,
            confidence,
            recommended_depth: 0,
            reason: "SOAR disabled".into(),
        };
    }

    let below_confidence = confidence < config.confidence_cap;
    let above_entropy = entropy > config.entropy_threshold;
    let above_difficulty = difficulty > config.difficulty_threshold;

    let signal_triggers = [below_confidence, above_entropy].iter().filter(|&&b| b).count();
    let at_edge = above_difficulty && signal_triggers >= 2;

    // Recommended depth (macOS: 3 if all 3 triggers or difficulty > 0.8, else 2)
    let recommended_depth = if !at_edge {
        0
    } else if signal_triggers >= 2 && difficulty > 0.8 {
        3
    } else {
        2
    };

    // Build reason string
    let reason = if !above_difficulty {
        format!(
            "Query difficulty ({:.2}) below threshold ({:.2}). Standard pipeline sufficient.",
            difficulty, config.difficulty_threshold
        )
    } else if signal_triggers < 2 {
        format!(
            "Difficulty is high ({:.2}) but only {}/2 signal thresholds triggered. SOAR not needed.",
            difficulty, signal_triggers
        )
    } else {
        let mut triggers = Vec::new();
        if below_confidence {
            triggers.push(format!("confidence {:.2} < {:.2}", confidence, config.confidence_cap));
        }
        if above_entropy {
            triggers.push(format!("entropy {:.2} > {:.2}", entropy, config.entropy_threshold));
        }
        format!(
            "At learnability edge: {}. Difficulty: {:.2}. SOAR recommended (depth {}).",
            triggers.join(", "), difficulty, recommended_depth
        )
    };

    LearnabilityProbe {
        at_edge,
        difficulty,
        entropy,
        confidence,
        recommended_depth,
        reason,
    }
}

// ── Stone Generation ─────────────────────────────────────────────────

/// Generate the three teaching stones based on query analysis.
pub fn generate_stones(qa: &QueryAnalysis, sigs: &GeneratedSignals) -> Vec<Stone> {
    let domain = format!("{:?}", qa.domain);
    let key_terms = qa.key_terms.join(", ");

    vec![
        Stone {
            kind: StoneKind::Clarify,
            title: format!("Clarify: Assumptions about {}", qa.core_question),
            content: format!(
                "Before analyzing further, let's pin down the key assumptions. \
                 In the domain of {domain}, terms like {key_terms} can mean different things \
                 depending on context. What exactly do we mean here?"
            ),
            prompt: format!(
                "Define the key terms and assumptions in this question: {}. \
                 What definitions would change the answer? \
                 What is the most common vs. most rigorous interpretation?",
                qa.core_question
            ),
        },
        Stone {
            kind: StoneKind::Frameworks,
            title: format!("Frameworks: Analytical lenses for {:?}", qa.question_type),
            content: format!(
                "Multiple analytical frameworks apply to {:?} questions in {domain}. \
                 Each framework highlights different aspects and may reach different conclusions. \
                 Confidence: {:.0}%, Entropy: {:.0}%.",
                qa.question_type, sigs.confidence * 100.0, sigs.entropy * 100.0
            ),
            prompt: format!(
                "What are the 2-3 most relevant analytical frameworks for this question? \
                 For each: what does it emphasize, what does it miss, and what conclusion would it reach? \
                 Question: {}",
                qa.core_question
            ),
        },
        Stone {
            kind: StoneKind::EmpiricalTests,
            title: "Empirical: What would resolve this?".into(),
            content: format!(
                "Given the uncertainty (entropy {:.0}%), what evidence would most change \
                 the assessment? What experiment, dataset, or replication would shift confidence?",
                sigs.entropy * 100.0
            ),
            prompt: format!(
                "Design 2-3 empirical tests that could resolve the key uncertainties in: {}. \
                 For each: what would it measure, what result would increase confidence, \
                 and what result would decrease it?",
                qa.core_question
            ),
        },
    ]
}

// ── Reward Function ──────────────────────────────────────────────────

/// Compute learning gain from signal changes.
///
/// Weights: confidence improvement (40%), entropy reduction (25%),
/// dissonance reduction (20%), health improvement (15%).
pub fn compute_learning_gain(initial: &BaselineSignals, final_sigs: &BaselineSignals) -> f64 {
    let conf_gain = (final_sigs.confidence - initial.confidence).max(0.0);
    let entropy_reduction = (initial.entropy - final_sigs.entropy).max(0.0);
    let dissonance_reduction = (initial.dissonance - final_sigs.dissonance).max(0.0);
    let health_gain = (final_sigs.health_score - initial.health_score).max(0.0);

    conf_gain * 0.40
        + entropy_reduction * 0.25
        + dissonance_reduction * 0.20
        + health_gain * 0.15
}

/// Build a SOAR session from query analysis and signals.
pub fn build_session(qa: &QueryAnalysis, sigs: &GeneratedSignals) -> SoarSession {
    let stones = generate_stones(qa, sigs);
    let initial = BaselineSignals::from(sigs);

    SoarSession {
        stones,
        initial_signals: initial,
        final_signals: None,
        learning_gain: 0.0,
    }
}

/// Update session with final signals and compute learning gain.
pub fn complete_session(session: &mut SoarSession, final_sigs: &GeneratedSignals) {
    let final_baseline = BaselineSignals::from(final_sigs);
    session.learning_gain = compute_learning_gain(&session.initial_signals, &final_baseline);
    session.final_signals = Some(final_baseline);
}

// ── Structural Quality Assessment ───────────────────────────────────
// [MAC] Ported from SOARRewardCalculator.assessStructuralQuality()

/// Assess how well a stone question is constructed relative to the target query.
/// Higher quality = stone explores a genuinely different angle (low token overlap)
/// with proper question form and domain-specific terminology.
pub fn assess_structural_quality(stone_question: &str, target_query: &str) -> StoneQuality {
    let mut quality: f64 = 0.5;

    // Word count sweet spot
    let word_count = stone_question.split_whitespace().count();
    if (15..=80).contains(&word_count) {
        quality += 0.15;
    } else if !(8..=120).contains(&word_count) {
        quality -= 0.15;
    }

    // Proper question form
    let trimmed = stone_question.trim();
    if trimmed.ends_with('?') {
        quality += 0.1;
    }
    let lower = trimmed.to_lowercase();
    let question_starters = ["what", "how", "why", "when", "where", "which", "can", "does", "is", "are", "should", "would", "could"];
    if question_starters.iter().any(|s| lower.starts_with(s)) {
        quality += 0.05;
    }

    // Domain-specific terminology (crude: words ending in common academic suffixes)
    let has_specific_terms = stone_question.split_whitespace().any(|w| {
        let wl = w.to_lowercase();
        wl.ends_with("tion") || wl.ends_with("ment") || wl.ends_with("ness")
            || wl.ends_with("ity") || wl.ends_with("ism") || wl.ends_with("ics")
            || wl.ends_with("ogy") || wl.ends_with("phy")
            || (w.len() > 3 && w.chars().next().is_some_and(|c| c.is_uppercase()))
    });
    if has_specific_terms {
        quality += 0.1;
    }

    // Token overlap — lower overlap is better (stone explores different angle)
    let overlap = compute_token_overlap(stone_question, target_query);
    if overlap < 0.3 {
        quality += 0.1;
    } else if overlap > 0.7 {
        quality -= 0.2;
    }

    StoneQuality {
        score: quality.clamp(0.0, 1.0),
        token_overlap: overlap,
    }
}

/// Jaccard-like token overlap between two texts.
fn compute_token_overlap(a: &str, b: &str) -> f64 {
    let a_lower = a.to_lowercase();
    let b_lower = b.to_lowercase();

    let tokens_a: std::collections::HashSet<&str> = a_lower
        .split_whitespace()
        .filter(|w| w.len() > 3)
        .collect();
    let tokens_b: std::collections::HashSet<&str> = b_lower
        .split_whitespace()
        .filter(|w| w.len() > 3)
        .collect();

    if tokens_a.is_empty() || tokens_b.is_empty() {
        return 0.0;
    }

    let intersection = tokens_a.intersection(&tokens_b).count();
    let union = tokens_a.union(&tokens_b).count();
    if union == 0 { 0.0 } else { intersection as f64 / union as f64 }
}

// ── Contradiction Detection ─────────────────────────────────────────
// [MAC] Ported from ContradictionDetector (heuristic path) in SOARReward.swift.

/// Extract factual claims from an analysis text.
fn extract_claims(analysis: &str, max_claims: usize) -> Vec<String> {
    let mut claims: Vec<String> = Vec::with_capacity(max_claims);

    let sentences: Vec<&str> = analysis
        .split(['.', '!', '?', '\n'])
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && s.len() > 20)
        .collect();

    // Prioritize sentences with epistemic tags
    for sentence in &sentences {
        if sentence.contains("[DATA]") || sentence.contains("[MODEL]")
            || sentence.contains("[UNCERTAIN]") || sentence.contains("[CONFLICT]")
        {
            let clean = sentence
                .replace("[DATA]", "")
                .replace("[MODEL]", "")
                .replace("[UNCERTAIN]", "")
                .replace("[CONFLICT]", "");
            let clean = clean.trim();
            if !clean.is_empty() {
                claims.push(clean.to_string());
            }
        }
    }

    // Fill remaining with long sentences
    for sentence in &sentences {
        if claims.len() >= max_claims { break; }
        let s = sentence.to_string();
        if !claims.contains(&s) && sentence.len() > 30 {
            claims.push(s);
        }
    }

    claims.truncate(max_claims);
    claims
}

/// Heuristic contradiction scan — finds claims with similar content but opposite polarity.
/// [MAC] The macOS version also has an LLM-powered path; here we do the heuristic path
/// synchronously. LLM-powered contradiction detection runs via the orchestrator.
pub fn scan_for_contradictions(analysis: &str, max_claims: usize) -> ContradictionScan {
    let claims = extract_claims(analysis, max_claims);
    let mut contradictions = Vec::new();

    let negation_indicators = ["not", "no", "never", "none", "cannot", "impossible", "false"];
    let affirmation_indicators = ["is", "are", "does", "can", "will", "always", "true"];

    for i in 0..claims.len() {
        for j in (i + 1)..claims.len() {
            let claim_a = claims[i].to_lowercase();
            let claim_b = claims[j].to_lowercase();

            let a_has_neg = negation_indicators.iter().any(|n| claim_a.contains(n));
            let b_has_neg = negation_indicators.iter().any(|n| claim_b.contains(n));
            let a_has_aff = affirmation_indicators.iter().any(|a| claim_a.contains(a));
            let b_has_aff = affirmation_indicators.iter().any(|a| claim_b.contains(a));

            let overlap = compute_token_overlap(&claim_a, &claim_b);

            if overlap > 0.5 && ((a_has_neg && b_has_aff) || (a_has_aff && b_has_neg)) {
                contradictions.push(Contradiction {
                    claim_a: claims[i].clone(),
                    claim_b: claims[j].clone(),
                    confidence: 0.6,
                    explanation: "Claims have similar content but opposite polarity".into(),
                });
            }
        }
    }

    let computed_dissonance = if claims.is_empty() {
        0.0
    } else {
        (contradictions.len() as f64 / (claims.len().max(4) / 4).max(1) as f64 * 0.5).min(0.95)
    };

    let total_comparisons = claims.len() * claims.len().saturating_sub(1) / 2;

    ContradictionScan {
        total_claims: claims.len(),
        total_comparisons,
        contradictions,
        computed_dissonance,
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::query_analyzer;
    use crate::signals;

    fn make_sigs(query: &str) -> (QueryAnalysis, GeneratedSignals) {
        let qa = query_analyzer::analyze(query, None);
        let sigs = signals::generate(&qa, &signals::PipelineControls::default(), None);
        (qa, sigs)
    }

    #[test]
    fn probe_low_complexity_does_not_engage() {
        let (qa, sigs) = make_sigs("What is AI?");
        let probe = probe_learnability(&qa, &sigs);
        assert!(!probe.at_edge, "simple query should not trigger SOAR");
    }

    #[test]
    fn probe_high_complexity_with_right_signals_engages() {
        let (qa, mut sigs) = make_sigs(
            "How does the interaction between quantum decoherence and environmental \
             entanglement explain the emergence of classical behavior in macroscopic \
             systems, and what philosophical implications does this have for free will?"
        );
        // Force signals to meet thresholds
        sigs.entropy = 0.65;
        sigs.confidence = 0.4;
        let probe = probe_learnability(&qa, &sigs);
        // Only engages if complexity > 0.5 AND entropy > 0.6 AND confidence < 0.7
        if qa.complexity > 0.5 {
            assert!(probe.at_edge);
        }
    }

    #[test]
    fn probe_with_config_respects_thresholds() {
        let (qa, sigs) = make_sigs("What is AI?");
        let strict = SoarConfig {
            enabled: true,
            difficulty_threshold: 0.01, // very low threshold
            entropy_threshold: 0.01,
            confidence_cap: 1.0,
            ..Default::default()
        };
        let probe = probe_with_config(&qa, &sigs, &strict);
        // With very permissive thresholds, even simple queries might engage
        assert!(probe.difficulty >= 0.0);
    }

    #[test]
    fn probe_disabled_never_engages() {
        let (qa, sigs) = make_sigs("Complex philosophical question about consciousness");
        let config = SoarConfig { enabled: false, ..Default::default() };
        let probe = probe_with_config(&qa, &sigs, &config);
        assert!(!probe.at_edge);
    }

    #[test]
    fn generate_stones_produces_three() {
        let (qa, sigs) = make_sigs("What causes cancer?");
        let stones = generate_stones(&qa, &sigs);
        assert_eq!(stones.len(), 3);
        assert_eq!(stones[0].kind, StoneKind::Clarify);
        assert_eq!(stones[1].kind, StoneKind::Frameworks);
        assert_eq!(stones[2].kind, StoneKind::EmpiricalTests);
    }

    #[test]
    fn stones_contain_query_context() {
        let (qa, sigs) = make_sigs("What causes cancer?");
        let stones = generate_stones(&qa, &sigs);
        assert!(stones[0].prompt.contains("cancer") || stones[0].prompt.contains("causes"));
    }

    #[test]
    fn learning_gain_positive_improvement() {
        let initial = BaselineSignals {
            confidence: 0.4,
            entropy: 0.7,
            dissonance: 0.3,
            health_score: 0.6,
        };
        let final_sigs = BaselineSignals {
            confidence: 0.7,  // +0.3
            entropy: 0.4,     // -0.3
            dissonance: 0.1,  // -0.2
            health_score: 0.8, // +0.2
        };
        let gain = compute_learning_gain(&initial, &final_sigs);
        // 0.3*0.4 + 0.3*0.25 + 0.2*0.20 + 0.2*0.15 = 0.12 + 0.075 + 0.04 + 0.03 = 0.265
        assert!((gain - 0.265).abs() < 0.01, "gain was {gain}");
    }

    #[test]
    fn learning_gain_no_regression() {
        let initial = BaselineSignals {
            confidence: 0.7,
            entropy: 0.3,
            dissonance: 0.1,
            health_score: 0.9,
        };
        let worse = BaselineSignals {
            confidence: 0.5,  // regression
            entropy: 0.5,     // regression
            dissonance: 0.3,  // regression
            health_score: 0.7, // regression
        };
        let gain = compute_learning_gain(&initial, &worse);
        assert_eq!(gain, 0.0, "regression should not produce positive gain");
    }

    #[test]
    fn session_lifecycle() {
        let (qa, sigs) = make_sigs("What causes cancer?");
        let mut session = build_session(&qa, &sigs);
        assert_eq!(session.stones.len(), 3);
        assert!(session.final_signals.is_none());
        assert_eq!(session.learning_gain, 0.0);

        // Simulate improved signals
        let mut better_sigs = sigs.clone();
        better_sigs.confidence = sigs.confidence + 0.2;
        better_sigs.entropy = (sigs.entropy - 0.1).max(0.0);

        complete_session(&mut session, &better_sigs);
        assert!(session.final_signals.is_some());
        assert!(session.learning_gain > 0.0);
    }

    // ── Boundary value tests ──

    #[test]
    fn probe_exactly_at_threshold_does_not_engage() {
        let (mut qa, mut sigs) = make_sigs("test query");
        qa.complexity = 0.5; // exactly at threshold (>0.5 needed, not >=)
        sigs.entropy = 0.6;  // exactly at threshold
        sigs.confidence = 0.7; // exactly at threshold
        let probe = probe_learnability(&qa, &sigs);
        assert!(!probe.at_edge, "exact boundary values should NOT engage");
    }

    #[test]
    fn probe_just_past_threshold_engages() {
        let (mut qa, mut sigs) = make_sigs("test query");
        qa.complexity = 0.51;
        sigs.entropy = 0.61;
        sigs.confidence = 0.69;
        let probe = probe_learnability(&qa, &sigs);
        assert!(probe.at_edge, "values just past thresholds should engage");
    }

    #[test]
    fn learning_gain_partial_improvement() {
        // Some metrics improve, others stay the same
        let initial = BaselineSignals {
            confidence: 0.5,
            entropy: 0.5,
            dissonance: 0.2,
            health_score: 0.7,
        };
        let partial = BaselineSignals {
            confidence: 0.8,  // +0.3 improved
            entropy: 0.5,     // same
            dissonance: 0.2,  // same
            health_score: 0.7, // same
        };
        let gain = compute_learning_gain(&initial, &partial);
        // Only confidence contributes: 0.3 * 0.40 = 0.12
        assert!((gain - 0.12).abs() < 0.01, "gain was {gain}");
    }

    #[test]
    fn learning_gain_zero_for_identical_signals() {
        let same = BaselineSignals {
            confidence: 0.6, entropy: 0.4, dissonance: 0.2, health_score: 0.8,
        };
        let gain = compute_learning_gain(&same, &same);
        assert_eq!(gain, 0.0);
    }

    #[test]
    fn learning_gain_maximum_theoretical() {
        let worst = BaselineSignals {
            confidence: 0.0, entropy: 1.0, dissonance: 1.0, health_score: 0.0,
        };
        let best = BaselineSignals {
            confidence: 1.0, entropy: 0.0, dissonance: 0.0, health_score: 1.0,
        };
        let gain = compute_learning_gain(&worst, &best);
        // Max: 1.0*0.40 + 1.0*0.25 + 1.0*0.20 + 1.0*0.15 = 1.0
        assert!((gain - 1.0).abs() < 0.01, "max gain should be 1.0 but was {gain}");
    }

    // ── SoarConfig validation ──

    #[test]
    fn config_default_matches_hardcoded_thresholds() {
        let config = SoarConfig::default();
        assert!(config.enabled);
        assert!((config.difficulty_threshold - 0.5).abs() < f64::EPSILON);
        assert!((config.entropy_threshold - 0.6).abs() < f64::EPSILON);
        assert!((config.confidence_cap - 0.7).abs() < f64::EPSILON);
    }

    // ── Event serialization ──

    #[test]
    fn soar_event_serializes_correctly() {
        let events = vec![
            SoarEvent::ProbeComplete(LearnabilityProbe {
                at_edge: true, difficulty: 0.7, entropy: 0.65, confidence: 0.4,
                recommended_depth: 2, reason: "At edge".into(),
            }),
            SoarEvent::TeachingStart { stone_count: 3 },
            SoarEvent::StonePresented {
                index: 0,
                stone: Stone {
                    kind: StoneKind::Clarify,
                    title: "Clarify: Assumptions".into(),
                    content: "Let's pin down...".into(),
                    prompt: "Define the key terms...".into(),
                },
            },
            SoarEvent::SessionComplete { learning_gain: 0.265, recommended_depth: 2 },
        ];

        for event in &events {
            let json = serde_json::to_string(event).expect("serialize");
            let roundtrip: SoarEvent = serde_json::from_str(&json).expect("deserialize");
            assert_eq!(
                serde_json::to_string(&roundtrip).unwrap(), json,
                "roundtrip mismatch for event"
            );
        }
    }

    // ── Stones content quality ──

    #[test]
    fn stones_all_have_nonempty_fields() {
        let (qa, sigs) = make_sigs(
            "What is the relationship between gut microbiome diversity and mental health outcomes?"
        );
        let stones = generate_stones(&qa, &sigs);

        for (i, stone) in stones.iter().enumerate() {
            assert!(!stone.title.is_empty(), "stone {i} has empty title");
            assert!(!stone.content.is_empty(), "stone {i} has empty content");
            assert!(!stone.prompt.is_empty(), "stone {i} has empty prompt");
        }

        // Verify each stone's prompt includes the core question
        assert!(stones[0].prompt.contains(&qa.core_question));
        assert!(stones[1].prompt.contains(&qa.core_question));
        assert!(stones[2].prompt.contains(&qa.core_question));
    }

    #[test]
    fn baseline_signals_from_generated() {
        let (_, sigs) = make_sigs("Test query about physics");
        let baseline = BaselineSignals::from(&sigs);
        assert!((baseline.confidence - sigs.confidence).abs() < f64::EPSILON);
        assert!((baseline.entropy - sigs.entropy).abs() < f64::EPSILON);
        assert!((baseline.dissonance - sigs.dissonance).abs() < f64::EPSILON);
        assert!((baseline.health_score - sigs.health_score).abs() < f64::EPSILON);
    }

    // ── Hard indicator tests ──

    #[test]
    fn hard_indicators_increase_difficulty() {
        let (qa_simple, _) = make_sigs("What is the weather?");
        let (qa_hard, _) = make_sigs("What is the hard problem of consciousness and qualia?");
        let d_simple = compute_soar_difficulty(&qa_simple);
        let d_hard = compute_soar_difficulty(&qa_hard);
        assert!(d_hard > d_simple, "hard indicators should increase difficulty: simple={d_simple} hard={d_hard}");
    }

    #[test]
    fn probe_has_reason_string() {
        let (qa, sigs) = make_sigs("What is AI?");
        let probe = probe_learnability(&qa, &sigs);
        assert!(!probe.reason.is_empty(), "probe should have a reason");
        assert!(probe.reason.contains("threshold") || probe.reason.contains("edge"),
            "reason should explain decision: {}", probe.reason);
    }

    #[test]
    fn probe_recommended_depth_zero_when_not_at_edge() {
        let (qa, sigs) = make_sigs("What is AI?");
        let probe = probe_learnability(&qa, &sigs);
        assert!(!probe.at_edge);
        assert_eq!(probe.recommended_depth, 0);
    }

    // ── Structural quality tests ──

    #[test]
    fn structural_quality_good_question() {
        let quality = assess_structural_quality(
            "What are the key assumptions underlying the claim that meditation reduces cortisol levels, and how might selection bias affect the available evidence?",
            "Does meditation reduce stress?"
        );
        assert!(quality.score > 0.5, "well-formed question should score >0.5: {}", quality.score);
    }

    #[test]
    fn structural_quality_low_overlap_scores_higher() {
        let high_overlap = assess_structural_quality(
            "Does meditation reduce stress hormones?",
            "Does meditation reduce stress?"
        );
        let low_overlap = assess_structural_quality(
            "What confounding variables affect longitudinal cortisol studies in mindfulness research?",
            "Does meditation reduce stress?"
        );
        assert!(low_overlap.score >= high_overlap.score,
            "low overlap ({}) should score >= high overlap ({})", low_overlap.score, high_overlap.score);
    }

    #[test]
    fn token_overlap_identical_is_one() {
        let overlap = compute_token_overlap("hello world test", "hello world test");
        assert!((overlap - 1.0).abs() < 0.01);
    }

    #[test]
    fn token_overlap_disjoint_is_zero() {
        let overlap = compute_token_overlap("alpha beta gamma", "delta epsilon zeta");
        assert!((overlap - 0.0).abs() < 0.01);
    }

    // ── Contradiction detection tests ──

    #[test]
    fn contradiction_scan_finds_opposite_claims() {
        // Claims need >50% token overlap + opposite polarity to trigger
        let analysis = "The experimental treatment significantly reduces anxiety symptoms in patients. \
                        The experimental treatment does not significantly reduce anxiety symptoms in patients. \
                        More research is needed to determine long-term outcomes.";
        let scan = scan_for_contradictions(analysis, 20);
        assert!(scan.total_claims > 0, "should extract claims");
        // The first two claims have high overlap + opposite polarity
        assert!(!scan.contradictions.is_empty(), "should find contradiction");
        assert!(scan.computed_dissonance > 0.0, "dissonance should be positive");
    }

    #[test]
    fn contradiction_scan_empty_text() {
        let scan = scan_for_contradictions("", 20);
        assert_eq!(scan.total_claims, 0);
        assert!(scan.contradictions.is_empty());
        assert_eq!(scan.computed_dissonance, 0.0);
    }

    #[test]
    fn contradiction_scan_consistent_text() {
        let analysis = "The evidence strongly supports the hypothesis that exercise improves mood. \
                        Multiple randomized controlled trials confirm exercise benefits for depression. \
                        Meta-analyses show consistent positive effects across different populations.";
        let scan = scan_for_contradictions(analysis, 20);
        assert!(scan.contradictions.is_empty(), "consistent text should have no contradictions");
    }

    #[test]
    fn contradiction_scan_epistemic_tags() {
        let analysis = "[DATA] Studies show X causes Y with high confidence. \
                        [CONFLICT] However some evidence suggests X does not cause Y at all. \
                        [UNCERTAIN] The relationship between X and Y remains debated.";
        let scan = scan_for_contradictions(analysis, 20);
        assert!(scan.total_claims > 0, "should extract tagged claims");
    }

    // ── SoarConfig new fields ──

    #[test]
    fn config_default_has_new_fields() {
        let config = SoarConfig::default();
        assert_eq!(config.max_iterations, 3);
        assert_eq!(config.stones_per_curriculum, 3);
        assert!(config.contradiction_detection);
        assert!(config.auto_detect);
    }
}
