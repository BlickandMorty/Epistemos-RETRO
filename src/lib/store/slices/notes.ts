'use client';

import { logger } from '@/lib/debug-logger';
import { readVersioned, writeVersioned, readString, writeString, removeStorage } from '@/lib/storage-versioning';
import type {
  NoteBlock, NotePage, NoteBook, PageLink,
  NoteSearchResult, NoteAIState, BlockType,
  Transaction, IOperation, Vault, Concept, ConceptCorrelation,
} from '@/lib/notes/types';
import type { PFCSet, PFCGet } from '../use-pfc-store';
import {
  generateBlockId, normalizePageName,
  createEmptyBlock, createNewPage, getTodayJournalDate,
  extractPageLinks, orderBetween, migrateBlock, stripHtml,
  generateVaultId,
} from '@/lib/notes/types';
import {
  checkMigrationStatus,
  loadVaultsFromDb,
  loadVaultDataFromDb,
  syncVaultToServer,
  migrateToSqlite,
  upsertVaultOnServer,
  deleteVaultOnServer,
} from '@/lib/notes/sync-client';

// ── Module-scope abort controller for Note AI SSE (not in Zustand state) ──
let _noteAIAbortController: AbortController | null = null;

function isExpectedStreamInterruption(error: unknown): boolean {
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

// ═══════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════

export interface NotesSliceState {
  notePages: NotePage[];
  noteBlocks: NoteBlock[];
  noteBooks: NoteBook[];
  pageLinks: PageLink[];

  // Vault
  vaults: Vault[];
  activeVaultId: string | null;
  vaultReady: boolean;

  // Concepts
  concepts: Concept[];
  conceptCorrelations: ConceptCorrelation[];

  // UI
  activePageId: string | null;
  activeBlockId: string | null;
  editingBlockId: string | null;
  notesSidebarOpen: boolean;
  notesSidebarView: 'pages' | 'journals' | 'books' | 'graph';
  notesSearchQuery: string;

  // Tabs — ordered list of open page tabs (like browser tabs)
  openTabIds: string[];

  // Navigation history — tracks page visits for Back button (like browser history)
  navigationHistory: string[];

  // Undo/redo (SiYuan-inspired transaction system)
  undoStack: Transaction[];
  redoStack: Transaction[];

  // AI
  noteAI: NoteAIState;
}

// ═══════════════════════════════════════════════════════════════════
// Actions
// ═══════════════════════════════════════════════════════════════════

export interface NotesSliceActions {
  // Pages
  createPage: (title: string, isJournal?: boolean) => string;
  deletePage: (pageId: string) => void;
  renamePage: (pageId: string, newTitle: string) => void;
  setActivePage: (pageId: string | null) => void;
  goBack: () => void;
  ensurePage: (title: string) => string;
  togglePageFavorite: (pageId: string) => void;
  togglePagePin: (pageId: string) => void;

  // Blocks
  createBlock: (pageId: string, parentId?: string | null, afterBlockId?: string | null, content?: string, type?: BlockType) => string;
  updateBlockContent: (blockId: string, content: string) => void;
  deleteBlock: (blockId: string) => void;
  indentBlock: (blockId: string) => void;
  outdentBlock: (blockId: string) => void;
  moveBlock: (blockId: string, newParentId: string | null, afterBlockId: string | null) => void;
  toggleBlockCollapse: (blockId: string) => void;
  setEditingBlock: (blockId: string | null) => void;
  changeBlockType: (blockId: string, type: BlockType, props?: Record<string, string>) => void;
  mergeBlockUp: (blockId: string) => string | null;
  splitBlock: (blockId: string, htmlBefore: string, htmlAfter: string) => string;

  // Property tagging (used by learning slice via store actions, not direct state mutation)
  tagPageProperties: (pageId: string, props: Record<string, string>) => void;
  tagBlockProperties: (blockId: string, props: Record<string, string>) => void;
  removeBlockProperty: (blockId: string, key: string) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;
  pushTransaction: (doOps: IOperation[], undoOps: IOperation[]) => void;

  // Journal
  getOrCreateTodayJournal: () => string;

  // Search
  setNotesSearchQuery: (query: string) => void;
  searchNotes: (query: string) => NoteSearchResult[];

  // Sidebar
  toggleNotesSidebar: () => void;
  setNotesSidebarView: (view: 'pages' | 'journals' | 'books' | 'graph') => void;

  // Tabs
  openTab: (pageId: string) => void;
  closeTab: (pageId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  // Books
  createNoteBook: (title: string, pageIds?: string[], parentId?: string | null) => string;
  addPageToBook: (bookId: string, pageId: string) => void;
  removePageFromBook: (bookId: string, pageId: string) => void;
  movePageToBook: (pageId: string, targetBookId: string | null) => void;
  moveNoteBook: (bookId: string, newParentId: string | null) => void;

  // AI
  startNoteAIGeneration: (pageId: string, blockId: string | null, prompt: string) => void;
  /** Typewriter mode: AI writes directly into the note instead of the chat panel */
  startNoteAITypewriter: (pageId: string, blockId: string | null, prompt: string) => void;
  appendNoteAIText: (text: string) => void;
  stopNoteAIGeneration: () => void;

  // Persistence
  loadNotesFromStorage: () => void;
  saveNotesToStorage: () => void;

  // Backlinks
  rebuildPageLinks: () => void;
  getBacklinks: (pageId: string) => PageLink[];

  // Vault
  createVault: (name: string) => string;
  switchVault: (vaultId: string) => void;
  deleteVault: (vaultId: string) => void;
  renameVault: (vaultId: string, name: string) => void;
  loadVaultIndex: () => void;

  // Concepts
  extractConcepts: (pageId: string) => void;
  addConcept: (concept: Omit<Concept, 'id' | 'createdAt'>) => string;
  removeConcept: (conceptId: string) => void;
  getPageConcepts: (pageId: string) => Concept[];
  correlatePages: (pageAId: string, pageBId: string) => ConceptCorrelation[];
}

// ── Constants ──
const STORAGE_KEY_VAULTS = 'pfc-vaults';
const VAULTS_VERSION = 1;
const VAULT_DATA_VERSION = 1;
const STORAGE_KEY_ACTIVE_VAULT = 'pfc-active-vault';
const MAX_UNDO_STACK = 64;
const SAVE_DEBOUNCE_MS = 500;

// ── Module-level debounce timers (replaces globalThis hack) ──
let _notesSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _notesContentTimer: ReturnType<typeof setTimeout> | null = null;

// Vault-scoped storage keys
function vaultKey(vaultId: string, suffix: string): string {
  return `pfc-vault-${vaultId}-${suffix}`;
}

// ═══════════════════════════════════════════════════════════════════
// Note AI SSE connection — calls /api/notes/ai and streams response
// Same pattern as connectLearningSSE in the learning slice
// ═══════════════════════════════════════════════════════════════════

function connectNoteAISSE(set: PFCSet, get: PFCGet) {
  const state = get();
  const noteAI: NoteAIState = state.noteAI;
  if (!noteAI || !noteAI.isGenerating) return;

  // Abort any existing connection
  if (_noteAIAbortController) {
    _noteAIAbortController.abort();
  }

  const controller = new AbortController();
  _noteAIAbortController = controller;

  // ── Undo snapshot: capture pre-AI block content for typewriter mode ──
  // This lets Cmd+Z revert the entire AI insertion in one step
  let _typewriterPreContent: string | null = null;
  const _typewriterBlockId: string | null = noteAI.typewriterBlockId ?? null;
  if (noteAI.writeToNote && _typewriterBlockId) {
    const targetBlock = state.noteBlocks.find((b: NoteBlock) => b.id === _typewriterBlockId);
    _typewriterPreContent = targetBlock ? targetBlock.content : null;
  }

  // Gather note data
  const notePages = state.notePages ?? [];
  const noteBlocks = state.noteBlocks ?? [];

  // Gather inference config
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

  (async () => {
    try {
      const response = await fetch('/api/notes/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pages: notePages,
          blocks: noteBlocks,
          prompt: noteAI.prompt,
          targetBlockId: noteAI.targetBlockId,
          inferenceConfig,
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
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          if (data === '[DONE]') {
            set((s) => ({
              noteAI: { ...s.noteAI, isGenerating: false },
            }));
            continue;
          }

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'text': {
                const currentState = get();
                const ai = currentState.noteAI;

                if (ai.writeToNote && ai.typewriterBlockId) {
                  // ── Typewriter mode: write directly into the note block ──
                  const block = currentState.noteBlocks.find(
                    (b: NoteBlock) => b.id === ai.typewriterBlockId
                  );
                  if (block) {
                    // Strip the placeholder text on first token
                    const currentContent = block.content === '✍️ Writing...' ? '' : block.content;
                    const newContent = currentContent + event.text;
                    set((s) => ({
                      noteBlocks: s.noteBlocks.map((b: NoteBlock) =>
                        b.id === ai.typewriterBlockId
                          ? { ...b, content: newContent, updatedAt: Date.now() }
                          : b
                      ),
                      noteAI: {
                        ...s.noteAI,
                        generatedText: s.noteAI.generatedText + event.text,
                      },
                    }));
                  }
                } else {
                  // ── Normal mode: accumulate in AI chat panel ──
                  set((s) => ({
                    noteAI: {
                      ...s.noteAI,
                      generatedText: s.noteAI.generatedText + event.text,
                    },
                  }));
                }
                break;
              }
              case 'done': {
                const doneState = get();
                const wasTypewriting = doneState.noteAI.writeToNote;

                // ── Push undo transaction for typewriter AI insertion ──
                if (wasTypewriting && _typewriterBlockId && _typewriterPreContent !== null) {
                  const finalBlock = doneState.noteBlocks.find(
                    (b: NoteBlock) => b.id === _typewriterBlockId
                  );
                  if (finalBlock && finalBlock.content !== _typewriterPreContent) {
                    const pid = finalBlock.pageId ?? '';
                    doneState.pushTransaction(
                      [{ action: 'update', blockId: _typewriterBlockId, pageId: pid, data: { content: finalBlock.content } }],
                      [{ action: 'update', blockId: _typewriterBlockId, pageId: pid, previousData: { content: _typewriterPreContent } }],
                    );
                  }
                }

                set((s) => ({
                  noteAI: { ...s.noteAI, isGenerating: false, writeToNote: false, typewriterBlockId: null },
                  // Exit editing mode for the typewriter block so it renders in view mode
                  ...(wasTypewriting ? { editingBlockId: null } : {}),
                }));
                break;
              }
              case 'error': {
                if (typeof event.message === 'string' && event.message.includes('Local model produced no output')) {
                  logger.warn('note-ai', 'SSE warning:', event.message);
                } else {
                  logger.error('note-ai', 'SSE error:', event.message);
                }
                const errState = get();
                const wasTypewritingOnErr = errState.noteAI.writeToNote;

                // ── Push undo transaction for partial AI content on error ──
                if (wasTypewritingOnErr && _typewriterBlockId && _typewriterPreContent !== null) {
                  const errBlock = errState.noteBlocks.find(
                    (b: NoteBlock) => b.id === _typewriterBlockId
                  );
                  if (errBlock && errBlock.content !== _typewriterPreContent) {
                    const pid = errBlock.pageId ?? '';
                    errState.pushTransaction(
                      [{ action: 'update', blockId: _typewriterBlockId, pageId: pid, data: { content: errBlock.content } }],
                      [{ action: 'update', blockId: _typewriterBlockId, pageId: pid, previousData: { content: _typewriterPreContent } }],
                    );
                  }
                }

                set((s) => ({
                  noteAI: { ...s.noteAI, isGenerating: false, writeToNote: false, typewriterBlockId: null },
                  ...(wasTypewritingOnErr ? { editingBlockId: null } : {}),
                }));
                break;
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (error) {
      if (!isExpectedStreamInterruption(error)) {
        logger.error('note-ai', 'Stream error:', error);
        const catchState = get();
        const wasTypewritingOnCatch = catchState.noteAI.writeToNote;

        // ── Push undo transaction for partial AI content on stream error ──
        if (wasTypewritingOnCatch && _typewriterBlockId && _typewriterPreContent !== null) {
          const catchBlock = catchState.noteBlocks.find(
            (b: NoteBlock) => b.id === _typewriterBlockId
          );
          if (catchBlock && catchBlock.content !== _typewriterPreContent) {
            const pid = catchBlock.pageId ?? '';
            catchState.pushTransaction(
              [{ action: 'update', blockId: _typewriterBlockId, pageId: pid, data: { content: catchBlock.content } }],
              [{ action: 'update', blockId: _typewriterBlockId, pageId: pid, previousData: { content: _typewriterPreContent } }],
            );
          }
        }

        set((s) => ({
          noteAI: { ...s.noteAI, isGenerating: false, writeToNote: false, typewriterBlockId: null },
          ...(wasTypewritingOnCatch ? { editingBlockId: null } : {}),
        }));
      }
    } finally {
      _noteAIAbortController = null;
    }
  })();
}

// ═══════════════════════════════════════════════════════════════════
// Slice Creator
// ═══════════════════════════════════════════════════════════════════

export const createNotesSlice = (set: PFCSet, get: PFCGet) => ({
  // ── Initial State ──
  notePages: [] as NotePage[],
  noteBlocks: [] as NoteBlock[],
  noteBooks: [] as NoteBook[],
  pageLinks: [] as PageLink[],

  // Vault
  vaults: [] as Vault[],
  activeVaultId: null as string | null,
  vaultReady: false,

  // Concepts
  concepts: [] as Concept[],
  conceptCorrelations: [] as ConceptCorrelation[],

  activePageId: null as string | null,
  activeBlockId: null as string | null,
  editingBlockId: null as string | null,
  notesSidebarOpen: true,
  notesSidebarView: 'pages' as 'pages' | 'journals' | 'books' | 'graph',
  notesSearchQuery: '',
  openTabIds: [] as string[],
  navigationHistory: [] as string[],

  undoStack: [] as Transaction[],
  redoStack: [] as Transaction[],

  noteAI: {
    isGenerating: false,
    targetPageId: null,
    targetBlockId: null,
    generatedText: '',
    prompt: '',
    writeToNote: false,
    typewriterBlockId: null,
  } as NoteAIState,

  // ═════════════════════════════════════════════════════════════════
  // Transaction System (SiYuan-inspired)
  // 64-entry undo stack, operation pairs for reliable undo/redo
  // ═════════════════════════════════════════════════════════════════

  pushTransaction: (doOps: IOperation[], undoOps: IOperation[]) => {
    const txn: Transaction = {
      id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      doOps,
      undoOps,
    };
    set((s) => ({
      undoStack: [...s.undoStack.slice(-MAX_UNDO_STACK + 1), txn],
      redoStack: [], // Clear redo on new action
    }));
  },

  undo: () => {
    const s = get();
    if (s.undoStack.length === 0) return;

    const txn = s.undoStack[s.undoStack.length - 1]!;
    let blocks = [...s.noteBlocks];

    // Apply undo operations
    for (const op of txn.undoOps) {
      switch (op.action) {
        case 'insert':
          // Undo insert = delete the block
          blocks = blocks.filter((b: NoteBlock) => b.id !== op.blockId);
          break;
        case 'delete':
          // Undo delete = re-insert the block
          if (op.previousData && typeof op.previousData === 'object' && 'id' in op.previousData) {
            blocks.push(op.previousData as NoteBlock);
          }
          break;
        case 'update':
          blocks = blocks.map((b: NoteBlock) =>
            b.id === op.blockId ? { ...b, content: op.previousData?.content ?? b.content, updatedAt: Date.now() } : b
          );
          break;
        case 'setBlockType':
          blocks = blocks.map((b: NoteBlock) =>
            b.id === op.blockId
              ? { ...b, type: op.previousData?.type ?? b.type, properties: op.previousData?.properties ?? b.properties, updatedAt: Date.now() }
              : b
          );
          break;
        case 'move':
          blocks = blocks.map((b: NoteBlock) =>
            b.id === op.blockId
              ? {
                  ...b,
                  parentId: op.previousData?.parentId ?? b.parentId,
                  order: op.previousData?.order ?? b.order,
                  indent: op.previousData?.indent ?? b.indent,
                  updatedAt: Date.now(),
                }
              : b
          );
          break;
      }
    }

    set((s) => ({
      noteBlocks: blocks,
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, txn] as Transaction[],
    }));

    debouncedSave(get);
  },

  redo: () => {
    const s = get();
    if (s.redoStack.length === 0) return;

    const txn = s.redoStack[s.redoStack.length - 1]!;
    let blocks = [...s.noteBlocks];

    // Apply do operations
    for (const op of txn.doOps) {
      switch (op.action) {
        case 'insert':
          if (op.data && typeof op.data === 'object' && 'id' in op.data) {
            blocks.push(op.data as NoteBlock);
          }
          break;
        case 'delete':
          blocks = blocks.filter((b: NoteBlock) => b.id !== op.blockId);
          break;
        case 'update':
          blocks = blocks.map((b: NoteBlock) =>
            b.id === op.blockId ? { ...b, content: op.data?.content ?? b.content, updatedAt: Date.now() } : b
          );
          break;
        case 'setBlockType':
          blocks = blocks.map((b: NoteBlock) =>
            b.id === op.blockId
              ? { ...b, type: op.data?.type ?? b.type, properties: op.data?.properties ?? b.properties, updatedAt: Date.now() }
              : b
          );
          break;
        case 'move':
          blocks = blocks.map((b: NoteBlock) =>
            b.id === op.blockId
              ? {
                  ...b,
                  parentId: op.data?.parentId ?? b.parentId,
                  order: op.data?.order ?? b.order,
                  indent: op.data?.indent ?? b.indent,
                  updatedAt: Date.now(),
                }
              : b
          );
          break;
      }
    }

    set((s) => ({
      noteBlocks: blocks,
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, txn] as Transaction[],
    }));

    debouncedSave(get);
  },

  // ═════════════════════════════════════════════════════════════════
  // Page Operations
  // ═════════════════════════════════════════════════════════════════

  createPage: (title: string, isJournal: boolean = false): string => {
    const journalDate = isJournal ? getTodayJournalDate() : undefined;
    const page = createNewPage(title, isJournal, journalDate);
    const firstBlock = createEmptyBlock(page.id, null, 'a0');

    set((s) => ({
      notePages: [...s.notePages, page],
      noteBlocks: [...s.noteBlocks, firstBlock],
      activePageId: page.id,
      // Auto-open tab for the new page (matches setActivePage behavior)
      openTabIds: [...s.openTabIds, page.id],
    }));

    debouncedSave(get);
    return page.id;
  },

  deletePage: (pageId: string) => {
    set((s) => {
      const newTabs = s.openTabIds.filter((id) => id !== pageId);
      let newActive = s.activePageId;
      if (s.activePageId === pageId) {
        const idx = s.openTabIds.indexOf(pageId);
        newActive = newTabs.length > 0 ? newTabs[Math.min(idx, newTabs.length - 1)]! : null;
      }
      return {
        notePages: s.notePages.filter((p: NotePage) => p.id !== pageId),
        noteBlocks: s.noteBlocks.filter((b: NoteBlock) => b.pageId !== pageId),
        pageLinks: s.pageLinks.filter((l: PageLink) => l.sourcePageId !== pageId && l.targetPageId !== pageId),
        activePageId: newActive,
        openTabIds: newTabs,
      };
    });
    debouncedSave(get);
  },

  renamePage: (pageId: string, newTitle: string) => {
    const s = get();
    const page = s.notePages.find((p: NotePage) => p.id === pageId);
    if (!page) return;
    const oldTitle = page.title;

    set((s) => {
      // Update all blocks that reference the old page name via [[links]]
      const escOld = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linkRegex = new RegExp(`\\[\\[${escOld}\\]\\]`, 'gi');
      const updatedBlocks = s.noteBlocks.map((b: NoteBlock) => {
        if (b.refs.some((r: string) => normalizePageName(r) === normalizePageName(oldTitle))) {
          const newContent = b.content.replace(linkRegex, `[[${newTitle}]]`);
          return { ...b, content: newContent, refs: extractPageLinks(newContent), updatedAt: Date.now() };
        }
        return b;
      });

      return {
        notePages: s.notePages.map((p: NotePage) =>
          p.id === pageId
            ? { ...p, title: newTitle, name: normalizePageName(newTitle), updatedAt: Date.now() }
            : p
        ),
        noteBlocks: updatedBlocks,
      };
    });

    get().rebuildPageLinks();
    debouncedSave(get);
  },

  setActivePage: (pageId: string | null) => {
    const prev = get().activePageId;
    set((s) => ({
      activePageId: pageId,
      editingBlockId: null,
      // Auto-open tab when navigating to a page
      openTabIds: pageId && !s.openTabIds.includes(pageId)
        ? [...s.openTabIds, pageId]
        : s.openTabIds,
      // Push previous page to navigation history (for Back button)
      navigationHistory: prev && prev !== pageId
        ? [...s.navigationHistory.slice(-49), prev]  // cap at 50 entries
        : s.navigationHistory,
    }));
  },

  goBack: () => {
    const s = get();
    if (s.navigationHistory.length === 0) return;
    const prevPageId = s.navigationHistory[s.navigationHistory.length - 1];
    // Pop last entry WITHOUT pushing current to history (avoid infinite loop)
    set({
      activePageId: prevPageId,
      editingBlockId: null,
      navigationHistory: s.navigationHistory.slice(0, -1),
      openTabIds: prevPageId && !s.openTabIds.includes(prevPageId)
        ? [...s.openTabIds, prevPageId]
        : s.openTabIds,
    });
  },

  ensurePage: (title: string): string => {
    const s = get();
    const normalized = normalizePageName(title);
    const existing = s.notePages.find((p: NotePage) => p.name === normalized);
    if (existing) return existing.id;
    return get().createPage(title);
  },

  togglePageFavorite: (pageId: string) => {
    set((s) => ({
      notePages: s.notePages.map((p: NotePage) =>
        p.id === pageId ? { ...p, favorite: !p.favorite } : p
      ),
    }));
    debouncedSave(get);
  },

  togglePagePin: (pageId: string) => {
    set((s) => ({
      notePages: s.notePages.map((p: NotePage) =>
        p.id === pageId ? { ...p, pinned: !p.pinned } : p
      ),
    }));
    debouncedSave(get);
  },

  // ═════════════════════════════════════════════════════════════════
  // Block Operations (with transaction recording)
  // ═════════════════════════════════════════════════════════════════

  createBlock: (
    pageId: string,
    parentId: string | null = null,
    afterBlockId: string | null = null,
    content: string = '',
    type: BlockType = 'paragraph',
  ): string => {
    const s = get();
    const siblings = s.noteBlocks
      .filter((b: NoteBlock) => b.pageId === pageId && b.parentId === parentId)
      .sort((a: NoteBlock, b: NoteBlock) => a.order.localeCompare(b.order));

    let order: string;
    if (afterBlockId) {
      const afterBlock = siblings.find((b: NoteBlock) => b.id === afterBlockId);
      const afterIdx = siblings.indexOf(afterBlock!);
      const nextBlock = siblings[afterIdx + 1];
      order = orderBetween(afterBlock?.order ?? null, nextBlock?.order ?? null);
    } else {
      const lastBlock = siblings[siblings.length - 1];
      order = orderBetween(lastBlock?.order ?? null, null);
    }

    const block: NoteBlock = {
      id: generateBlockId(),
      type,
      content,
      parentId,
      pageId,
      order,
      collapsed: false,
      indent: parentId ? (s.noteBlocks.find((b: NoteBlock) => b.id === parentId)?.indent ?? 0) + 1 : 0,
      properties: {},
      refs: extractPageLinks(content),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set((s) => ({
      noteBlocks: [...s.noteBlocks, block],
      editingBlockId: block.id,
    }));

    // Record transaction
    get().pushTransaction(
      [{ action: 'insert', blockId: block.id, pageId, data: block }],
      [{ action: 'insert', blockId: block.id, pageId }],
    );

    if (block.refs.length > 0) updateBlockLinks(block.id, set, get);
    debouncedSave(get);
    return block.id;
  },

  updateBlockContent: (blockId: string, content: string) => {
    const s = get();
    const oldBlock = s.noteBlocks.find((b: NoteBlock) => b.id === blockId);
    if (!oldBlock) return;

    const refs = extractPageLinks(content);
    set((s) => ({
      noteBlocks: s.noteBlocks.map((b: NoteBlock) =>
        b.id === blockId ? { ...b, content, refs, updatedAt: Date.now() } : b
      ),
    }));

    // Batch content updates (don't push a txn for every keystroke)
    // Transaction is pushed on blur or explicit save
    if (_notesContentTimer) clearTimeout(_notesContentTimer);
    _notesContentTimer = setTimeout(() => {
      _notesContentTimer = null;
      updateBlockLinks(blockId, set, get);
      get().saveNotesToStorage();
    }, SAVE_DEBOUNCE_MS);
  },

  deleteBlock: (blockId: string) => {
    const s = get();
    const block = s.noteBlocks.find((b: NoteBlock) => b.id === blockId);
    if (!block) return;

    // Find children recursively
    const toDelete = new Set<string>([blockId]);
    let found = true;
    while (found) {
      found = false;
      for (const b of s.noteBlocks) {
        if (b.parentId && toDelete.has(b.parentId) && !toDelete.has(b.id)) {
          toDelete.add(b.id);
          found = true;
        }
      }
    }

    const deletedBlocks = s.noteBlocks.filter((b: NoteBlock) => toDelete.has(b.id));

    // Find the best sibling to move cursor to (previous first, then next)
    let nextEditId: string | null = null;
    if (s.editingBlockId && toDelete.has(s.editingBlockId)) {
      const pageBlocks = s.noteBlocks.filter((b: NoteBlock) => b.pageId === block.pageId && !toDelete.has(b.id));
      const deletedIdx = s.noteBlocks.findIndex((b: NoteBlock) => b.id === blockId);
      // Find closest preceding sibling that's not being deleted
      let prevBlock: NoteBlock | null = null;
      let nextBlock: NoteBlock | null = null;
      for (let i = deletedIdx - 1; i >= 0; i--) {
        const b = s.noteBlocks[i]!;
        if (b.pageId === block.pageId && !toDelete.has(b.id)) {
          prevBlock = b;
          break;
        }
      }
      if (!prevBlock) {
        for (let i = deletedIdx + 1; i < s.noteBlocks.length; i++) {
          const b = s.noteBlocks[i]!;
          if (b.pageId === block.pageId && !toDelete.has(b.id)) {
            nextBlock = b;
            break;
          }
        }
      }
      nextEditId = (prevBlock ?? nextBlock)?.id ?? null;
    }

    set((s) => ({
      noteBlocks: s.noteBlocks.filter((b: NoteBlock) => !toDelete.has(b.id)),
      editingBlockId: s.editingBlockId && toDelete.has(s.editingBlockId) ? nextEditId : s.editingBlockId,
    }));

    // Record transaction
    get().pushTransaction(
      [{ action: 'delete', blockId, pageId: block.pageId }],
      deletedBlocks.map((b: NoteBlock) => ({ action: 'delete', blockId: b.id, pageId: b.pageId, previousData: b })),
    );

    debouncedSave(get);
  },

  changeBlockType: (blockId: string, type: BlockType, props?: Record<string, string>) => {
    const s = get();
    const block = s.noteBlocks.find((b: NoteBlock) => b.id === blockId);
    if (!block) return;

    const oldType = block.type;
    const oldProps = { ...block.properties };

    set((s) => ({
      noteBlocks: s.noteBlocks.map((b: NoteBlock) =>
        b.id === blockId
          ? { ...b, type, properties: { ...b.properties, ...props }, content: '', updatedAt: Date.now() }
          : b
      ),
    }));

    get().pushTransaction(
      [{ action: 'setBlockType', blockId, pageId: block.pageId, data: { type, properties: props } }],
      [{ action: 'setBlockType', blockId, pageId: block.pageId, previousData: { type: oldType, properties: oldProps } }],
    );

    debouncedSave(get);
  },

  // ── Property tagging (cross-slice safe) ──────────────────────────

  /** Merge properties into a page. No undo (page properties are metadata, not user content). */
  tagPageProperties: (pageId: string, props: Record<string, string>) => {
    set((s) => ({
      notePages: s.notePages.map((p: NotePage) =>
        p.id === pageId
          ? { ...p, properties: { ...p.properties, ...props }, updatedAt: Date.now() }
          : p,
      ),
    }));
    debouncedSave(get);
  },

  /** Merge properties into a block, tracked via undo/redo transaction. */
  tagBlockProperties: (blockId: string, props: Record<string, string>) => {
    const block = get().noteBlocks.find((b: NoteBlock) => b.id === blockId);
    if (!block) return;
    const oldProps = { ...block.properties };
    set((s) => ({
      noteBlocks: s.noteBlocks.map((b: NoteBlock) =>
        b.id === blockId
          ? { ...b, properties: { ...b.properties, ...props }, updatedAt: Date.now() }
          : b,
      ),
    }));
    get().pushTransaction(
      [{ action: 'setBlockProps', blockId, pageId: block.pageId, data: { properties: { ...block.properties, ...props } } }],
      [{ action: 'setBlockProps', blockId, pageId: block.pageId, previousData: { properties: oldProps } }],
    );
    debouncedSave(get);
  },

  /** Remove a single property key from a block, tracked via undo/redo transaction. */
  removeBlockProperty: (blockId: string, key: string) => {
    const block = get().noteBlocks.find((b: NoteBlock) => b.id === blockId);
    if (!block || !(key in block.properties)) return;
    const oldProps = { ...block.properties };
    const { [key]: _, ...restProps } = block.properties;
    set((s) => ({
      noteBlocks: s.noteBlocks.map((b: NoteBlock) =>
        b.id === blockId
          ? { ...b, properties: restProps, updatedAt: Date.now() }
          : b,
      ),
    }));
    get().pushTransaction(
      [{ action: 'setBlockProps', blockId, pageId: block.pageId, data: { properties: restProps } }],
      [{ action: 'setBlockProps', blockId, pageId: block.pageId, previousData: { properties: oldProps } }],
    );
    debouncedSave(get);
  },

  /** Merge block content into the previous block, returns the target block ID or null */
  mergeBlockUp: (blockId: string): string | null => {
    const s = get();
    const block = s.noteBlocks.find((b: NoteBlock) => b.id === blockId);
    if (!block) return null;

    // Find previous sibling
    const siblings = s.noteBlocks
      .filter((b: NoteBlock) => b.pageId === block.pageId && b.parentId === block.parentId)
      .sort((a: NoteBlock, b: NoteBlock) => a.order.localeCompare(b.order));

    const idx = siblings.findIndex((b: NoteBlock) => b.id === blockId);
    if (idx <= 0) return null;

    const prevBlock = siblings[idx - 1]!;
    if (prevBlock.type === 'divider' || prevBlock.type === 'page-break') return null;

    const mergedContent = prevBlock.content + block.content;

    set((s) => ({
      noteBlocks: s.noteBlocks
        .map((b: NoteBlock) => b.id === prevBlock.id ? { ...b, content: mergedContent, updatedAt: Date.now() } : b)
        .filter((b: NoteBlock) => b.id !== blockId),
      editingBlockId: prevBlock.id,
    }));

    get().pushTransaction(
      [
        { action: 'update', blockId: prevBlock.id, pageId: block.pageId, data: { content: mergedContent } },
        { action: 'delete', blockId, pageId: block.pageId },
      ],
      [
        { action: 'update', blockId: prevBlock.id, pageId: block.pageId, previousData: { content: prevBlock.content } },
        { action: 'delete', blockId, pageId: block.pageId, previousData: block },
      ],
    );

    debouncedSave(get);
    return prevBlock.id;
  },

  /** Split a block at cursor: block becomes htmlBefore, new block gets htmlAfter. Returns new block ID. */
  splitBlock: (blockId: string, htmlBefore: string, htmlAfter: string): string => {
    const s = get();
    const block = s.noteBlocks.find((b: NoteBlock) => b.id === blockId);
    if (!block) return '';

    // Find next sibling order for new block
    const siblings = s.noteBlocks
      .filter((b: NoteBlock) => b.pageId === block.pageId && b.parentId === block.parentId)
      .sort((a: NoteBlock, b: NoteBlock) => a.order.localeCompare(b.order));

    const idx = siblings.findIndex((b: NoteBlock) => b.id === blockId);
    const nextSibling = siblings[idx + 1];
    const newOrder = orderBetween(block.order, nextSibling?.order ?? null);

    const newBlock: NoteBlock = {
      id: generateBlockId(),
      type: 'paragraph',
      content: htmlAfter,
      parentId: block.parentId,
      pageId: block.pageId,
      order: newOrder,
      collapsed: false,
      indent: block.indent,
      properties: {},
      refs: extractPageLinks(htmlAfter),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set((s) => ({
      noteBlocks: [
        ...s.noteBlocks.map((b: NoteBlock) =>
          b.id === blockId ? { ...b, content: htmlBefore, updatedAt: Date.now() } : b
        ),
        newBlock,
      ],
      editingBlockId: newBlock.id,
    }));

    get().pushTransaction(
      [
        { action: 'update', blockId, pageId: block.pageId, data: { content: htmlBefore } },
        { action: 'insert', blockId: newBlock.id, pageId: block.pageId, data: newBlock },
      ],
      [
        { action: 'update', blockId, pageId: block.pageId, previousData: { content: block.content } },
        { action: 'insert', blockId: newBlock.id, pageId: block.pageId },
      ],
    );

    debouncedSave(get);
    return newBlock.id;
  },

  indentBlock: (blockId: string) => {
    const s = get();
    const block = s.noteBlocks.find((b: NoteBlock) => b.id === blockId);
    if (!block) return;

    const siblings = s.noteBlocks
      .filter((b: NoteBlock) => b.pageId === block.pageId && b.parentId === block.parentId)
      .sort((a: NoteBlock, b: NoteBlock) => a.order.localeCompare(b.order));

    const idx = siblings.findIndex((b: NoteBlock) => b.id === blockId);
    if (idx <= 0) return;

    const newParent = siblings[idx - 1]!;
    const oldParentId = block.parentId;
    const oldOrder = block.order;
    const oldIndent = block.indent;

    set((s) => ({
      noteBlocks: s.noteBlocks.map((b: NoteBlock) =>
        b.id === blockId
          ? { ...b, parentId: newParent.id, indent: (newParent.indent ?? 0) + 1, updatedAt: Date.now() }
          : b
      ),
    }));

    get().pushTransaction(
      [{ action: 'move', blockId, pageId: block.pageId, data: { parentId: newParent.id, indent: (newParent.indent ?? 0) + 1 } }],
      [{ action: 'move', blockId, pageId: block.pageId, previousData: { parentId: oldParentId, order: oldOrder, indent: oldIndent } }],
    );

    debouncedSave(get);
  },

  outdentBlock: (blockId: string) => {
    const s = get();
    const block = s.noteBlocks.find((b: NoteBlock) => b.id === blockId);
    if (!block || !block.parentId) return;

    const parent = s.noteBlocks.find((b: NoteBlock) => b.id === block.parentId);
    if (!parent) return;

    const oldParentId = block.parentId;
    const oldOrder = block.order;
    const oldIndent = block.indent;

    set((s) => ({
      noteBlocks: s.noteBlocks.map((b: NoteBlock) =>
        b.id === blockId
          ? { ...b, parentId: parent.parentId, indent: Math.max(0, (block.indent ?? 1) - 1), updatedAt: Date.now() }
          : b
      ),
    }));

    get().pushTransaction(
      [{ action: 'move', blockId, pageId: block.pageId, data: { parentId: parent.parentId, indent: Math.max(0, (block.indent ?? 1) - 1) } }],
      [{ action: 'move', blockId, pageId: block.pageId, previousData: { parentId: oldParentId, order: oldOrder, indent: oldIndent } }],
    );

    debouncedSave(get);
  },

  moveBlock: (blockId: string, newParentId: string | null, afterBlockId: string | null) => {
    const s = get();
    const block = s.noteBlocks.find((b: NoteBlock) => b.id === blockId);
    if (!block) return;

    const siblings = s.noteBlocks.filter((b: NoteBlock) =>
      b.pageId === block.pageId && b.parentId === newParentId
    );

    let order: string;
    if (afterBlockId) {
      const afterBlock = siblings.find((b: NoteBlock) => b.id === afterBlockId);
      const afterIdx = siblings.indexOf(afterBlock!);
      const nextBlock = siblings[afterIdx + 1];
      order = orderBetween(afterBlock?.order ?? null, nextBlock?.order ?? null);
    } else {
      order = orderBetween(null, siblings[0]?.order ?? null);
    }

    const parentIndent = newParentId
      ? (s.noteBlocks.find((b: NoteBlock) => b.id === newParentId)?.indent ?? 0) + 1
      : 0;

    const oldParentId = block.parentId;
    const oldOrder = block.order;
    const oldIndent = block.indent;

    set((s) => ({
      noteBlocks: s.noteBlocks.map((b: NoteBlock) =>
        b.id === blockId
          ? { ...b, parentId: newParentId, order, indent: parentIndent, updatedAt: Date.now() }
          : b
      ),
    }));

    get().pushTransaction(
      [{ action: 'move', blockId, pageId: block.pageId, data: { parentId: newParentId, order, indent: parentIndent } }],
      [{ action: 'move', blockId, pageId: block.pageId, previousData: { parentId: oldParentId, order: oldOrder, indent: oldIndent } }],
    );

    debouncedSave(get);
  },

  toggleBlockCollapse: (blockId: string) => {
    set((s) => ({
      noteBlocks: s.noteBlocks.map((b: NoteBlock) =>
        b.id === blockId ? { ...b, collapsed: !b.collapsed } : b
      ),
    }));
  },

  setEditingBlock: (blockId: string | null) => set({ editingBlockId: blockId }),

  // ═════════════════════════════════════════════════════════════════
  // Journal
  // ═════════════════════════════════════════════════════════════════

  getOrCreateTodayJournal: (): string => {
    const s = get();
    const today = getTodayJournalDate();
    const existing = s.notePages.find((p: NotePage) => p.isJournal && p.journalDate === today);
    if (existing) {
      set((prev) => ({
        activePageId: existing.id,
        // Auto-open tab (matches setActivePage behavior)
        openTabIds: prev.openTabIds.includes(existing.id)
          ? prev.openTabIds
          : [...prev.openTabIds, existing.id],
      }));
      return existing.id;
    }
    const d = new Date();
    const title = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return get().createPage(title, true);
  },

  // ═════════════════════════════════════════════════════════════════
  // Search
  // ═════════════════════════════════════════════════════════════════

  setNotesSearchQuery: (query: string) => set({ notesSearchQuery: query }),

  searchNotes: (query: string): NoteSearchResult[] => {
    if (!query.trim()) return [];
    const s = get();
    const q = query.toLowerCase();
    const results: NoteSearchResult[] = [];

    for (const page of s.notePages) {
      if (page.title.toLowerCase().includes(q) || page.name.includes(q)) {
        results.push({
          type: 'page',
          pageId: page.id,
          title: page.title,
          snippet: page.title,
          score: page.title.toLowerCase().startsWith(q) ? 2 : 1,
        });
      }
    }

    for (const block of s.noteBlocks) {
      const text = stripHtml(block.content).toLowerCase();
      if (text.includes(q)) {
        const page = s.notePages.find((p: NotePage) => p.id === block.pageId);
        results.push({
          type: 'block',
          pageId: block.pageId,
          blockId: block.id,
          title: page?.title ?? 'Unknown',
          snippet: stripHtml(block.content).slice(0, 120),
          score: text.startsWith(q) ? 1.5 : 0.5,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 20);
  },

  // ═════════════════════════════════════════════════════════════════
  // Sidebar
  // ═════════════════════════════════════════════════════════════════

  toggleNotesSidebar: () => set((s) => ({ notesSidebarOpen: !s.notesSidebarOpen })),

  setNotesSidebarView: (view: 'pages' | 'journals' | 'books' | 'graph') =>
    set({ notesSidebarView: view }),

  // ═════════════════════════════════════════════════════════════════
  // Tabs — open/close note tabs (browser-tab style)
  // ═════════════════════════════════════════════════════════════════

  openTab: (pageId: string) => set((s) => ({
    openTabIds: s.openTabIds.includes(pageId)
      ? s.openTabIds
      : [...s.openTabIds, pageId],
  })),

  closeTab: (pageId: string) => set((s) => {
    const newTabs = s.openTabIds.filter((id) => id !== pageId);
    // If closing the active tab, switch to adjacent tab or null
    let newActivePageId = s.activePageId;
    if (s.activePageId === pageId) {
      const idx = s.openTabIds.indexOf(pageId);
      if (newTabs.length > 0) {
        newActivePageId = newTabs[Math.min(idx, newTabs.length - 1)] ?? null;
      } else {
        newActivePageId = null;
      }
    }
    return { openTabIds: newTabs, activePageId: newActivePageId, editingBlockId: null };
  }),

  reorderTabs: (fromIndex: number, toIndex: number) => set((s) => {
    const newTabs = [...s.openTabIds];
    const [moved] = newTabs.splice(fromIndex, 1);
    newTabs.splice(toIndex, 0, moved!);
    return { openTabIds: newTabs };
  }),

  // ═════════════════════════════════════════════════════════════════
  // Books
  // ═════════════════════════════════════════════════════════════════

  createNoteBook: (title: string, pageIds: string[] = [], parentId: string | null = null): string => {
    const book: NoteBook = {
      id: `book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      pageIds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      autoGenerated: false,
      chapters: [],
      parentId: parentId || undefined,
    };
    set((s) => ({ noteBooks: [...s.noteBooks, book] }));
    debouncedSave(get);
    return book.id;
  },

  addPageToBook: (bookId: string, pageId: string) => {
    set((s) => ({
      noteBooks: s.noteBooks.map((b: NoteBook) =>
        b.id === bookId && !b.pageIds.includes(pageId)
          ? { ...b, pageIds: [...b.pageIds, pageId], updatedAt: Date.now() }
          : b
      ),
    }));
    debouncedSave(get);
  },

  removePageFromBook: (bookId: string, pageId: string) => {
    set((s) => ({
      noteBooks: s.noteBooks.map((b: NoteBook) =>
        b.id === bookId
          ? { ...b, pageIds: b.pageIds.filter((id: string) => id !== pageId), updatedAt: Date.now() }
          : b
      ),
    }));
    debouncedSave(get);
  },

  movePageToBook: (pageId: string, targetBookId: string | null) => {
    set((s) => {
      const now = Date.now();
      // Remove from any existing book, then add to target
      const updated = s.noteBooks.map((b: NoteBook) => {
        const hadPage = b.pageIds.includes(pageId);
        const isTarget = b.id === targetBookId;
        let ids = hadPage ? b.pageIds.filter((id: string) => id !== pageId) : b.pageIds;
        if (isTarget && !ids.includes(pageId)) ids = [...ids, pageId];
        if (hadPage || isTarget) return { ...b, pageIds: ids, updatedAt: now };
        return b;
      });
      return { noteBooks: updated };
    });
    debouncedSave(get);
  },

  moveNoteBook: (bookId: string, newParentId: string | null) => {
    // Prevent circular nesting (book can't be its own ancestor)
    const books = get().noteBooks;
    if (newParentId) {
      let cursor: string | null | undefined = newParentId;
      while (cursor) {
        if (cursor === bookId) return; // would create cycle
        const parent = books.find((b: NoteBook) => b.id === cursor);
        cursor = parent?.parentId;
      }
    }
    set((s) => ({
      noteBooks: s.noteBooks.map((b: NoteBook) =>
        b.id === bookId
          ? { ...b, parentId: newParentId || undefined, updatedAt: Date.now() }
          : b
      ),
    }));
    debouncedSave(get);
  },

  // ═════════════════════════════════════════════════════════════════
  // AI
  // ═════════════════════════════════════════════════════════════════

  startNoteAIGeneration: (pageId: string, blockId: string | null, prompt: string) => {
    set({
      noteAI: {
        isGenerating: true,
        targetPageId: pageId,
        targetBlockId: blockId,
        generatedText: '',
        prompt,
        writeToNote: false,
        typewriterBlockId: null,
      },
    });
    // Connect to SSE endpoint to stream the AI response
    connectNoteAISSE(set, get);
  },

  startNoteAITypewriter: (pageId: string, blockId: string | null, prompt: string) => {
    // Create a new block for the typewriter to write into
    const newBlockId = get().createBlock(pageId, null, blockId, '✍️ Writing...', 'paragraph');

    set({
      noteAI: {
        isGenerating: true,
        targetPageId: pageId,
        targetBlockId: blockId,
        generatedText: '',
        prompt,
        writeToNote: true,
        typewriterBlockId: newBlockId,
      },
      // Set editing focus to the new block for visual feedback
      editingBlockId: newBlockId,
    });
    // Connect to SSE — the handler will write tokens into the block
    connectNoteAISSE(set, get);
  },

  appendNoteAIText: (text: string) =>
    set((s) => ({
      noteAI: { ...s.noteAI, generatedText: s.noteAI.generatedText + text },
    })),

  stopNoteAIGeneration: () => {
    // Abort the SSE fetch if active
    if (_noteAIAbortController) {
      _noteAIAbortController.abort();
      _noteAIAbortController = null;
    }
    set((s) => ({
      noteAI: { ...s.noteAI, isGenerating: false, writeToNote: false, typewriterBlockId: null },
    }));
  },

  // ═════════════════════════════════════════════════════════════════
  // Vault System
  // ═════════════════════════════════════════════════════════════════

  loadVaultIndex: () => {
    // Try loading from SQLite first, then fall back to localStorage.
    // Also handles one-time migration from localStorage → SQLite.
    (async () => {
      try {
        const hasMigrated = await checkMigrationStatus();

        if (hasMigrated) {
          // SQLite is the source of truth — load from server
          const dbVaults = await loadVaultsFromDb();
          const activeVaultId = readString(STORAGE_KEY_ACTIVE_VAULT);
          set({
            vaults: dbVaults,
            activeVaultId: activeVaultId || (dbVaults[0]?.id ?? null),
            vaultReady: true,
          });
          return;
        }

        // SQLite is empty — load from localStorage (legacy path)
        let vaults: Vault[] = readVersioned<Vault[]>(STORAGE_KEY_VAULTS, VAULTS_VERSION) ?? [];
        const activeVaultId = readString(STORAGE_KEY_ACTIVE_VAULT);

        // Migrate: if old non-vault data exists, create a default vault
        const legacyPages = readString('pfc-note-pages');
        if (legacyPages && vaults.length === 0) {
          const defaultVault: Vault = {
            id: generateVaultId(),
            name: 'My Vault',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            pageCount: 0,
          };
          vaults = [defaultVault];
          const legacyBlocks = readString('pfc-note-blocks');
          const legacyBooks = readString('pfc-note-books');
          if (legacyPages) writeString(vaultKey(defaultVault.id, 'pages'), legacyPages);
          if (legacyBlocks) writeString(vaultKey(defaultVault.id, 'blocks'), legacyBlocks);
          if (legacyBooks) writeString(vaultKey(defaultVault.id, 'books'), legacyBooks);
          removeStorage('pfc-note-pages');
          removeStorage('pfc-note-blocks');
          removeStorage('pfc-note-books');
          writeVersioned(STORAGE_KEY_VAULTS, VAULTS_VERSION, vaults);
          writeString(STORAGE_KEY_ACTIVE_VAULT, defaultVault.id);
        }

        set({
          vaults,
          activeVaultId: activeVaultId || (vaults[0]?.id ?? null),
          vaultReady: true,
        });

        // ── Async: migrate localStorage vaults to SQLite (one-time) ──
        if (vaults.length > 0) {
          triggerMigration(vaults, get);
        }
      } catch {
        // Fallback: load from localStorage if server is down
        const vaults: Vault[] = readVersioned<Vault[]>(STORAGE_KEY_VAULTS, VAULTS_VERSION) ?? [];
        const activeVaultId = readString(STORAGE_KEY_ACTIVE_VAULT);
        set({
          vaults,
          activeVaultId: activeVaultId || (vaults[0]?.id ?? null),
          vaultReady: true,
        });
      }
    })();
  },

  createVault: (name: string): string => {
    const vault: Vault = {
      id: generateVaultId(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pageCount: 0,
    };
    set((s) => ({ vaults: [...s.vaults, vault] }));
    writeVersioned(STORAGE_KEY_VAULTS, VAULTS_VERSION, get().vaults);
    // Async: persist to SQLite
    upsertVaultOnServer(vault).catch(() => {});
    return vault.id;
  },

  switchVault: (vaultId: string) => {
    // Save current vault to localStorage (sync) + SQLite (async) before switching
    const s = get();
    const oldVid = s.activeVaultId;
    if (oldVid) {
      writeVersioned(vaultKey(oldVid, 'pages'), VAULT_DATA_VERSION, s.notePages);
      writeVersioned(vaultKey(oldVid, 'blocks'), VAULT_DATA_VERSION, s.noteBlocks);
      writeVersioned(vaultKey(oldVid, 'books'), VAULT_DATA_VERSION, s.noteBooks);
      writeVersioned(vaultKey(oldVid, 'concepts'), VAULT_DATA_VERSION, s.concepts);
      // Async: flush to SQLite before switch
      const oldVault = s.vaults.find((v: Vault) => v.id === oldVid);
      if (oldVault) {
        syncVaultToServer(oldVid, oldVault, s.notePages, s.noteBlocks, s.noteBooks, s.concepts, s.pageLinks).catch(() => {});
      }
    }
    // Clear current data and switch
    set({
      notePages: [],
      noteBlocks: [],
      noteBooks: [],
      pageLinks: [],
      concepts: [],
      conceptCorrelations: [],
      activePageId: null,
      editingBlockId: null,
      activeVaultId: vaultId,
    });
    writeString(STORAGE_KEY_ACTIVE_VAULT, vaultId);
    // Load new vault's data
    get().loadNotesFromStorage();
  },

  deleteVault: (vaultId: string) => {
    // Remove vault data from localStorage
    removeStorage(vaultKey(vaultId, 'pages'));
    removeStorage(vaultKey(vaultId, 'blocks'));
    removeStorage(vaultKey(vaultId, 'books'));
    removeStorage(vaultKey(vaultId, 'concepts'));
    // Async: delete from SQLite (cascade deletes pages, blocks, etc.)
    deleteVaultOnServer(vaultId).catch(() => {});
    set((s) => {
      const vaults = s.vaults.filter((v: Vault) => v.id !== vaultId);
      writeVersioned(STORAGE_KEY_VAULTS, VAULTS_VERSION, vaults);
      const newActiveId = s.activeVaultId === vaultId ? (vaults[0]?.id ?? null) : s.activeVaultId;
      if (newActiveId !== s.activeVaultId) {
        if (newActiveId) {
          writeString(STORAGE_KEY_ACTIVE_VAULT, newActiveId);
        } else {
          removeStorage(STORAGE_KEY_ACTIVE_VAULT);
        }
      }
      return { vaults, activeVaultId: newActiveId };
    });
  },

  renameVault: (vaultId: string, name: string) => {
    set((s) => {
      const vaults = s.vaults.map((v: Vault) => v.id === vaultId ? { ...v, name, updatedAt: Date.now() } : v);
      writeVersioned(STORAGE_KEY_VAULTS, VAULTS_VERSION, vaults);
      // Async: persist renamed vault to SQLite
      const updated = vaults.find((v: Vault) => v.id === vaultId);
      if (updated) upsertVaultOnServer(updated).catch(() => {});
      return { vaults };
    });
  },

  // ═════════════════════════════════════════════════════════════════
  // Concepts
  // ═════════════════════════════════════════════════════════════════

  extractConcepts: (pageId: string) => {
    const s = get();
    const pageBlocks = s.noteBlocks.filter((b: NoteBlock) => b.pageId === pageId);
    const newConcepts: Concept[] = [];

    for (const block of pageBlocks) {
      const text = stripHtml(block.content).trim();
      if (!text) continue;

      // Extract headings as concepts
      if (block.type === 'heading') {
        newConcepts.push({
          id: `concept-${block.id}`,
          name: text,
          sourcePageId: pageId,
          sourceBlockId: block.id,
          type: 'heading',
          context: text,
          createdAt: Date.now(),
        });
      }

      // Extract bold/strong terms as key concepts
      const boldMatches = block.content.matchAll(/<(?:strong|b)>([^<]+)<\/(?:strong|b)>/gi);
      for (const match of boldMatches) {
        const term = match[1]!.trim();
        if (term.length > 2 && term.length < 100) {
          newConcepts.push({
            id: `concept-bold-${block.id}-${term.slice(0, 20)}`,
            name: term,
            sourcePageId: pageId,
            sourceBlockId: block.id,
            type: 'key-term',
            context: text.slice(0, 150),
            createdAt: Date.now(),
          });
        }
      }

      // Extract [[linked]] terms as concepts
      const linkMatches = text.matchAll(/\[\[([^\]]+)\]\]/g);
      for (const match of linkMatches) {
        newConcepts.push({
          id: `concept-link-${block.id}-${match[1]!.slice(0, 20)}`,
          name: match[1]!,
          sourcePageId: pageId,
          sourceBlockId: block.id,
          type: 'entity',
          context: text.slice(0, 150),
          createdAt: Date.now(),
        });
      }
    }

    // Merge with existing concepts (replace page's concepts)
    set((s) => ({
      concepts: [
        ...s.concepts.filter((c: Concept) => c.sourcePageId !== pageId),
        ...newConcepts,
      ],
    }));
  },

  addConcept: (partial: Omit<Concept, 'id' | 'createdAt'>): string => {
    const id = `concept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const concept: Concept = { ...partial, id, createdAt: Date.now() };
    set((s) => ({ concepts: [...s.concepts, concept] }));
    return id;
  },

  removeConcept: (conceptId: string) => {
    set((s) => ({
      concepts: s.concepts.filter((c: Concept) => c.id !== conceptId),
    }));
  },

  getPageConcepts: (pageId: string): Concept[] => {
    return get().concepts.filter((c: Concept) => c.sourcePageId === pageId);
  },

  correlatePages: (pageAId: string, pageBId: string): ConceptCorrelation[] => {
    const s = get();
    const conceptsA = s.concepts.filter((c: Concept) => c.sourcePageId === pageAId);
    const conceptsB = s.concepts.filter((c: Concept) => c.sourcePageId === pageBId);
    const correlations: ConceptCorrelation[] = [];

    // Find shared concepts (same name or similar)
    for (const a of conceptsA) {
      for (const b of conceptsB) {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        if (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA)) {
          correlations.push({
            id: `corr-${a.id}-${b.id}`,
            conceptAId: a.id,
            conceptBId: b.id,
            pageAId: pageAId,
            pageBId: pageBId,
            correlationType: 'shared-concept',
            description: `Both pages discuss "${a.name}"`,
            strength: nameA === nameB ? 1.0 : 0.7,
            createdAt: Date.now(),
          });
        }
      }
    }

    // Find [[link]] references between pages
    const blocksA = s.noteBlocks.filter((b: NoteBlock) => b.pageId === pageAId);
    const blocksB = s.noteBlocks.filter((b: NoteBlock) => b.pageId === pageBId);
    const pageA = s.notePages.find((p: NotePage) => p.id === pageAId);
    const pageB = s.notePages.find((p: NotePage) => p.id === pageBId);

    if (pageA && pageB) {
      const aLinksToB = blocksA.some((b: NoteBlock) =>
        b.refs.some((r: string) => normalizePageName(r) === pageB.name)
      );
      const bLinksToA = blocksB.some((b: NoteBlock) =>
        b.refs.some((r: string) => normalizePageName(r) === pageA.name)
      );

      if (aLinksToB || bLinksToA) {
        correlations.push({
          id: `corr-link-${pageAId}-${pageBId}`,
          conceptAId: pageAId,
          conceptBId: pageBId,
          pageAId, pageBId,
          correlationType: aLinksToB && bLinksToA ? 'supporting' : 'hierarchical',
          description: aLinksToB && bLinksToA
            ? `"${pageA.title}" and "${pageB.title}" reference each other`
            : aLinksToB
              ? `"${pageA.title}" links to "${pageB.title}"`
              : `"${pageB.title}" links to "${pageA.title}"`,
          strength: aLinksToB && bLinksToA ? 0.9 : 0.6,
          createdAt: Date.now(),
        });
      }
    }

    set({ conceptCorrelations: correlations });
    return correlations;
  },

  // ═════════════════════════════════════════════════════════════════
  // Persistence (vault-scoped)
  // ═════════════════════════════════════════════════════════════════

  loadNotesFromStorage: () => {
    const activeVaultId = get().activeVaultId;
    if (!activeVaultId) return;

    // Try SQLite first, fall back to localStorage
    (async () => {
      try {
        const dbData = await loadVaultDataFromDb(activeVaultId);
        if (dbData && (dbData.pages.length > 0 || dbData.blocks.length > 0)) {
          // SQLite has data — use it as source of truth
          set({
            notePages: dbData.pages,
            noteBlocks: dbData.blocks,
            noteBooks: dbData.books,
            concepts: dbData.concepts,
            pageLinks: dbData.pageLinks,
          });
          return;
        }
      } catch {
        // Server unavailable — fall through to localStorage
      }

      // Fallback: load from localStorage (legacy or offline)
      const notePages = readVersioned<NotePage[]>(vaultKey(activeVaultId, 'pages'), VAULT_DATA_VERSION) ?? [];
      const rawBlocks = readVersioned<NoteBlock[]>(vaultKey(activeVaultId, 'blocks'), VAULT_DATA_VERSION) ?? [];
      const noteBlocks = rawBlocks.map(migrateBlock);
      const noteBooks = readVersioned<NoteBook[]>(vaultKey(activeVaultId, 'books'), VAULT_DATA_VERSION) ?? [];
      const concepts = readVersioned<Concept[]>(vaultKey(activeVaultId, 'concepts'), VAULT_DATA_VERSION) ?? [];

      set({ notePages, noteBlocks, noteBooks, concepts });
      get().rebuildPageLinks();
    })();
  },

  saveNotesToStorage: () => {
    const s = get();
    const vid = s.activeVaultId;
    if (!vid) return;

    // Still save to localStorage as backup
    writeVersioned(vaultKey(vid, 'pages'), VAULT_DATA_VERSION, s.notePages);
    writeVersioned(vaultKey(vid, 'blocks'), VAULT_DATA_VERSION, s.noteBlocks);
    writeVersioned(vaultKey(vid, 'books'), VAULT_DATA_VERSION, s.noteBooks);
    writeVersioned(vaultKey(vid, 'concepts'), VAULT_DATA_VERSION, s.concepts);

    // Update vault page count
    set((st) => ({
      vaults: st.vaults.map((v: Vault) =>
        v.id === vid ? { ...v, pageCount: s.notePages.length, updatedAt: Date.now() } : v
      ),
    }));
    writeVersioned(STORAGE_KEY_VAULTS, VAULTS_VERSION, get().vaults);

    // Async: write-through to SQLite
    const vault = get().vaults.find((v: Vault) => v.id === vid);
    if (vault) {
      syncVaultToServer(vid, vault, s.notePages, s.noteBlocks, s.noteBooks, s.concepts, s.pageLinks).catch(() => {});
    }
  },

  // ── Internal: rebuild page links ──

  rebuildPageLinks: () => {
    const s = get();
    // Build indexed lookup: O(m) once instead of O(m) per block
    const pageByName = new Map<string, string>();
    for (const p of s.notePages) {
      pageByName.set(normalizePageName(p.name), p.id);
    }
    const links: PageLink[] = [];
    for (const block of s.noteBlocks) {
      const pageRefs = extractPageLinks(block.content);
      for (const ref of pageRefs) {
        const targetPageId = pageByName.get(normalizePageName(ref));
        if (targetPageId) {
          links.push({
            sourcePageId: block.pageId,
            targetPageId,
            sourceBlockId: block.id,
            context: stripHtml(block.content).slice(0, 100),
          });
        }
      }
    }
    set({ pageLinks: links });
  },

  getBacklinks: (pageId: string): PageLink[] => {
    const s = get();
    return s.pageLinks.filter((l: PageLink) => l.targetPageId === pageId);
  },
});

// ── Incremental page-link update for a single block ──
// Removes existing links where sourceBlockId === blockId, then re-extracts
// links from that block's current content and appends them.
// O(L + R) where L = existing links and R = refs in the block, vs O(N*R)
// for the full rebuildPageLinks over all N blocks.
function updateBlockLinks(blockId: string, set: PFCSet, get: PFCGet) {
  const s = get();
  const block = s.noteBlocks.find((b: NoteBlock) => b.id === blockId);
  if (!block) return;

  // Build page name → id lookup
  const pageByName = new Map<string, string>();
  for (const p of s.notePages) {
    pageByName.set(normalizePageName(p.name), p.id);
  }

  // Remove old links from this block
  const filtered = s.pageLinks.filter((l: PageLink) => l.sourceBlockId !== blockId);

  // Extract new links from the block's current content
  const pageRefs = extractPageLinks(block.content);
  const newLinks: PageLink[] = [];
  for (const ref of pageRefs) {
    const targetPageId = pageByName.get(normalizePageName(ref));
    if (targetPageId) {
      newLinks.push({
        sourcePageId: block.pageId,
        targetPageId,
        sourceBlockId: block.id,
        context: stripHtml(block.content).slice(0, 100),
      });
    }
  }

  set({ pageLinks: [...filtered, ...newLinks] });
}

// ── Debounced save helper ──
function debouncedSave(get: PFCGet) {
  if (_notesSaveTimer) clearTimeout(_notesSaveTimer);
  _notesSaveTimer = setTimeout(() => {
    _notesSaveTimer = null;
    get().saveNotesToStorage();
  }, 300);
}

// ── One-time localStorage → SQLite migration ──
// Reads all vault data from localStorage and pushes to SQLite via API.
// Non-blocking — runs in background after loadVaultIndex completes.
async function triggerMigration(vaults: Vault[], get: PFCGet) {
  try {
    const migrationPayload: Array<{
      vault: Vault;
      pages: NotePage[];
      blocks: NoteBlock[];
      books: NoteBook[];
      concepts: Concept[];
      pageLinks: PageLink[];
    }> = [];

    for (const vault of vaults) {
      const pages: NotePage[] = readVersioned<NotePage[]>(vaultKey(vault.id, 'pages'), VAULT_DATA_VERSION) ?? [];
      const rawBlocks: NoteBlock[] = readVersioned<NoteBlock[]>(vaultKey(vault.id, 'blocks'), VAULT_DATA_VERSION) ?? [];
      const blocks = rawBlocks.map(migrateBlock);
      const books: NoteBook[] = readVersioned<NoteBook[]>(vaultKey(vault.id, 'books'), VAULT_DATA_VERSION) ?? [];
      const concepts: Concept[] = readVersioned<Concept[]>(vaultKey(vault.id, 'concepts'), VAULT_DATA_VERSION) ?? [];

      // Build page links from block content
      const pageByName = new Map<string, string>();
      for (const p of pages) pageByName.set(normalizePageName(p.name), p.id);
      const pageLinks: PageLink[] = [];
      for (const block of blocks) {
        for (const ref of extractPageLinks(block.content)) {
          const targetId = pageByName.get(normalizePageName(ref));
          if (targetId) {
            pageLinks.push({
              sourcePageId: block.pageId,
              targetPageId: targetId,
              sourceBlockId: block.id,
              context: stripHtml(block.content).slice(0, 100),
            });
          }
        }
      }

      migrationPayload.push({ vault, pages, blocks, books, concepts, pageLinks });
    }

    const result = await migrateToSqlite(migrationPayload);
    if (result.ok && !result.skipped) {
      logger.info('notes', 'Migration to SQLite complete:', migrationPayload.length, 'vaults');
    }
  } catch (err) {
    logger.warn('notes', 'Migration to SQLite failed (will retry next load):', err);
  }
}
