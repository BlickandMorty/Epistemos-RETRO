use crate::query_analyzer;

// ── Routing Decision ──

/// Binary routing (Local vs Cloud). Backward-compatible.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriageDecision {
    Local,
    Cloud,
}

/// Three-tier routing: NPU (Foundry Local) → GPU (Ollama/CUDA) → Cloud APIs.
///
/// Maps to Dell XPS 16 9640 hardware stack:
/// - NPU: Intel Core Ultra 7 155H (11 TOPS), Phi-3.5-mini via Foundry Local (~50ms)
/// - GPU: NVIDIA RTX 4060 50W (CUDA), GPT-OSS 20B via Ollama (~500ms)
/// - Cloud: Claude/GPT/Gemini APIs (~3-8s)
///
/// Ollama does NOT support NPU — only CUDA/ROCm/Metal/Vulkan.
/// For NPU inference, use Foundry Local (DirectML, OpenAI-compatible REST).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TriageTier {
    /// Intel NPU via Foundry Local — sub-100ms, small models.
    /// Best for: grammar, summaries, short Q&A, quick edits.
    Npu,
    /// NVIDIA GPU via Ollama/CUDA — ~500ms, medium models.
    /// Best for: expansions, outlines, moderate analysis, brainstorming.
    Gpu,
    /// Cloud API — ~3-8s, large frontier models.
    /// Best for: deep analysis, epistemic lens, learning mode, long-form, SOAR.
    Cloud,
}

// ── Operation Complexity ──

#[derive(Debug, Clone, Copy)]
pub enum NotesOperation {
    GrammarFix,
    Summarize,
    Rewrite,
    ContinueWriting,
    Ask,
    Outline,
    Expand,
    Analyze,
    Learn,
}

impl NotesOperation {
    fn base_complexity(self) -> f64 {
        match self {
            Self::GrammarFix => 0.15,
            Self::Summarize => 0.20,
            Self::Rewrite => 0.25,
            Self::ContinueWriting => 0.30,
            Self::Ask => 0.35,
            Self::Outline => 0.40,
            Self::Expand => 0.50,
            Self::Analyze => 0.60,
            Self::Learn => 0.70,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum GeneralOperation {
    Brainstorm,
    ChatResponse,
    EpistemicLens,
    ApiOnly,
}

impl GeneralOperation {
    fn base_complexity(self) -> f64 {
        match self {
            Self::Brainstorm => 0.25,
            Self::ChatResponse => 0.35,
            Self::EpistemicLens => 0.65,
            Self::ApiOnly => 1.00,
        }
    }
}

// ── Triage Logic ──

const COMPLEXITY_THRESHOLD: f64 = 0.25;
const MAX_LOCAL_CONTENT_LENGTH: usize = 6_000;

pub fn triage_notes(
    operation: NotesOperation,
    content_length: usize,
    query: Option<&str>,
    has_cloud_key: bool,
    has_local: bool,
) -> TriageDecision {
    // No cloud key but local available → force local
    if !has_cloud_key && has_local {
        return TriageDecision::Local;
    }

    // No local → must use cloud
    if !has_local {
        return TriageDecision::Cloud;
    }

    // Content too long for local
    if content_length > MAX_LOCAL_CONTENT_LENGTH {
        return TriageDecision::Cloud;
    }

    let mut complexity = operation.base_complexity();
    complexity += (content_length as f64 / 60_000.0).min(0.20);

    if let Some(q) = query {
        if !q.is_empty() {
            let qa = query_analyzer::analyze(q, None);
            complexity += qa.complexity * 0.30;
        }
    }

    complexity = complexity.min(1.0);

    if complexity <= COMPLEXITY_THRESHOLD {
        TriageDecision::Local
    } else {
        TriageDecision::Cloud
    }
}

pub fn triage_general(
    operation: GeneralOperation,
    query: Option<&str>,
    has_cloud_key: bool,
    has_local: bool,
) -> TriageDecision {
    if !has_cloud_key && has_local {
        return TriageDecision::Local;
    }
    if !has_local {
        return TriageDecision::Cloud;
    }

    let mut complexity = operation.base_complexity();

    if let Some(q) = query {
        if !q.is_empty() {
            let qa = query_analyzer::analyze(q, None);
            complexity += qa.complexity * 0.30;
        }
    }

    complexity = complexity.min(1.0);

    if complexity <= COMPLEXITY_THRESHOLD {
        TriageDecision::Local
    } else {
        TriageDecision::Cloud
    }
}

// ── Three-Tier Triage ──
//
// Three-tier triage routes to the optimal hardware tier based on:
//  1. Task complexity (determines minimum model size needed)
//  2. Content length (NPU models can't handle 6K+ tokens well)
//  3. Available services (Foundry Local, Ollama, cloud APIs)

/// NPU handles complexity ≤ 0.25 (grammar fixes, short summaries).
const NPU_COMPLEXITY_CEILING: f64 = 0.25;
/// GPU handles complexity ≤ 0.55 (moderate analysis, outlines, brainstorming).
const GPU_COMPLEXITY_CEILING: f64 = 0.55;
/// Foundry Local / NPU models can't handle very long contexts.
const MAX_NPU_CONTENT_LENGTH: usize = 2_000;
/// Ollama / GPU models handle medium contexts.
const MAX_GPU_CONTENT_LENGTH: usize = 6_000;

/// Available inference services on this machine.
#[derive(Debug, Clone, Copy)]
pub struct InferenceAvailability {
    /// Foundry Local is running (NPU / DirectML)
    pub has_npu: bool,
    /// Ollama is running (GPU / CUDA)
    pub has_gpu: bool,
    /// Cloud API key is configured
    pub has_cloud: bool,
}

/// Three-tier triage for notes operations.
///
/// Routes: NPU (Foundry Local) → GPU (Ollama) → Cloud
pub fn triage_notes_3tier(
    operation: NotesOperation,
    content_length: usize,
    query: Option<&str>,
    availability: InferenceAvailability,
) -> TriageTier {
    let complexity = compute_complexity(operation.base_complexity(), content_length, query);

    // Determine ideal tier based on complexity + content length
    let ideal = if complexity <= NPU_COMPLEXITY_CEILING && content_length <= MAX_NPU_CONTENT_LENGTH {
        TriageTier::Npu
    } else if complexity <= GPU_COMPLEXITY_CEILING && content_length <= MAX_GPU_CONTENT_LENGTH {
        TriageTier::Gpu
    } else {
        TriageTier::Cloud
    };

    // Fallback cascade: if ideal tier is unavailable, try the next one
    match ideal {
        TriageTier::Npu => {
            if availability.has_npu { return TriageTier::Npu; }
            if availability.has_gpu { return TriageTier::Gpu; }
            TriageTier::Cloud
        }
        TriageTier::Gpu => {
            if availability.has_gpu { return TriageTier::Gpu; }
            // Don't fall back to NPU for GPU-complexity tasks — too complex for small models
            if availability.has_cloud { return TriageTier::Cloud; }
            // Last resort: try NPU anyway
            if availability.has_npu { return TriageTier::Npu; }
            TriageTier::Cloud
        }
        TriageTier::Cloud => {
            if availability.has_cloud { return TriageTier::Cloud; }
            // Fallback to GPU for cloud-level tasks (may produce lower quality)
            if availability.has_gpu { return TriageTier::Gpu; }
            if availability.has_npu { return TriageTier::Npu; }
            TriageTier::Cloud // No services — caller will get an error
        }
    }
}

/// Three-tier triage for general operations.
pub fn triage_general_3tier(
    operation: GeneralOperation,
    query: Option<&str>,
    availability: InferenceAvailability,
) -> TriageTier {
    let complexity = compute_general_complexity(operation.base_complexity(), query);
    let content_length = query.map(|q| q.len()).unwrap_or(0);

    let ideal = if complexity <= NPU_COMPLEXITY_CEILING && content_length <= MAX_NPU_CONTENT_LENGTH {
        TriageTier::Npu
    } else if complexity <= GPU_COMPLEXITY_CEILING && content_length <= MAX_GPU_CONTENT_LENGTH {
        TriageTier::Gpu
    } else {
        TriageTier::Cloud
    };

    match ideal {
        TriageTier::Npu => {
            if availability.has_npu { return TriageTier::Npu; }
            if availability.has_gpu { return TriageTier::Gpu; }
            TriageTier::Cloud
        }
        TriageTier::Gpu => {
            if availability.has_gpu { return TriageTier::Gpu; }
            if availability.has_cloud { return TriageTier::Cloud; }
            if availability.has_npu { return TriageTier::Npu; }
            TriageTier::Cloud
        }
        TriageTier::Cloud => {
            if availability.has_cloud { return TriageTier::Cloud; }
            if availability.has_gpu { return TriageTier::Gpu; }
            if availability.has_npu { return TriageTier::Npu; }
            TriageTier::Cloud
        }
    }
}

fn compute_complexity(base: f64, content_length: usize, query: Option<&str>) -> f64 {
    let mut c = base;
    c += (content_length as f64 / 60_000.0).min(0.20);
    if let Some(q) = query {
        if !q.is_empty() {
            let qa = query_analyzer::analyze(q, None);
            c += qa.complexity * 0.30;
        }
    }
    c.min(1.0)
}

fn compute_general_complexity(base: f64, query: Option<&str>) -> f64 {
    let mut c = base;
    if let Some(q) = query {
        if !q.is_empty() {
            let qa = query_analyzer::analyze(q, None);
            c += qa.complexity * 0.30;
        }
    }
    c.min(1.0)
}

// ── Refusal Detection ──

const REFUSAL_PATTERNS: &[&str] = &[
    "i can't help", "i cannot help",
    "i'm not able to", "i am not able to",
    "i don't have the ability",
    "i'm unable to", "i am unable to",
    "as an ai",
    "i can't assist", "i cannot assist",
    "i'm sorry, but i can't", "i'm sorry, but i cannot",
    "beyond my capabilities", "outside my capabilities",
    "not something i can do",
    "i don't have enough context",
    "i can't provide", "i cannot provide",
    "could not help", "couldn't help",
    "as a language model created by apple",
    "beyond my remit",
    "adhere to ethical guidelines",
    "i'm not able to assist", "i am not able to assist",
    "i'm sorry, but as a language model",
    "i am sorry, but as a language model",
    "ensure the safety and well-being",
    "is beyond my", "outside my remit",
    "not within my capabilities",
    "i'm designed to", "as an apple",
];

pub fn is_refusal(text: &str) -> bool {
    let check = text.chars().take(500).collect::<String>().to_lowercase();
    REFUSAL_PATTERNS.iter().any(|p| check.contains(p))
}

pub fn is_truncated(text: &str) -> bool {
    let trimmed = text.trim();

    if trimmed.len() < 20 {
        return true;
    }

    if trimmed.len() > 40 {
        if let Some(last_char) = trimmed.chars().last() {
            let terminal = ['.', '!', '?', ':', ')', ']', '"', '\'', '`', '-', '*'];
            if !terminal.contains(&last_char) {
                // Exclude list/code blocks
                let last_line = trimmed.lines().last().unwrap_or("");
                let is_list_or_code = last_line.starts_with('-')
                    || last_line.starts_with('*')
                    || last_line.starts_with("```")
                    || last_line.starts_with("  ");
                if !is_list_or_code {
                    return true;
                }
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grammar_fix_routes_local() {
        let d = triage_notes(NotesOperation::GrammarFix, 100, None, true, true);
        assert_eq!(d, TriageDecision::Local);
    }

    #[test]
    fn analyze_routes_cloud() {
        let d = triage_notes(NotesOperation::Analyze, 100, None, true, true);
        assert_eq!(d, TriageDecision::Cloud);
    }

    #[test]
    fn no_cloud_key_forces_local() {
        let d = triage_notes(NotesOperation::Analyze, 100, None, false, true);
        assert_eq!(d, TriageDecision::Local);
    }

    #[test]
    fn long_content_forces_cloud() {
        let d = triage_notes(NotesOperation::GrammarFix, 7000, None, true, true);
        assert_eq!(d, TriageDecision::Cloud);
    }

    #[test]
    fn refusal_detected() {
        assert!(is_refusal("I'm sorry, but I can't help with that request."));
        assert!(is_refusal("As an AI, I'm not able to assist with dangerous topics."));
        assert!(!is_refusal("Here's the analysis you requested:"));
    }

    #[test]
    fn truncation_detected() {
        assert!(is_truncated("Short"));
        assert!(is_truncated("This is a sentence that ends without any punctuation and keeps going on"));
        assert!(!is_truncated("This is a complete sentence."));
        assert!(!is_truncated("- This is a list item without punctuation"));
    }

    // ── Three-tier triage tests ──

    const ALL_AVAILABLE: InferenceAvailability = InferenceAvailability {
        has_npu: true,
        has_gpu: true,
        has_cloud: true,
    };

    #[test]
    fn grammar_fix_routes_npu() {
        let tier = triage_notes_3tier(NotesOperation::GrammarFix, 100, None, ALL_AVAILABLE);
        assert_eq!(tier, TriageTier::Npu);
    }

    #[test]
    fn expand_routes_gpu() {
        let tier = triage_notes_3tier(NotesOperation::Expand, 500, None, ALL_AVAILABLE);
        assert_eq!(tier, TriageTier::Gpu);
    }

    #[test]
    fn analyze_routes_cloud_3tier() {
        let tier = triage_notes_3tier(NotesOperation::Analyze, 500, None, ALL_AVAILABLE);
        assert_eq!(tier, TriageTier::Cloud);
    }

    #[test]
    fn npu_unavailable_falls_to_gpu() {
        let avail = InferenceAvailability { has_npu: false, has_gpu: true, has_cloud: true };
        let tier = triage_notes_3tier(NotesOperation::GrammarFix, 100, None, avail);
        assert_eq!(tier, TriageTier::Gpu);
    }

    #[test]
    fn only_cloud_available() {
        let avail = InferenceAvailability { has_npu: false, has_gpu: false, has_cloud: true };
        let tier = triage_notes_3tier(NotesOperation::GrammarFix, 100, None, avail);
        assert_eq!(tier, TriageTier::Cloud);
    }

    #[test]
    fn long_content_bypasses_npu() {
        // 3000 chars > MAX_NPU_CONTENT_LENGTH (2000), so even simple ops go to GPU
        let tier = triage_notes_3tier(NotesOperation::GrammarFix, 3000, None, ALL_AVAILABLE);
        assert_eq!(tier, TriageTier::Gpu);
    }

    #[test]
    fn epistemic_lens_always_cloud() {
        let tier = triage_general_3tier(GeneralOperation::EpistemicLens, None, ALL_AVAILABLE);
        assert_eq!(tier, TriageTier::Cloud);
    }

    #[test]
    fn brainstorm_routes_gpu_with_query() {
        // Brainstorm base=0.25, query adds complexity → exceeds NPU ceiling
        let tier = triage_general_3tier(GeneralOperation::Brainstorm, Some("ideas"), ALL_AVAILABLE);
        assert_eq!(tier, TriageTier::Gpu);
    }

    #[test]
    fn brainstorm_routes_npu_without_query() {
        // Brainstorm base=0.25 with no query → exactly at NPU ceiling (<=)
        let tier = triage_general_3tier(GeneralOperation::Brainstorm, None, ALL_AVAILABLE);
        assert_eq!(tier, TriageTier::Npu);
    }

    #[test]
    fn triage_tier_serializes() {
        assert_eq!(serde_json::to_string(&TriageTier::Npu).unwrap(), "\"npu\"");
        assert_eq!(serde_json::to_string(&TriageTier::Gpu).unwrap(), "\"gpu\"");
        assert_eq!(serde_json::to_string(&TriageTier::Cloud).unwrap(), "\"cloud\"");
    }
}
