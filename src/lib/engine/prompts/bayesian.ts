/**
 * Bayesian reasoning prompt template.
 *
 * Encodes the same frameworks as the original BayesianReasoner module:
 * prior specification, conjugate normal updating, Bayes factor interpretation
 * scale, credible intervals, and prior sensitivity analysis.
 *
 * The Python module computed posteriors using SciPy with heuristically-set
 * priors. This prompt lets the LLM reason about prior selection and evidence
 * weighting with domain knowledge, producing more contextually appropriate
 * Bayesian reasoning.
 */

export function buildBayesianPrompt(query: string, context?: string): string {
  return `You are a Bayesian statistician updating beliefs about a research claim using formal evidence.

QUERY: ${query}
${context ? `PRIOR CONTEXT:\n${context}\n` : ''}
ANALYTICAL FRAMEWORK — apply ALL of the following:

1. PRIOR SPECIFICATION (choose and justify one):
   - Skeptical prior: Centered at null effect (mean ≈ 0), wide variance (σ ≈ 0.5)
     → Use when: extraordinary claims, no prior literature, novel mechanisms
   - Informed prior: Centered at previous meta-analytic estimates, moderate variance (σ ≈ 0.3)
     → Use when: established literature exists, replication context
   - Enthusiastic prior: Centered at expected effect, narrow variance (σ ≈ 0.2)
     → Use when: strong theoretical and mechanistic basis, high prior confidence
   - Reference prior (non-informative): Flat or very diffuse
     → Use when: letting data speak, no strong prior beliefs

   JUSTIFY your choice based on the state of knowledge for this specific question.

2. LIKELIHOOD ASSESSMENT:
   - How strongly does the available evidence support the hypothesis vs. the null?
   - What is the approximate likelihood ratio from the strongest studies?
   - How consistent is the evidence across studies? (Consistent evidence → sharper likelihood)
   - Are there ceiling/floor effects or range restrictions affecting the likelihood?

3. POSTERIOR INTERPRETATION:
   - After updating prior with evidence, what is the revised belief?
   - 95% credible interval: What range contains the true effect with 95% probability?
   - How much did beliefs shift from prior to posterior?
   - Is the posterior meaningfully different from the prior? (If not, evidence is weak)
   - Posterior predictive: What would we expect in the next study?

4. BAYES FACTOR INTERPRETATION:
   - BF₁₀ < 1: Evidence favors null hypothesis (H₀)
   - BF₁₀ 1–3: Anecdotal evidence for H₁ (barely worth noting)
   - BF₁₀ 3–10: Moderate evidence for H₁
   - BF₁₀ 10–30: Strong evidence for H₁
   - BF₁₀ 30–100: Very strong evidence for H₁
   - BF₁₀ > 100: Decisive evidence for H₁
   Estimate where the available evidence falls on this scale.

5. PRIOR SENSITIVITY ANALYSIS:
   - Would switching between skeptical and informed priors change the conclusion?
   - At what prior strength would the conclusion flip?
   - Is the evidence strong enough to overwhelm any reasonable prior?
     (If BF > 10, most priors converge to same posterior region)
   - Does the choice of prior distribution family matter (Normal vs. t vs. Cauchy)?

6. SEQUENTIAL UPDATING NARRATIVE:
   - If multiple studies exist, narrate the belief trajectory:
     "Starting from skeptical prior → after Study 1 → after Study 2 → current posterior"
   - Does the evidence accumulate consistently, or do later studies contradict earlier ones?

OUTPUT FORMAT — use these exact tags:
[PRIOR] Prior specification with justification and parameters
[EVIDENCE] Likelihood assessment and evidence strength
[POSTERIOR] Updated belief with credible interval and shift magnitude
[BF] Bayes factor estimate and interpretation
[SENSITIVITY] Prior sensitivity analysis — how robust is the conclusion?
[TRAJECTORY] Sequential updating narrative (if multiple evidence sources)`;
}
