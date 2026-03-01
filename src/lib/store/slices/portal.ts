'use client';

import type { PFCSet, PFCGet } from '../use-pfc-store';

// ---------------------------------------------------------------------------
// Portal types (LobeChat-inspired)
// ---------------------------------------------------------------------------

export type PortalViewType = 'artifact' | 'terminal' | 'suggestion' | 'home';

export type ArtifactType = 'code' | 'document' | 'html' | 'react' | 'image' | 'data' | 'text';

export interface PortalArtifact {
  messageId: string;
  identifier: string;
  title: string;
  type: ArtifactType;
  language?: string;
  content: string;
}

export interface PortalViewData {
  type: PortalViewType;
  artifact?: PortalArtifact;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface PortalSliceState {
  portalStack: PortalViewData[];
  showPortal: boolean;
  portalDisplayMode: 'code' | 'preview';
}

// ---------------------------------------------------------------------------
// Actions interface
// ---------------------------------------------------------------------------

export interface PortalSliceActions {
  openArtifact: (artifact: PortalArtifact) => void;
  closePortal: () => void;
  setPortalDisplayMode: (mode: 'code' | 'preview') => void;
  portalGoBack: () => void;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

export const createPortalSlice = (set: PFCSet, get: PFCGet) => ({
  // --- initial state ---
  portalStack: [] as PortalViewData[],
  showPortal: false,
  portalDisplayMode: 'preview' as 'code' | 'preview',

  // --- actions ---

  openArtifact: (artifact: PortalArtifact) =>
    set((s) => {
      const view: PortalViewData = { type: 'artifact', artifact };
      const stack = s.portalStack as PortalViewData[];
      // Smart duplicate prevention: if top is already an artifact, replace
      if (
        stack.length > 0 &&
        stack[stack.length - 1]!.type === 'artifact'
      ) {
        return {
          portalStack: [...stack.slice(0, -1), view],
          showPortal: true,
        };
      }
      return {
        portalStack: [...stack, view],
        showPortal: true,
      };
    }),

  closePortal: () => set({ showPortal: false }),

  setPortalDisplayMode: (mode: 'code' | 'preview') =>
    set({ portalDisplayMode: mode }),

  portalGoBack: () =>
    set((s) => {
      const stack = s.portalStack as PortalViewData[];
      if (stack.length <= 1) {
        return { portalStack: [], showPortal: false };
      }
      return { portalStack: stack.slice(0, -1) };
    }),
});
