'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useTheme } from 'next-themes';
import type { NoteBlock, NotePage, BlockType } from '@/lib/notes/types';
import { stripHtml, normalizePageName } from '@/lib/notes/types';
import { BlockContextMenu } from './context-menu';
import { BlockItem } from './block-renderer';

// ═══════════════════════════════════════════════════════════════════
// BlockEditor — renders all blocks for a page
// Handles floating toolbar, drag-drop coordination, block navigation
// ═══════════════════════════════════════════════════════════════════

export function BlockEditor({ pageId, readOnly, bookLayout }: { pageId: string; readOnly?: boolean; bookLayout?: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme === 'dark' || resolvedTheme === 'oled' || resolvedTheme === 'cosmic' || resolvedTheme === 'sunset');

  const noteBlocks = usePFCStore((s) => s.noteBlocks);
  const notePages = usePFCStore((s) => s.notePages);
  const editingBlockId = usePFCStore((s) => s.editingBlockId);
  const setEditingBlock = usePFCStore((s) => s.setEditingBlock);
  const createBlock = usePFCStore((s) => s.createBlock);
  const moveBlock = usePFCStore((s) => s.moveBlock);
  const setActivePage = usePFCStore((s) => s.setActivePage);
  const ensurePage = usePFCStore((s) => s.ensurePage);

  // Typewriter mode — track which block is being written to
  const typewriterBlockId = usePFCStore((s) => s.noteAI.writeToNote ? s.noteAI.typewriterBlockId : null);
  const isTypewriting = usePFCStore((s) => s.noteAI.writeToNote && s.noteAI.isGenerating);

  // ── Navigate to a page by title (from [[link]] click) ──
  const handleNavigateToPage = useCallback((pageTitle: string) => {
    const normalized = normalizePageName(pageTitle);
    const existing = notePages.find((p: NotePage) => p.name === normalized || p.title === pageTitle);
    if (existing) {
      setActivePage(existing.id);
    } else {
      // Create page if it doesn't exist
      const newId = ensurePage(pageTitle);
      setActivePage(newId);
    }
  }, [notePages, setActivePage, ensurePage]);

  // Context menu state (replaces floating toolbar)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; blockId: string } | null>(null);
  const changeBlockType = usePFCStore((s) => s.changeBlockType);
  const deleteBlock = usePFCStore((s) => s.deleteBlock);

  // Drag state
  const dragSourceRef = useRef<string | null>(null);
  const dragTargetRef = useRef<string | null>(null);

  // Save selection range when context menu opens (restored before format commands)
  const ctxSavedRangeRef = useRef<Range | null>(null);

  // Page blocks sorted, with collapsed heading/toggle children filtered out
  const pageBlocks = useMemo(() => {
    const sorted = noteBlocks
      .filter((b: NoteBlock) => b.pageId === pageId)
      .sort((a: NoteBlock, b: NoteBlock) => a.order.localeCompare(b.order));

    // Build lookup map for parent checks
    const blockById = new Map(sorted.map(b => [b.id, b]));

    const visible: NoteBlock[] = [];
    const hiddenIds = new Set<string>(); // tracks all hidden block IDs for recursive hiding
    let hiddenUntilLevel = -1; // heading collapse: -1 = not hiding

    for (const block of sorted) {
      // 1. If any ancestor is hidden, this block is also hidden (recursive parent collapse)
      if (block.parentId && hiddenIds.has(block.parentId)) {
        hiddenIds.add(block.id);
        continue;
      }

      // 2. Check if direct parent is a collapsed toggle block
      if (block.parentId) {
        const parent = blockById.get(block.parentId);
        if (parent && parent.type === 'toggle' && parent.collapsed) {
          hiddenIds.add(block.id);
          continue;
        }
      }

      // 3. Heading-level collapsing (document order based)
      if (block.type === 'heading') {
        const level = parseInt(block.properties.level || '1', 10);
        if (hiddenUntilLevel > 0) {
          if (level <= hiddenUntilLevel) {
            // Same or higher level heading ends the collapsed section
            hiddenUntilLevel = -1;
          } else {
            hiddenIds.add(block.id);
            continue;
          }
        }
        visible.push(block);
        if (block.collapsed) {
          hiddenUntilLevel = level;
        }
      } else {
        // Non-heading block under collapsed heading section
        if (hiddenUntilLevel > 0) {
          hiddenIds.add(block.id);
          continue;
        }
        visible.push(block);
      }
    }

    return visible;
  }, [noteBlocks, pageId]);

  // ── Context menu handler (right-click → block context menu) ──
  // Always prevent default inside editor to suppress browser menu
  // Save the current selection so format commands can restore it
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Capture current selection before menu steals focus
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      ctxSavedRangeRef.current = sel.getRangeAt(0).cloneContents() ? sel.getRangeAt(0).cloneRange() : null;
    } else {
      ctxSavedRangeRef.current = null;
    }
    const target = e.target as HTMLElement;
    const blockEl = target.closest?.('[data-block-id]');
    const blockId = blockEl?.getAttribute('data-block-id') ?? pageBlocks[0]?.id ?? '';
    if (blockId) {
      setCtxMenu({ x: e.clientX, y: e.clientY, blockId });
    }
  }, [pageBlocks]);

  // ── Format handler for toolbar / context menu ──
  // Pushes undo transaction so Cmd+Z works for format changes
  const handleFormat = useCallback((command: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // Find the block element BEFORE formatting to capture old content
    const preRange = sel.getRangeAt(0);
    const preContainer = preRange.commonAncestorContainer;
    const blockEl = (preContainer.nodeType === 3 ? preContainer.parentElement : preContainer as HTMLElement)?.closest('[data-block-id]') as HTMLElement;
    const oldHtml = blockEl ? blockEl.innerHTML : null;
    const blockId = blockEl?.getAttribute('data-block-id');

    switch (command) {
      case 'bold': document.execCommand('bold', false); break;
      case 'italic': document.execCommand('italic', false); break;
      case 'underline': document.execCommand('underline', false); break;
      case 'strikethrough': document.execCommand('strikeThrough', false); break;
      case 'inlineCode': {
        const range = sel.getRangeAt(0);
        if (range.collapsed) break;
        const code = document.createElement('code');
        code.style.cssText = `
          background: ${isDark ? 'rgba(var(--pfc-accent-rgb), 0.1)' : 'rgba(0,0,0,0.06)'};
          padding: 0.125em 0.35em; border-radius: 4px;
          font-family: var(--font-mono); font-size: 0.875em;
          color: ${isDark ? '#E8B06A' : '#B07D42'};
        `;
        try {
          range.surroundContents(code);
        } catch {
          break;
        }
        break;
      }
      case 'highlight': {
        const range = sel.getRangeAt(0);
        if (range.collapsed) break;
        const mark = document.createElement('mark');
        mark.style.cssText = `background: rgba(251,191,36,0.25); padding: 0 2px; border-radius: 2px;`;
        try {
          range.surroundContents(mark);
        } catch {
          break;
        }
        break;
      }
    }

    // Sync the modified block to store + push undo transaction
    if (blockEl && blockId) {
      const newHtml = blockEl.innerHTML;
      const oldContent = oldHtml === '<br>' ? '' : (oldHtml ?? '');
      const newContent = newHtml === '<br>' ? '' : newHtml;
      if (newContent !== oldContent) {
        usePFCStore.getState().updateBlockContent(blockId, newContent);
        usePFCStore.getState().pushTransaction(
          [{ action: 'update', blockId, pageId, data: { content: newContent } }],
          [{ action: 'update', blockId, pageId, previousData: { content: oldContent } }],
        );
      }
    }
  }, [isDark, pageId]);

  // ── Navigate between blocks ──
  const handleNavigate = useCallback((direction: 'up' | 'down', currentBlockId: string) => {
    const idx = pageBlocks.findIndex((b: NoteBlock) => b.id === currentBlockId);
    if (direction === 'up' && idx > 0) {
      setEditingBlock(pageBlocks[idx - 1]!.id);
    } else if (direction === 'down' && idx < pageBlocks.length - 1) {
      setEditingBlock(pageBlocks[idx + 1]!.id);
    }
  }, [pageBlocks, setEditingBlock]);

  // ── Drag handlers ──
  const handleDragStart = useCallback((blockId: string) => { dragSourceRef.current = blockId; }, []);
  const handleDragOver = useCallback((blockId: string) => { dragTargetRef.current = blockId; }, []);
  const handleDrop = useCallback(() => {
    if (dragSourceRef.current && dragTargetRef.current && dragSourceRef.current !== dragTargetRef.current) {
      const target = pageBlocks.find((b: NoteBlock) => b.id === dragTargetRef.current);
      if (target) {
        moveBlock(dragSourceRef.current, target.parentId, target.id);
      }
    }
    dragSourceRef.current = null;
    dragTargetRef.current = null;
  }, [pageBlocks, moveBlock]);

  // ── Click empty area — add/focus last block ──
  const handleEmptyClick = useCallback(() => {
    if (pageBlocks.length === 0) {
      const newId = createBlock(pageId);
      requestAnimationFrame(() => setEditingBlock(newId));
    } else {
      const lastBlock = pageBlocks[pageBlocks.length - 1]!;
      if (stripHtml(lastBlock.content) !== '' || (lastBlock.type ?? 'paragraph') !== 'paragraph') {
        const newId = createBlock(pageId, null, lastBlock.id);
        requestAnimationFrame(() => setEditingBlock(newId));
      } else {
        setEditingBlock(lastBlock.id);
      }
    }
  }, [pageBlocks, pageId, createBlock, setEditingBlock]);

  // ── Context menu callbacks ──
  const handleCtxFormat = useCallback((command: string) => {
    // Restore saved selection before executing format (menu click steals focus)
    const savedRange = ctxSavedRangeRef.current;
    if (savedRange) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
    }
    handleFormat(command);
    ctxSavedRangeRef.current = null;
  }, [handleFormat]);

  const handleCtxChangeType = useCallback((type: BlockType, props?: Record<string, string>) => {
    if (ctxMenu?.blockId) {
      changeBlockType(ctxMenu.blockId, type, props ?? {});
    }
  }, [ctxMenu, changeBlockType]);

  const handleCtxInsert = useCallback((type: string) => {
    if (!ctxMenu?.blockId) return;
    const newId = createBlock(pageId, null, ctxMenu.blockId, '', type as BlockType);
    requestAnimationFrame(() => setEditingBlock(newId));
  }, [ctxMenu, createBlock, pageId, setEditingBlock]);

  const handleCtxDelete = useCallback(() => {
    if (ctxMenu?.blockId) {
      deleteBlock(ctxMenu.blockId);
    }
  }, [ctxMenu, deleteBlock]);

  const handleCtxPageLink = useCallback(() => {
    if (!ctxMenu?.blockId) return;
    // Focus the block and insert [[ to trigger the bracket popup
    setEditingBlock(ctxMenu.blockId);
    requestAnimationFrame(() => {
      const blockEl = document.querySelector(`[data-block-id="${ctxMenu.blockId}"] [contenteditable]`) as HTMLElement;
      if (!blockEl) return;
      blockEl.focus();
      // Place cursor at end
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(blockEl);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      // Insert [[
      document.execCommand('insertText', false, '[[');
    });
  }, [ctxMenu, setEditingBlock]);

  const handleCtxAI = useCallback((action: string) => {
    if (!ctxMenu?.blockId) return;
    // Dispatch a custom event that the note-AI system can listen for
    window.dispatchEvent(new CustomEvent('pfc-note-ai', {
      detail: { action, blockId: ctxMenu.blockId, pageId },
    }));
  }, [ctxMenu, pageId]);

  const ctxBlock = ctxMenu ? pageBlocks.find((b: NoteBlock) => b.id === ctxMenu.blockId) : null;

  return (
    <>
      {/* Right-click context menu (replaces floating toolbar) */}
      {ctxMenu && ctxBlock && (
        <BlockContextMenu
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          isDark={isDark}
          onClose={() => setCtxMenu(null)}
          onFormat={handleCtxFormat}
          onChangeType={handleCtxChangeType}
          onInsert={handleCtxInsert}
          onDelete={handleCtxDelete}
          onPageLink={handleCtxPageLink}
          onAI={handleCtxAI}
          currentBlockType={ctxBlock.type}
        />
      )}

      {/* Block list — GPU-promoted container with paint containment */}
      <div
        onContextMenu={handleContextMenu}
        data-book-layout={bookLayout ? '' : undefined}
        style={bookLayout ? {
          columnCount: 2,
          columnGap: '3rem',
          columnRule: `1px solid ${isDark ? 'rgba(79,69,57,0.15)' : 'rgba(0,0,0,0.06)'}`,
          contain: 'layout style',
          transform: 'translateZ(0)',
        } : {
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          contain: 'layout style',
          transform: 'translateZ(0)',
        }}
      >
        {pageBlocks.map((block, idx) => (
          <BlockItem
            key={block.id}
            block={block}
            isEditing={editingBlockId === block.id}
            isDark={isDark}
            onFocus={() => setEditingBlock(block.id)}
            pageId={pageId}
            blockIndex={idx}
            totalBlocks={pageBlocks.length}
            onNavigate={(dir) => handleNavigate(dir, block.id)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            readOnly={readOnly || (isTypewriting && block.id === typewriterBlockId)}
            onNavigateToPage={handleNavigateToPage}
            isTypewriterTarget={isTypewriting && block.id === typewriterBlockId}
          />
        ))}

        {/* Click zone to add new blocks */}
        <div
          onClick={handleEmptyClick}
          style={{
            minHeight: '12rem',
            cursor: 'text',
            borderRadius: '8px',
          }}
        />
      </div>

      {/* 60fps styles: all transitions use S-Tier properties (transform, opacity) */}
      <style>{`
        @keyframes drop-line-in {
          from { transform: translateZ(0) scaleX(0); opacity: 0; }
          to   { transform: translateZ(0) scaleX(1); opacity: 0.7; }
        }

        /* Drag ghost: subtle scale + opacity */
        .pfc-block:active[draggable="true"] {
          opacity: 0.5;
        }

        [data-block-id]:empty:before {
          content: attr(data-placeholder);
          color: ${isDark ? 'rgba(155,150,137,0.25)' : 'rgba(0,0,0,0.15)'};
          pointer-events: none;
          position: absolute;
        }
        [data-block-id] strong { font-weight: 700; }
        [data-block-id] em { font-style: italic; }
        [data-block-id] u { text-decoration: underline; text-underline-offset: 2px; }
        [data-block-id] s { text-decoration: line-through; opacity: 0.6; }
        [data-block-id] code {
          background: ${isDark ? 'rgba(var(--pfc-accent-rgb), 0.1)' : 'rgba(0,0,0,0.06)'};
          padding: 0.125em 0.35em;
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 0.875em;
          color: ${isDark ? '#E8B06A' : '#B07D42'};
        }
        [data-block-id] mark {
          background: rgba(251,191,36,0.25);
          padding: 0 2px;
          border-radius: 2px;
        }
        .pfc-page-link {
          color: var(--pfc-accent);
          cursor: pointer;
          border-bottom: 1px solid rgba(var(--pfc-accent-rgb), 0.3);
          font-weight: 500;
          transition: border-color 0.15s, color 0.15s;
          text-decoration: none;
        }
        .pfc-page-link:hover {
          border-bottom-color: var(--pfc-accent);
          color: #D4B896;
        }
        /* Book layout — prevent blocks from splitting across columns */
        [data-book-layout] .pfc-block {
          break-inside: avoid;
          margin-bottom: 0.5rem;
        }
      `}</style>
    </>
  );
}
