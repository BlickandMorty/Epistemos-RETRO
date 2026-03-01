/**
 * Steering Store — thin UI state holder.
 * ALL steering computation lives in Rust (ported from Mac version).
 * This store only holds display state received from the backend via Tauri events.
 */

import { create } from 'zustand';

interface SteeringConfig {
  enabled: boolean;
  masterStrength: number;
}

interface SteeringStats {
  totalExemplars: number;
  positiveRate: number;
}

interface SteeringBias {
  steeringStrength: number;
  direction: number;
}

interface SteeringDisplayState {
  enabled: boolean;
  masterStrength: number;
  steeringStrength: number;
  isLoaded: boolean;

  // Structured accessors (used by steering-indicator.tsx, steering-feedback.tsx)
  config: SteeringConfig;
  stats: SteeringStats;
  currentBias: SteeringBias;

  // Actions
  toggleSteering: () => void;
  setMasterStrength: (v: number) => void;
  setSteeringStrength: (v: number) => void;
  loadFromBackend: () => void;
  resetMemory: () => void;
  rateMessage: (synthesisKeyId: string, rating: number) => void;
}

export const useSteeringStore = create<SteeringDisplayState>((set, get) => ({
  enabled: true,
  masterStrength: 0.5,
  steeringStrength: 0,
  isLoaded: false,

  // Structured accessors — computed from raw state
  config: { enabled: true, masterStrength: 0.5 },
  stats: { totalExemplars: 0, positiveRate: 0 },
  currentBias: { steeringStrength: 0, direction: 0 },

  toggleSteering: () => set((s) => {
    const enabled = !s.enabled;
    return { enabled, config: { ...s.config, enabled } };
  }),
  setMasterStrength: (v) => {
    const masterStrength = Math.max(0, Math.min(1, v));
    set((s) => ({ masterStrength, config: { ...s.config, masterStrength } }));
  },
  setSteeringStrength: (v) => set((s) => ({
    steeringStrength: v,
    currentBias: { ...s.currentBias, steeringStrength: v },
  })),
  loadFromBackend: () => set({ isLoaded: true }),
  resetMemory: () => set((s) => ({
    steeringStrength: 0,
    currentBias: { ...s.currentBias, steeringStrength: 0 },
  })),
  rateMessage: (_synthesisKeyId: string, _rating: number) => { /* Will wire to Rust backend */ },
}));
