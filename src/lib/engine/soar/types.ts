// ═══════════════════════════════════════════════════════════════════
// SOAR — Self-Organized Analytical Reasoning
// Type Definitions (ported from brainiac-2.0)
// ═══════════════════════════════════════════════════════════════════

import type { InferenceMode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Learnability Thresholds
// ---------------------------------------------------------------------------

export interface LearnabilityThresholds {
  confidenceFloor: number;
  entropyCeiling: number;
  dissonanceCeiling: number;
  difficultyFloor: number;
}

const DEFAULT_LEARNABILITY_THRESHOLDS: LearnabilityThresholds = {
  confidenceFloor: 0.35,
  entropyCeiling: 0.7,
  dissonanceCeiling: 0.6,
  difficultyFloor: 0.5,
};

// ---------------------------------------------------------------------------
// Reward Weights
// ---------------------------------------------------------------------------

export interface RewardWeights {
  confidence: number;
  entropy: number;
  dissonance: number;
  health: number;
  tda: number;
}

const DEFAULT_REWARD_WEIGHTS: RewardWeights = {
  confidence: 0.35,
  entropy: 0.25,
  dissonance: 0.20,
  health: 0.15,
  tda: 0.05,
};

// ---------------------------------------------------------------------------
// SOAR Session (runtime state, not persisted)
// ---------------------------------------------------------------------------

export interface SOARSession {
  id: string;
  targetQuery: string;
  iterationsCompleted: number;
  maxIterations: number;
  overallImproved: boolean;
  status: 'probing' | 'teaching' | 'learning' | 'evaluating' | 'complete' | 'aborted';
  startedAt: number;
  completedAt: number | null;
}

// ---------------------------------------------------------------------------
// SOAR Configuration (persisted in localStorage)
// ---------------------------------------------------------------------------

export interface SOARConfig {
  enabled: boolean;
  autoDetect: boolean;
  thresholds: LearnabilityThresholds;
  maxIterations: number;
  stonesPerCurriculum: number;
  rewardWeights: RewardWeights;
  minRewardThreshold: number;
  contradictionDetection: boolean;
  maxContradictionClaims: number;
  apiCostCapTokens: number;
  verbose: boolean;
}

export const DEFAULT_SOAR_CONFIG: SOARConfig = {
  enabled: false,
  autoDetect: true,
  thresholds: DEFAULT_LEARNABILITY_THRESHOLDS,
  maxIterations: 3,
  stonesPerCurriculum: 3,
  rewardWeights: DEFAULT_REWARD_WEIGHTS,
  minRewardThreshold: 0.05,
  contradictionDetection: true,
  maxContradictionClaims: 20,
  apiCostCapTokens: 50000,
  verbose: false,
};

// ---------------------------------------------------------------------------
// Provider Limitations
// ---------------------------------------------------------------------------

export interface SOARLimitations {
  mode: InferenceMode;
  maxIterations: number;
  maxStonesPerCurriculum: number;
  supportsRapidIteration: boolean;
  supportsLogprobs: boolean;
  estimatedCostPerIteration: string;
  estimatedLatencyPerIteration: string;
}

export function getSOARLimitations(mode: InferenceMode): SOARLimitations {
  if (mode === 'local') {
    return {
      mode: 'local',
      maxIterations: 5,
      maxStonesPerCurriculum: 5,
      supportsRapidIteration: true,
      supportsLogprobs: true,
      estimatedCostPerIteration: 'Free (local compute)',
      estimatedLatencyPerIteration: '5-30s',
    };
  }
  return {
    mode: 'api',
    maxIterations: 2,
    maxStonesPerCurriculum: 3,
    supportsRapidIteration: false,
    supportsLogprobs: false,
    estimatedCostPerIteration: '~$0.02-0.15',
    estimatedLatencyPerIteration: '3-12s',
  };
}
