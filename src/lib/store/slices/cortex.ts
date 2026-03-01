'use client';

import type { TDASnapshot, SafetyState, PipelineControls } from '@/lib/engine/types';
import type { InferenceMode } from '@/lib/engine/llm/config';
import type { SignalHistoryEntry } from './pipeline';
import type { PFCSet, PFCGet } from '../use-pfc-store';

// ---------------------------------------------------------------------------
// Cortex Snapshot type
// ---------------------------------------------------------------------------

export interface CortexSnapshot {
  id: string;
  label: string;
  timestamp: number;
  signals: {
    confidence: number;
    entropy: number;
    dissonance: number;
    healthScore: number;
    safetyState: SafetyState;
    riskScore: number;
  };
  tda: TDASnapshot;
  focus: { focusDepth: number; temperatureScale: number };
  concepts: {
    activeConcepts: string[];
    activeChordProduct: number;
    harmonyKeyDistance: number;
  };
  controls: PipelineControls;
  meta: {
    queriesProcessed: number;
    totalTraces: number;
    skillGapsDetected: number;
  };
  inferenceMode: InferenceMode;
  signalHistory: SignalHistoryEntry[];
}

// ---------------------------------------------------------------------------
// localStorage helpers (versioned)
// ---------------------------------------------------------------------------

import { readVersioned, writeVersioned } from '@/lib/storage-versioning';

const CORTEX_STORAGE_KEY = 'pfc-cortex-archive';
const CORTEX_VERSION = 1;

function loadCortexArchive(): CortexSnapshot[] {
  return readVersioned<CortexSnapshot[]>(CORTEX_STORAGE_KEY, CORTEX_VERSION) ?? [];
}

function saveCortexArchive(snapshots: CortexSnapshot[]) {
  writeVersioned(CORTEX_STORAGE_KEY, CORTEX_VERSION, snapshots);
}

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface CortexSliceState {
  cortexArchive: CortexSnapshot[];
}

// ---------------------------------------------------------------------------
// Actions interface
// ---------------------------------------------------------------------------

export interface CortexSliceActions {
  saveCortexSnapshot: (label: string) => void;
  deleteCortexSnapshot: (id: string) => void;
  restoreCortexSnapshot: (id: string) => void;
  loadCortexFromStorage: () => void;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

export const createCortexSlice = (set: PFCSet, get: PFCGet) => ({
  // --- initial state ---
  cortexArchive: [] as CortexSnapshot[],

  // --- actions ---

  saveCortexSnapshot: (label: string) =>
    set((s) => {
      const snapshot: CortexSnapshot = {
        id: `cortex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label,
        timestamp: Date.now(),
        signals: {
          confidence: s.confidence,
          entropy: s.entropy,
          dissonance: s.dissonance,
          healthScore: s.healthScore,
          safetyState: s.safetyState,
          riskScore: s.riskScore,
        },
        tda: { ...s.tda },
        focus: {
          focusDepth: s.focusDepth,
          temperatureScale: s.temperatureScale,
        },
        concepts: {
          activeConcepts: [...s.activeConcepts],
          activeChordProduct: s.activeChordProduct,
          harmonyKeyDistance: s.harmonyKeyDistance,
        },
        controls: { ...s.controls },
        meta: {
          queriesProcessed: s.queriesProcessed,
          totalTraces: s.totalTraces,
          skillGapsDetected: s.skillGapsDetected,
        },
        inferenceMode: s.inferenceMode,
        signalHistory: [...s.signalHistory],
      };
      const updated = [snapshot, ...s.cortexArchive].slice(0, 50);
      saveCortexArchive(updated);
      return { cortexArchive: updated };
    }),

  deleteCortexSnapshot: (id: string) =>
    set((s) => {
      const updated = s.cortexArchive.filter(
        (snap: CortexSnapshot) => snap.id !== id,
      );
      saveCortexArchive(updated);
      return { cortexArchive: updated };
    }),

  restoreCortexSnapshot: (id: string) =>
    set((s) => {
      const snap = s.cortexArchive.find(
        (sn: CortexSnapshot) => sn.id === id,
      );
      if (!snap) return {};
      return {
        confidence: snap.signals.confidence,
        entropy: snap.signals.entropy,
        dissonance: snap.signals.dissonance,
        healthScore: snap.signals.healthScore,
        safetyState: snap.signals.safetyState,
        riskScore: snap.signals.riskScore,
        tda: { ...snap.tda },
        focusDepth: snap.focus.focusDepth,
        temperatureScale: snap.focus.temperatureScale,
        activeConcepts: [...snap.concepts.activeConcepts],
        activeChordProduct: snap.concepts.activeChordProduct,
        harmonyKeyDistance: snap.concepts.harmonyKeyDistance,
        controls: { ...snap.controls },
        queriesProcessed: snap.meta.queriesProcessed,
        totalTraces: snap.meta.totalTraces,
        skillGapsDetected: snap.meta.skillGapsDetected,
        inferenceMode: snap.inferenceMode,
        signalHistory: [...snap.signalHistory],
      };
    }),

  loadCortexFromStorage: () => set({ cortexArchive: loadCortexArchive() }),
});
