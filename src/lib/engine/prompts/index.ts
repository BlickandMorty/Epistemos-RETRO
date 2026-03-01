/**
 * Structured prompt templates for the 10-stage analytical pipeline.
 *
 * These replace the Python reasoning modules (StatisticalAnalyzer, CausalInferenceEngine,
 * MetaAnalysisEngine, BayesianReasoner) with prompt-based equivalents that encode the
 * same mathematical frameworks as behavioral instructions for the LLM.
 *
 * The mathematical foundations are preserved as structured rubrics:
 * - Cohen's d thresholds, power analysis, MCID (statistical)
 * - Bradford Hill 9 criteria, DAG formalism (causal)
 * - DerSimonian-Laird concepts, I² scale, GRADE framework (meta-analysis)
 * - Conjugate priors, Bayes factor scale, credible intervals (Bayesian)
 *
 * The standalone mathematical implementations live in the meta-analytical-pipeline
 * project for those who need actual numerical computation.
 */

export { buildStatisticalPrompt } from './statistical';
export { buildCausalPrompt } from './causal';
export { buildMetaAnalysisPrompt } from './meta-analysis';
export { buildBayesianPrompt } from './bayesian';
