import type {
  AnalysisMode,
  ChatMessage,
  DualMessage,
  EvidenceGrade,
  FileAttachment,
  TruthAssessment,
} from '@/lib/types';
import type { PFCSet, PFCGet } from '../use-pfc-store';
import { emit } from '../events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextMsgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface MessageSliceState {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  activeMessageLayer: 'raw' | 'layman';
  currentChatId: string | null;
  pendingAttachments: FileAttachment[];

  // Reasoning (AI thinking) state
  reasoningText: string;
  reasoningDuration: number | null;
  isReasoning: boolean;
  isThinkingPaused: boolean;
}

// ---------------------------------------------------------------------------
// Actions interface
// ---------------------------------------------------------------------------

export interface MessageSliceActions {
  setCurrentChat: (chatId: string) => void;
  submitQuery: (query: string) => void;
  completeProcessing: (
    dualMessage: DualMessage,
    confidence: number,
    grade: EvidenceGrade,
    mode: AnalysisMode,
    truthAssessment?: TruthAssessment,
  ) => void;
  toggleMessageLayer: () => void;
  loadMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  appendStreamingText: (text: string) => void;
  startStreaming: () => void;
  stopStreaming: () => void;
  clearStreamingText: () => void;
  addAttachment: (file: FileAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;

  // Reasoning actions
  appendReasoningText: (text: string) => void;
  startReasoning: () => void;
  stopReasoning: () => void;
  clearReasoning: () => void;
  setThinkingPaused: (paused: boolean) => void;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

export const createMessageSlice = (set: PFCSet, _get: PFCGet) => ({
  // --- initial state ---
  messages: [] as ChatMessage[],
  streamingText: '',
  isStreaming: false,
  activeMessageLayer: 'raw' as const,
  currentChatId: null as string | null,
  pendingAttachments: [] as FileAttachment[],

  // Reasoning state
  reasoningText: '',
  reasoningDuration: null as number | null,
  isReasoning: false,
  isThinkingPaused: false,

  // --- actions ---

  setCurrentChat: (chatId: string) => set({ currentChatId: chatId }),

  submitQuery: (query: string) => {
    const id = nextMsgId();
    // Message-slice-owned state only — pipeline/UI state updated via their own actions
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id,
          role: 'user',
          text: query,
          timestamp: Date.now(),
          attachments:
            s.pendingAttachments.length > 0
              ? [...s.pendingAttachments]
              : undefined,
        },
      ],
      pendingAttachments: [],
      streamingText: '',
      isStreaming: false,
      // Reset reasoning for new query
      reasoningText: '',
      reasoningDuration: null,
      isReasoning: false,
    }));
    // Notify pipeline slice via event bus (pipeline handles its own state)
    emit('query:submitted', { query, mode: 'research' });
  },

  completeProcessing: (
    dualMessage: DualMessage,
    confidence: number,
    grade: EvidenceGrade,
    mode: AnalysisMode,
    truthAssessment?: TruthAssessment,
  ) => {
    const id = nextMsgId();
    set((s) => {
      // NOTE: signalHistory is written by the query:completed event handler
      // in use-pfc-store.ts — do NOT write it here to avoid double-write.

      // Record concepts for this query in the hierarchy
      const now = Date.now();
      const queryConcepts = [...s.activeConcepts];
      const MAX_CONCEPT_HISTORY = 100;
      const newConceptWeights = { ...s.conceptWeights };
      for (const concept of queryConcepts) {
        if (newConceptWeights[concept]) {
          newConceptWeights[concept] = {
            ...newConceptWeights[concept],
            lastSeen: now,
            queryCount: newConceptWeights[concept].queryCount + 1,
            autoWeight: Math.min(
              2.0,
              0.5 + (newConceptWeights[concept].queryCount + 1) * 0.15,
            ),
          };
        } else {
          newConceptWeights[concept] = {
            concept,
            weight: 1.0,
            firstSeen: now,
            lastSeen: now,
            queryCount: 1,
            autoWeight: 0.65,
          };
        }
      }
      const conceptEntry = {
        queryId: id,
        timestamp: now,
        concepts: queryConcepts,
      };
      const newConceptHistory = [
        ...s.queryConceptHistory,
        conceptEntry,
      ].slice(-MAX_CONCEPT_HISTORY);

      // Build reasoning attachment for the message (NEW)
      const reasoning =
        s.reasoningText.length > 0
          ? {
              content: s.reasoningText,
              duration: s.reasoningDuration ?? undefined,
            }
          : undefined;

      return {
        // Message-slice-owned state only
        messages: [
          ...s.messages,
          {
            id,
            role: 'system' as const,
            text: dualMessage.rawAnalysis,
            timestamp: Date.now(),
            confidence,
            evidenceGrade: grade,
            mode,
            dualMessage,
            truthAssessment,
            concepts: queryConcepts,
            reasoning,
          },
        ],
        streamingText: '',
        isStreaming: false,
        // Reset reasoning state after completion
        reasoningText: '',
        reasoningDuration: null,
        isReasoning: false,
        // Concepts state (owned by concepts slice, co-located here for atomicity)
        conceptWeights: newConceptWeights,
        queryConceptHistory: newConceptHistory,
      };
    });

    // Notify pipeline/cortex slices via event bus (they handle their own state)
    emit('query:completed', {
      confidence,
      grade,
      mode,
      truthAssessment: truthAssessment ?? null,
    });

  },

  toggleMessageLayer: () =>
    set((s) => ({
      activeMessageLayer: s.activeMessageLayer === 'raw' ? 'layman' : 'raw',
    })),

  loadMessages: (messages: ChatMessage[]) => set({ messages }),

  clearMessages: () => {
    // Message-slice-owned state only
    set({
      messages: [],
      currentChatId: null,
      isStreaming: false,
      streamingText: '',
      reasoningText: '',
      reasoningDuration: null,
      isReasoning: false,
    });
    // Notify pipeline + UI slices via event bus (they handle their own state)
    emit('chat:cleared', {});
  },

  appendStreamingText: (text: string) =>
    set((s) => ({ streamingText: s.streamingText + text })),

  startStreaming: () => set({ isStreaming: true, streamingText: '' }),

  stopStreaming: () => set({ isStreaming: false }),

  clearStreamingText: () => set({ streamingText: '' }),

  addAttachment: (file: FileAttachment) =>
    set((s) => ({
      pendingAttachments: [...s.pendingAttachments, file],
    })),

  removeAttachment: (id: string) =>
    set((s) => ({
      pendingAttachments: s.pendingAttachments.filter(
        (f: FileAttachment) => f.id !== id,
      ),
    })),

  clearAttachments: () => set({ pendingAttachments: [] }),

  // --- NEW: reasoning actions ---

  appendReasoningText: (text: string) =>
    set((s) => ({ reasoningText: s.reasoningText + text })),

  startReasoning: () =>
    set({ isReasoning: true, reasoningText: '', reasoningDuration: null }),

  stopReasoning: () => {
    // If we were reasoning, calculate the duration based on when reasoning started
    // We don't have a start timestamp stored, so stopReasoning just marks it done.
    // The caller can set reasoningDuration explicitly if needed.
    set({ isReasoning: false });
  },

  clearReasoning: () =>
    set({ reasoningText: '', reasoningDuration: null, isReasoning: false }),

  setThinkingPaused: (paused: boolean) => set({ isThinkingPaused: paused }),
});
