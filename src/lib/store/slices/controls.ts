'use client';

import type { PipelineControls } from '@/lib/engine/types';
import type { PFCSet, PFCGet } from '../use-pfc-store';

const defaultControls: PipelineControls = {
  focusDepthOverride: null,
  temperatureOverride: null,
  complexityBias: 0,
  adversarialIntensity: 1.0,
  bayesianPriorStrength: 1.0,
};

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface ControlsSliceState {
  liveControlsOpen: boolean;
  controls: PipelineControls;
  /** Whether the analytics engine (signal computation, steering, SOAR) is enabled */
  analyticsEngineEnabled: boolean;
  userSignalOverrides: {
    confidence: number | null;
    entropy: number | null;
    dissonance: number | null;
    // healthScore is intentionally excluded — it's a COMPUTED metric
    // derived from entropy + dissonance + safety state. Users cannot
    // override it because it represents the model's actual analytical health.
  };
}

// ---------------------------------------------------------------------------
// Actions interface
// ---------------------------------------------------------------------------

export interface ControlsSliceActions {
  toggleLiveControls: () => void;
  setControls: (controls: Partial<PipelineControls>) => void;
  resetControls: () => void;
  setAnalyticsEngineEnabled: (enabled: boolean) => void;
  setSignalOverride: (
    signal: 'confidence' | 'entropy' | 'dissonance',
    value: number | null,
  ) => void;
  resetAllSignalOverrides: () => void;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

export const createControlsSlice = (set: PFCSet, get: PFCGet) => ({
  // --- initial state ---
  liveControlsOpen: false,
  controls: { ...defaultControls },
  analyticsEngineEnabled: true,
  userSignalOverrides: {
    confidence: null as number | null,
    entropy: null as number | null,
    dissonance: null as number | null,
    // healthScore removed — it's computed, not user-controllable
  },

  // --- actions ---

  toggleLiveControls: () =>
    set((s) => ({ liveControlsOpen: !s.liveControlsOpen })),

  setControls: (partial: Partial<PipelineControls>) =>
    set((s) => ({ controls: { ...s.controls, ...partial } })),

  resetControls: () => set({ controls: { ...defaultControls } }),

  setAnalyticsEngineEnabled: (enabled: boolean) =>
    set({ analyticsEngineEnabled: enabled }),

  setSignalOverride: (
    signal: 'confidence' | 'entropy' | 'dissonance',
    value: number | null,
  ) =>
    set((s) => ({
      userSignalOverrides: { ...s.userSignalOverrides, [signal]: value },
    })),

  resetAllSignalOverrides: () =>
    set({
      userSignalOverrides: {
        confidence: null,
        entropy: null,
        dissonance: null,
      },
    }),
});
