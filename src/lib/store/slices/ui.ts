'use client';

import type { TruthAssessment } from '@/lib/engine/types';
import type { NoteBlock } from '@/lib/notes/types';
import type { ApiProvider } from '@/lib/engine/llm/config';
import type { PFCSet, PFCGet } from '../use-pfc-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tabs inside the mini-chat panel */
export type MiniChatTab = 'chat' | 'notes' | 'research' | 'history';

/** Thread routing: which API endpoint and hook drives this thread */
export type ThreadType = 'pipeline' | 'assistant' | 'notes';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/** An independent chat conversation inside the mini-chat widget */
export interface ChatThread {
  id: string;
  label: string;
  type: ThreadType;
  /** Own message history */
  messages: AssistantMessage[];
  createdAt: number;
  /** Per-thread provider override (uses global settings if undefined) */
  provider?: ApiProvider;
  /** Per-thread model override (uses global settings if undefined) */
  model?: string;
  /** When true, this thread uses local inference (Ollama) instead of API */
  useLocal?: boolean;
  /** For 'notes' threads — which note page this is scoped to */
  pageId?: string;
  /** When set, this thread is linked to a DB-persisted chat */
  chatId?: string;
}

// Default thread ID — constant so reset() can reuse it
const DEFAULT_THREAD_ID = 'pfc-main';
const MAX_THREADS = 8;

function makeDefaultThread(): ChatThread {
  return {
    id: DEFAULT_THREAD_ID,
    label: 'Research Chat',
    type: 'assistant',
    messages: [],
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface UISliceState {
  showTruthBot: boolean;
  latestTruthAssessment: TruthAssessment | null;
  /** When true the full-size chat is hidden and the mini floating widget shows */
  chatMinimized: boolean;
  /** Draggable position for the mini-chat widget (viewport px) */
  miniChatPosition: { x: number; y: number };
  /** Resizable dimensions for the mini-chat widget */
  miniChatSize: { w: number; h: number };

  // ── Mini-chat visibility (independent of main chat) ──
  /** Whether the mini-chat panel is open — toggled by the floating GIF */
  miniChatOpen: boolean;
  /** Active tab inside the mini-chat panel */
  miniChatTab: MiniChatTab;

  // ── Multi-thread chat system ──
  /** All open chat threads (max 8) */
  chatThreads: ChatThread[];
  /** ID of the currently active thread */
  activeThreadId: string;
  /** Whether the tools drawer (signals, guide, quick actions) is expanded */
  toolsDrawerOpen: boolean;

  // ── Streaming (per-thread) ──
  /** Streaming text keyed by thread ID */
  threadStreamingText: Record<string, string>;
  /** Streaming flag keyed by thread ID */
  threadIsStreaming: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Actions interface
// ---------------------------------------------------------------------------

export interface UISliceActions {
  toggleTruthBot: () => void;
  setTruthAssessment: (assessment: TruthAssessment) => void;
  setChatMinimized: (minimized: boolean) => void;
  setMiniChatPosition: (pos: { x: number; y: number }) => void;
  setMiniChatSize: (size: { w: number; h: number }) => void;

  // ── Mini-chat visibility ──
  setMiniChatOpen: (open: boolean) => void;
  toggleMiniChat: () => void;
  setMiniChatTab: (tab: MiniChatTab) => void;

  // ── Thread management ──
  createThread: (type: ThreadType, label?: string, pageId?: string, provider?: ApiProvider) => string;
  closeThread: (threadId: string) => void;
  renameThread: (threadId: string, label: string) => void;
  setActiveThread: (threadId: string) => void;
  setThreadProvider: (threadId: string, provider: ApiProvider) => void;
  setThreadModel: (threadId: string, model: string | undefined) => void;
  setThreadLocal: (threadId: string, useLocal: boolean) => void;
  /** Write a message to a specific thread (or active thread if no id) */
  addThreadMessage: (msg: AssistantMessage, threadId?: string) => void;
  /** Clear the active thread's messages */
  clearThreadMessages: () => void;
  setToolsDrawerOpen: (open: boolean) => void;

  // ── Convenience accessors for backward compat ──
  /** Returns active thread's messages (for mini-chat) */
  getAssistantMessages: () => AssistantMessage[];
  /** Alias: add message to active thread */
  addAssistantMessage: (msg: AssistantMessage) => void;

  // ── Notes integration ──
  /** Create a new note page from assistant message content (auto-generates title) */
  saveMessageToNotes: (content: string) => string;

  // ── Streaming (per-thread) ──
  setThreadStreamingText: (threadId: string, text: string) => void;
  appendThreadStreamingText: (threadId: string, text: string) => void;
  setThreadIsStreaming: (threadId: string, streaming: boolean) => void;

  // ── Convenience: get streaming state for active thread ──
  getActiveStreamingText: () => string;
  getActiveIsStreaming: () => boolean;

  // ── Thread expansion — open a mini-chat thread in the full main chat ──
  expandThreadToChat: (threadId?: string) => void;

  // ── Load a DB chat into a mini-chat thread ──
  loadChatIntoThread: (chatId: string, title: string, messages: AssistantMessage[]) => string;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

let threadCounter = 0;

export const createUISlice = (set: PFCSet, get: PFCGet) => ({
  // --- initial state ---
  showTruthBot: true,
  latestTruthAssessment: null as TruthAssessment | null,
  chatMinimized: false,
  miniChatPosition: { x: 900, y: 400 },
  miniChatSize: { w: 280, h: 440 },

  miniChatOpen: false,
  miniChatTab: 'chat' as MiniChatTab,

  chatThreads: [makeDefaultThread()] as ChatThread[],
  activeThreadId: DEFAULT_THREAD_ID,
  toolsDrawerOpen: false,

  threadStreamingText: {} as Record<string, string>,
  threadIsStreaming: {} as Record<string, boolean>,

  // --- actions ---

  toggleTruthBot: () =>
    set((s) => ({ showTruthBot: !s.showTruthBot })),

  setTruthAssessment: (assessment: TruthAssessment) =>
    set({ latestTruthAssessment: assessment }),

  setChatMinimized: (minimized: boolean) => {
    set({ chatMinimized: minimized });
    // When minimizing the main chat, auto-open the mini-chat
    if (minimized) {
      set({ miniChatOpen: true });
    }
  },

  setMiniChatPosition: (pos: { x: number; y: number }) =>
    set({ miniChatPosition: pos }),

  setMiniChatSize: (size: { w: number; h: number }) =>
    set({ miniChatSize: { w: Math.max(360, Math.min(900, size.w)), h: Math.max(300, Math.min(900, size.h)) } }),

  // ═══════════════════════════════════════════════════════════════════
  // Mini-chat visibility
  // ═══════════════════════════════════════════════════════════════════

  setMiniChatOpen: (open: boolean) => set({ miniChatOpen: open }),
  toggleMiniChat: () => set((s) => ({ miniChatOpen: !s.miniChatOpen })),
  setMiniChatTab: (tab: MiniChatTab) => set({ miniChatTab: tab }),

  // ═══════════════════════════════════════════════════════════════════
  // Thread management
  // ═══════════════════════════════════════════════════════════════════

  createThread: (type: ThreadType, label?: string, pageId?: string, provider?: ApiProvider): string => {
    const s = get();
    if (s.chatThreads.length >= MAX_THREADS) return s.activeThreadId;

    threadCounter++;
    const id = `thread-${Date.now()}-${threadCounter}`;
    const defaultLabel = type === 'notes' && pageId
      ? `Notes: ${s.notePages.find((p: { id: string; title: string }) => p.id === pageId)?.title || 'Untitled'}`
      : `Chat ${s.chatThreads.length + 1}`;

    const thread: ChatThread = {
      id,
      label: label || defaultLabel,
      type,
      messages: [],
      createdAt: Date.now(),
      ...(provider ? { provider } : {}),
      ...(pageId ? { pageId } : {}),
    };

    set({
      chatThreads: [...s.chatThreads, thread],
      activeThreadId: id,
    });
    return id;
  },

  closeThread: (threadId: string) => {
    const s = get();
    if (threadId === DEFAULT_THREAD_ID) return;
    if (s.chatThreads.length <= 1) return;

    const newThreads = s.chatThreads.filter((t) => t.id !== threadId);
    let newActiveId = s.activeThreadId;
    if (s.activeThreadId === threadId) {
      const idx = s.chatThreads.findIndex((t) => t.id === threadId);
      newActiveId = newThreads[Math.min(idx, newThreads.length - 1)]!.id;
    }
    // Clean up per-thread streaming state
    const { [threadId]: _st, ...restStreamText } = s.threadStreamingText;
    const { [threadId]: _si, ...restIsStreaming } = s.threadIsStreaming;
    set({
      chatThreads: newThreads,
      activeThreadId: newActiveId,
      threadStreamingText: restStreamText,
      threadIsStreaming: restIsStreaming,
    });
  },

  renameThread: (threadId: string, label: string) => {
    set((s) => ({
      chatThreads: s.chatThreads.map((t) =>
        t.id === threadId ? { ...t, label } : t,
      ),
    }));
  },

  setActiveThread: (threadId: string) => {
    const s = get();
    if (s.chatThreads.some((t) => t.id === threadId)) {
      set({ activeThreadId: threadId });
    }
  },

  setThreadProvider: (threadId: string, provider: ApiProvider) => {
    set((s) => ({
      chatThreads: s.chatThreads.map((t) =>
        t.id === threadId ? { ...t, provider, model: undefined, useLocal: false } : t,
      ),
    }));
  },

  setThreadModel: (threadId: string, model: string | undefined) => {
    set((s) => ({
      chatThreads: s.chatThreads.map((t) =>
        t.id === threadId ? { ...t, model } : t,
      ),
    }));
  },

  setThreadLocal: (threadId: string, useLocal: boolean) => {
    set((s) => ({
      chatThreads: s.chatThreads.map((t) =>
        t.id === threadId ? { ...t, useLocal, ...(useLocal ? { provider: undefined } : {}) } : t,
      ),
    }));
  },

  addThreadMessage: (msg: AssistantMessage, threadId?: string) => {
    const targetId = threadId || get().activeThreadId;
    set((s) => ({
      chatThreads: s.chatThreads.map((t) =>
        t.id === targetId
          ? { ...t, messages: [...t.messages, msg] }
          : t,
      ),
    }));
  },

  clearThreadMessages: () => {
    const threadId = get().activeThreadId;
    set((s) => ({
      chatThreads: s.chatThreads.map((t) =>
        t.id === threadId
          ? { ...t, messages: [] }
          : t,
      ),
      threadStreamingText: { ...s.threadStreamingText, [threadId]: '' },
      threadIsStreaming: { ...s.threadIsStreaming, [threadId]: false },
    }));
  },

  setToolsDrawerOpen: (open: boolean) =>
    set({ toolsDrawerOpen: open }),

  // ═══════════════════════════════════════════════════════════════════
  // Convenience accessors (backward compat for mini-chat)
  // ═══════════════════════════════════════════════════════════════════

  getAssistantMessages: (): AssistantMessage[] => {
    const s = get();
    const thread = s.chatThreads.find((t) => t.id === s.activeThreadId);
    return thread?.messages || [];
  },

  addAssistantMessage: (msg: AssistantMessage) => {
    const targetId = get().activeThreadId;
    set((s) => ({
      chatThreads: s.chatThreads.map((t) =>
        t.id === targetId
          ? { ...t, messages: [...t.messages, msg] }
          : t,
      ),
    }));
  },

  // ═══════════════════════════════════════════════════════════════════
  // Notes integration — save assistant message as a new note page
  // ═══════════════════════════════════════════════════════════════════

  saveMessageToNotes: (content: string): string => {
    try {
      if (!content || !content.trim()) {
        get().addToast({ type: 'error', message: 'Nothing to save — message is empty' });
        return '';
      }
      const firstLine = content.split('\n')[0]!.replace(/^[#*\-\s]+/, '').trim();
      const title = firstLine.length > 60
        ? firstLine.slice(0, 57) + '...'
        : firstLine || 'Chat Insight';

      // Cross-slice: create page via NotesSlice (this also sets activePageId)
      const pageId = get().createPage(title);

      // get() reflects the updated state after createPage's set() call
      const blocks: NoteBlock[] = get().noteBlocks;
      const firstBlock = blocks.find((b) => b.pageId === pageId);
      if (firstBlock) {
        get().updateBlockContent(firstBlock.id, content);
      }
      // Ensure the new page is the active page for navigation
      get().setActivePage(pageId);
      // Persist immediately so loadNotesFromStorage on /notes finds this page
      get().saveNotesToStorage();
      get().addToast({ type: 'success', message: `Saved to Notes: ${title}` });
      return pageId;
    } catch {
      get().addToast({ type: 'error', message: 'Failed to save to notes' });
      return '';
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // Streaming (per-thread — each thread has its own streaming state)
  // ═══════════════════════════════════════════════════════════════════

  setThreadStreamingText: (threadId: string, text: string) =>
    set((s) => ({
      threadStreamingText: { ...s.threadStreamingText, [threadId]: text },
    })),

  appendThreadStreamingText: (threadId: string, text: string) =>
    set((s) => ({
      threadStreamingText: {
        ...s.threadStreamingText,
        [threadId]: (s.threadStreamingText[threadId] || '') + text,
      },
    })),

  setThreadIsStreaming: (threadId: string, streaming: boolean) =>
    set((s) => ({
      threadIsStreaming: { ...s.threadIsStreaming, [threadId]: streaming },
    })),

  getActiveStreamingText: (): string => {
    const s = get();
    return s.threadStreamingText[s.activeThreadId] || '';
  },

  getActiveIsStreaming: (): boolean => {
    const s = get();
    return s.threadIsStreaming[s.activeThreadId] || false;
  },

  // ═══════════════════════════════════════════════════════════════════
  // Thread expansion — promote a mini-chat thread into the main chat
  // Converts AssistantMessage[] → ChatMessage[] and loads into message slice
  // ═══════════════════════════════════════════════════════════════════

  expandThreadToChat: (threadId?: string) => {
    const s = get();
    const targetId = threadId || s.activeThreadId;
    const thread = s.chatThreads.find((t) => t.id === targetId);
    if (!thread || thread.messages.length === 0) {
      // Just un-minimize if no messages to transfer
      set({ chatMinimized: false });
      return;
    }

    // Convert AssistantMessage[] → ChatMessage[] for the message slice
    let counter = Date.now();
    const converted = thread.messages.map((msg) => ({
      id: `expanded-${counter++}`,
      role: msg.role === 'user' ? ('user' as const) : ('system' as const),
      text: msg.content,
      timestamp: msg.timestamp,
    }));

    // Load into main chat and un-minimize
    s.loadMessages(converted);
    set({ chatMinimized: false, currentChatId: thread.chatId || null });
  },

  // ═══════════════════════════════════════════════════════════════════
  // Load a DB chat into a mini-chat thread
  // If a thread with this chatId already exists, switch to it instead
  // ═══════════════════════════════════════════════════════════════════

  loadChatIntoThread: (chatId: string, title: string, messages: AssistantMessage[]): string => {
    const s = get();

    // Check if a thread for this chatId already exists
    const existing = s.chatThreads.find((t) => t.chatId === chatId);
    if (existing) {
      set({ activeThreadId: existing.id });
      return existing.id;
    }

    // Create a new thread with the DB messages
    if (s.chatThreads.length >= MAX_THREADS) {
      // Replace the default thread if it's empty, otherwise just switch
      const defaultThread = s.chatThreads.find((t) => t.id === DEFAULT_THREAD_ID);
      if (defaultThread && defaultThread.messages.length === 0) {
        set({
          chatThreads: s.chatThreads.map((t) =>
            t.id === DEFAULT_THREAD_ID
              ? { ...t, label: title, messages, chatId }
              : t,
          ),
          activeThreadId: DEFAULT_THREAD_ID,
        });
        return DEFAULT_THREAD_ID;
      }
      return s.activeThreadId;
    }

    threadCounter++;
    const id = `thread-${Date.now()}-${threadCounter}`;
    const thread: ChatThread = {
      id,
      label: title,
      type: 'assistant',
      messages,
      createdAt: Date.now(),
      chatId,
    };

    set({
      chatThreads: [...s.chatThreads, thread],
      activeThreadId: id,
    });
    return id;
  },

});
