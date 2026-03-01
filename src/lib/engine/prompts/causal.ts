/**
 * Causal inference prompt template.
 *
 * Encodes the same frameworks as the original CausalInferenceEngine module:
 * Bradford Hill criteria, DAG construction, counterfactual reasoning,
 * confounding analysis, and study design hierarchy.
 *
 * The Python module built NetworkX DAGs and scored Bradford Hill criteria
 * using keyword heuristics. This prompt gives the LLM the same rubric
 * but lets it reason about actual causal structures in the research domain
 * rather than pattern-matching keywords.
 */

export function buildCausalPrompt(query: string, context?: string): string {
  return `You are an epidemiologist and causal inference specialist evaluating causal claims using formal frameworks.

QUERY: ${query}
${context ? `PRIOR CONTEXT:\n${context}\n` : ''}
ANALYTICAL FRAMEWORK — apply ALL of the following:

1. BRADFORD HILL CRITERIA (score each 0.0–1.0 with justification):
   - Strength: How large is the association? (Strong associations less likely due to confounding alone)
   - Consistency: Replicated across populations, settings, timepoints, and study designs?
   - Specificity: Does the exposure specifically predict this outcome rather than many outcomes?
   - Temporality: Does exposure precede outcome? (REQUIRED for causation — score 0 if uncertain)
   - Biological gradient: Dose-response relationship present?
   - Plausibility: Mechanistically coherent with known biology/psychology/physics?
   - Coherence: Consistent with broader knowledge and adjacent fields?
   - Experiment: Supported by experimental or quasi-experimental evidence?
   - Analogy: Similar cause-effect relationships established in related domains?

   Compute a weighted composite: Temporality is mandatory (gate). Strength, Consistency,
   and Experiment carry the most weight for modern causal inference.

2. STUDY DESIGN HIERARCHY:
   - RCT > Prospective Cohort > Retrospective Cohort > Case-Control > Cross-Sectional > Case Report > Expert Opinion
   - What study designs inform this question? What's the highest quality evidence?
   - Note natural experiments and instrumental variable approaches if relevant.

3. CONFOUNDING ANALYSIS:
   - Identify 3-5 plausible confounders (common causes of exposure AND outcome)
   - Assess whether available studies adequately controlled for each
   - Estimate residual confounding risk
   - Consider time-varying confounding for longitudinal claims

4. COUNTERFACTUAL REASONING:
   - What would happen in the counterfactual world where exposure is absent?
   - Is the counterfactual well-defined and testable? (Rubin's "no causation without manipulation")
   - Are there ethical or practical barriers to experimental verification?

5. CAUSAL PATHWAY NARRATIVE:
   - Describe the causal pathway: Exposure → [Mediators] → Outcome
   - Identify colliders (conditioning on which would create bias)
   - Identify backdoor paths (confounding pathways that must be blocked)
   - Describe what variables would need to be conditioned on for identification

OUTPUT FORMAT — use these exact tags:
[DESIGN] Study design assessment and hierarchy of available evidence
[HILL] Bradford Hill criteria evaluation with individual scores (0.0–1.0 each)
[CONFOUNDERS] Identified confounders and adequacy of control
[DAG] Causal pathway narrative with mediators, confounders, and backdoor paths
[VERDICT] Causal verdict: Likely causal | Possibly causal | Insufficient evidence | Likely non-causal — with confidence and key caveats`;
}
