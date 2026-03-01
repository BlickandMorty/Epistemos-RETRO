/**
 * Signal generation — computes pipeline signals from query analysis,
 * and extracts concepts from LLM analysis text.
 *
 * Extracted from simulate.ts for independent importability.
 *
 * COMPUTATION METHOD: All signals are deterministic heuristic functions of:
 *   - c: clamped(qa.complexity + complexityBias)     [0-1]
 *   - ef: min(1, qa.entities.length / 8)             [0-1]
 *   - advInt: adversarialIntensity control            [default 1.0]
 *   - bayStr: bayesianPriorStrength control           [default 1.0]
 *   - domain flags: isPhilosophical, isEmpirical, hasNormativeClaims, hasSafetyKeywords
 *
 * These are NOT derived from real statistical analysis or information theory.
 * They provide useful relative rankings that respond to query properties and
 * user-controllable steering settings.
 */

import type { SteeringBias } from '@/lib/engine/steering/types';
import type {
  AnalysisMode,
  EvidenceGrade,
  PipelineControls,
  SignalUpdate,
  SafetyState,
} from './types';
import type { QueryAnalysis } from './query-analysis';

// ═════════════════════════════════════════════════════════════════════
// ██ CONCEPT EXTRACTION — derive concepts from LLM analysis text
// ═════════════════════════════════════════════════════════════════════

/**
 * Extract meaningful research concepts from LLM-generated analysis text.
 *
 * Rather than using hardcoded concept pools, this function identifies
 * domain-specific terms that the LLM actually discussed. It filters out
 * trivial/generic words to produce robust concept lists.
 *
 * @param rawAnalysis - The LLM-generated analytical text
 * @param qa - Query analysis for domain context
 * @returns Array of 3-8 meaningful concept strings
 */
const CONCEPT_STOPWORDS = new Set([
  // Generic words that should never be concepts
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'were',
  'been', 'being', 'have', 'has', 'had', 'will', 'would', 'could', 'should',
  'may', 'might', 'can', 'not', 'but', 'also', 'more', 'most', 'some', 'any',
  'than', 'other', 'such', 'very', 'just', 'about', 'into', 'over', 'after',
  'before', 'between', 'through', 'during', 'each', 'these', 'those', 'which',
  // Common verbs
  'make', 'made', 'take', 'give', 'find', 'know', 'want', 'tell', 'become',
  'show', 'think', 'look', 'use', 'used', 'work', 'call', 'need', 'try',
  // Generic analytical terms too vague for concepts
  'analysis', 'result', 'study', 'evidence', 'research', 'data', 'finding',
  'approach', 'method', 'question', 'answer', 'effect', 'factor', 'level',
  'point', 'case', 'example', 'way', 'type', 'form', 'part', 'number',
  'time', 'year', 'group', 'area', 'word', 'test', 'note', 'deep', 'write',
  'thing', 'fact', 'idea', 'view', 'issue', 'high', 'low', 'new', 'old',
  'good', 'bad', 'long', 'short', 'large', 'small', 'first', 'last',
]);

// Multi-word domain concepts the extractor should recognize as single concepts
const DOMAIN_PHRASES: [RegExp, string][] = [
  [/\beffect\s+size/gi, 'effect_size'],
  [/\bconfidence\s+interval/gi, 'confidence_interval'],
  [/\bpublication\s+bias/gi, 'publication_bias'],
  [/\breverse\s+causation/gi, 'reverse_causation'],
  [/\brandomized\s+controlled?\s+trial/gi, 'RCT'],
  [/\bmeta[-\s]analy/gi, 'meta_analysis'],
  [/\bcausal\s+inference/gi, 'causal_inference'],
  [/\bBradford\s+Hill/gi, 'Bradford_Hill_criteria'],
  [/\bBayes(?:ian)?\s+factor/gi, 'Bayes_factor'],
  [/\bcognitive\s+bias/gi, 'cognitive_bias'],
  [/\bselection\s+bias/gi, 'selection_bias'],
  [/\bsample\s+size/gi, 'sample_size'],
  [/\bstatistical\s+significance/gi, 'statistical_significance'],
  [/\bpractical\s+significance/gi, 'practical_significance'],
  [/\bdose[-\s]response/gi, 'dose_response'],
  [/\bcross[-\s]disciplinary/gi, 'cross_disciplinary'],
  [/\bsystematic\s+review/gi, 'systematic_review'],
  [/\bfunnel\s+plot/gi, 'funnel_plot'],
  [/\bheterogeneity/gi, 'heterogeneity'],
  [/\bconfound(?:er|ing)/gi, 'confounding'],
  [/\breplication/gi, 'replication'],
  [/\bepistemic/gi, 'epistemic_humility'],
  [/\bpsychoneuroimmunol/gi, 'psychoneuroimmunology'],
  [/\bneuroplasticity/gi, 'neuroplasticity'],
  [/\bepigenetic/gi, 'epigenetics'],
  [/\ballostatic/gi, 'allostatic_load'],
  [/\bplacebo/gi, 'placebo_effect'],
  [/\bnocebo/gi, 'nocebo_effect'],
];

export function extractConceptsFromAnalysis(rawAnalysis: string, qa: QueryAnalysis): string[] {
  if (!rawAnalysis || rawAnalysis.length < 50) return [];

  const concepts = new Set<string>();

  // 1. Extract multi-word domain phrases first
  for (const [pattern, concept] of DOMAIN_PHRASES) {
    if (pattern.test(rawAnalysis)) {
      concepts.add(concept);
      // Reset regex lastIndex since we use /g flag
      pattern.lastIndex = 0;
    }
  }

  // 2. Extract capitalized terms (likely domain-specific proper nouns / frameworks)
  const capitalizedTerms = rawAnalysis.match(/\b[A-Z][a-z]{3,}(?:\s+[A-Z][a-z]{3,}){0,2}/g) || [];
  for (const term of capitalizedTerms) {
    const normalized = term.toLowerCase().replace(/\s+/g, '_');
    if (!CONCEPT_STOPWORDS.has(normalized) && normalized.length > 3) {
      concepts.add(normalized);
    }
  }

  // 3. Extract terms from epistemic tags — these are the LLM's own identified claims
  const taggedClaims = rawAnalysis.match(/\[(DATA|MODEL|UNCERTAIN|CONFLICT)\]\s*([^[.]{10,80})/g) || [];
  for (const claim of taggedClaims) {
    // Extract key nouns from tagged claims (words 4+ chars, not stopwords)
    const words = claim.replace(/\[(DATA|MODEL|UNCERTAIN|CONFLICT)\]\s*/, '')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !CONCEPT_STOPWORDS.has(w.toLowerCase()))
      .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
      .filter(w => w.length >= 4);
    // Take the most specific word (longest) from each tagged claim
    if (words.length > 0) {
      const best = words.sort((a, b) => b.length - a.length)[0]!;
      concepts.add(best);
    }
  }

  // 4. Add query entities that actually appear in the analysis (validation)
  for (const entity of qa.entities) {
    if (entity.length > 3
      && !CONCEPT_STOPWORDS.has(entity.toLowerCase())
      && rawAnalysis.toLowerCase().includes(entity.toLowerCase())
    ) {
      concepts.add(entity.toLowerCase().replace(/\s+/g, '_'));
    }
  }

  // 5. Deduplicate and limit to 3-8 meaningful concepts
  const result = [...concepts]
    .filter(c => c.length > 2 && !CONCEPT_STOPWORDS.has(c))
    .slice(0, 8);

  return result;
}

// ═════════════════════════════════════════════════════════════════════
// ██ SIGNAL GENERATION — correlated with query properties
// ═════════════════════════════════════════════════════════════════════

export function generateSignals(qa: QueryAnalysis, controls?: PipelineControls, steeringBias?: SteeringBias, llmConcepts?: string[]): SignalUpdate & { grade: EvidenceGrade; mode: AnalysisMode } {
  // Apply complexity bias from controls
  const c = Math.max(0, Math.min(1, qa.complexity + (controls?.complexityBias ?? 0)));
  const advInt = controls?.adversarialIntensity ?? 1.0;
  const bayStr = controls?.bayesianPriorStrength ?? 1.0;
  // Deterministic entity-based factor (replaces Math.random())
  const ef = Math.min(1, qa.entities.length / 8);

  // Structural complexity heuristics — simple functions of query properties that
  // produce useful relative rankings for steering and display:
  // - betti0: fragmentation estimate — more entities/complexity → more "components"
  // - betti1: cyclical complexity — adversarial intensity × complexity + entities
  // - persistenceEntropy: structural noise — linear combo of complexity + entity factor
  // - maxPersistence: dominant pattern strength — 0.1 + complexity × 0.5 + ef × 0.15
  const betti0 = qa.isPhilosophical
    ? Math.floor(2 + qa.entities.length * 0.5)
    : Math.max(1, Math.floor(1 + c * 4));
  const betti1 = qa.isPhilosophical
    ? (qa.hasNormativeClaims ? Math.floor(1 + ef) : Math.floor(ef * 1.5))
    : Math.floor(c * 2 * advInt + ef);
  const persistenceEntropy = qa.isPhilosophical
    ? 0.5 + c * 1.5 + ef * 0.4
    : 0.1 + c * 1.8 + ef * 0.25;
  const maxPersistence = 0.1 + c * 0.5 + ef * 0.15;

  const baseConf = qa.isPhilosophical
    ? 0.2 + c * 0.15 + ef * 0.1
    : qa.isEmpirical
    ? (0.45 + c * 0.2 + ef * 0.15) * bayStr
    : 0.35 + c * 0.2 + ef * 0.15;

  const entropy = qa.isPhilosophical
    ? 0.5 + c * 0.3 + ef * 0.1
    : qa.isEmpirical
    ? 0.05 + c * 0.4 + ef * 0.1
    : 0.15 + c * 0.45 + ef * 0.1;

  const dissonance = qa.hasNormativeClaims
    ? (0.3 + c * 0.25 + ef * 0.15) * advInt
    : qa.isPhilosophical
    ? 0.2 + c * 0.25 + ef * 0.15
    : (0.05 + c * 0.35 + ef * 0.1) * advInt;

  const healthScoreBase = Math.max(0.25, 1 - entropy * 0.45 - dissonance * 0.35 - (qa.hasSafetyKeywords ? 0.15 : 0));

  const riskScoreBase = qa.hasSafetyKeywords
    ? 0.4 + c * 0.2 + ef * 0.15
    : qa.hasNormativeClaims
    ? 0.15 + c * 0.15 + ef * 0.1
    : 0.02 + c * 0.2 + ef * 0.08;

  // ── Apply steering bias (activation steering injection point) ──
  // Pattern: base_signal + bias_coefficient * steering_vector
  const sb = steeringBias;
  const steeredConf = sb ? baseConf + sb.confidence * sb.steeringStrength : baseConf;
  const steeredEntropy = sb ? entropy + sb.entropy * sb.steeringStrength : entropy;
  const steeredDissonance = sb ? dissonance + sb.dissonance * sb.steeringStrength : dissonance;
  const healthScore = sb ? healthScoreBase + sb.healthScore * sb.steeringStrength : healthScoreBase;
  const riskScore = sb ? riskScoreBase + sb.riskScore * sb.steeringStrength : riskScoreBase;

  const safetyState: SafetyState = riskScore >= 0.55 ? 'red' : riskScore >= 0.35 ? 'yellow' : 'green';

  // Apply focus/temperature overrides from controls + steering
  const baseDepth = controls?.focusDepthOverride ?? (2 + c * 7 + (qa.isPhilosophical ? 1.5 : 0));
  const baseTemp = controls?.temperatureOverride ?? (qa.isPhilosophical ? 0.7 + c * 0.15 + ef * 0.1 : 1.0 - c * 0.5);
  const depth = sb ? baseDepth + sb.focusDepth * sb.steeringStrength : baseDepth;
  const temp = sb ? baseTemp + sb.temperatureScale * sb.steeringStrength : baseTemp;

  // Concept generation: use LLM-extracted concepts if available, otherwise
  // fall back to generic domain pool.
  // Concepts are extracted from the actual LLM analysis text
  // by extractConceptsFromAnalysis() and passed in via llmConcepts.
  let concepts: string[];
  if (llmConcepts && llmConcepts.length > 0) {
    // Use real concepts from LLM analysis
    concepts = llmConcepts;
  } else {
    // Fallback: generic domain pools
    const conceptPool = qa.isPhilosophical
      ? ['free_will', 'determinism', 'moral_responsibility', 'compatibilism', 'retribution',
         'consequentialism', 'agency', 'desert', 'justice', ...qa.entities]
      : qa.isEmpirical
      ? ['effect_size', 'power', 'confounding', 'heterogeneity', 'causality', 'bias',
         'replication', 'bayesian_prior', ...qa.entities]
      : ['coherence', 'framework', 'evidence', 'inference', ...qa.entities];

    const uniqueConcepts = [...new Set(conceptPool)];
    const cw = controls?.conceptWeights ?? {};
    const sortedConcepts = uniqueConcepts.sort((a, b) => {
      const wa = cw[a] ?? 1.0;
      const wb = cw[b] ?? 1.0;
      return (wb + a.length * 0.02) - (wa + b.length * 0.02);
    });
    concepts = sortedConcepts.slice(0, Math.floor(3 + c * 4));
  }
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
  const chord = concepts.reduce((p, _, i) => p * (primes[i] || 41), 1);

  const clampedConf = Math.max(0.1, Math.min(steeredConf, 0.95));
  const grade = clampedConf > 0.7 ? 'A' : clampedConf > 0.5 ? 'B' : 'C';
  const mode = qa.isMetaAnalytical ? 'meta-analytical' : qa.isPhilosophical ? 'philosophical-analytical' : qa.isEmpirical ? 'executive' : 'moderate';

  return {
    confidence: clampedConf,
    entropy: Math.max(0.01, Math.min(steeredEntropy, 0.95)),
    dissonance: Math.max(0.01, Math.min(steeredDissonance, 0.95)),
    healthScore: Math.max(healthScore, 0.2),
    safetyState,
    riskScore: Math.max(0.01, Math.min(riskScore, 0.9)),
    tda: { betti0, betti1, persistenceEntropy, maxPersistence },
    focusDepth: depth,
    temperatureScale: temp,
    activeConcepts: concepts,
    activeChordProduct: chord,
    harmonyKeyDistance: Math.min(dissonance, 0.95),
    grade,
    mode,
  };
}
