import type { PipelineStage } from '@/lib/constants';

// --- Pipeline Stage Result ---

export type StageStatus = 'idle' | 'active' | 'complete' | 'error';

export interface StageResult {
  stage: PipelineStage;
  status: StageStatus;
  summary: string;
  detail?: string;
  value?: number;
}

// --- Dual-Message System ---

export interface LaymanSummary {
  whatWasTried: string;
  whatIsLikelyTrue: string;
  confidenceExplanation: string;
  whatCouldChange: string;
  whoShouldTrust: string;
  sectionLabels?: {
    whatWasTried?: string;
    whatIsLikelyTrue?: string;
    confidenceExplanation?: string;
    whatCouldChange?: string;
    whoShouldTrust?: string;
  };
}

export interface ReflectionResult {
  selfCriticalQuestions: string[];
  adjustments: string[];
  leastDefensibleClaim: string;
  precisionVsEvidenceCheck: string;
}

export interface EngineVote {
  engine: PipelineStage;
  position: 'supports' | 'opposes' | 'neutral';
  reasoning: string;
  confidence: number;
}

export interface ArbitrationResult {
  consensus: boolean;
  votes: EngineVote[];
  disagreements: string[];
  resolution: string;
}

export interface DualMessage {
  rawAnalysis: string;
  uncertaintyTags: UncertaintyTag[];
  modelVsDataFlags: DataFlag[];

  laymanSummary: LaymanSummary;
  reflection: ReflectionResult;
  arbitration: ArbitrationResult;
}

export type UncertaintyTag = {
  claim: string;
  tag: 'DATA' | 'MODEL' | 'UNCERTAIN' | 'CONFLICT';
};

export type DataFlag = {
  claim: string;
  source: 'data-driven' | 'model-assumption' | 'heuristic';
};

// --- Synthesis Report ---

export interface SynthesisReport {
  plainSummary: string;
  researchSummary: string;
  suggestions: string[];
  timestamp: number;
}

// --- File Attachments ---

export interface FileAttachment {
  id: string;
  name: string;
  type: 'image' | 'csv' | 'pdf' | 'text' | 'other';
  uri: string;
  size: number;
  mimeType: string;
  preview?: string;
}

// --- Truth Bot ---

export interface TruthAssessment {
  overallTruthLikelihood: number;
  signalInterpretation: string;
  weaknesses: string[];
  improvements: string[];
  blindSpots: string[];
  confidenceCalibration: string;
  dataVsModelBalance: string;
  recommendedActions: string[];
}

// --- Structural Complexity Metrics ---
//
// Heuristic structural complexity signals derived from query properties
// (entity count, complexity, domain flags). They provide useful RELATIVE
// rankings (higher complexity → higher values) for the steering engine
// and UI display.
//
// - betti0: fragmentation estimate — entity count and complexity based
// - betti1: cyclical complexity — complexity × adversarial intensity + entity factor
// - persistenceEntropy: structural noise — linear combo of complexity + entity factor
// - maxPersistence: dominant pattern strength — 0.1 + complexity × 0.5 + entity factor × 0.15
//
// In API mode, the prompt composer translates these into behavioral directives,
// so the exact values matter less than their relative magnitudes.

export interface TDASnapshot {
  betti0: number;
  betti1: number;
  persistenceEntropy: number;
  maxPersistence: number;
}

// --- Evidence Grade ---

export type EvidenceGrade = 'A' | 'B' | 'C' | 'D' | 'F';

// --- Analysis Mode ---

export type AnalysisMode = 'meta-analytical' | 'philosophical-analytical' | 'executive' | 'moderate';

// --- Safety State ---

export type SafetyState = 'green' | 'yellow' | 'orange' | 'red';

// --- SSE Pipeline Events ---

export type PipelineEvent =
  | { type: 'stage'; stage: PipelineStage; detail: string; value: number; status: StageStatus }
  | { type: 'signals'; data: Partial<SignalUpdate> }
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'soar'; event: string; data: Record<string, unknown> }
  | { type: 'complete'; dualMessage: DualMessage; truthAssessment: TruthAssessment; confidence: number; grade: EvidenceGrade; mode: AnalysisMode; signals: SignalUpdate }
  | { type: 'error'; message: string };

// HONEST ASSESSMENT: All signals are heuristic functions of query properties
// (complexity, entity count, domain flags) plus user-controllable steering bias.
// They are NOT derived from real statistical analysis or information theory.
// They provide useful relative rankings but should
// not be interpreted as calibrated probabilities or information-theoretic measures.
// In API mode, these signals are translated into behavioral LLM directives by
// the prompt-composer, so they influence output quality via prompt engineering.
export interface SignalUpdate {
  confidence: number;          // heuristic: domain-weighted complexity + entity factor
  entropy: number;             // heuristic: philosophical=high base, empirical=low base + complexity
  dissonance: number;          // heuristic: normative claims flag × adversarial intensity
  healthScore: number;         // computed: 1 - entropy×0.45 - dissonance×0.35 - safetyPenalty
  safetyState: SafetyState;    // threshold-based: riskScore >= 0.55 → red, >= 0.35 → yellow
  riskScore: number;           // heuristic: safety keywords → 0.4 base, normative → 0.15 base
  tda: TDASnapshot;            // heuristic structural complexity (see TDASnapshot doc)
  focusDepth: number;          // user-controllable + steering bias
  temperatureScale: number;    // user-controllable + steering bias
  activeConcepts: string[];    // domain-based concept pool, sorted by concept weights
  /** @deprecated Decorative metric — product of prime numbers by concept index. No semantic meaning. */
  activeChordProduct: number;
  /** @deprecated Alias for dissonance capped at 0.95. Retained for UI compatibility. */
  harmonyKeyDistance: number;
}

// --- Pipeline Controls (shared between store and engine) ---

export interface PipelineControls {
  focusDepthOverride: number | null;
  temperatureOverride: number | null;
  complexityBias: number;
  adversarialIntensity: number;
  bayesianPriorStrength: number;
  conceptWeights?: Record<string, number>;
}

// --- Chat Message (for DB serialization) ---

export interface ChatMessage {
  id: string;
  role: 'user' | 'system';
  text: string;
  timestamp: number;
  confidence?: number;
  evidenceGrade?: EvidenceGrade;
  mode?: AnalysisMode;
  dualMessage?: DualMessage;
  attachments?: FileAttachment[];
  truthAssessment?: TruthAssessment;
  concepts?: string[];
  reasoning?: {
    content: string;
    duration?: number;
  };
}
