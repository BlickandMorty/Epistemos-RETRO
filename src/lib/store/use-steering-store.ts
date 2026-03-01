'use client';

// ═══════════════════════════════════════════════════════════════════
// ██ STEERING STORE — Zustand State for Adaptive Steering Engine
// ══════════════════════════════════════════════════════════════════
//
// Separate store from use-pfc-store.ts (which is already 700+ lines).
// Manages steering memory, configuration, and current bias state.
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import type {
  SteeringMemory,
  SteeringBias,
  SteeringConfig,
  QueryFeatureVector,
} from '@/lib/engine/steering/types';
import {
  createEmptyMemory,
  createNeutralBias,
  DEFAULT_STEERING_CONFIG,
} from '@/lib/engine/steering/types';
import { computeSteeringBias, updatePriors } from '@/lib/engine/steering/engine';
import {
  addExemplar,
  updateExemplarRating,
  saveMemoryToStorage,
  loadMemoryFromStorage,
  clearMemoryFromStorage,
  getMemoryStats,
  type MemoryStats,
  exportMemory,
  importMemory,
  refreshDecayWeights,
} from '@/lib/engine/steering/memory';
import { encodeSynthesisKey, type SignalSnapshot, type QueryAnalysisSnapshot } from '@/lib/engine/steering/encoder';
import { createSteeringOutcome, type TruthAssessmentInput, type SignalStateInput } from '@/lib/engine/steering/feedback';

// ── Store interface ──────────────────────────────────────────────

interface SteeringStoreState {
  // Core state
  memory: SteeringMemory;
  config: SteeringConfig;
  currentBias: SteeringBias;
  stats: MemoryStats;

  // Tracking
  latestSynthesisKeyId: string | null;
  isLoaded: boolean;

  // Actions — lifecycle
  loadFromStorage: () => void;
  resetMemory: () => void;

  // Actions — recording
  recordPipelineRun: (
    signals: SignalSnapshot,
    queryAnalysis: QueryAnalysisSnapshot,
    chatId: string,
    truthAssessment: TruthAssessmentInput | null,
  ) => string; // returns synthesis key ID

  // Actions — user feedback
  rateMessage: (synthesisKeyId: string, rating: number) => void;

  // Actions — bias computation
  computeBias: (queryFeatures: QueryFeatureVector) => SteeringBias;

  // Actions — configuration
  toggleSteering: () => void;
  setMasterStrength: (v: number) => void;

  // Actions — import/export
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
}

// ── Store implementation ─────────────────────────────────────────

export const useSteeringStore = create<SteeringStoreState>((set, get) => ({
  memory: createEmptyMemory(),
  config: { ...DEFAULT_STEERING_CONFIG },
  currentBias: createNeutralBias(),
  stats: getMemoryStats(createEmptyMemory()),
  latestSynthesisKeyId: null,
  isLoaded: false,

  // ── Load from localStorage ───────────────────────────────────

  loadFromStorage: () => {
    const memory = loadMemoryFromStorage();
    const refreshed = refreshDecayWeights(memory, Date.now(), DEFAULT_STEERING_CONFIG.decayRate);
    set({
      memory: refreshed,
      stats: getMemoryStats(refreshed),
      isLoaded: true,
    });
  },

  // ── Reset ────────────────────────────────────────────────────

  resetMemory: () => {
    clearMemoryFromStorage();
    const empty = createEmptyMemory();
    set({
      memory: empty,
      currentBias: createNeutralBias(),
      stats: getMemoryStats(empty),
      latestSynthesisKeyId: null,
    });
  },

  // ── Record a pipeline run ────────────────────────────────────
  // Called after every query completion. Encodes signals → synthesis key,
  // computes auto-quality outcome, adds to memory, updates priors.

  recordPipelineRun: (signals, queryAnalysis, chatId, truthAssessment) => {
    const state = get();

    // 1. Encode synthesis key
    const key = encodeSynthesisKey(signals, queryAnalysis, chatId);

    // 2. Compute auto-quality outcome
    const signalState: SignalStateInput = {
      confidence: signals.confidence,
      entropy: signals.entropy,
      dissonance: signals.dissonance,
      healthScore: signals.healthScore,
      riskScore: signals.riskScore,
    };
    const outcome = createSteeringOutcome(key.id, truthAssessment, signalState);

    // 3. Add to memory
    const updatedMemory = addExemplar(state.memory, key, outcome, state.config);

    // 4. Update Bayesian priors
    const isPositive = outcome.compositeScore > state.config.outcomeThreshold;
    const isNegative = outcome.compositeScore < -state.config.outcomeThreshold;

    let updatedPriors = updatedMemory.priors;
    if (isPositive || isNegative) {
      updatedPriors = updatePriors(updatedMemory.priors, key.vector, isPositive);
    }

    const finalMemory: SteeringMemory = {
      ...updatedMemory,
      priors: updatedPriors,
    };

    // 5. Save and update state
    saveMemoryToStorage(finalMemory);
    set({
      memory: finalMemory,
      stats: getMemoryStats(finalMemory),
      latestSynthesisKeyId: key.id,
    });

    return key.id;
  },

  // ── Rate a message ───────────────────────────────────────────

  rateMessage: (synthesisKeyId, rating) => {
    const state = get();
    const updatedMemory = updateExemplarRating(state.memory, synthesisKeyId, rating);

    // Re-update priors based on the new rating
    const exemplar = updatedMemory.exemplars.find(ex => ex.key.id === synthesisKeyId);
    if (exemplar) {
      const isPositive = exemplar.outcome.compositeScore > state.config.outcomeThreshold;
      const isNegative = exemplar.outcome.compositeScore < -state.config.outcomeThreshold;

      if (isPositive || isNegative) {
        updatedMemory.priors = updatePriors(
          updatedMemory.priors,
          exemplar.key.vector,
          isPositive,
        );
      }
    }

    saveMemoryToStorage(updatedMemory);
    set({
      memory: updatedMemory,
      stats: getMemoryStats(updatedMemory),
    });
  },

  // ── Compute steering bias for a new query ────────────────────

  computeBias: (queryFeatures) => {
    const state = get();
    const bias = computeSteeringBias(state.memory, queryFeatures, state.config);
    set({ currentBias: bias });
    return bias;
  },

  // ── Toggle steering on/off ───────────────────────────────────

  toggleSteering: () => {
    set(state => ({
      config: { ...state.config, enabled: !state.config.enabled },
      currentBias: state.config.enabled ? createNeutralBias() : state.currentBias,
    }));
  },

  // ── Set master strength dial ─────────────────────────────────

  setMasterStrength: (v) => {
    set(state => ({
      config: { ...state.config, masterStrength: Math.max(0, Math.min(1, v)) },
    }));
  },

  // ── Export/Import ────────────────────────────────────────────

  exportJSON: () => {
    return exportMemory(get().memory);
  },

  importJSON: (json) => {
    const imported = importMemory(json);
    if (!imported) return false;
    saveMemoryToStorage(imported);
    set({
      memory: imported,
      stats: getMemoryStats(imported),
    });
    return true;
  },
}));
