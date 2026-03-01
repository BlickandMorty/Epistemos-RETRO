'use client';

import { logger } from '@/lib/debug-logger';
import type {
  LearningSession,
  LearningSessionStatus,
  LearningStep,
} from '@/lib/notes/learning-protocol';
import { createLearningSession } from '@/lib/notes/learning-protocol';
import { readVersioned, writeVersioned, readString, writeString } from '@/lib/storage-versioning';
import type { PFCSet, PFCGet } from '../use-pfc-store';
import type { NotePage, NoteBlock } from '@/lib/notes/types';
import {
  startScheduler,
  stopScheduler,
  loadSchedulerConfig,
  saveSchedulerConfig,
  type SchedulerConfig,
} from '@/lib/notes/learning-scheduler';

// ── localStorage keys ──
const STORAGE_KEY_HISTORY = 'pfc-learning-history';
const LEARNING_HISTORY_VERSION = 1;
const STORAGE_KEY_AUTORUN = 'pfc-learning-autorun';

// ── Module-scope abort controller (not in Zustand state) ──
let _learningAbortController: AbortController | null = null;

// ── Module-scope maps for tracking page/block refs during SSE session ──
let _pageRefMap: Map<string, string> = new Map(); // clientPageRef → real pageId
let _blockTrackers: Map<string, string> = new Map(); // `${ref}:${index}` → blockId
let _seedBlockByPageRef: Map<string, string> = new Map(); // clientPageRef → initial empty block

function resetLearningRuntimeState() {
  _pageRefMap = new Map();
  _blockTrackers = new Map();
  _seedBlockByPageRef = new Map();
}

function isExpectedLearningInterruption(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const asObject = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const message = [
    error instanceof Error ? error.message : '',
    error instanceof Error ? error.stack ?? '' : '',
    typeof asObject?.message === 'string' ? asObject.message : '',
    typeof asObject?.cause === 'string' ? asObject.cause : '',
    typeof (asObject?.cause as Record<string, unknown> | undefined)?.message === 'string'
      ? ((asObject?.cause as Record<string, unknown>).message as string)
      : '',
    String(error),
  ]
    .join(' ')
    .toLowerCase();
  const name = error instanceof Error ? error.name : typeof asObject?.name === 'string' ? asObject.name : '';
  return (
    name === 'AbortError' ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('the user aborted a request') ||
    message.includes('load failed')
  );
}

// ── History entry ──
export interface LearningHistoryEntry {
  id: string;
  startedAt: number;
  completedAt: number;
  totalInsights: number;
  totalPagesCreated: number;
  totalBlocksCreated: number;
  iteration: number;
}

// ── State interface ──
export interface LearningSliceState {
  learningSession: LearningSession | null;
  learningHistory: LearningHistoryEntry[];
  learningStreamText: string;
  learningAutoRun: boolean;
  schedulerConfig: SchedulerConfig;
  schedulerActive: boolean;
  lastAutoRunAt: number | null;
}

// ── Actions interface ──
export interface LearningSliceActions {
  startLearningSession: (
    depth: LearningSession['depth'],
    maxIterations: number,
    targetPageIds?: string[],
  ) => void;
  pauseLearningSession: () => void;
  resumeLearningSession: () => void;
  stopLearningSession: () => void;
  updateLearningStep: (stepIndex: number, updates: Partial<LearningStep>) => void;
  advanceLearningStep: () => void;
  appendLearningStreamText: (text: string) => void;
  clearLearningStreamText: () => void;
  setLearningAutoRun: (enabled: boolean) => void;
  completeLearningSession: () => void;
  updateSchedulerConfig: (updates: Partial<SchedulerConfig>) => void;
  initScheduler: () => void;
  startDailyBriefSession: () => void;
  hydrateLearning: () => void;
}

// ── SSE event types emitted by /api/notes/learn ──
type LearningSSEEvent =
  | { type: 'step-start'; stepIndex: number; stepType: string }
  | { type: 'step-progress'; stepIndex: number; progress: number; detail?: string }
  | { type: 'step-complete'; stepIndex: number; insights: string[]; pagesCreated: string[]; blocksCreated: string[] }
  | { type: 'insight'; text: string }
  | { type: 'page-created'; pageTitle: string; clientPageRef: string }
  | { type: 'block-created'; content: string; clientPageRef: string; blockIndex: number }
  | { type: 'stream-text'; text: string }
  | { type: 'iterate-result'; shouldContinue: boolean; reason: string; focusAreas: string[]; confidenceScore: number }
  | { type: 'iteration-start'; iteration: number }
  | { type: 'session-complete'; totalInsights: number; totalPagesCreated: number; totalBlocksCreated?: number }
  | { type: 'error'; message: string };

// ── Helper: load history from localStorage (versioned) ──
function loadHistory(): LearningHistoryEntry[] {
  return readVersioned<LearningHistoryEntry[]>(STORAGE_KEY_HISTORY, LEARNING_HISTORY_VERSION) ?? [];
}

function saveHistory(history: LearningHistoryEntry[]) {
  writeVersioned(STORAGE_KEY_HISTORY, LEARNING_HISTORY_VERSION, history);
}

function loadAutoRun(): boolean {
  return readString(STORAGE_KEY_AUTORUN) === 'true';
}

// ── Helper: create summary note after learning completes ──
function createLearningSummaryNote(set: PFCSet, get: PFCGet, session: LearningSession) {
  const state = get();
  const notePages = state.notePages ?? [];

  // Collect all page IDs created across all steps
  const createdPageIds = new Set<string>();
  const allInsights: string[] = [];
  for (const step of session.steps) {
    for (const pid of step.pagesCreated) createdPageIds.add(pid);
    for (const insight of step.insights) allInsights.push(insight);
  }

  if (createdPageIds.size === 0 && allInsights.length === 0) return;

  // Build page title lookup
  const createdPages = notePages.filter((p: NotePage) => createdPageIds.has(p.id));
  const duration = session.completedAt
    ? Math.round((session.completedAt - session.startedAt) / 1000)
    : 0;
  const durationStr = duration > 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`;
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const title = `Deep Self-Learning Analysis — ${dateStr}`;

  // Preserve user context
  const prevActivePageId = state.activePageId;
  const prevEditingBlockId = state.editingBlockId;

  const pageId = state.createPage(title);

  // Find the initial empty block
  const blocks = get().noteBlocks as NoteBlock[];
  const firstBlock = blocks.find((b: NoteBlock) => b.pageId === pageId);

  // Build header content
  const headerContent = [
    `<strong>Self-Learning Analysis Complete</strong>`,
    `Depth: <strong>${session.depth}</strong> | Iterations: <strong>${session.iteration}</strong> | Duration: <strong>${durationStr}</strong>`,
    `Pages generated: <strong>${createdPageIds.size}</strong> | Insights: <strong>${allInsights.length}</strong> | Blocks: <strong>${session.totalBlocksCreated}</strong>`,
  ].join('<br>');

  if (firstBlock) {
    state.updateBlockContent(firstBlock.id, headerContent);
  }

  // Add insights section
  if (allInsights.length > 0) {
    state.createBlock(pageId, null, null, 'Key Insights', 'heading');
    for (const insight of allInsights.slice(0, 20)) {
      state.createBlock(pageId, null, null, insight, 'paragraph');
    }
  }

  // Add links to generated notes
  if (createdPages.length > 0) {
    state.createBlock(pageId, null, null, 'Generated Notes', 'heading');
    for (const page of createdPages) {
      state.createBlock(pageId, null, null, `[[${page.title}]]`, 'paragraph');
    }
  }

  // Tag summary page via notes slice action (respects slice ownership)
  state.tagPageProperties(pageId, { autoGenerated: 'true', learningSummary: 'true', learningSessionId: session.id });

  // Restore user context
  if (prevActivePageId !== null) {
    state.setActivePage(prevActivePageId);
  }
  if (prevEditingBlockId) {
    set({ editingBlockId: prevEditingBlockId });
  }

  // Rebuild page links for the new [[links]]
  state.rebuildPageLinks();
  state.saveNotesToStorage();
}

// ── Generation counter: prevents stale SSE connections from mutating state ──
let _learningGeneration = 0;

// ── Helper: connect to SSE endpoint ──
function connectLearningSSE(set: PFCSet, get: PFCGet, sessionType: 'full-protocol' | 'daily-brief' = 'full-protocol') {
  const state = get();
  const session: LearningSession | null = state.learningSession;
  if (!session) return;

  // Abort any existing connection
  if (_learningAbortController) {
    _learningAbortController.abort();
  }

  const myGen = ++_learningGeneration;
  const controller = new AbortController();
  _learningAbortController = controller;

  // Reset ref tracking maps for new connection
  resetLearningRuntimeState();

  // Gather note data from the notes slice
  const notePages = state.notePages ?? [];
  const noteBlocks = state.noteBlocks ?? [];

  // Gather inference config from the inference slice
  const inferenceConfig = state.getInferenceConfig
    ? state.getInferenceConfig()
    : {
        mode: state.inferenceMode ?? 'api',
        apiProvider: state.apiProvider ?? 'openai',
        apiKey: state.apiKey ?? '',
        openaiModel: state.openaiModel ?? 'gpt-4o',
        anthropicModel: state.anthropicModel ?? 'claude-sonnet-4-20250514',
        ollamaBaseUrl: state.ollamaBaseUrl ?? 'http://localhost:11434',
        ollamaModel: state.ollamaModel ?? 'llama3.1',
      };

  // Build recent activity for daily brief
  let recentActivity: string | undefined;
  if (sessionType === 'daily-brief') {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentPages = notePages.filter((p: NotePage) => p.updatedAt > cutoff);
    recentActivity = recentPages.map((p: NotePage) => `- ${p.title} (updated ${new Date(p.updatedAt).toLocaleDateString()})`).join('\n');
  }

  // Fire the SSE fetch
  (async () => {
    try {
      const response = await fetch('/api/notes/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: { pages: notePages, blocks: noteBlocks },
          session,
          inferenceConfig,
          sessionType,
          recentActivity,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (myGen !== _learningGeneration) break; // stale connection
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          if (data === '[DONE]') {
            // Session completion is handled via explicit `session-complete` events.
            // Avoid double-finalization and duplicate history entries.
            continue;
          }

          try {
            const event = JSON.parse(data) as LearningSSEEvent;

            switch (event.type) {
              case 'step-start': {
                get().updateLearningStep(event.stepIndex, {
                  status: 'running',
                  startedAt: Date.now(),
                });
                get().clearLearningStreamText();
                break;
              }

              case 'step-progress': {
                if (event.detail) {
                  get().updateLearningStep(event.stepIndex, {
                    output: event.detail,
                  });
                }
                break;
              }

              case 'step-complete': {
                const currentSession = get().learningSession as LearningSession | null;
                const existingStep = currentSession?.steps[event.stepIndex];
                const mergedPagesCreated =
                  existingStep && existingStep.pagesCreated.length > 0
                    ? existingStep.pagesCreated
                    : event.pagesCreated;
                const mergedBlocksCreated =
                  existingStep && existingStep.blocksCreated.length > 0
                    ? existingStep.blocksCreated
                    : event.blocksCreated;

                get().updateLearningStep(event.stepIndex, {
                  status: 'completed',
                  completedAt: Date.now(),
                  insights: event.insights,
                  pagesCreated: mergedPagesCreated,
                  blocksCreated: mergedBlocksCreated,
                });

                // Update session totals
                set((s) => {
                  if (!s.learningSession) return {};
                  const pageDelta = Math.max(
                    event.pagesCreated.length,
                    existingStep?.pagesCreated.length ?? 0,
                  );
                  const blockDelta = Math.max(
                    event.blocksCreated.length,
                    existingStep?.blocksCreated.length ?? 0,
                  );
                  return {
                    learningSession: {
                      ...s.learningSession,
                      totalInsights: s.learningSession.totalInsights + event.insights.length,
                      totalPagesCreated: s.learningSession.totalPagesCreated + pageDelta,
                      totalBlocksCreated: s.learningSession.totalBlocksCreated + blockDelta,
                    },
                  };
                });

                // Remove streaming flag from any blocks via notes slice action
                for (const [key, blockId] of _blockTrackers) {
                  const currentBlocks = get().noteBlocks as NoteBlock[];
                  const block = currentBlocks.find((b: NoteBlock) => b.id === blockId);
                  if (block?.properties?.streaming === 'true') {
                    get().removeBlockProperty(blockId, 'streaming');
                  }
                }

                get().advanceLearningStep();
                break;
              }

              case 'insight': {
                const currentSession = get().learningSession as LearningSession | null;
                if (currentSession) {
                  const idx = currentSession.currentStepIndex;
                  const step = currentSession.steps[idx];
                  if (step) {
                    get().updateLearningStep(idx, {
                      insights: [...step.insights, event.text],
                    });
                  }
                }
                break;
              }

              // ═══ PHASE 1: Actually create notes from learning events ═══
              case 'page-created': {
                // Preserve user context while background generation creates pages.
                const previousActivePageId = get().activePageId;
                const previousEditingBlockId = get().editingBlockId;

                // Create the actual page in the notes system
                const realPageId = get().createPage(event.pageTitle);
                const seedBlockId = get().noteBlocks.find((b: NoteBlock) => b.pageId === realPageId)?.id;
                if (seedBlockId) {
                  _seedBlockByPageRef.set(event.clientPageRef, seedBlockId);
                }

                // Restore active page/editing state so generation is non-disruptive.
                if (previousActivePageId !== null && previousActivePageId !== get().activePageId) {
                  get().setActivePage(previousActivePageId);
                }
                if (previousEditingBlockId !== get().editingBlockId) {
                  set({ editingBlockId: previousEditingBlockId });
                }

                // Store the mapping for subsequent block-created events
                _pageRefMap.set(event.clientPageRef, realPageId);

                // Tag page + seed block via notes slice actions (respects slice ownership)
                get().tagPageProperties(realPageId, { autoGenerated: 'true', learningSessionId: session.id });
                if (seedBlockId) {
                  get().tagBlockProperties(seedBlockId, { autoGenerated: 'true' });
                }

                // Update step tracking
                const cs = get().learningSession as LearningSession | null;
                if (cs) {
                  const idx = cs.currentStepIndex;
                  const step = cs.steps[idx];
                  if (step) {
                    get().updateLearningStep(idx, {
                      pagesCreated: [...step.pagesCreated, realPageId],
                    });
                  }
                }
                break;
              }

              case 'block-created': {
                const realPageId = _pageRefMap.get(event.clientPageRef);
                if (realPageId) {
                  const previousEditingBlockId = get().editingBlockId;
                  const seedBlockId = _seedBlockByPageRef.get(event.clientPageRef);
                  let blockId: string;

                  if (seedBlockId && event.blockIndex === 0) {
                    // Reuse the page's initial empty block for first generated content
                    // to avoid leaving a blank block at the top of auto-generated pages.
                    get().updateBlockContent(seedBlockId, event.content);
                    blockId = seedBlockId;
                    _seedBlockByPageRef.delete(event.clientPageRef);
                  } else {
                    // Create subsequent generated blocks
                    blockId = get().createBlock(realPageId, null, null, event.content, 'paragraph');
                  }

                  // Restore editing focus to the user-selected block (if any)
                  if (previousEditingBlockId !== get().editingBlockId) {
                    set({ editingBlockId: previousEditingBlockId });
                  }

                  // Tag block via notes slice action (respects slice ownership + undo/redo)
                  get().tagBlockProperties(blockId, { autoGenerated: 'true' });

                  // Track the block for potential streaming
                  const key = `${event.clientPageRef}:${event.blockIndex}`;
                  _blockTrackers.set(key, blockId);

                  // Update step tracking
                  const bs = get().learningSession as LearningSession | null;
                  if (bs) {
                    const idx = bs.currentStepIndex;
                    const step = bs.steps[idx];
                    if (step) {
                      get().updateLearningStep(idx, {
                        blocksCreated: [...step.blocksCreated, blockId],
                      });
                    }
                  }
                }
                break;
              }

              case 'stream-text': {
                get().appendLearningStreamText(event.text);
                break;
              }

              // ═══ PHASE 2: Recursive iteration events ═══
              case 'iteration-start': {
                // Reset steps for the new iteration pass
                set((s) => {
                  if (!s.learningSession) return {};
                  return {
                    learningSession: {
                      ...s.learningSession,
                      iteration: event.iteration,
                      currentStepIndex: 0,
                      steps: s.learningSession.steps.map((step: LearningStep) => ({
                        ...step,
                        status: 'pending' as const,
                        startedAt: undefined,
                        completedAt: undefined,
                        insights: [],
                        pagesCreated: [],
                        blocksCreated: [],
                        output: undefined,
                        error: undefined,
                      })),
                    },
                  };
                });
                get().clearLearningStreamText();
                break;
              }

              case 'iterate-result': {
                // Store the iterate decision for UI display
                set((s) => {
                  if (!s.learningSession) return {};
                  return {
                    learningSession: {
                      ...s.learningSession,
                      lastIterateDecision: {
                        shouldContinue: event.shouldContinue,
                        reason: event.reason,
                        focusAreas: event.focusAreas,
                      },
                    },
                  };
                });
                break;
              }

              case 'session-complete': {
                const currentSession = get().learningSession as LearningSession | null;
                if (!currentSession || currentSession.status === 'completed') {
                  break;
                }
                set((s) => {
                  if (!s.learningSession) return {};
                  return {
                    learningSession: {
                      ...s.learningSession,
                      totalInsights: event.totalInsights,
                      totalPagesCreated: event.totalPagesCreated,
                      totalBlocksCreated: event.totalBlocksCreated ?? s.learningSession.totalBlocksCreated,
                    },
                  };
                });
                get().completeLearningSession();
                break;
              }

              case 'error': {
                if (typeof event.message === 'string' && event.message.includes('Local model produced no output')) {
                  logger.warn('learning', 'SSE warning:', event.message);
                } else {
                  logger.error('learning', 'SSE error:', event.message);
                }
                const errSession = get().learningSession as LearningSession | null;
                if (errSession) {
                  get().updateLearningStep(errSession.currentStepIndex, {
                    status: 'error',
                    error: event.message,
                  });
                }
                set((s) => {
                  if (!s.learningSession) return {};
                  return {
                    learningSession: {
                      ...s.learningSession,
                      status: 'error' as LearningSessionStatus,
                    },
                  };
                });
                break;
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (error) {
      if (!isExpectedLearningInterruption(error)) {
        logger.error('learning', 'Stream error:', error);
        set((s) => {
          if (!s.learningSession) return {};
          return {
            learningSession: {
              ...s.learningSession,
              status: 'error' as LearningSessionStatus,
            },
          };
        });
      }
    } finally {
      _learningAbortController = null;
      resetLearningRuntimeState();
      // Persist notes after learning session ends
      try {
        get().saveNotesToStorage();
      } catch {
        // May fail if notes slice isn't ready
      }
    }
  })();
}

// ── Slice creator ──
export const createLearningSlice = (set: PFCSet, get: PFCGet) => ({
  // ── Initial state (hydrated from localStorage in hydrateLearning) ──
  learningSession: null as LearningSession | null,
  learningHistory: [] as LearningHistoryEntry[],
  learningStreamText: '',
  learningAutoRun: false,
  schedulerConfig: { enabled: false, intervalMinutes: 60, maxIterations: 3, depth: 'moderate' as const, enableDailyBrief: false, dailyBriefHour: 9 },
  schedulerActive: false,
  lastAutoRunAt: null as number | null,

  // ── Actions ──

  startLearningSession: (
    depth: LearningSession['depth'],
    maxIterations: number,
    targetPageIds?: string[],
  ) => {
    // Create a fresh session
    const session = createLearningSession(depth, maxIterations, targetPageIds);
    session.status = 'running';

    set({
      learningSession: session,
      learningStreamText: '',
      lastAutoRunAt: Date.now(),
    });

    // Connect to SSE endpoint
    connectLearningSSE(set, get, 'full-protocol');
  },

  pauseLearningSession: () => {
    if (_learningAbortController) {
      _learningAbortController.abort();
      _learningAbortController = null;
    }

    set((s) => {
      if (!s.learningSession) return {};
      return {
        learningSession: {
          ...s.learningSession,
          status: 'paused' as LearningSessionStatus,
        },
      };
    });
  },

  resumeLearningSession: () => {
    set((s) => {
      if (!s.learningSession) return {};
      return {
        learningSession: {
          ...s.learningSession,
          status: 'running' as LearningSessionStatus,
        },
      };
    });

    connectLearningSSE(set, get);
  },

  stopLearningSession: () => {
    if (_learningAbortController) {
      _learningAbortController.abort();
      _learningAbortController = null;
    }
    resetLearningRuntimeState();

    const session = get().learningSession as LearningSession | null;
    if (session) {
      const existingHistory = get().learningHistory;
      const alreadyRecorded = existingHistory.some((h) => h.id === session.id);
      const entry: LearningHistoryEntry = {
        id: session.id,
        startedAt: session.startedAt,
        completedAt: Date.now(),
        totalInsights: session.totalInsights,
        totalPagesCreated: session.totalPagesCreated,
        totalBlocksCreated: session.totalBlocksCreated,
        iteration: session.iteration,
      };
      const history = alreadyRecorded ? existingHistory : [...existingHistory, entry];
      if (!alreadyRecorded) {
        saveHistory(history);
      }

      set({
        learningSession: null,
        learningHistory: history,
        learningStreamText: '',
      });
    } else {
      set({
        learningSession: null,
        learningStreamText: '',
      });
    }
  },

  updateLearningStep: (stepIndex: number, updates: Partial<LearningStep>) => {
    set((s) => {
      if (!s.learningSession) return {};
      const steps = [...s.learningSession.steps];
      if (stepIndex < 0 || stepIndex >= steps.length) return {};
      steps[stepIndex] = { ...steps[stepIndex]!, ...updates };
      return {
        learningSession: {
          ...s.learningSession,
          steps,
        },
      };
    });
  },

  advanceLearningStep: () => {
    set((s) => {
      if (!s.learningSession) return {};
      const nextIndex = s.learningSession.currentStepIndex + 1;
      if (nextIndex >= s.learningSession.steps.length) return {};
      return {
        learningSession: {
          ...s.learningSession,
          currentStepIndex: nextIndex,
        },
      };
    });
  },

  appendLearningStreamText: (text: string) => {
    set((s) => ({
      learningStreamText: s.learningStreamText + text,
    }));
  },

  clearLearningStreamText: () => {
    set({ learningStreamText: '' });
  },

  setLearningAutoRun: (enabled: boolean) => {
    set({ learningAutoRun: enabled });
    writeString(STORAGE_KEY_AUTORUN, String(enabled));

    // Also update scheduler config
    const config = get().schedulerConfig;
    const updated = { ...config, enabled };
    saveSchedulerConfig(updated);
    set({ schedulerConfig: updated });

    // Start/stop scheduler
    if (enabled) {
      startScheduler(() => get());
      set({ schedulerActive: true });
    } else {
      stopScheduler();
      set({ schedulerActive: false });
    }
  },

  completeLearningSession: () => {
    if (_learningAbortController) {
      _learningAbortController.abort();
      _learningAbortController = null;
    }
    resetLearningRuntimeState();

    const session = get().learningSession as LearningSession | null;
    if (!session) return;
    if (session.status === 'completed') return;

    // Mark remaining pending steps as skipped
    const steps = session.steps.map((step: LearningStep) =>
      step.status === 'pending' ? { ...step, status: 'skipped' as const } : step,
    );

    const completedSession: LearningSession = {
      ...session,
      steps,
      status: 'completed',
      completedAt: Date.now(),
    };

    const entry: LearningHistoryEntry = {
      id: completedSession.id,
      startedAt: completedSession.startedAt,
      completedAt: completedSession.completedAt!,
      totalInsights: completedSession.totalInsights,
      totalPagesCreated: completedSession.totalPagesCreated,
      totalBlocksCreated: completedSession.totalBlocksCreated,
      iteration: completedSession.iteration,
    };
    const history = [...get().learningHistory, entry];
    saveHistory(history);

    set({
      learningSession: completedSession,
      learningHistory: history,
    });

    // Persist notes that were created during the session
    try {
      get().saveNotesToStorage();
    } catch {
      // Notes slice may not have saveNotesToStorage available yet
    }

    // ═══ Auto-create "Deep Self-Learning Analysis" summary note ═══
    try {
      createLearningSummaryNote(set, get, completedSession);
    } catch {
      // Non-critical — don't break completion if summary fails
    }
  },

  // ═══ PHASE 3: Scheduler integration ═══
  updateSchedulerConfig: (updates: Partial<SchedulerConfig>) => {
    const current = get().schedulerConfig;
    const updated = { ...current, ...updates };
    saveSchedulerConfig(updated);
    set({ schedulerConfig: updated });

    // Restart scheduler with new config
    if (updated.enabled) {
      stopScheduler();
      startScheduler(() => get());
      set({ schedulerActive: true });
    } else {
      stopScheduler();
      set({ schedulerActive: false });
    }
  },

  initScheduler: () => {
    const config = loadSchedulerConfig();
    set({ schedulerConfig: config });

    if (config.enabled) {
      startScheduler(() => get());
      set({ schedulerActive: true });
    }
  },

  // ═══ PHASE 4: Daily brief ═══
  startDailyBriefSession: () => {
    const session = createLearningSession('shallow', 1);
    session.steps = [{
      id: `step-${Date.now()}-daily`,
      type: 'synthesis',
      status: 'pending',
      title: 'Daily Brief',
      description: 'Generate a daily summary from your latest notes activity',
      insights: [],
      pagesCreated: [],
      blocksCreated: [],
    }];
    session.currentStepIndex = 0;
    session.iteration = 1;
    session.maxIterations = 1;
    session.status = 'running';

    set({
      learningSession: session,
      learningStreamText: '',
    });

    connectLearningSSE(set, get, 'daily-brief');
  },

  hydrateLearning: () => {
    set({
      learningHistory: loadHistory(),
      learningAutoRun: loadAutoRun(),
      schedulerConfig: loadSchedulerConfig(),
    });
  },
});
