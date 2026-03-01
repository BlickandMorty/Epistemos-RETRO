/**
 * Steering Store — thin UI state holder.
 * ALL steering computation lives in Rust (ported from Mac version).
 * This store only holds display state received from the backend via Tauri events.
 */

import { create } from 'zustand';

interface SteeringDisplayState {
  enabled: boolean;
  masterStrength: number;
  steeringStrength: number;
  isLoaded: boolean;

  // Actions
  toggleSteering: () => void;
  setMasterStrength: (v: number) => void;
  setSteeringStrength: (v: number) => void;
  loadFromBackend: () => void;
  resetMemory: () => void;
}

export const useSteeringStore = create<SteeringDisplayState>((set) => ({
  enabled: true,
  masterStrength: 0.5,
  steeringStrength: 0,
  isLoaded: false,

  toggleSteering: () => set((s) => ({ enabled: !s.enabled })),
  setMasterStrength: (v) => set({ masterStrength: Math.max(0, Math.min(1, v)) }),
  setSteeringStrength: (v) => set({ steeringStrength: v }),
  loadFromBackend: () => set({ isLoaded: true }),
  resetMemory: () => set({ steeringStrength: 0 }),
}));
