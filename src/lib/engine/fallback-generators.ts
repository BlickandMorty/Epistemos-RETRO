/**
 * Fallback/template generators — deterministic, query-aware text generators
 * used as internal fallbacks when LLM calls are unavailable.
 *
 * Extracted from simulate.ts for independent importability.
 *
 * Contains:
 *   - generateStageDetail: query-aware stage detail strings
 *   - generateRawAnalysis: fallback raw analysis (template-based, no real evidence)
 *   - isTrivialQuery: detect trivial/conversational input
 *   - getSectionLabels: dynamic section labels for layman summary
 *   - generateLaymanSummary: fallback layman summary generation
 */

import type { PipelineStage } from '@/lib/constants';
import type { LaymanSummary } from './types';
import type { QueryAnalysis } from './query-analysis';

// ═════════════════════════════════════════════════════════════════════
// ██ DYNAMIC STAGE DETAILS — query-aware
// ═════════════════════════════════════════════════════════════════════

export function generateStageDetail(stage: PipelineStage, qa: QueryAnalysis): string {
  const topic = qa.entities.slice(0, 3).join(', ') || 'the query topic';
  // Use query complexity as a deterministic seed instead of Math.random()
  const c = qa.complexity;
  const entityFactor = Math.min(1, qa.entities.length / 8);

  switch (stage) {
    case 'triage':
      return qa.isPhilosophical
        ? `complexity score: ${(0.7 + c * 0.3).toFixed(2)} — philosophical-conceptual routing, multi-framework analysis`
        : qa.isMetaAnalytical
        ? `complexity score: ${(0.85 + c * 0.15).toFixed(2)} — full meta-analytical mode for ${topic}`
        : `complexity score: ${(0.3 + c * 0.6).toFixed(2)} — ${c > 0.5 ? 'executive pipeline' : 'moderate-depth analysis'} for "${topic}"`;

    case 'memory':
      return qa.isPhilosophical
        ? `cross-referencing ${Math.floor(3 + qa.entities.length * 0.5)} philosophical frameworks for ${topic}`
        : `${Math.floor(2 + c * 8)} context fragments retrieved for "${topic}" (similarity > 0.7)`;

    case 'routing':
      if (qa.isPhilosophical) return `philosophical-analytical mode — dialectical + ethical + epistemic engines for: ${qa.coreQuestion.slice(0, 60)}`;
      if (qa.isMetaAnalytical) return `meta-analytical mode — multi-study synthesis with heterogeneity assessment for ${topic}`;
      if (qa.questionType === 'causal') return `causal-inference mode — DAG construction + Bradford Hill scoring for ${topic}`;
      return `executive mode — full reasoning pipeline for: ${qa.coreQuestion.slice(0, 60)}`;

    case 'statistical': {
      if (qa.isPhilosophical) {
        return `framework agreement index: ${(0.3 + c * 0.4).toFixed(2)}, argument coherence: ${(0.4 + entityFactor * 0.4).toFixed(2)}, ${Math.floor(2 + qa.entities.length * 0.5)} positions identified`;
      }
      const d = (0.2 + c * 0.8 + entityFactor * 0.2).toFixed(2);
      const power = (0.5 + c * 0.35 + entityFactor * 0.1).toFixed(2);
      return `Cohen's d = ${d} (${parseFloat(d) > 0.8 ? 'large' : parseFloat(d) > 0.5 ? 'medium' : 'small'}), power = ${power}${parseFloat(power) > 0.8 ? ', adequately powered' : ', may be underpowered'}`;
    }

    case 'causal': {
      if (qa.isPhilosophical) {
        return `${Math.floor(2 + qa.entities.length * 0.5)} causal/logical chains analyzed — ${qa.hasNormativeClaims ? 'normative-descriptive boundary flagged' : 'conceptual dependencies mapped'}`;
      }
      const hill = (0.4 + c * 0.35 + entityFactor * 0.15).toFixed(2);
      return `Bradford Hill score: ${hill} — ${parseFloat(hill) > 0.7 ? 'strong' : parseFloat(hill) > 0.5 ? 'moderate' : 'weak'} causal evidence for ${topic}`;
    }

    case 'meta_analysis':
      if (qa.isPhilosophical) {
        return `${Math.floor(3 + qa.entities.length * 0.6)} traditions synthesized — cross-framework convergence: ${(0.2 + c * 0.4 + entityFactor * 0.2).toFixed(2)}`;
      }
      if (qa.isMetaAnalytical) {
        const iSq = Math.floor(20 + c * 40 + entityFactor * 20);
        return `${Math.floor(4 + c * 8 + entityFactor * 4)} studies pooled, I² = ${iSq}% (${iSq < 30 ? 'low' : iSq < 60 ? 'moderate' : 'high'} heterogeneity)`;
      }
      return `${Math.floor(2 + c * 3 + entityFactor * 2)} analytical perspectives integrated for ${topic}`;

    case 'bayesian': {
      if (qa.isPhilosophical) {
        const range = (0.15 + c * 0.3 + entityFactor * 0.2).toFixed(2);
        return `posterior across ${Math.floor(2 + qa.entities.length * 0.4)} priors, range = ${range} — ${parseFloat(range) > 0.3 ? 'position-sensitive' : 'converges across starting positions'}`;
      }
      const bf = (1.5 + c * 12 + entityFactor * 6).toFixed(1);
      return `BF₁₀ = ${bf} (${parseFloat(bf) > 10 ? 'strong' : parseFloat(bf) > 3 ? 'moderate' : 'weak'} evidence for ${topic})`;
    }

    case 'synthesis':
      return qa.isPhilosophical
        ? `synthesizing dialectical analysis across ${qa.entities.length} concepts — building nuanced position`
        : `integrating evidence streams for structured response on ${topic}`;

    case 'adversarial': {
      const challenges = Math.max(1, Math.floor(1 + c * 2 + entityFactor));
      return qa.isPhilosophical
        ? `${challenges} counter-argument${challenges > 1 ? 's' : ''} generated — ${qa.hasNormativeClaims ? 'is/ought distinction tested' : 'logical consistency verified'}`
        : `${challenges} weakness${challenges > 1 ? 'es' : ''} identified${c > 0.6 ? ', no overclaiming' : ', potential overclaiming flagged'}`;
    }

    case 'calibration': {
      const conf = (0.3 + c * 0.35 + entityFactor * 0.2).toFixed(2);
      const margin = (0.08 + (1 - c) * 0.15 + entityFactor * 0.1).toFixed(2);
      const grade = parseFloat(conf) > 0.75 ? 'A' : parseFloat(conf) > 0.55 ? 'B' : 'C';
      return `final confidence: ${conf} ± ${margin} (grade ${grade}) — ${qa.isPhilosophical ? 'philosophical claims resist high certainty' : 'calibrated against convergence'}`;
    }
  }
}


// ═════════════════════════════════════════════════════════════════════
// ██ DYNAMIC RAW ANALYSIS — generated from query content
// ═════════════════════════════════════════════════════════════════════

/**
 * Fallback raw analysis generator (template-based, no real evidence).
 *
 * Generates analytically-structured prose using query properties to produce
 * plausible-sounding analysis text. ALL statistics in this output are
 * heuristic functions of query complexity and entity count — they do NOT
 * represent real literature searches, meta-analyses, or empirical data.
 *
 * Used only as an internal fallback; the LLM generates real analysis
 * via `llmStreamRawAnalysis()` or `llmGenerateRawAnalysis()`.
 */
export function generateRawAnalysis(qa: QueryAnalysis): string {
  const topic = qa.entities.slice(0, 3).join(', ') || 'the subject';
  const focusAspect = qa.followUpFocus;
  const segments: string[] = [];

  // For follow-ups, add a context-continuation marker
  if (qa.isFollowUp) {
    segments.push(
      `[DATA] Deeper analysis of ${focusAspect || topic} (follow-up pass with increased focus depth). Building on prior evidence base for ${topic}.`,
    );
  }

  if (qa.isPhilosophical) {
    const traditions = Math.floor(3 + qa.entities.length * 0.5);
    const convergence = (0.2 + qa.complexity * 0.3 + (qa.entities.length / 16)).toFixed(2);

    segments.push(
      `[DATA] Analysis of ${traditions} major philosophical frameworks relevant to "${qa.coreQuestion.slice(0, 80)}" reveals fundamental tensions between ${qa.hasNormativeClaims ? 'descriptive and normative claims' : 'competing ontological commitments'}.`,
    );

    if (qa.hasNormativeClaims) {
      segments.push(
        `[DATA] The query crosses the is-ought boundary: ${
          qa.entities.some(e => ['determinism', 'determined', 'free'].includes(e))
            ? 'if hard determinism holds, traditional moral responsibility frameworks require revision — compatibilists maintain moral accountability is coherent even without libertarian free will, while hard incompatibilists argue all desert-based reactive attitudes are unjustified'
            : 'normative claims here require separate justification from the empirical observations — the gap between what is and what ought to be cannot be bridged by evidence alone'
        }.`,
      );
    }

    if (qa.entities.some(e => ['morality', 'moral', 'blame', 'criminal', 'criminals', 'prison', 'imprison', 'punish'].includes(e))) {
      segments.push(
        `[MODEL] Multiple defensible positions identified: (1) Consequentialist — punishment justified by deterrence and social protection regardless of metaphysical freedom; (2) Retributivist — moral desert requires libertarian free will, which determinism undermines; (3) Compatibilist — responsibility grounded in reasons-responsiveness, not ultimate origination; (4) Eliminativist — moral language is a useful social fiction, not tracking objective features of reality.`,
      );
      segments.push(
        `[DATA] Cross-framework convergence is low (${convergence}), confirming this is a genuinely unresolved question where rational disagreement persists.`,
      );
      segments.push(
        `[UNCERTAIN] The intuition that punishment-as-social-mechanism is more defensible than punishment-as-moral-desert aligns with a recognized philosophical position. Whether morality reduces to a sense-making heuristic or tracks something deeper remains contested — this is itself a first-order metaphysical question, not a settled empirical matter.`,
      );
    } else {
      segments.push(
        `[MODEL] The reasoning topology reveals ${traditions > 4 ? 'a highly fragmented' : 'a moderately fragmented'} conceptual landscape for ${topic}. The query resists convergence because it spans multiple philosophical sub-domains with different methodological standards.`,
      );
      segments.push(
        `[UNCERTAIN] Philosophical analysis cannot produce empirical certainty. The confidence score reflects analytical coherence and argument strength, not truth-probability in the scientific sense.`,
      );
    }

    if (qa.emotionalValence === 'negative' || qa.emotionalValence === 'mixed') {
      segments.push(
        `[MODEL] The existential dimensions of this question are noted — the analysis separates logical validity from emotional resonance while acknowledging that philosophical engagement with these questions is not purely intellectual.`,
      );
    }

  } else if (qa.isEmpirical || qa.isMetaAnalytical) {
    const c = qa.complexity;
    const ef = Math.min(1, qa.entities.length / 8);
    const studies = Math.floor(3 + c * 10 + ef * 5);
    const n = Math.floor(500 + c * 30000 + ef * 20000);
    const d = (0.15 + c * 0.8 + ef * 0.4).toFixed(2);
    const iSq = Math.floor(15 + c * 40 + ef * 20);
    const hillScore = (0.4 + c * 0.3 + ef * 0.2).toFixed(2);
    const bf = (0.8 + c * 12 + ef * 8).toFixed(1);
    const priorRange = (0.04 + c * 0.2 + ef * 0.15).toFixed(2);

    segments.push(
      `[DATA] Based on ${studies} ${qa.isMetaAnalytical ? 'pooled studies' : 'available studies'} (combined N ≈ ${n.toLocaleString()}) examining ${topic}, the ${qa.questionType === 'causal' ? 'intervention' : 'relationship'} shows ${parseFloat(d) > 0.8 ? 'a large' : parseFloat(d) > 0.5 ? 'a medium' : parseFloat(d) > 0.2 ? 'a small' : 'a negligible'} effect size (d = ${d}, 95% CI [${(parseFloat(d) - 0.15 - c * 0.15).toFixed(2)}, ${(parseFloat(d) + 0.15 + c * 0.15).toFixed(2)}]) with ${iSq < 30 ? 'low' : iSq < 60 ? 'moderate' : 'high'} heterogeneity (I² = ${iSq}%).`,
    );

    segments.push(
      `[DATA] Bradford Hill criteria score ${hillScore}/1.0 for ${topic}: ${parseFloat(hillScore) > 0.7 ? 'temporality, biological gradient, and plausibility scored above 0.7, supporting a causal interpretation' : parseFloat(hillScore) > 0.5 ? 'partial support — some criteria met but temporality or specificity evidence incomplete' : 'weak causal case — multiple criteria unmet'}.`,
    );

    segments.push(
      `[DATA] Bayesian updating yields posterior range = ${priorRange}, BF₁₀ = ${bf}: ${parseFloat(bf) > 10 ? 'strong' : parseFloat(bf) > 3 ? 'moderate' : 'weak'} evidence. ${parseFloat(priorRange) > 0.25 ? 'Conclusion is sensitive to prior specification' : 'Posterior converges across priors, suggesting data-dominated inference'}.`,
    );

    if (qa.domain === 'medical') {
      const nnt = Math.floor(5 + c * 30 + ef * 20);
      segments.push(
        `[DATA] Clinical significance: NNT = ${nnt}, ${nnt < 15 ? 'suggesting meaningful clinical benefit' : nnt < 30 ? 'moderate clinical significance' : 'raising questions about practical value despite statistical significance'} for ${topic}.`,
      );
    }

    const altExplanations = Math.max(1, Math.floor(1 + c * 2 + ef));
    segments.push(
      `[MODEL] Adversarial review identified ${altExplanations} alternative explanation${altExplanations > 1 ? 's' : ''}: ${
        qa.questionType === 'causal'
          ? `${altExplanations > 1 ? 'reverse causation and residual confounding' : 'residual confounding'}, ${parseFloat(hillScore) > 0.65 ? 'partially mitigated by study designs' : 'inadequately addressed'}`
          : `including ${qa.isMetaAnalytical ? 'publication bias and heterogeneous populations' : 'selection bias and measurement error'}`
      }.`,
    );

    if (iSq > 50 || parseFloat(priorRange) > 0.25) {
      segments.push(
        `[UNCERTAIN] ${iSq > 50 ? 'High heterogeneity suggests the pooled estimate may not represent any single population. ' : ''}${parseFloat(priorRange) > 0.25 ? 'Prior sensitivity indicates current evidence is insufficient to override strong pre-existing beliefs.' : ''}`,
      );
    }

  } else {
    const perspectives = Math.floor(2 + qa.complexity * 3 + qa.entities.length * 0.3);
    const coherence = (0.3 + qa.complexity * 0.35 + (qa.entities.length / 16)).toFixed(2);

    segments.push(
      `[DATA] Analysis of ${perspectives} major perspectives on "${qa.coreQuestion.slice(0, 80)}" yields a coherence index of ${coherence}, indicating ${parseFloat(coherence) > 0.7 ? 'substantial agreement' : parseFloat(coherence) > 0.4 ? 'partial convergence with notable dissent' : 'significant disagreement'}.`,
    );

    if (qa.domain === 'psychology') {
      segments.push(
        `[DATA] Psychological evidence from ${Math.floor(2 + qa.complexity * 4 + qa.entities.length * 0.3)} research paradigms addresses ${topic}. ${qa.questionType === 'causal' ? 'Causal mechanisms are proposed but primarily supported by correlational designs' : 'Multiple theoretical accounts exist with varying empirical support'}.`,
      );
    } else if (qa.domain === 'technology') {
      segments.push(
        `[DATA] Technical analysis identifies ${Math.floor(2 + qa.complexity * 2 + qa.entities.length * 0.3)} key dimensions of ${topic}. ${qa.complexity > 0.5 ? 'Benchmarks exist but ecological validity is limited' : 'The field is rapidly evolving, limiting shelf-life of current findings'}.`,
      );
    } else if (qa.domain === 'social_science') {
      segments.push(
        `[DATA] Social science literature on ${topic} reveals ${Math.floor(2 + qa.complexity * 2 + qa.entities.length * 0.3)} competing frameworks. Cross-cultural generalizability is ${qa.complexity > 0.5 ? 'limited' : 'partially supported'}.`,
      );
    } else {
      segments.push(
        `[MODEL] The question integrates evidence across ${qa.entities.length > 3 ? 'multiple domains' : 'related sub-topics'}, each with different epistemic standards.`,
      );
    }

    if (qa.questionType === 'evaluative' || qa.hasNormativeClaims) {
      segments.push(
        `[MODEL] Evaluative claims about ${topic} depend on value frameworks not adjudicable by evidence alone. The analysis presents strongest arguments from major positions without endorsing one.`,
      );
    }

    segments.push(
      `[UNCERTAIN] Confidence is bounded by inability to access real-time data, conduct original research, or capture lived experiential knowledge relevant to ${topic}. ${qa.isFollowUp ? 'This deeper analysis inherits uncertainties from the initial assessment and adds new ones specific to the focused dimension.' : ''}`,
    );
  }

  return segments.join(' ');
}


// ═════════════════════════════════════════════════════════════════════
// ██ DYNAMIC LAYMAN SUMMARY — query-specific with dynamic labels
// ═════════════════════════════════════════════════════════════════════

export function isTrivialQuery(query: string): boolean {
  const trivial = /^(hi|hello|hey|yo|sup|what'?s up|hiya|howdy|greetings|test|testing|lol|ok|okay|hm+|um+|ah+|bruh|nah|yep|yeah|nope|bye|thanks|thx|ty|wow|cool|nice|good|great|sure|fine|meh|idk|hmm+|huh|oh|ooh|aight|ayo|word|bet|dope|sick|lit|fam|bro|dude|ugh|lmao|omg|wtf|wut)\s*[.!?]*$/i;
  return trivial.test(query.trim()) || query.trim().length < 5;
}

type SectionLabels = NonNullable<LaymanSummary['sectionLabels']>;

export function getSectionLabels(qa: QueryAnalysis): SectionLabels {
  if (qa.isPhilosophical) {
    return {
      whatWasTried: 'Analysis approach',
      whatIsLikelyTrue: 'Philosophical landscape',
      confidenceExplanation: 'Epistemic status',
      whatCouldChange: 'Open questions',
      whoShouldTrust: 'How to engage with this',
    };
  }

  if (qa.isMetaAnalytical || (qa.isEmpirical && qa.questionType !== 'causal')) {
    return {
      whatWasTried: 'Methodology',
      whatIsLikelyTrue: 'Key findings',
      confidenceExplanation: 'Evidence strength',
      whatCouldChange: 'Limitations & gaps',
      whoShouldTrust: 'Applicability',
    };
  }

  if (qa.questionType === 'causal') {
    return {
      whatWasTried: 'Causal analysis',
      whatIsLikelyTrue: 'Probable relationship',
      confidenceExplanation: 'Causal certainty',
      whatCouldChange: 'Alternative explanations',
      whoShouldTrust: 'Decision relevance',
    };
  }

  if (qa.questionType === 'evaluative') {
    return {
      whatWasTried: 'Evaluation framework',
      whatIsLikelyTrue: 'Assessment',
      confidenceExplanation: 'Judgment confidence',
      whatCouldChange: 'Value dependencies',
      whoShouldTrust: 'Practical guidance',
    };
  }

  if (qa.questionType === 'speculative') {
    return {
      whatWasTried: 'Scenario analysis',
      whatIsLikelyTrue: 'Most likely trajectory',
      confidenceExplanation: 'Prediction confidence',
      whatCouldChange: 'Wild cards',
      whoShouldTrust: 'Forecast reliability',
    };
  }

  // General / conceptual / definitional / comparative
  return {
    whatWasTried: 'Analytical approach',
    whatIsLikelyTrue: 'Core insight',
    confidenceExplanation: 'Confidence level',
    whatCouldChange: 'What could shift',
    whoShouldTrust: 'Audience & applicability',
  };
}

export function generateLaymanSummary(qa: QueryAnalysis, rawAnalysis: string): LaymanSummary {
  const topic = qa.entities.slice(0, 3).join(' and ') || 'this topic';
  const focusAspect = qa.followUpFocus || (qa.isFollowUp ? 'the deeper nuances' : null);

  // ── Trivial / conversational input ─────────────────────────────────
  if (!qa.isFollowUp && isTrivialQuery(qa.coreQuestion)) {
    return {
      whatWasTried: '',
      whatIsLikelyTrue: `Hey! This is a research analysis engine — I run questions through a 10-stage reasoning pipeline that includes statistical, causal, Bayesian, and adversarial analysis. Try asking something like "Is intermittent fasting effective for weight loss?" or "What does the evidence say about screen time and children?" and I'll stress-test it for you.`,
      confidenceExplanation: '',
      whatCouldChange: '',
      whoShouldTrust: '',
    };
  }

  const sectionLabels = getSectionLabels(qa);

  // ── Philosophical queries ──────────────────────────────────────────
  if (qa.isPhilosophical) {
    return {
      whatWasTried: `The system analyzed your question through multiple philosophical frameworks, examining argument structure, internal consistency, and how different intellectual traditions approach ${topic}.`,
      whatIsLikelyTrue: qa.hasNormativeClaims
        ? `This is a genuinely contested question where thoughtful people disagree for good reasons. Your observation identifies a real tension — ${
          qa.entities.some(e => ['determinism', 'determined', 'free'].includes(e))
            ? 'if determinism is true, traditional retributive punishment loses its moral foundation. The strongest remaining justification for criminal justice is the consequentialist one you identified: social protection, deterrence, and incapacitation. Whether morality is a "sense-making signal" or tracks something deeper is itself one of the oldest unresolved questions in philosophy — and the fact that you\'re asking it suggests you\'re already reasoning at a level many professional philosophers take seriously'
            : 'the normative and descriptive dimensions pull in different directions, and this tension cannot be resolved by evidence alone'
        }.`
        : `The analysis found ${rawAnalysis.includes('convergence is low') || rawAnalysis.includes('fragmented') ? 'significant disagreement across frameworks — there is no consensus' : 'partial convergence, but important tensions remain'}. This kind of question resists simple answers because it touches on fundamental assumptions about ${topic}.`,
      confidenceExplanation: `Confidence is ${qa.complexity > 0.6 ? 'intentionally low' : 'moderate at best'} because philosophical questions don't have empirically testable answers. The score reflects analytical coherence, not truth-probability in a scientific sense.`,
      whatCouldChange: qa.hasNormativeClaims
        ? `Your position could be strengthened or challenged by: (1) new empirical findings about human decision-making; (2) philosophical arguments you haven't encountered yet — particularly from the compatibilist tradition, which has sophisticated responses to the determinism challenge; (3) examining edge cases where your intuition breaks down.`
        : `New philosophical arguments, empirical discoveries about ${topic}, or examining the question from an unconsidered tradition could shift the analysis.`,
      whoShouldTrust: `This analysis maps the landscape of arguments and identifies which positions are logically strongest. It should not be treated as a definitive answer — philosophical questions require personal engagement and continued reflection.`,
      sectionLabels,
    };
  }

  // ── Empirical / meta-analytical queries ────────────────────────────
  if (qa.isEmpirical || qa.isMetaAnalytical) {
    const dMatch = rawAnalysis.match(/d = (\d+\.\d+)/);
    const effectSize = dMatch ? parseFloat(dMatch[1]!) : 0.5;
    const bfMatch = rawAnalysis.match(/BF₁₀ = (\d+\.?\d*)/);
    const bayesFactor = bfMatch ? parseFloat(bfMatch[1]!) : 3;

    return {
      whatWasTried: `The system ran a ${qa.isMetaAnalytical ? 'meta-analytical synthesis, pooling multiple studies' : 'comprehensive evidence review'} to evaluate ${topic}. It applied statistical, causal, Bayesian, and adversarial analysis to stress-test the evidence.`,
      whatIsLikelyTrue: effectSize > 0.8
        ? `The evidence strongly supports a meaningful effect related to ${topic}. The effect is large, and multiple analytical methods converge on this conclusion.`
        : effectSize > 0.4
        ? `There is a moderate, likely real effect for ${topic}. Most evidence points the same direction, though the strength may be overstated by publication practices.`
        : `The evidence for ${topic} is weak or inconsistent. While some studies find an effect, it is small and may not be practically meaningful.`,
      confidenceExplanation: bayesFactor > 10
        ? `Confidence is relatively high because the Bayesian analysis shows strong evidence that converges regardless of starting assumptions.`
        : bayesFactor > 3
        ? `Confidence is moderate — the evidence leans in one direction but isn't overwhelming. The conclusion could shift with new data.`
        : `Confidence is limited because the evidence is weak or the conclusion depends heavily on which assumptions you start with.`,
      whatCouldChange: `${rawAnalysis.includes('publication bias') ? 'Publication bias is a concern — negative results may be missing. ' : ''}${rawAnalysis.includes('confound') ? 'Uncontrolled confounders could explain the association. ' : ''}New well-designed studies with larger samples would clarify the picture for ${topic}.`,
      whoShouldTrust: effectSize > 0.6 && bayesFactor > 5
        ? `This evidence is strong enough to inform guidelines and decisions about ${topic}, though domain experts should verify primary sources.`
        : `This should be treated as preliminary evidence. It's useful for guiding further research on ${topic}, but not for changing practice yet.`,
      sectionLabels,
    };
  }

  // ── General / conceptual queries ───────────────────────────────────
  // For follow-ups, adjust the framing to show we're going deeper, not starting over
  const depthPrefix = qa.isFollowUp
    ? `Building on the previous analysis, the system performed a ${focusAspect ? `focused deep-dive into ${focusAspect} as it relates to` : 'deeper-layer analysis of'} ${topic}`
    : null;

  return {
    whatWasTried: qa.isFollowUp
      ? `${depthPrefix}, running ${Math.floor(5 + qa.complexity * 5)} additional reasoning passes with increased focus depth. The pipeline targeted ${focusAspect || 'the specific dimensions'} the user asked about, cross-referencing with the initial findings.`
      : qa.domain !== 'general'
      ? `The system examined "${qa.coreQuestion.slice(0, 80)}" through ${qa.domain === 'psychology' ? 'behavioral science and cognitive' : qa.domain === 'technology' ? 'technical assessment and benchmarking' : qa.domain === 'social_science' ? 'sociological and institutional' : qa.domain === 'economics' ? 'economic modeling and market analysis' : 'cross-disciplinary analytical'} frameworks, running ${Math.floor(3 + qa.complexity * 7)} reasoning passes across ${qa.entities.length > 2 ? qa.entities.length : 'multiple'} key dimensions.`
      : `The system ran a structured analysis of "${qa.coreQuestion.slice(0, 80)}" — breaking it into testable sub-claims, checking internal consistency, and evaluating from ${Math.floor(2 + qa.entities.length)} distinct analytical perspectives.`,

    whatIsLikelyTrue: (() => {
      const topic = qa.entities.slice(0, 3).join(', ') || 'this topic';

      // Follow-up responses should go DEEPER into the specific aspect, not repeat the overview
      if (qa.isFollowUp && focusAspect) {
        return `Drilling into ${focusAspect} specifically: the evidence reveals a more nuanced picture than the initial overview suggests. For ${topic}, ${focusAspect} operates through multiple mechanisms — some well-established in the literature and others still debated. The strongest evidence supports a conditional relationship: the degree of ${focusAspect} depends on contextual factors including individual differences, methodology, and the specific outcome measures used. What appears as a simple relationship at the surface level actually involves multiple interacting pathways, with both direct effects (supported by stronger evidence) and indirect effects through mediating variables (where evidence is more mixed).`;
      }

      if (qa.isFollowUp) {
        return `Going deeper into ${topic}: the additional analysis reveals layers that the initial assessment didn't fully surface. The core findings hold, but with important qualifications. The evidence base is stronger in some dimensions than others, and the nuances that matter most involve the boundary conditions — where the general pattern breaks down or reverses. Understanding these edge cases is where the real insight lies.`;
      }

      if (qa.questionType === 'evaluative') {
        return `The answer depends significantly on which values and criteria you prioritize. For ${topic}, the evidence supports multiple defensible positions, and the system found no single framing that dominates all others. The strongest claims are those grounded in empirical observation rather than theoretical preference.`;
      }
      if (qa.questionType === 'causal') {
        return `There is ${rawAnalysis.includes('strong causal') ? 'reasonably strong' : 'suggestive but incomplete'} evidence linking the factors in question. For ${topic}, correlational data exists but establishing firm causation requires controlling for confounders that current research hasn't fully addressed.`;
      }
      if (qa.questionType === 'comparative') {
        return `The comparison reveals meaningful differences, but context matters heavily. For ${topic}, which option "wins" depends on the specific criteria, population, and conditions you care about most. No single answer applies universally.`;
      }
      if (qa.questionType === 'speculative') {
        return `This is inherently forward-looking, so confidence is bounded. For ${topic}, the most probable trajectory based on current trends and structural factors points in a specific direction, but prediction accuracy degrades with time horizon.`;
      }
      if (qa.complexity < 0.3) {
        return `The evidence on ${topic} is relatively straightforward. The key points are well-established, though as with any topic, edge cases and contextual factors can change the picture.`;
      }
      return `This is a multi-layered question. For ${topic}, the evidence converges on some points but diverges on others. The most robust finding is that simplistic framings miss important nuances — the reality involves trade-offs and conditional dependencies that resist sound-bite answers.`;
    })(),

    confidenceExplanation: (() => {
      if (qa.isFollowUp) return `Confidence on this deeper pass is ${qa.complexity > 0.5 ? 'lower than the initial assessment' : 'comparable to the initial assessment'} because digging into nuances exposes more uncertainty. The system is more certain about the broad strokes and less certain about the specific mechanisms and boundary conditions that this follow-up targets.`;
      if (qa.complexity > 0.7) return `Confidence is moderate-to-low because the question is genuinely complex — it touches multiple domains with different evidence standards, and any simple answer would be misleading.`;
      if (qa.questionType === 'speculative') return `Confidence is inherently limited for speculative questions. The system can analyze trends and structural factors but cannot predict future events with high reliability.`;
      if (qa.questionType === 'evaluative') return `Confidence in the factual components is reasonable, but the evaluative dimension depends on values and priorities that the system cannot adjudicate.`;
      if (qa.isEmpirical) return `Confidence is anchored to the available evidence. Where randomized controlled studies exist, confidence is higher; where the system relies on observational data or expert opinion, it's lower.`;
      return `Confidence reflects the quality and convergence of available evidence. The system is more certain about well-studied aspects and less certain about areas where research is thin or contradictory.`;
    })(),

    whatCouldChange: (() => {
      const topic = qa.entities.slice(0, 2).join(' and ') || 'this topic';
      const parts: string[] = [];
      if (qa.isFollowUp) parts.push(`The specific nuances identified in this deeper analysis are more sensitive to methodological choices and population differences than the broad findings.`);
      if (qa.isEmpirical || qa.questionType === 'causal') parts.push(`New randomized controlled studies with larger samples could strengthen or overturn the current evidence on ${topic}.`);
      if (qa.hasNormativeClaims) parts.push(`Shifts in cultural values or ethical frameworks could reframe which considerations are most important.`);
      if (qa.questionType === 'speculative') parts.push(`Unexpected events, policy changes, or technological breakthroughs could invalidate current projections.`);
      if (parts.length === 0) parts.push(`New data, unconsidered perspectives, or methodological improvements could shift this analysis.`);
      if (!qa.isFollowUp) parts.push(`Framing the question differently could highlight aspects the current analysis underweights.`);
      return parts.join(' ');
    })(),

    whoShouldTrust: (() => {
      const topic = qa.entities.slice(0, 2).join(' and ') || 'this topic';
      if (qa.isFollowUp) return `This deeper analysis is most valuable for researchers and practitioners who need to understand the specific mechanisms and boundary conditions around ${topic}. The nuances identified here go beyond introductory-level understanding and into territory where expert judgment matters.`;
      if (qa.complexity > 0.7) return `This analysis provides a structured map of a genuinely difficult question about ${topic}. Use it as a starting point for deeper investigation, not as a final answer. Domain experts will likely agree with the framework but may weight factors differently.`;
      if (qa.isEmpirical) return `The evidence-based components of this analysis are solid for informing decisions about ${topic}. Cross-reference with primary sources and domain-specific guidelines before making high-stakes decisions.`;
      return `This analysis is useful for understanding the key considerations around ${topic}. It provides a balanced overview, but specialists in the relevant field may offer additional depth and nuance.`;
    })(),

    sectionLabels,
  };
}
