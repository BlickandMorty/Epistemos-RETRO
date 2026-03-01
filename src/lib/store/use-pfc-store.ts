'use client';

// ═══════════════════════════════════════════════════════════════════
// PFC Store — Composed from modular slices (LobeChat pattern)
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { onStoreEvent } from './events';
import { STAGES, STAGE_LABELS } from '@/lib/constants';
import type { StageResult, StageStatus, TruthAssessment } from '@/lib/engine/types';

// Slice creators
import { createMessageSlice } from './slices/message';
import { createPipelineSlice } from './slices/pipeline';
import { createInferenceSlice } from './slices/inference';
import { createControlsSlice } from './slices/controls';
import { createCortexSlice } from './slices/cortex';
import { createConceptsSlice } from './slices/concepts';
import { createResearchSlice } from './slices/research';
import { createPortalSlice } from './slices/portal';
import { createUISlice } from './slices/ui';
import { createNotesSlice } from './slices/notes';
import { createLearningSlice } from './slices/learning';
import { createSOARSlice } from './slices/soar';
import { createToastSlice } from './slices/toast';

// Slice types — local imports for composition
import type { MessageSliceState, MessageSliceActions } from './slices/message';
import type { PipelineSliceState, PipelineSliceActions } from './slices/pipeline';
import type { InferenceSliceState, InferenceSliceActions } from './slices/inference';
import type { ControlsSliceState, ControlsSliceActions } from './slices/controls';

import type { CortexSliceState, CortexSliceActions } from './slices/cortex';
import type { ConceptsSliceState, ConceptsSliceActions } from './slices/concepts';
import type { ResearchSliceState, ResearchSliceActions } from './slices/research';
import type { PortalSliceState, PortalSliceActions } from './slices/portal';
import type { UISliceState, UISliceActions } from './slices/ui';
import type { NotesSliceState, NotesSliceActions } from './slices/notes';
import type { LearningSliceState, LearningSliceActions } from './slices/learning';
import type { SOARSliceState, SOARSliceActions } from './slices/soar';
import type { ToastSliceState, ToastSliceActions } from './slices/toast';

// Re-export selected slice types used outside the store
export type { SignalHistoryEntry } from './slices/pipeline';
export type { CortexSnapshot } from './slices/cortex';
export type { ConceptWeight } from './slices/concepts';
export type { MiniChatTab } from './slices/ui';

// ═══════════════════════════════════════════════════════════════════
// Slice creator helpers — typed set/get for all slices
// ═══════════════════════════════════════════════════════════════════

export type PFCSet = (partial: Partial<PFCState> | ((state: PFCState) => Partial<PFCState>)) => void;
export type PFCGet = () => PFCState;

// ═══════════════════════════════════════════════════════════════════
// Aggregate store type
// ═══════════════════════════════════════════════════════════════════

export type PFCStoreState =
  & MessageSliceState
  & PipelineSliceState
  & InferenceSliceState
  & ControlsSliceState
  & CortexSliceState
  & ConceptsSliceState
  & ResearchSliceState
  & PortalSliceState
  & UISliceState
  & NotesSliceState
  & LearningSliceState
  & SOARSliceState
  & ToastSliceState;

export type PFCStoreActions =
  & MessageSliceActions
  & PipelineSliceActions
  & InferenceSliceActions
  & ControlsSliceActions
  & CortexSliceActions
  & ConceptsSliceActions
  & ResearchSliceActions
  & PortalSliceActions
  & UISliceActions
  & NotesSliceActions
  & LearningSliceActions
  & SOARSliceActions
  & ToastSliceActions
  & { reset: () => void };

export type PFCState = PFCStoreState & PFCStoreActions;

// ═══════════════════════════════════════════════════════════════════
// Create composed store with subscribeWithSelector middleware
// ═══════════════════════════════════════════════════════════════════

export const usePFCStore = create<PFCState>()(
  subscribeWithSelector((set, get, _api) => ({
    // Compose all slices
    ...createMessageSlice(set, get),
    ...createPipelineSlice(set, get),
    ...createInferenceSlice(set, get),
    ...createControlsSlice(set, get),
    ...createCortexSlice(set, get),
    ...createConceptsSlice(set, get),
    ...createResearchSlice(set, get),
    ...createPortalSlice(set, get),
    ...createUISlice(set, get),
    ...createNotesSlice(set, get),
    ...createLearningSlice(set, get),
    ...createSOARSlice(set, get),
    ...createToastSlice(set, get),

    // Global reset — preserves tier settings, cortex, and codebase analyses
    reset: () => {
      // Get fresh defaults from each slice
      const freshMsg = createMessageSlice(set, get);
      const freshPipeline = createPipelineSlice(set, get);
      const freshControls = createControlsSlice(set, get);
      const freshPortal = createPortalSlice(set, get);
      const freshUI = createUISlice(set, get);

      set({
        // Reset message state
        messages: freshMsg.messages,
        streamingText: freshMsg.streamingText,
        isStreaming: freshMsg.isStreaming,
        currentChatId: freshMsg.currentChatId,
        pendingAttachments: freshMsg.pendingAttachments,
        reasoningText: freshMsg.reasoningText,
        reasoningDuration: freshMsg.reasoningDuration,
        isReasoning: freshMsg.isReasoning,
        isThinkingPaused: freshMsg.isThinkingPaused,
        activeMessageLayer: freshMsg.activeMessageLayer,

        // Reset pipeline state
        pipelineStages: freshPipeline.pipelineStages,
        activeStage: freshPipeline.activeStage,
        isProcessing: freshPipeline.isProcessing,
        confidence: freshPipeline.confidence,
        entropy: freshPipeline.entropy,
        dissonance: freshPipeline.dissonance,
        healthScore: freshPipeline.healthScore,
        safetyState: freshPipeline.safetyState,
        riskScore: freshPipeline.riskScore,
        tda: freshPipeline.tda,
        focusDepth: freshPipeline.focusDepth,
        temperatureScale: freshPipeline.temperatureScale,
        activeConcepts: freshPipeline.activeConcepts,
        activeChordProduct: freshPipeline.activeChordProduct,
        harmonyKeyDistance: freshPipeline.harmonyKeyDistance,
        queriesProcessed: freshPipeline.queriesProcessed,
        totalTraces: freshPipeline.totalTraces,
        skillGapsDetected: freshPipeline.skillGapsDetected,
        signalHistory: [],

        // Reset controls
        controls: freshControls.controls,
        userSignalOverrides: freshControls.userSignalOverrides,

        // Reset research
        researchPapers: [],
        currentCitations: [],
        pendingReroute: null,

        // Reset portal
        portalStack: freshPortal.portalStack,
        showPortal: freshPortal.showPortal,

        // Reset UI
        chatMinimized: false,
        miniChatOpen: false,
        miniChatTab: freshUI.miniChatTab,
        chatThreads: freshUI.chatThreads,
        activeThreadId: freshUI.activeThreadId,
        toolsDrawerOpen: false,
        threadStreamingText: {},
        threadIsStreaming: {},

        // Preserve cortex
        // (cortexArchive stays)
        // (conceptWeights reset)
        conceptWeights: {},
        queryConceptHistory: [],

        // Reset learning (preserve history)
        learningSession: null,
        learningStreamText: '',

        // Reset SOAR (preserve config)
        soarSession: null,
      });
    },
  })),
);

// ═══════════════════════════════════════════════════════════════════
// Event bus subscriptions — slices handle their own state mutations
// ═══════════════════════════════════════════════════════════════════

function freshPipeline(): StageResult[] {
  return STAGES.map((s) => ({
    stage: s,
    status: 'idle' as StageStatus,
    summary: STAGE_LABELS[s],
  }));
}

// Pipeline slice reacts to query lifecycle events
onStoreEvent('query:submitted', () => {
  usePFCStore.setState({
    isProcessing: true,
    pipelineStages: freshPipeline(),
    activeStage: 'triage' as const,
  });
});

onStoreEvent('query:completed', ({ confidence, truthAssessment }) => {
  const s = usePFCStore.getState();
  const MAX_SIGNAL_HISTORY = 50;
  const historyEntry = {
    timestamp: Date.now(),
    confidence,
    entropy: s.entropy,
    dissonance: s.dissonance,
    healthScore: s.healthScore,
    riskScore: s.riskScore,
  };

  usePFCStore.setState({
    isProcessing: false,
    activeStage: null,
    confidence,
    queriesProcessed: s.queriesProcessed + 1,
    totalTraces: s.totalTraces + 1,
    latestTruthAssessment: (truthAssessment as TruthAssessment) ?? null,
    signalHistory: [...s.signalHistory, historyEntry].slice(-MAX_SIGNAL_HISTORY),
    pipelineStages: s.pipelineStages.map((sr: StageResult) => ({
      ...sr,
      status: 'complete' as StageStatus,
    })),
  });
});

// UI + Pipeline slices react to chat clear
onStoreEvent('chat:cleared', () => {
  usePFCStore.setState({
    // Pipeline state reset
    isProcessing: false,
    pipelineStages: freshPipeline(),
    activeStage: null,
    // UI state reset
    chatMinimized: false,
  });
});
