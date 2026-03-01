//! System prompt composition for the 3-pass SOAR pipeline.
//!
//! - Pass 1: Direct streaming answer with evidence hierarchy
//! - Pass 2: Epistemic Lens — deep 6000+ token analysis
//! - Pass 3: Consolidated JSON — layman summary, reflection, arbitration, truth

use crate::pipeline::EpistemicTagCounts;
use crate::query_analyzer::QueryAnalysis;
use crate::signals::{AnalysisMode, GeneratedSignals, PipelineControls};

// ── Pass 1: Streaming Direct Answer ──────────────────────────────────

/// Build the system prompt for Pass 1 (streaming direct answer).
pub fn pass1_system_prompt(qa: &QueryAnalysis, sigs: &GeneratedSignals) -> String {
    let mut prompt = String::with_capacity(2048);

    prompt.push_str(PREAMBLE);
    prompt.push_str(EVIDENCE_HIERARCHY);

    // Analytical mode
    prompt.push_str(match sigs.mode {
        AnalysisMode::MetaAnalytical => RESEARCH_MODE,
        AnalysisMode::PhilosophicalAnalytical => RESEARCH_MODE,
        AnalysisMode::Executive => RESEARCH_MODE,
        AnalysisMode::Moderate => PLAIN_MODE,
    });

    // Response structure
    prompt.push_str(RESPONSE_STRUCTURE);
    prompt.push_str(INTELLECTUAL_HONESTY);

    // Domain/type metadata
    prompt.push_str(&format!(
        "\n\nQuery metadata:\n\
         - Domain: {:?}\n\
         - Question type: {:?}\n\
         - Complexity: {:.2}\n\
         - Key entities: {}\n\
         - Emotional valence: {:?}\n",
        qa.domain,
        qa.question_type,
        qa.complexity,
        qa.key_terms.join(", "),
        qa.emotional_valence,
    ));

    // Concept emphasis
    if !sigs.concepts.is_empty() {
        prompt.push_str(&format!(
            "\nEmphasize these concepts in your analysis: {}",
            sigs.concepts.join(", ")
        ));
    }

    prompt
}

/// Build the user-facing prompt for Pass 1 (includes the query + steering).
pub fn pass1_user_prompt(
    query: &str,
    sigs: &GeneratedSignals,
    controls: &PipelineControls,
) -> String {
    let mut prompt = String::with_capacity(1024);

    prompt.push_str(query);

    // Steering directives
    prompt.push_str(&compose_steering(sigs, controls));

    prompt
}

// ── Pass 2: Epistemic Lens (Deep Analysis) ───────────────────────────

/// Build the system prompt for Pass 2 (epistemic lens — deep background analysis).
pub fn pass2_system_prompt(qa: &QueryAnalysis, sigs: &GeneratedSignals) -> String {
    let mut prompt = String::with_capacity(4096);

    prompt.push_str(PREAMBLE);
    prompt.push_str(EVIDENCE_HIERARCHY);
    prompt.push_str(RESEARCH_MODE);

    // Adaptive paragraph count
    let (min_para, max_para) = if qa.complexity >= 0.6 {
        (8, 12)
    } else {
        (5, 8)
    };

    prompt.push_str(&format!(
        "\n\nRespond with a deep analytical essay ({min_para}-{max_para} paragraphs) covering:\n\
         \n\
         1. **Direct answer** (1-2 paragraphs)\n\
            Give a clear, direct answer first. No hedging.\n\
         \n\
         2. **Evidence and reasoning** (2-4 paragraphs)\n\
            Cite specific evidence tiers. Name studies, effect sizes, sample sizes where possible.\n\
            Tag empirical claims with [DATA] and theoretical assumptions with [MODEL].\n\
            Mark genuine unknowns with [UNCERTAIN] and contradictions with [CONFLICT].\n\
         \n\
         3. **The honest reckoning** (1-2 paragraphs)\n\
            What is the uncomfortable truth here? Never smooth over contradictions in the evidence.\n\
            Name them, sit with them, analyze them.\n\
         \n\
         4. **Counterarguments and paradoxes** (1-2 paragraphs)\n\
            Steel-man the strongest opposing argument. Apply reductio ad absurdum.\n\
            Check for survivorship bias, anchoring, edge cases.\n\
         \n\
         5. **Nuance and open questions** (1-2 paragraphs)\n\
            What remains genuinely unknown? What would change your assessment?\n\
         \n\
         6. **Sources & References** (list)\n\
            Name specific sources you are drawing on.\n\
         \n\
         CRITICAL INSTRUCTIONS:\n\
         - Ask 'what INPUTS produced this OUTPUT?' rather than stopping at surface description.\n\
         - Acknowledge when your analysis itself contains a performative tension.\n\
         - Never smooth over contradictions. Name them, sit with them, analyze them.\n\
         - Use epistemic tags: [DATA], [MODEL], [UNCERTAIN], [CONFLICT]\n"
    ));

    prompt.push_str(INTELLECTUAL_HONESTY);

    // Query metadata
    prompt.push_str(&format!(
        "\n\nAnalysis context:\n\
         - Domain: {:?}, Question type: {:?}, Complexity: {:.2}\n\
         - Confidence: {:.2}, Entropy: {:.2}, Dissonance: {:.2}\n\
         - Mode: {:?}\n\
         - Key terms: {}\n",
        qa.domain, qa.question_type, qa.complexity,
        sigs.confidence, sigs.entropy, sigs.dissonance,
        sigs.mode,
        qa.key_terms.join(", "),
    ));

    prompt
}

/// Build the user prompt for Pass 2.
pub fn pass2_user_prompt(query: &str, direct_answer: &str) -> String {
    format!(
        "Original query: {query}\n\n\
         Direct answer already provided:\n{direct_answer}\n\n\
         Now provide the deep epistemic lens analysis. \
         Go beyond the direct answer. Challenge it. Find what it missed."
    )
}

// ── Pass 3: Consolidated JSON ────────────────────────────────────────

/// Build the system prompt for Pass 3 (consolidated structured output).
pub fn pass3_system_prompt(
    qa: &QueryAnalysis,
    sigs: &GeneratedSignals,
    tags: &EpistemicTagCounts,
) -> String {
    let mut prompt = String::with_capacity(6144);

    prompt.push_str(
        "You are a calibrated epistemic assessor. \
         Produce a single JSON object with four sections. \
         Return ONLY valid JSON, no markdown fences.\n\n"
    );

    // Layman summary section labels (adaptive)
    let (tried, likely, conf, change, trust) =
        crate::pipeline::adaptive_labels(&qa.question_type);

    prompt.push_str(&format!(
        "1. \"laymanSummary\": {{\n\
         \t\"whatWasTried\": {{\"label\": \"{tried}\", \"content\": \"2-3 sentences\"}},\n\
         \t\"whatIsLikelyTrue\": {{\"label\": \"{likely}\", \"content\": \"2-3 sentences\"}},\n\
         \t\"confidenceExplanation\": {{\"label\": \"{conf}\", \"content\": \"2-3 sentences\"}},\n\
         \t\"whatCouldChange\": {{\"label\": \"{change}\", \"content\": \"2-3 sentences\"}},\n\
         \t\"whoShouldTrust\": {{\"label\": \"{trust}\", \"content\": \"2-3 sentences\"}}\n\
         }}\n\n"
    ));

    prompt.push_str(
        "2. \"reflection\": {\n\
         \t\"selfCriticalQuestions\": [\"5-7 pointed questions exposing genuine weaknesses\"],\n\
         \t\"adjustments\": [\"CLAIM → ADJUSTMENT → REASON (3-5 items)\"],\n\
         \t\"leastDefensibleClaim\": \"single weakest claim with explanation\",\n\
         \t\"precisionVsEvidenceCheck\": \"assessment of claimed precision vs evidence\"\n\
         }\n\n\
         Critique methods to apply:\n\
         - Steel-man test (strongest opposing argument)\n\
         - Reductio ad absurdum\n\
         - Edge case analysis\n\
         - Missing evidence audit\n\
         - Survivorship bias check\n\
         - Anchoring detection\n\n"
    );

    prompt.push_str(
        "3. \"arbitration\": {\n\
         \t\"consensus\": true/false (true ONLY if ≥4/5 engines agree),\n\
         \t\"votes\": [\n\
         \t\t{\"engine\": \"statistical\", \"position\": \"supports|opposes|neutral\", \"reasoning\": \"2-4 sentences\", \"confidence\": 0.0-1.0},\n\
         \t\t{\"engine\": \"causal\", ...},\n\
         \t\t{\"engine\": \"bayesian\", ...},\n\
         \t\t{\"engine\": \"meta_analysis\", ...},\n\
         \t\t{\"engine\": \"adversarial\", ...}\n\
         \t],\n\
         \t\"disagreements\": [\"2-4 specific disagreements\"],\n\
         \t\"resolution\": \"2-4 sentence synthesis\"\n\
         }\n\n\
         Engine domains:\n\
         - statistical: tests, effect sizes, sample sizes, replication\n\
         - causal: DAGs, Bradford Hill, confounding\n\
         - bayesian: prior-likelihood balance, updating\n\
         - meta_analysis: cross-study heterogeneity, publication bias\n\
         - adversarial: counterarguments, weakest assumptions, alternatives\n\n"
    );

    prompt.push_str(
        "4. \"truthAssessment\": {\n\
         \t\"signalInterpretation\": \"4-6 sentences reasoning through evidence BEFORE the number\",\n\
         \t\"overallTruthLikelihood\": 0.05-0.95 (NEVER exactly 0.50, 0.70, or 0.80),\n\
         \t\"weaknesses\": [\"3-5 specific, actionable weaknesses\"],\n\
         \t\"improvements\": [\"3-5 specific improvements — NAME exact studies or data needed\"],\n\
         \t\"blindSpots\": [\"2-4 areas the analysis may have missed\"],\n\
         \t\"confidenceCalibration\": \"2-3 sentences cross-checking against anchors below\",\n\
         \t\"dataVsModelBalance\": \"X% data-driven, Y% model-based, Z% heuristic (sum to 100)\",\n\
         \t\"recommendedActions\": [\"3-5 next steps prefixed with [ACT NOW], [WAIT], or [INVESTIGATE]\"]\n\
         }\n\n"
    );

    // Calibration anchors
    prompt.push_str(CALIBRATION_ANCHORS);

    // Hard rules
    prompt.push_str(&format!(
        "\n\nEPISTEMIC CONTEXT:\n\
         - Tags found in analysis: [DATA]×{}, [MODEL]×{}, [UNCERTAIN]×{}, [CONFLICT]×{}\n\
         - {}\n\
         - Current signals: confidence={:.2}, entropy={:.2}, dissonance={:.2}\n\
         - Mode: {:?}\n",
        tags.data, tags.model, tags.uncertain, tags.conflict,
        if tags.conflicts_dominate() {
            "WARNING: Conflicts outnumber data claims. Cap truthLikelihood at 0.60."
        } else {
            "Data claims outnumber conflicts."
        },
        sigs.confidence, sigs.entropy, sigs.dissonance,
        sigs.mode,
    ));

    prompt
}

/// Build the user prompt for Pass 3.
pub fn pass3_user_prompt(query: &str, raw_analysis: &str) -> String {
    // Truncate raw analysis to avoid token limits
    let analysis = if raw_analysis.len() > 8000 {
        &raw_analysis[..raw_analysis.char_indices()
            .nth(8000)
            .map_or(raw_analysis.len(), |(i, _)| i)]
    } else {
        raw_analysis
    };

    format!(
        "Original query: {query}\n\n\
         Deep analysis (epistemic lens):\n{analysis}\n\n\
         Now produce the consolidated JSON assessment."
    )
}

// ── Steering Composition ─────────────────────────────────────────────

fn compose_steering(sigs: &GeneratedSignals, controls: &PipelineControls) -> String {
    let mut directives = Vec::new();

    // Complexity bias
    if controls.complexity_bias > 0.1 {
        directives.push(
            "This question has more layers than it might initially appear. \
             Go deeper than the surface-level answer."
                .to_string(),
        );
    } else if controls.complexity_bias < -0.1 {
        directives.push("Keep the response focused and accessible.".to_string());
    }

    // Focus depth
    if sigs.focus_depth > 6.0 {
        directives.push(
            "Go deep on this topic — the reader wants specialist-level treatment.".to_string(),
        );
    }

    // Entropy-based
    if sigs.entropy > 0.5 {
        directives.push(
            "Surface disagreements between evidence streams. Don't force false consensus."
                .to_string(),
        );
    }

    // Dissonance
    if sigs.dissonance > 0.3 {
        directives.push("Analyze why this topic contains internal contradictions.".to_string());
    }

    if directives.is_empty() {
        String::new()
    } else {
        format!("\n\n[Analytical steering]\n{}", directives.join("\n"))
    }
}

// ── Static Prompt Fragments ──────────────────────────────────────────

const PREAMBLE: &str = "\
You are Epistemos, an epistemic research assistant. Your purpose is to provide \
rigorous, evidence-based analysis that helps the user think more clearly about \
complex questions. You never simply agree or disagree — you analyze.\n\n";

const EVIDENCE_HIERARCHY: &str = "\
Evidence hierarchy (cite tier when possible):\n\
Tier 1: Systematic reviews, meta-analyses, Cochrane, pre-registered replications\n\
Tier 2: Large-N RCTs (N>500), prospective cohort studies\n\
Tier 3: Small RCTs, case-control studies, well-designed observational\n\
Tier 4: Case series, expert consensus (Delphi), clinical guidelines\n\
Tier 5: Expert opinion, editorials, theoretical reasoning\n\n";

const RESEARCH_MODE: &str = "\
Use a rigorous, evidence-based approach. Support significant claims with evidence. \
Distinguish between what the data shows and what models predict. \
Name specific sources when possible.\n\n";

const PLAIN_MODE: &str = "\
Provide a clear, well-organized answer. Be thorough but accessible. \
Use examples where helpful.\n\n";

const RESPONSE_STRUCTURE: &str = "\
Structure your response clearly:\n\
1. Direct answer first (no hedging)\n\
2. Supporting evidence and reasoning\n\
3. Important caveats or counterpoints\n\
4. What remains uncertain\n\n";

const INTELLECTUAL_HONESTY: &str = "\
Intellectual honesty principles:\n\
- Say \"I don't know\" when you genuinely don't know\n\
- Distinguish correlation from causation\n\
- Name the strongest counterargument before refuting it\n\
- Never smooth over contradictions — name them and analyze them\n\
- If your confidence is low, say so explicitly\n\
- Cite the strength of evidence, not just the conclusion\n";

const CALIBRATION_ANCHORS: &str = "\
Calibration anchors (use these to cross-check your number):\n\
0.90-0.95: Near-certain — Tier 1-2 evidence, replicated ≥3×, expert consensus\n\
0.70-0.89: Probable — Tier 2-3, partially replicated, majority agreement\n\
0.50-0.69: Uncertain-leaning — mixed evidence, active debate\n\
0.30-0.49: Genuinely uncertain — thin or conflicting evidence\n\
0.05-0.29: Unlikely as stated — evidence contradicts the claim\n";

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::query_analyzer;
    use crate::signals;

    fn make_qa_sigs(query: &str) -> (QueryAnalysis, GeneratedSignals) {
        let qa = query_analyzer::analyze(query, None);
        let sigs = signals::generate(&qa, &PipelineControls::default(), None);
        (qa, sigs)
    }

    #[test]
    fn pass1_prompt_contains_preamble_and_hierarchy() {
        let (qa, sigs) = make_qa_sigs("What causes cancer?");
        let prompt = pass1_system_prompt(&qa, &sigs);
        assert!(prompt.contains("Epistemos"));
        assert!(prompt.contains("Tier 1"));
        assert!(prompt.contains("Medical"));
    }

    #[test]
    fn pass2_prompt_contains_epistemic_tags_instruction() {
        let (qa, sigs) = make_qa_sigs("What causes cancer?");
        let prompt = pass2_system_prompt(&qa, &sigs);
        assert!(prompt.contains("[DATA]"));
        assert!(prompt.contains("[CONFLICT]"));
        assert!(prompt.contains("honest reckoning"));
    }

    #[test]
    fn pass3_prompt_contains_all_four_sections() {
        let (qa, sigs) = make_qa_sigs("What causes cancer?");
        let tags = EpistemicTagCounts { data: 3, model: 1, uncertain: 1, conflict: 0 };
        let prompt = pass3_system_prompt(&qa, &sigs, &tags);
        assert!(prompt.contains("laymanSummary"));
        assert!(prompt.contains("reflection"));
        assert!(prompt.contains("arbitration"));
        assert!(prompt.contains("truthAssessment"));
    }

    #[test]
    fn pass3_warns_on_conflict_dominance() {
        let (qa, sigs) = make_qa_sigs("What causes cancer?");
        let tags = EpistemicTagCounts { data: 1, model: 0, uncertain: 0, conflict: 3 };
        let prompt = pass3_system_prompt(&qa, &sigs, &tags);
        assert!(prompt.contains("Conflicts outnumber data"));
        assert!(prompt.contains("0.60"));
    }

    #[test]
    fn steering_adds_depth_directive() {
        let mut sigs = signals::generate(
            &query_analyzer::analyze("complex topic", None),
            &PipelineControls::default(),
            None,
        );
        sigs.focus_depth = 8.0;
        let steering = compose_steering(&sigs, &PipelineControls::default());
        assert!(steering.contains("specialist-level"));
    }

    #[test]
    fn pass2_user_prompt_includes_direct_answer() {
        let prompt = pass2_user_prompt("What is AI?", "AI is artificial intelligence.");
        assert!(prompt.contains("AI is artificial intelligence"));
        assert!(prompt.contains("epistemic lens"));
    }

    #[test]
    fn pass3_user_prompt_truncates_long_analysis() {
        let long_analysis = "x".repeat(20000);
        let prompt = pass3_user_prompt("test", &long_analysis);
        assert!(prompt.len() < 20500);
    }

    #[test]
    fn adaptive_labels_vary_by_question_type() {
        use crate::query_analyzer::QuestionType;
        let (tried, _, _, _, _) = crate::pipeline::adaptive_labels(&QuestionType::Causal);
        assert_eq!(tried, "Causal analysis");

        let (tried, _, _, _, _) = crate::pipeline::adaptive_labels(&QuestionType::Empirical);
        assert_eq!(tried, "Methodology");
    }
}
