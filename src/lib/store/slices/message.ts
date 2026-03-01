'use client';

import type {
  AnalysisMode,
  ChatMessage,
  DualMessage,
  EvidenceGrade,
  FileAttachment,
  TruthAssessment,
  StageResult,
  StageStatus,
} from '@/lib/engine/types';
import type {
  ResearchPaper,
  Citation,
} from '@/lib/research/types';
import { STAGES, STAGE_LABELS } from '@/lib/constants';
import type { PFCSet, PFCGet } from '../use-pfc-store';
import { emit } from '../events';

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

function nextMsgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Auto-extraction: parse AI response text for papers & citations
// ---------------------------------------------------------------------------

/**
 * Regex-based extraction of academic references from raw analysis text.
 * Detects patterns like:
 *   - "Author et al. (2023)" or "Author et al., 2023"
 *   - "Author & Author (2023)"
 *   - DOIs: "10.1234/..."
 *   - Inline citations: "(Author, 2023)"
 * Creates ResearchPaper entries and Citation entries for the library.
 */
function extractAndStoreResearch(text: string, messageId: string, get: PFCGet) {
  const store = get();
  const existingTitles = new Set(store.researchPapers.map((p: ResearchPaper) => p.title.toLowerCase()));
  const papers: ResearchPaper[] = [];
  const citations: Citation[] = [];
  const tags = extractTopicTags(text);

  // --- Pattern 1: "Author et al. (YYYY)" or "Author et al., YYYY" ---
  const etAlRe = /([A-Z][a-z]+(?:\s(?:van|de|von|el|al|bin))?)(?:\s+(?:et\s+al\.?|and\s+colleagues|&\s+[A-Z][a-z]+))[\s,]*\(?(\d{4})\)?/g;
  let m;
  while ((m = etAlRe.exec(text)) !== null) {
    const author = m[1]!.trim();
    const year = parseInt(m[2]!, 10);
    if (year < 1900 || year > 2030) continue;
    const title = `${author} et al. (${year})`;
    if (existingTitles.has(title.toLowerCase())) continue;
    existingTitles.add(title.toLowerCase());
    papers.push({
      id: `auto-${Date.now()}-${papers.length}`,
      title, authors: [author], year, tags,
      savedAt: Date.now(), sourceMessageId: messageId,
      notes: 'Auto-extracted from research analysis',
    });
  }

  // --- Pattern 2: "Author & Author (YYYY)" ---
  const dualRe = /([A-Z][a-z]+)\s+(?:&|and)\s+([A-Z][a-z]+)\s*\((\d{4})\)/g;
  while ((m = dualRe.exec(text)) !== null) {
    const a1 = m[1]!.trim();
    const a2 = m[2]!.trim();
    const year = parseInt(m[3]!, 10);
    if (year < 1900 || year > 2030) continue;
    const title = `${a1} & ${a2} (${year})`;
    if (existingTitles.has(title.toLowerCase())) continue;
    existingTitles.add(title.toLowerCase());
    papers.push({
      id: `auto-${Date.now()}-${papers.length}`,
      title, authors: [a1, a2], year, tags,
      savedAt: Date.now(), sourceMessageId: messageId,
      notes: 'Auto-extracted from research analysis',
    });
  }

  // --- Pattern 3: DOIs -> citations ---
  const doiRe = /\b(10\.\d{4,}\/[^\s,;)]+)/g;
  while ((m = doiRe.exec(text)) !== null) {
    const doi = m[1]!.replace(/[.)]+$/, '');
    if (citations.some((c) => c.doi === doi)) continue;
    const start = Math.max(0, m.index - 120);
    const end = Math.min(text.length, m.index + m[0].length + 40);
    const context = text.slice(start, end).replace(/\n/g, ' ').trim();
    citations.push({
      id: `cite-${Date.now()}-${citations.length}`,
      text: context, source: `DOI: ${doi}`, doi,
      url: `https://doi.org/${doi}`, confidence: 0.9,
    });
  }

  // --- Pattern 4: Inline "(Author, YYYY)" ---
  const inlineRe = /\(([A-Z][a-z]+(?:\s(?:van|de|von|el|al|bin))?),\s*(\d{4})\)/g;
  while ((m = inlineRe.exec(text)) !== null) {
    const author = m[1]!.trim();
    const year = parseInt(m[2]!, 10);
    if (year < 1900 || year > 2030) continue;
    const title = `${author} (${year})`;
    if (existingTitles.has(title.toLowerCase())) continue;
    existingTitles.add(title.toLowerCase());
    papers.push({
      id: `auto-${Date.now()}-${papers.length}`,
      title, authors: [author], year, tags,
      savedAt: Date.now(), sourceMessageId: messageId,
      notes: 'Auto-extracted from research analysis',
    });
  }

  // --- Commit to store (cross-slice: research slice actions) ---
  for (const paper of papers) {
    store.addResearchPaper(paper);
  }
  if (citations.length > 0) {
    const merged = [...store.currentCitations, ...citations];
    store.setCurrentCitations(merged);
  }
}

/** Extract 1-3 rough topic tags from text based on common research domains */
function extractTopicTags(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();
  const domains: [string, string[]][] = [
    ['neuroscience', ['brain', 'neural', 'neuron', 'cortex', 'cognitive', 'fmri', 'eeg']],
    ['psychology', ['psychological', 'behavior', 'cognition', 'perception', 'emotion']],
    ['medicine', ['clinical', 'patient', 'treatment', 'therapy', 'diagnosis', 'medical']],
    ['statistics', ['meta-analysis', 'effect size', 'p-value', 'regression', 'bayesian']],
    ['biology', ['gene', 'protein', 'cell', 'organism', 'evolution', 'biological']],
    ['AI/ML', ['machine learning', 'deep learning', 'transformer', 'neural network', 'llm']],
    ['physics', ['quantum', 'relativity', 'particle', 'entropy', 'thermodynamic']],
    ['economics', ['economic', 'market', 'fiscal', 'monetary', 'gdp', 'inflation']],
    ['sociology', ['social', 'society', 'demographic', 'inequality', 'cultural']],
    ['philosophy', ['epistemolog', 'ontolog', 'phenomenolog', 'ethics', 'philosophical']],
  ];
  for (const [tag, keywords] of domains) {
    if (keywords.some((k) => lower.includes(k))) {
      tags.push(tag);
      if (tags.length >= 3) break;
    }
  }
  return tags.length > 0 ? tags : ['research'];
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

export const createMessageSlice = (set: PFCSet, get: PFCGet) => ({
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

    // ── Auto-extract papers & citations for Research Library ──
    // Runs as a post-processing side-effect; lightweight regex extraction
    try {
      const text = dualMessage.rawAnalysis || '';
      if (text.length > 20) {
        extractAndStoreResearch(text, id, get);
      }
    } catch { /* extraction is best-effort — never block main flow */ }
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
