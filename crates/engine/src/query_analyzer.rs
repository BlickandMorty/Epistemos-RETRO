use regex::Regex;
use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

// ── Output Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryAnalysis {
    pub domain: AnalysisDomain,
    pub question_type: QuestionType,
    pub entities: Vec<String>,
    pub core_question: String,
    pub complexity: f64,
    pub is_empirical: bool,
    pub is_philosophical: bool,
    pub is_meta_analytical: bool,
    pub has_safety_keywords: bool,
    pub has_normative_claims: bool,
    pub key_terms: Vec<String>,
    pub emotional_valence: EmotionalValence,
    pub is_follow_up: bool,
    pub follow_up_focus: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisDomain {
    Medical,
    Philosophy,
    Science,
    Technology,
    SocialScience,
    Economics,
    Psychology,
    Ethics,
    General,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QuestionType {
    Causal,
    Comparative,
    Definitional,
    Evaluative,
    Speculative,
    MetaAnalytical,
    Empirical,
    Conceptual,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EmotionalValence {
    Positive,
    Negative,
    Mixed,
    Neutral,
}

// ── Context for follow-up detection ──

#[derive(Debug, Clone, Default)]
pub struct QueryContext {
    pub previous_queries: Vec<String>,
    pub previous_entities: Vec<String>,
    pub root_question: Option<String>,
}

// ── Compiled regex patterns (lazy-initialized singletons) ──

struct PatternSet {
    domain: Vec<(Regex, AnalysisDomain)>,
    question_type: Vec<(Regex, QuestionType)>,
    follow_up: Vec<Regex>,
    focus: Vec<Regex>,
    empirical: Regex,
    philosophical: Regex,
    meta_analytical: Regex,
    safety: Regex,
    normative: Regex,
    negative: Regex,
    positive: Regex,
}

static PATTERNS: LazyLock<PatternSet> = LazyLock::new(|| {
    let re = |s: &str| Regex::new(s).expect("valid regex pattern");
    PatternSet {
        domain: vec![
            (re(r"(?i)\b(drug|treatment|therapy|clinical|patient|dose|symptom|disease|cancer|heart|blood|surgery|aspirin|stroke|medic|pharma|vaccine|diagnosis|prognosis|efficacy|ssri|depression|health)\b"), AnalysisDomain::Medical),
            (re(r"(?i)\b(meaning|truth|moral|ethic|consciousness|existence|free.?will|determinism|metaphys|epistem|ontolog|philosophy|virtue|deontol|utilitarian|nihil|absurd)\b"), AnalysisDomain::Philosophy),
            (re(r"(?i)\b(quantum|particle|evolution|genome|cell|molecule|gravity|physics|chemistry|biology|neuroscience|climate|ecosystem|species|bilingual|language|linguistic|cognitive)\b"), AnalysisDomain::Science),
            (re(r"(?i)\b(algorithm|software|AI|machine.?learn|neural.?net|blockchain|compute|programming|data.?science|model|training|GPT|LLM|transformer)\b"), AnalysisDomain::Technology),
            (re(r"(?i)\b(society|culture|inequality|gender|race|class|politics|democracy|governance|institution|social|community)\b"), AnalysisDomain::SocialScience),
            (re(r"(?i)\b(market|inflation|GDP|fiscal|monetary|trade|supply|demand|price|wage|economic|capitalism|labor)\b"), AnalysisDomain::Economics),
            (re(r"(?i)\b(behavior|cognition|emotion|perception|memory|personality|mental|anxiety|trauma|attachment|motivation|bias|cognitive|sleep)\b"), AnalysisDomain::Psychology),
            (re(r"(?i)\b(should|ought|right|wrong|justice|fair|blame|guilt|punish|crime|criminal|prison|morality|law|legal)\b"), AnalysisDomain::Ethics),
        ],
        question_type: vec![
            (re(r"(?i)\b(causes?|effects?|leads?\s+to|results?\s+in|because|why\s+does|impact\s+of|consequence|relationship\s+between)\b"), QuestionType::Causal),
            (re(r"(?i)\b(compare|versus|vs\.?|difference\s+between|better|worse|more\s+effective)\b"), QuestionType::Comparative),
            (re(r"(?i)\b(what\s+is|define|meaning\s+of|what\s+does\s+.+\s+mean)\b"), QuestionType::Definitional),
            (re(r"(?i)\b(should|ought|is\s+it\s+(good|bad|right|wrong)|evaluate|assess|worth)\b"), QuestionType::Evaluative),
            (re(r"(?i)\b(what\s+if|could|hypothetically|imagine|speculate|possible\s+that|future)\b"), QuestionType::Speculative),
            (re(r"(?i)\b(meta.?analy|pool|systematic\s+review|across\s+studies|heterogeneity)\b"), QuestionType::MetaAnalytical),
            (re(r"(?i)\b(evidence|data|study|trial|experiment|measure|observe|test|rct)\b"), QuestionType::Empirical),
        ],
        follow_up: vec![
            re(r"(?i)^(go|let'?s?\s+go|dig|dive|let'?s?\s+dive|let'?s?\s+dig)\s+(deeper|further|more)$"),
            re(r"(?i)^(tell\s+me|explain|elaborate|expand)\s+(more|further|on)"),
            re(r"(?i)^(what\s+about|how\s+about|and\s+what|and\s+how)\b"),
            re(r"(?i)^(more\s+on|more\s+about|deeper\s+into)\b"),
            re(r"(?i)^(can\s+you|could\s+you)\s+(explain|elaborate|expand|detail|go\s+deeper)"),
            re(r"(?i)^(why|how)\s+(is\s+that|does\s+that|is\s+this|does\s+this|so|exactly)\b"),
            re(r"(?i)^(ok|okay|sure|yes|yeah|right|interesting)\b.*\b(but|and|so|what|how|why|tell|explain|more|deeper)"),
        ],
        focus: vec![
            re(r"(?i)(?:deeper\s+into|more\s+about|expand\s+on|elaborate\s+on|tell\s+me\s+about)\s+(?:the\s+)?(.+)"),
            re(r"(?i)(?:what\s+about|how\s+about)\s+(?:the\s+)?(.+)"),
        ],
        empirical: re(r"(?i)\b(study|trial|evidence|data|experiment|rct|cohort|measure|observe|effect|efficacy)\b"),
        philosophical: re(r"(?i)\b(truth|meaning|moral|ethic|consciousness|free.?will|determinism|existence|reality|metaphys|why\s+are\s+we|what\s+is\s+the\s+truth)\b"),
        meta_analytical: re(r"(?i)\b(meta.?analy|pool|systematic|heterogeneity|across\s+studies)\b"),
        safety: re(r"(?i)\b(harm|danger|weapon|toxic|exploit|kill|violence|suicide)\b"),
        normative: re(r"(?i)\b(should|ought|right|wrong|blame|guilt|deserve|just|fair|moral)\b"),
        negative: re(r"(?i)\b(blame|imprison|bad|wrong|harm|suffering|pain|death|guilt|punish|crime|unjust|unfair)\b"),
        positive: re(r"(?i)\b(good|benefit|improve|help|hope|progress|heal|growth|love|justice|beneficial|advantage)\b"),
    }
});

static STOP_WORDS: LazyLock<FxHashSet<&'static str>> = LazyLock::new(|| {
    [
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "this", "that", "these", "those",
        "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
        "us", "them", "my", "your", "his", "its", "our", "their", "what",
        "which", "who", "whom", "when", "where", "why", "how", "if", "then",
        "than", "but", "and", "or", "not", "no", "nor", "so", "too", "very",
        "just", "about", "more", "most", "some", "any", "all", "each", "every",
        "both", "few", "many", "much", "own", "same", "other", "such", "only",
        "from", "with", "for", "of", "to", "in", "on", "at", "by", "up",
        "out", "off", "over", "into", "through", "during", "before", "after",
        "above", "below", "between", "under", "again", "there", "here", "think",
        "deeply", "really", "actually", "basically", "like", "things", "thing",
        "please", "also", "still", "even", "know", "understand", "seems",
        "seem", "make", "sense", "ppl", "people", "get", "got", "going",
    ].into_iter().collect()
});

// ── Public API ──

pub fn analyze(query: &str, context: Option<&QueryContext>) -> QueryAnalysis {
    let p = &*PATTERNS;
    let words: Vec<&str> = query.split_whitespace().collect();
    let word_count = words.len();

    // Follow-up detection
    let has_previous = context.is_some_and(|c| !c.previous_queries.is_empty());
    let is_follow_up = has_previous && p.follow_up.iter().any(|re| re.is_match(query));
    let follow_up_focus = if is_follow_up {
        extract_focus(query)
    } else {
        None
    };

    // Enrich query text with context if follow-up
    let analysis_text = if is_follow_up {
        if let Some(ctx) = context {
            let root = ctx.root_question.as_deref()
                .or(ctx.previous_queries.first().map(|s| s.as_str()))
                .unwrap_or(query);
            let focus = follow_up_focus.as_deref().unwrap_or(query);
            format!("{root} — {focus}")
        } else {
            query.to_string()
        }
    } else {
        query.to_string()
    };

    // Domain detection (first match wins)
    let domain = p.domain.iter()
        .find(|(re, _)| re.is_match(&analysis_text))
        .map(|(_, d)| *d)
        .unwrap_or(AnalysisDomain::General);

    // Question type (first match wins)
    let question_type = p.question_type.iter()
        .find(|(re, _)| re.is_match(&analysis_text))
        .map(|(_, qt)| *qt)
        .unwrap_or(QuestionType::Conceptual);

    // Entity extraction
    let mut entities: Vec<String> = analysis_text
        .split_whitespace()
        .map(|w| w.chars().filter(|c| c.is_ascii_alphabetic()).collect::<String>().to_lowercase())
        .filter(|w| w.len() > 3 && !STOP_WORDS.contains(w.as_str()))
        .collect::<FxHashSet<_>>()
        .into_iter()
        .take(8)
        .collect();

    // Merge with previous entities if follow-up
    if is_follow_up {
        if let Some(ctx) = context {
            if !ctx.previous_entities.is_empty() {
                let mut merged: FxHashSet<String> = ctx.previous_entities.iter().cloned().collect();
                merged.extend(entities);
                entities = merged.into_iter().take(8).collect();
            }
        }
    }

    // Core question extraction
    let sentences: Vec<&str> = analysis_text.split(&['.', '?', '!'][..])
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    let question_sentence = sentences.iter()
        .find(|s| s.contains('?'))
        .or(sentences.first())
        .copied()
        .unwrap_or(&analysis_text);
    let core_question = if is_follow_up {
        context.and_then(|c| c.root_question.as_deref())
            .map(|q| q.chars().take(120).collect())
            .unwrap_or_else(|| question_sentence.chars().take(120).collect())
    } else {
        question_sentence.chars().take(120).collect()
    };

    // Complexity
    let sentence_count = sentences.len();
    let complexity = (word_count as f64 / 40.0 * 0.5
        + entities.len() as f64 / 8.0 * 0.3
        + if sentence_count > 2 { 0.2 } else { 0.0 }
        + if is_follow_up { 0.15 } else { 0.0 })
    .min(1.0);

    // Flags
    let is_empirical = p.empirical.is_match(&analysis_text);
    let is_philosophical = p.philosophical.is_match(&analysis_text);
    let is_meta_analytical = p.meta_analytical.is_match(&analysis_text);
    let has_safety_keywords = p.safety.is_match(&analysis_text);
    let has_normative_claims = p.normative.is_match(&analysis_text);

    // Emotional valence
    let has_negative = p.negative.is_match(&analysis_text);
    let has_positive = p.positive.is_match(&analysis_text);
    let emotional_valence = match (has_negative, has_positive) {
        (true, true) => EmotionalValence::Mixed,
        (true, false) => EmotionalValence::Negative,
        (false, true) => EmotionalValence::Positive,
        (false, false) => EmotionalValence::Neutral,
    };

    let key_terms: Vec<String> = entities.iter().take(5).cloned().collect();

    QueryAnalysis {
        domain,
        question_type,
        entities,
        core_question,
        complexity,
        is_empirical,
        is_philosophical,
        is_meta_analytical,
        has_safety_keywords,
        has_normative_claims,
        key_terms,
        emotional_valence,
        is_follow_up,
        follow_up_focus,
    }
}

fn extract_focus(query: &str) -> Option<String> {
    PATTERNS.focus.iter()
        .find_map(|re| {
            re.captures(query)
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().trim().to_string())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn medical_domain_detected() {
        let a = analyze("What are the side effects of aspirin on heart disease?", None);
        assert_eq!(a.domain, AnalysisDomain::Medical);
    }

    #[test]
    fn philosophy_domain_detected() {
        let a = analyze("What is the meaning of consciousness?", None);
        assert_eq!(a.domain, AnalysisDomain::Philosophy);
    }

    #[test]
    fn causal_question_detected() {
        let a = analyze("What causes climate change?", None);
        assert_eq!(a.question_type, QuestionType::Causal);
    }

    #[test]
    fn entities_extracted() {
        let a = analyze("How does bilingualism affect cognitive development in children?", None);
        assert!(!a.entities.is_empty());
        assert!(a.entities.iter().any(|e| e.contains("bilingual") || e.contains("cognitive")));
    }

    #[test]
    fn complexity_scales_with_length() {
        let short = analyze("What is AI?", None);
        let long = analyze(
            "Can you explain the relationship between quantum mechanics and consciousness, \
             particularly how the observer effect in double-slit experiments might relate to \
             theories of panpsychism and integrated information theory?",
            None,
        );
        assert!(long.complexity > short.complexity);
    }

    #[test]
    fn safety_keywords_detected() {
        let a = analyze("How do weapons cause harm?", None);
        assert!(a.has_safety_keywords);
    }

    #[test]
    fn general_domain_default() {
        let a = analyze("Tell me something interesting", None);
        assert_eq!(a.domain, AnalysisDomain::General);
    }

    #[test]
    fn follow_up_detected_with_context() {
        let ctx = QueryContext {
            previous_queries: vec!["What is quantum physics?".into()],
            previous_entities: vec!["quantum".into(), "physics".into()],
            root_question: Some("What is quantum physics?".into()),
        };
        let a = analyze("Tell me more about it", Some(&ctx));
        assert!(a.is_follow_up);
    }
}
