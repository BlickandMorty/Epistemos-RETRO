'use client';

import type {
  StageResult,
  StageStatus,
  TDASnapshot,
  SafetyState,
  SignalUpdate,
} from '@/lib/engine/types';
import type { PipelineStage } from '@/lib/constants';
import { STAGES, STAGE_LABELS } from '@/lib/constants';
import type { PFCSet, PFCGet } from '../use-pfc-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshPipeline(): StageResult[] {
  return STAGES.map((s) => ({
    stage: s,
    status: 'idle' as StageStatus,
    summary: STAGE_LABELS[s],
  }));
}

// ---------------------------------------------------------------------------
// Signal history
// ---------------------------------------------------------------------------

export interface SignalHistoryEntry {
  timestamp: number;
  confidence: number;
  entropy: number;
  dissonance: number;
  healthScore: number;
  riskScore: number;
}

const MAX_SIGNAL_HISTORY = 50;

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface PipelineSliceState {
  pipelineStages: StageResult[];
  activeStage: PipelineStage | null;
  isProcessing: boolean;

  // signals
  confidence: number;
  entropy: number;
  dissonance: number;
  healthScore: number;
  safetyState: SafetyState;
  riskScore: number;

  // tda
  tda: TDASnapshot;

  // focus
  focusDepth: number;
  temperatureScale: number;

  // concept chords
  activeChordProduct: number;
  activeConcepts: string[];
  harmonyKeyDistance: number;

  // meta
  queriesProcessed: number;
  totalTraces: number;
  skillGapsDetected: number;

  // signal history
  signalHistory: SignalHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Actions interface
// ---------------------------------------------------------------------------

export interface PipelineSliceActions {
  advanceStage: (stage: PipelineStage, result: Partial<StageResult>) => void;
  updateSignals: (
    signals: Partial<
      Pick<
        PipelineSliceState,
        'entropy' | 'dissonance' | 'healthScore' | 'safetyState' | 'riskScore'
      >
    >,
  ) => void;
  updateTDA: (tda: Partial<TDASnapshot>) => void;
  updateFocus: (depth: number, temp: number) => void;
  updateConcepts: (
    concepts: string[],
    chord: number,
    harmony: number,
  ) => void;
  applySignalUpdate: (update: Partial<SignalUpdate>) => void;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

export const createPipelineSlice = (set: PFCSet, get: PFCGet) => ({
  // --- initial state ---
  pipelineStages: freshPipeline(),
  activeStage: null as PipelineStage | null,
  isProcessing: false,

  confidence: 0.5,
  entropy: 0,
  dissonance: 0,
  healthScore: 1.0,
  safetyState: 'green' as SafetyState,
  riskScore: 0,

  tda: { betti0: 0, betti1: 0, persistenceEntropy: 0, maxPersistence: 0 },

  focusDepth: 3,
  temperatureScale: 1.0,

  activeChordProduct: 1,
  activeConcepts: [] as string[],
  harmonyKeyDistance: 0,

  queriesProcessed: 0,
  totalTraces: 0,
  skillGapsDetected: 0,

  signalHistory: [] as SignalHistoryEntry[],

  // --- actions ---

  advanceStage: (stage: PipelineStage, result: Partial<StageResult>) =>
    set((s) => ({
      activeStage: stage,
      pipelineStages: s.pipelineStages.map((sr: StageResult) =>
        sr.stage === stage
          ? { ...sr, ...result, status: result.status ?? 'active' }
          : sr,
      ),
    })),

  updateSignals: (
    signals: Partial<
      Pick<
        PipelineSliceState,
        'entropy' | 'dissonance' | 'healthScore' | 'safetyState' | 'riskScore'
      >
    >,
  ) => set(signals),

  updateTDA: (tda: Partial<TDASnapshot>) =>
    set((s) => ({ tda: { ...s.tda, ...tda } })),

  updateFocus: (depth: number, temp: number) =>
    set({ focusDepth: depth, temperatureScale: temp }),

  updateConcepts: (concepts: string[], chord: number, harmony: number) =>
    set({
      activeConcepts: concepts,
      activeChordProduct: chord,
      harmonyKeyDistance: harmony,
    }),

  applySignalUpdate: (update: Partial<SignalUpdate>) =>
    set((s) => ({
      ...(update.confidence !== undefined && {
        confidence: update.confidence,
      }),
      ...(update.entropy !== undefined && { entropy: update.entropy }),
      ...(update.dissonance !== undefined && {
        dissonance: update.dissonance,
      }),
      ...(update.healthScore !== undefined && {
        healthScore: update.healthScore,
      }),
      ...(update.safetyState !== undefined && {
        safetyState: update.safetyState,
      }),
      ...(update.riskScore !== undefined && { riskScore: update.riskScore }),
      ...(update.tda && { tda: { ...s.tda, ...update.tda } }),
      ...(update.focusDepth !== undefined && {
        focusDepth: update.focusDepth,
      }),
      ...(update.temperatureScale !== undefined && {
        temperatureScale: update.temperatureScale,
      }),
      ...(update.activeConcepts && {
        activeConcepts: update.activeConcepts,
      }),
      ...(update.activeChordProduct !== undefined && {
        activeChordProduct: update.activeChordProduct,
      }),
      ...(update.harmonyKeyDistance !== undefined && {
        harmonyKeyDistance: update.harmonyKeyDistance,
      }),
    })),
});
