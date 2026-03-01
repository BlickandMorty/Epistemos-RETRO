use serde::{Deserialize, Serialize};
use crate::query_analyzer::QueryAnalysis;

// ── Output Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedSignals {
    pub confidence: f64,
    pub entropy: f64,
    pub dissonance: f64,
    pub health_score: f64,
    pub safety_state: SafetyState,
    pub risk_score: f64,
    pub focus_depth: f64,
    pub temperature_scale: f64,
    pub concepts: Vec<String>,
    pub grade: EvidenceGrade,
    pub mode: AnalysisMode,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SafetyState {
    Green,
    Yellow,
    Red,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceGrade {
    A,
    B,
    C,
    D,
    F,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisMode {
    MetaAnalytical,
    PhilosophicalAnalytical,
    Executive,
    Moderate,
}

// ── Optional overrides ──

#[derive(Debug, Clone, Default)]
pub struct PipelineControls {
    pub complexity_bias: f64,
    pub focus_depth_override: Option<f64>,
    pub temperature_override: Option<f64>,
}

// ── Generator ──

pub fn generate(
    qa: &QueryAnalysis,
    controls: &PipelineControls,
    llm_concepts: Option<&[String]>,
) -> GeneratedSignals {
    let c = (qa.complexity + controls.complexity_bias).clamp(0.0, 1.0);
    let ef = (qa.entities.len() as f64 / 8.0).min(1.0);

    // Confidence: base varies by query type
    let confidence = if qa.is_philosophical {
        0.35 + ef * 0.05
    } else if qa.is_empirical {
        0.55 + ef * 0.05
    } else {
        0.45 + ef * 0.05
    };

    // Entropy: philosophical = higher baseline uncertainty
    let entropy = if qa.is_philosophical {
        0.45 + c * 0.2
    } else {
        0.3 + c * 0.2
    };

    // Dissonance: normative claims = higher
    let dissonance = if qa.has_normative_claims { 0.35 } else { 0.15 };

    // Risk score: safety keywords trigger 0.4 bump
    let risk_score = if qa.has_safety_keywords {
        0.4 + c * 0.2 + ef * 0.1
    } else {
        0.1
    };

    // Safety state from risk thresholds
    let safety_state = if risk_score >= 0.55 {
        SafetyState::Red
    } else if risk_score >= 0.3 {
        SafetyState::Yellow
    } else {
        SafetyState::Green
    };

    // Health: composite of entropy & dissonance, floor at 0.5
    let health_score = (1.0 - entropy * 0.3 - dissonance * 0.2).max(0.5);

    // Focus depth: 3–8 range based on complexity
    let focus_depth = controls.focus_depth_override.unwrap_or(3.0 + c * 5.0);

    // Temperature: philosophical = more creative
    let temperature_scale = controls.temperature_override.unwrap_or(
        if qa.is_philosophical { 0.8 } else { 0.7 },
    );

    // Concepts: from LLM if available, else capitalize entities
    let concepts = if let Some(lc) = llm_concepts {
        if !lc.is_empty() {
            lc.to_vec()
        } else {
            capitalize_entities(&qa.entities)
        }
    } else {
        capitalize_entities(&qa.entities)
    };

    // Grade based on confidence
    let grade = if confidence > 0.5 {
        EvidenceGrade::B
    } else {
        EvidenceGrade::C
    };

    // Analysis mode routing
    let mode = if qa.is_meta_analytical {
        AnalysisMode::MetaAnalytical
    } else if qa.is_philosophical {
        AnalysisMode::PhilosophicalAnalytical
    } else if qa.is_empirical {
        AnalysisMode::Executive
    } else {
        AnalysisMode::Moderate
    };

    GeneratedSignals {
        confidence,
        entropy,
        dissonance,
        health_score,
        safety_state,
        risk_score,
        focus_depth,
        temperature_scale,
        concepts,
        grade,
        mode,
    }
}

fn capitalize_entities(entities: &[String]) -> Vec<String> {
    entities
        .iter()
        .take(6)
        .map(|e| {
            let mut chars = e.chars();
            match chars.next() {
                Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::query_analyzer;

    fn default_controls() -> PipelineControls {
        PipelineControls::default()
    }

    #[test]
    fn empirical_query_has_higher_confidence() {
        let qa = query_analyzer::analyze("What does the clinical trial data show about aspirin?", None);
        let sig = generate(&qa, &default_controls(), None);
        assert!(sig.confidence >= 0.55, "empirical confidence should be >= 0.55, got {}", sig.confidence);
    }

    #[test]
    fn philosophical_query_has_higher_entropy() {
        let qa = query_analyzer::analyze("What is the meaning of consciousness?", None);
        let sig = generate(&qa, &default_controls(), None);
        assert!(sig.entropy >= 0.45, "philosophical entropy should be >= 0.45, got {}", sig.entropy);
    }

    #[test]
    fn safety_keywords_increase_risk() {
        let qa = query_analyzer::analyze("How do weapons cause violence and harm?", None);
        let sig = generate(&qa, &default_controls(), None);
        assert!(sig.risk_score >= 0.4);
        assert_ne!(sig.safety_state, SafetyState::Green);
    }

    #[test]
    fn health_score_never_below_half() {
        let qa = query_analyzer::analyze("Should we blame people for moral wrongs involving violence?", None);
        let sig = generate(&qa, &default_controls(), None);
        assert!(sig.health_score >= 0.5);
    }

    #[test]
    fn focus_depth_scales_with_complexity() {
        let simple = query_analyzer::analyze("What is AI?", None);
        let complex = query_analyzer::analyze(
            "Explain the causal relationship between quantum decoherence and the emergence \
             of classical behavior in macroscopic systems with particular attention to \
             environmental entanglement theory",
            None,
        );
        let sig_s = generate(&simple, &default_controls(), None);
        let sig_c = generate(&complex, &default_controls(), None);
        assert!(sig_c.focus_depth > sig_s.focus_depth);
    }

    #[test]
    fn mode_routing() {
        let meta = query_analyzer::analyze("What do meta-analyses show about heterogeneity across studies?", None);
        assert_eq!(generate(&meta, &default_controls(), None).mode, AnalysisMode::MetaAnalytical);

        let phil = query_analyzer::analyze("What is the meaning of existence?", None);
        assert_eq!(generate(&phil, &default_controls(), None).mode, AnalysisMode::PhilosophicalAnalytical);
    }
}
