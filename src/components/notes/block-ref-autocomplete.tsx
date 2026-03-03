import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { invoke } from '@tauri-apps/api/core';
import type { BlockSearchResult } from '@/lib/notes/types';
import { FileTextIcon, Loader2Icon, TextIcon } from 'lucide-react';

export type { BlockSearchResult };

// ═══════════════════════════════════════════════════════════════════
// BlockRefAutocomplete — Fuzzy search for block references when typing ((
// Shows matching blocks with preview text and page context
// Similar to transclusion but for inline block references
// ═══════════════════════════════════════════════════════════════════

interface BlockRefAutocompleteProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (result: BlockSearchResult) => void;
  onClose: () => void;
  selectedIndex?: number;
}

// Highlight matching text in the preview
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            style={{
              background: 'rgba(var(--pfc-accent-rgb), 0.25)',
              color: 'inherit',
              borderRadius: '2px',
              padding: '0 2px',
            }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function BlockRefAutocomplete({
  query,
  position,
  onSelect,
  onClose,
  selectedIndex = 0,
}: BlockRefAutocompleteProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark' || resolvedTheme === 'oled' || resolvedTheme === 'cosmic';

  const [results, setResults] = useState<BlockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalIndex, setInternalIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Use external or internal selected index
  const activeIndex = selectedIndex !== undefined ? selectedIndex : internalIndex;

  // Debounced search
  useEffect(() => {
    const searchBlocks = async () => {
      if (!query.trim()) {
        // When no query, show recent blocks (empty query returns recent)
        try {
          setLoading(true);
          const searchResults = await invoke<BlockSearchResult[]>('search_blocks', {
            query: '',
            limit: 10,
          });
          setResults(searchResults);
        } catch (e) {
          console.error('Failed to fetch recent blocks:', e);
          setResults([]);
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const searchResults = await invoke<BlockSearchResult[]>('search_blocks', {
          query: query.trim(),
          limit: 10,
        });
        setResults(searchResults);
      } catch (e) {
        console.error('Failed to search blocks:', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(searchBlocks, 150);
    return () => clearTimeout(timeout);
  }, [query]);

  // Reset index when results change
  useEffect(() => {
    setInternalIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!menuRef.current) return;
    const el = menuRef.current.querySelector('[data-selected="true"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (results.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setInternalIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setInternalIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[activeIndex]) {
            onSelect(results[activeIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, activeIndex, onSelect, onClose]);

  // Empty state when no results
  const showEmptyState = results.length === 0 && !loading;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 'var(--z-modal)',
        width: '22rem',
        maxHeight: '20rem',
        overflowY: 'auto',
        borderRadius: '12px',
        background: isDark ? 'rgba(40,36,30,0.95)' : 'rgba(255,255,255,0.97)',
        border: `1px solid ${isDark ? 'rgba(79,69,57,0.4)' : 'rgba(0,0,0,0.05)'}`,
        boxShadow: isDark
          ? '0 8px 32px rgba(0,0,0,0.5)'
          : '0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '6px',
        backdropFilter: 'blur(20px) saturate(1.5)',
        animation: 'toolbar-in 0.12s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: '0.625rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: isDark ? 'rgba(155,150,137,0.4)' : 'rgba(0,0,0,0.25)',
          padding: '6px 8px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{query.trim() ? 'Block References' : 'Recent Blocks'}</span>
        {loading && <Loader2Icon style={{ width: '12px', height: '12px', animation: 'spin 1s linear infinite' }} />}
      </div>

      {/* Results */}
      {showEmptyState ? (
        <div
          style={{
            padding: '12px 8px',
            fontSize: '0.75rem',
            color: isDark ? 'rgba(155,150,137,0.5)' : 'rgba(0,0,0,0.35)',
            textAlign: 'center',
          }}
        >
          No blocks found
        </div>
      ) : (
        results.map((result, idx) => {
          const isSelected = idx === activeIndex;
          return (
            <button
              key={result.block_id}
              data-selected={isSelected ? 'true' : undefined}
              onClick={() => onSelect(result)}
              onMouseDown={(e) => e.preventDefault()}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                width: '100%',
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                background: isSelected
                  ? isDark
                    ? 'rgba(var(--pfc-accent-rgb), 0.12)'
                    : 'rgba(var(--pfc-accent-rgb), 0.08)'
                  : 'transparent',
                color: isDark ? 'rgba(232,228,222,0.9)' : 'rgba(0,0,0,0.8)',
                transition: 'background 0.1s',
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.08)' : 'rgba(0,0,0,0.04)',
                  flexShrink: 0,
                }}
              >
                <TextIcon style={{ width: '13px', height: '13px', color: 'var(--pfc-accent)' }} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: isDark ? 'rgba(232,228,222,0.85)' : 'rgba(0,0,0,0.85)',
                  }}
                >
                  <HighlightMatch text={result.preview_text || '(empty block)'} query={query} />
                </div>
                <div
                  style={{
                    fontSize: '0.6875rem',
                    color: isDark ? 'rgba(155,150,137,0.6)' : 'rgba(0,0,0,0.45)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <FileTextIcon style={{ width: '10px', height: '10px', flexShrink: 0 }} />
                  {result.page_title}
                </div>
              </div>
            </button>
          );
        })
      )}

      {/* Footer hint */}
      <div
        style={{
          fontSize: '0.625rem',
          color: isDark ? 'rgba(155,150,137,0.35)' : 'rgba(0,0,0,0.25)',
          padding: '6px 8px 2px',
          borderTop: `1px solid ${isDark ? 'rgba(79,69,57,0.2)' : 'rgba(0,0,0,0.05)'}`,
          marginTop: '4px',
          display: 'flex',
          gap: '12px',
        }}
      >
        <span>↑↓ to navigate</span>
        <span>Enter to select</span>
        <span>Esc to close</span>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export type { BlockSearchResult };
