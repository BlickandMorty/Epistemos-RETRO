import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { NoteBlock } from '@/lib/notes/types';
import { FrameIcon, Loader2Icon } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TransclusionBlock — Renders embedded/transcluded block content
// Shows live-updating content from another block
// ═══════════════════════════════════════════════════════════════════

interface TransclusionBlockProps {
  blockId: string;
  pageId?: string;
  className?: string;
}

interface TransclusionContent {
  content: string;
  pageTitle: string;
  isStale: boolean;
}

export function TransclusionBlock({ blockId, pageId, className }: TransclusionBlockProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark' || resolvedTheme === 'oled' || resolvedTheme === 'cosmic';

  const [content, setContent] = useState<TransclusionContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load transcluded block content
  const loadTranscludedContent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await invoke<{ content: string; page_id: string; id: string } | null>('get_transcluded_block', {
        blockId,
      });

      if (result) {
        setContent({
          content: result.content,
          pageTitle: 'Transcluded Block', // Would be enriched with page info
          isStale: false,
        });
      } else {
        setError('Block not found');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transclusion');
    } finally {
      setLoading(false);
    }
  }, [blockId]);

  // Initial load
  useEffect(() => {
    loadTranscludedContent();
  }, [loadTranscludedContent]);

  // Listen for refresh events
  useEffect(() => {
    const unlisten = listen('transclusion-refresh', (event) => {
      const payload = event.payload as { block_id?: string; page_id?: string };
      if (payload.block_id === blockId || payload.page_id === pageId) {
        loadTranscludedContent();
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [blockId, pageId, loadTranscludedContent]);

  if (loading) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          borderRadius: '8px',
          background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.03)' : 'rgba(var(--pfc-accent-rgb), 0.02)',
          border: `1px solid ${isDark ? 'rgba(var(--pfc-accent-rgb), 0.1)' : 'rgba(var(--pfc-accent-rgb), 0.15)'}`,
          color: isDark ? 'rgba(155,150,137,0.5)' : 'rgba(0,0,0,0.35)',
        }}
      >
        <Loader2Icon style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.8125rem' }}>Loading transcluded content...</span>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={className}
        style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.04)',
          border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)'}`,
          color: isDark ? 'rgba(239,68,68,0.8)' : 'rgba(239,68,68,0.9)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem' }}>
          <FrameIcon style={{ width: '14px', height: '14px' }} />
          <span>Transclusion error: {error}</span>
        </div>
      </div>
    );
  }

  if (!content) {
    return null;
  }

  // Strip HTML tags for preview (matches backend strip_html)
  const previewText = content.content
    .replace(/[<>]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .slice(0, 200);

  return (
    <div
      className={className}
      style={{
        border: `1px solid ${isDark ? 'rgba(var(--pfc-accent-rgb), 0.15)' : 'rgba(var(--pfc-accent-rgb), 0.2)'}`,
        borderRadius: '8px',
        padding: '12px 16px',
        background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.03)' : 'rgba(var(--pfc-accent-rgb), 0.02)',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isDark
          ? 'rgba(var(--pfc-accent-rgb), 0.05)'
          : 'rgba(var(--pfc-accent-rgb), 0.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isDark
          ? 'rgba(var(--pfc-accent-rgb), 0.03)'
          : 'rgba(var(--pfc-accent-rgb), 0.02)';
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: isDark ? 'rgba(var(--pfc-accent-rgb), 0.6)' : 'rgba(var(--pfc-accent-rgb), 0.7)',
          marginBottom: '8px',
        }}
      >
        <FrameIcon style={{ width: '12px', height: '12px' }} />
        <span>Transcluded from {content.pageTitle}</span>
      </div>
      <div
        style={{
          fontSize: '0.8125rem',
          lineHeight: 1.6,
          color: isDark ? 'rgba(232,228,222,0.7)' : 'rgba(0,0,0,0.6)',
          fontStyle: previewText.length >= 200 ? 'italic' : 'normal',
        }}
      >
        {previewText || '(empty block)'}
        {content.content.length > 200 && '...'}
      </div>
    </div>
  );
}
