// ═══════════════════════════════════════════════════════════════════
// Table of Contents Component
// Sidebar panel showing document outline with scroll spy
// Ported from macOS NoteTableOfContents.swift
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import {
  parseTOCFromBlocks,
  buildTOCTree,
  getFlatTOCItems,
  scrollToBlock,
  findActiveHeading,
  debounce,
  type TOCItem,
  type TOCEntry,
} from '@/lib/notes/toc';
import {
  ListIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  HashIcon,
} from 'lucide-react';

// ── TOC Item Component ─────────────────────────────────────────────

interface TOCItemProps {
  item: TOCItem;
  depth: number;
  isActive: boolean;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: (id: string) => void;
  accentColor: string;
  isDark: boolean;
}

function TOCItemComponent({
  item,
  depth,
  isActive,
  expandedIds,
  onToggle,
  onNavigate,
  accentColor,
  isDark,
}: TOCItemProps) {
  const hasChildren = item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);
  const paddingLeft = 12 + depth * 12;

  const handleClick = useCallback(() => {
    onNavigate(item.id);
  }, [item.id, onNavigate]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(item.id);
  }, [item.id, onToggle]);

  const fontSize = item.level <= 2 ? 12 : item.level === 3 ? 11 : 10.5;
  const fontWeight = item.level <= 2 ? 500 : 400;

  return (
    <div>
      <motion.button
        onClick={handleClick}
        whileHover={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '4px 12px 4px 0',
          paddingLeft: `${paddingLeft}px`,
          border: 'none',
          background: isActive ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          position: 'relative',
        }}
      >
        {/* Active indicator */}
        {isActive && (
          <motion.div
            layoutId="toc-active-indicator"
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 3,
              height: '60%',
              background: accentColor,
              borderRadius: '0 2px 2px 0',
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        )}

        {/* Expand/collapse chevron */}
        {hasChildren && (
          <span
            onClick={handleToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 14,
              height: 14,
              marginRight: 4,
              color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
              cursor: 'pointer',
            }}
          >
            {isExpanded ? (
              <ChevronDownIcon style={{ width: 12, height: 12 }} />
            ) : (
              <ChevronRightIcon style={{ width: 12, height: 12 }} />
            )}
          </span>
        )}

        {/* Heading icon for H1/H2 */}
        {item.level <= 2 && !hasChildren && (
          <HashIcon
            style={{
              width: 10,
              height: 10,
              marginRight: 6,
              color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
            }}
          />
        )}

        {/* Text */}
        <span
          style={{
            fontSize: `${fontSize}px`,
            fontWeight,
            color: isActive
              ? accentColor
              : isDark
                ? 'rgba(237,224,212,0.85)'
                : 'rgba(28,27,31,0.85)',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {item.text}
        </span>
      </motion.button>

      {/* Children */}
      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {item.children.map((child) => (
              <TOCItemComponent
                key={child.id}
                item={child}
                depth={depth + 1}
                isActive={isActive && child.id === item.id}
                expandedIds={expandedIds}
                onToggle={onToggle}
                onNavigate={onNavigate}
                accentColor={accentColor}
                isDark={isDark}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────

function EmptyState({ isDark }: { isDark: boolean }) {
  return (
    <div
      style={{
        padding: '24px 16px',
        textAlign: 'center',
        color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
      }}
    >
      <ListIcon
        style={{
          width: 24,
          height: 24,
          margin: '0 auto 8px',
          opacity: 0.5,
        }}
      />
      <p
        style={{
          fontSize: '12px',
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        No headings yet
      </p>
      <p
        style={{
          fontSize: '11px',
          opacity: 0.7,
          margin: '4px 0 0',
        }}
      >
        Add # Heading to structure your note
      </p>
    </div>
  );
}

// ── Main TOC Component ─────────────────────────────────────────────

interface TableOfContentsProps {
  pageId: string;
  isOpen: boolean;
  onClose: () => void;
  accentColor?: string;
}

export function TableOfContents({
  pageId,
  isOpen,
  onClose,
  accentColor = 'var(--pfc-accent)',
}: TableOfContentsProps) {
  const { isDark } = useIsDark();
  const noteBlocks = usePFCStore((s) => s.noteBlocks);

  // TOC state
  const [tocTree, setTocTree] = useState<TOCItem[]>([]);
  const [flatItems, setFlatItems] = useState<TOCItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Refs for scroll spy
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  // Parse blocks when they change
  useEffect(() => {
    const pageBlocks = noteBlocks.filter((b) => b.pageId === pageId);
    const entries = parseTOCFromBlocks(pageBlocks);
    const tree = buildTOCTree(entries);
    const flat = getFlatTOCItems(tree);

    setTocTree(tree);
    setFlatItems(flat);

    // Auto-expand all by default
    if (flat.length > 0) {
      setExpandedIds(new Set(flat.map((item) => item.id)));
    }
  }, [noteBlocks, pageId]);

  // Scroll spy: track which heading is in view
  useEffect(() => {
    if (!isOpen || flatItems.length === 0) return;

    const headingIds = flatItems.map((item) => item.id);

    const updateActiveHeading = () => {
      const active = findActiveHeading(headingIds, scrollContainerRef.current);
      if (active) {
        setActiveId(active);
      }
    };

    // Debounced scroll handler
    const debouncedUpdate = debounce(updateActiveHeading, 100);

    // Find scroll container (the main editor area)
    const findScrollContainer = () => {
      const editorArea = document.querySelector('[data-editor-scroll-area]');
      if (editorArea) {
        scrollContainerRef.current = editorArea as HTMLElement;
      } else {
        // Fallback to window
        scrollContainerRef.current = null;
      }
    };

    findScrollContainer();
    const container = scrollContainerRef.current || window;

    // Initial check
    updateActiveHeading();

    container.addEventListener('scroll', debouncedUpdate, { passive: true });
    return () => {
      container.removeEventListener('scroll', debouncedUpdate);
    };
  }, [isOpen, flatItems]);

  // Toggle expand/collapse
  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Navigate to heading
  const handleNavigate = useCallback((id: string) => {
    scrollToBlock(id, 'smooth');
    setActiveId(id);
  }, []);

  // Collapse all
  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // Expand all
  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(flatItems.map((item) => item.id)));
  }, [flatItems]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        width: 220,
        minWidth: 220,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: isDark ? 'rgba(30,27,24,0.96)' : 'rgba(255,255,255,0.96)',
        borderLeft: isDark ? '1px solid rgba(60,52,42,0.2)' : '1px solid rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: isDark ? '1px solid rgba(60,52,42,0.15)' : '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '11px',
            fontWeight: 600,
            color: isDark ? 'rgba(156,143,128,0.7)' : 'rgba(0,0,0,0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}
        >
          <ListIcon style={{ width: 12, height: 12 }} />
          Contents
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {tocTree.length > 0 && (
            <>
              <button
                onClick={handleCollapseAll}
                title="Collapse all"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: 'none',
                  background: 'transparent',
                  color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                  cursor: 'pointer',
                  fontSize: 10,
                }}
              >
                −
              </button>
              <button
                onClick={handleExpandAll}
                title="Expand all"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: 'none',
                  background: 'transparent',
                  color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                  cursor: 'pointer',
                  fontSize: 10,
                }}
              >
                +
              </button>
            </>
          )}
          <button
            onClick={onClose}
            title="Close"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* TOC List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '6px 0',
        }}
      >
        {tocTree.length === 0 ? (
          <EmptyState isDark={isDark} />
        ) : (
          tocTree.map((item) => (
            <TOCItemComponent
              key={item.id}
              item={item}
              depth={0}
              isActive={item.id === activeId}
              expandedIds={expandedIds}
              onToggle={handleToggle}
              onNavigate={handleNavigate}
              accentColor={accentColor}
              isDark={isDark}
            />
          ))
        )}
      </div>

      {/* Footer with item count */}
      {flatItems.length > 0 && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: isDark ? '1px solid rgba(60,52,42,0.15)' : '1px solid rgba(0,0,0,0.06)',
            fontSize: '10px',
            color: isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.4)',
            textAlign: 'center',
          }}
        >
          {flatItems.length} section{flatItems.length !== 1 ? 's' : ''}
        </div>
      )}
    </motion.div>
  );
}

// ── Floating TOC Button (for toolbar integration) ──────────────────

interface TOCButtonProps {
  isOpen: boolean;
  onClick: () => void;
  isDark: boolean;
}

export function TOCButton({ isOpen, onClick, isDark }: TOCButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      title={isOpen ? 'Hide Table of Contents' : 'Show Table of Contents'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        background: isOpen
          ? 'rgba(var(--pfc-accent-rgb), 0.15)'
          : isDark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.04)',
        color: isOpen ? 'var(--pfc-accent)' : isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      <ListIcon style={{ width: 16, height: 16 }} />
    </motion.button>
  );
}

// ── Export Types ───────────────────────────────────────────────────

export type { TOCItem, TOCEntry };
