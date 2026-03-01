/**
 * Meta-analysis prompt template.
 *
 * Encodes the same frameworks as the original MetaAnalysisEngine module:
 * DerSimonian-Laird random-effects concepts, heterogeneity interpretation (I²),
 * publication bias assessment (Egger's test), and sensitivity analysis.
 *
 * The Python module computed pooled effects using NumPy/SciPy on mock studies
 * extracted from query keywords. This prompt lets the LLM synthesize across
 * actual literature with proper meta-analytical reasoning.
 */

export function buildMetaAnalysisPrompt(query: string, context?: string): string {
  return `You are a meta-analyst evaluating the totality of evidence across studies on a research question.

QUERY: ${query}
${context ? `PRIOR CONTEXT:\n${context}\n` : ''}
ANALYTICAL FRAMEWORK — apply ALL of the following:

1. EVIDENCE MAPPING:
   - What body of literature informs this question?
   - Estimate the number and type of studies available (RCTs, cohorts, case-controls)
   - What are the approximate individual effect estimates and their directions?
   - Are there landmark or pivotal studies that anchor the evidence base?

2. SYNTHESIS MODEL:
   - Would fixed-effects or random-effects be more appropriate?
   - Random-effects (DerSimonian-Laird approach) is preferred when studies differ in:
     populations, interventions, measurement instruments, or settings.
   - Fixed-effects only appropriate when studies are essentially identical replications.
   - What is the approximate pooled effect direction and magnitude?

3. HETEROGENEITY ASSESSMENT (I² interpretation scale):
   - Low: I² < 25% — studies show consistent results; pooled estimate is reliable
   - Moderate: 25% ≤ I² < 50% — some variation; explore subgroups
   - Substantial: 50% ≤ I² < 75% — considerable variation; pooling may mask important differences
   - Considerable: I² ≥ 75% — extreme variation; pooling may not be meaningful
   - Identify SOURCES of heterogeneity: population differences, intervention dosage/duration,
     outcome measurement, risk of bias, publication year, geographic region

4. PUBLICATION BIAS:
   - Funnel plot reasoning: Would small negative/null studies be missing?
   - Egger's test concept: Is there systematic asymmetry favoring small positive studies?
   - Grey literature: Were unpublished studies, dissertations, conference abstracts considered?
   - Language bias: Were non-English studies systematically excluded?
   - Time-lag bias: Were positive results published faster?
   - Trim-and-fill: How would results change if missing studies were imputed?

5. SENSITIVITY & SUBGROUP ANALYSIS:
   - Leave-one-out: Would removing any single influential study change the conclusion?
   - Robustness: Are results consistent across analytical assumptions?
   - Subgroup moderators: Do effects differ by age, sex, severity, dose, study quality?
   - Quality-stratified: Do high-quality studies show different effects than low-quality ones?

6. EVIDENCE CERTAINTY (GRADE framework concepts):
   - Rate: High / Moderate / Low / Very Low
   - Downgrade for: risk of bias, inconsistency (I²), indirectness, imprecision, publication bias
   - Upgrade for: large effect (d > 0.8), dose-response gradient, plausible confounding would reduce effect

OUTPUT FORMAT — use these exact tags:
[STUDIES] Overview of the evidence base (approximate count, designs, key studies)
[POOLED] Pooled effect estimate, direction, and magnitude interpretation
[HETEROGENEITY] I² assessment with identified sources of variation
[BIAS] Publication bias evaluation
[SENSITIVITY] Key sensitivity and subgroup findings
[GRADE] Evidence certainty rating with justification`;
}
