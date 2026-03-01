'use client';

import type { PFCSet, PFCGet } from '../use-pfc-store';

// ---------------------------------------------------------------------------
// Concept types
// ---------------------------------------------------------------------------

export interface ConceptWeight {
  concept: string;
  weight: number; // 0.0 to 2.0, default 1.0 — user-adjustable importance
  firstSeen: number; // timestamp of first extraction
  lastSeen: number; // timestamp of most recent extraction
  queryCount: number; // how many queries this concept appeared in
  autoWeight: number; // engine-calculated weight (frequency-based)
}

export interface QueryConceptEntry {
  queryId: string;
  timestamp: number;
  concepts: string[];
}

const MAX_CONCEPT_HISTORY = 100;

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface ConceptsSliceState {
  conceptWeights: Record<string, ConceptWeight>;
  queryConceptHistory: QueryConceptEntry[];
  conceptHierarchyOpen: boolean;
}

// ---------------------------------------------------------------------------
// Actions interface
// ---------------------------------------------------------------------------

export interface ConceptsSliceActions {
  setConceptWeight: (concept: string, weight: number) => void;
  resetConceptWeight: (concept: string) => void;
  resetAllConceptWeights: () => void;
  toggleConceptHierarchy: () => void;
  getEffectiveConceptWeights: () => Record<string, number>;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

export const createConceptsSlice = (set: PFCSet, get: PFCGet) => ({
  // --- initial state ---
  conceptWeights: {} as Record<string, ConceptWeight>,
  queryConceptHistory: [] as QueryConceptEntry[],
  conceptHierarchyOpen: false,

  // --- actions ---

  setConceptWeight: (concept: string, weight: number) =>
    set((s) => {
      const existing = s.conceptWeights[concept];
      if (!existing) return {};
      return {
        conceptWeights: {
          ...s.conceptWeights,
          [concept]: {
            ...existing,
            weight: Math.max(0, Math.min(2.0, weight)),
          },
        },
      };
    }),

  resetConceptWeight: (concept: string) =>
    set((s) => {
      const existing = s.conceptWeights[concept];
      if (!existing) return {};
      return {
        conceptWeights: {
          ...s.conceptWeights,
          [concept]: { ...existing, weight: 1.0 },
        },
      };
    }),

  resetAllConceptWeights: () =>
    set((s) => {
      const reset: Record<string, ConceptWeight> = {};
      for (const [key, cw] of Object.entries(s.conceptWeights)) {
        reset[key] = { ...(cw as ConceptWeight), weight: 1.0 };
      }
      return { conceptWeights: reset };
    }),

  toggleConceptHierarchy: () =>
    set((s) => ({ conceptHierarchyOpen: !s.conceptHierarchyOpen })),

  getEffectiveConceptWeights: (): Record<string, number> => {
    const state = get();
    const result: Record<string, number> = {};
    for (const [key, cw] of Object.entries(state.conceptWeights)) {
      const typed = cw as ConceptWeight;
      result[key] = typed.weight * typed.autoWeight;
    }
    return result;
  },
});
