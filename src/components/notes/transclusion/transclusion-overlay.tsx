import { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { invoke } from '@tauri-apps/api/core';
import type { NoteBlock } from '@/lib/notes/types';
import { FrameIcon, FileTextIcon, Loader2Icon, ExternalLinkIcon } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// TransclusionOverlay — Shows information about a transclusion on hover
// Displays source page, block content preview, and backlinks count
// ═══════════════════════════════════════════════════════════════════

interface TransclusionOverlayProps {
  blockId: string;
  sourcePageId?: string; // Reserved for future use
  isOpen: boolean;
  onClose: () => void;
  onNavigateToSource?: () => void;
}

interface OverlayData {
  block: NoteBlock | null;
  transcludingPages: string[];
}

export function TransclusionOverlay({
  blockId,
  sourcePageId: _sourcePageId,
  isOpen,
  onClose,
  onNavigateToSource,
}: TransclusionOverlayProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark' || resolvedTheme === 'oled' || resolvedTheme === 'cosmic';

  const [data, setData] = useState<OverlayData | null>(null);
  const [loading, setLoading] = useState(false);

  // Load overlay data
  useEffect(() => {
    if (!isOpen) {
      setData(null);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);

        // Get the transcluded block
        const block = await invoke<NoteBlock | null>('get_transcluded_block', { blockId });

        // Get pages that transclude this block
        const pages = await invoke<string[]>('get_pages_transcluding_block', { blockId });

        setData({
          block,
          transcludingPages: pages,
        });
      } catch (e) {
        console.error('Failed to load transclusion overlay:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, blockId]);

  if (!isOpen) return null;

  const previewText = data?.block?.content
    ? data.block.content
        .replace(/[<>]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .join(' ')
        .slice(0, 150)
    : '';

  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 'var(--z-popover)',
        width: '18rem',
        borderRadius: '10px',
        background: isDark ? 'rgba(40,36,30,0.98)' : 'rgba(255,255,255,0.98)',
        border: `1px solid ${isDark ? 'rgba(79,69,57,0.4)' : 'rgba(0,0,0,0.08)'}`,
        boxShadow: isDark
          ? '0 12px 40px rgba(0,0,0,0.6)'
          : '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '12px',
        backdropFilter: 'blur(20px) saturate(1.5)',
        animation: 'fade-in 0.15s ease-out',
      }}
      onMouseLeave={onClose}
    >
      {loading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '16px',
            color: isDark ? 'rgba(155,150,137,0.5)' : 'rgba(0,0,0,0.35)',
          }}
        >
          <Loader2Icon style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '0.8125rem' }}>Loading...</span>
        </div>
      ) : (
        <>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
              paddingBottom: '10px',
              borderBottom: `1px solid ${isDark ? 'rgba(79,69,57,0.2)' : 'rgba(0,0,0,0.06)'}`,
            }}
          >
            <FrameIcon
              style={{
                width: '16px',
                height: '16px',
                color: 'var(--pfc-accent)',
              }}
            />
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                color: isDark ? 'rgba(var(--pfc-accent-rgb), 0.7)' : 'rgba(var(--pfc-accent-rgb), 0.8)',
              }}
            >
              Block Reference
            </span>
          </div>

          {/* Content Preview */}
          <div
            style={{
              fontSize: '0.8125rem',
              lineHeight: 1.6,
              color: isDark ? 'rgba(232,228,222,0.8)' : 'rgba(0,0,0,0.7)',
              marginBottom: '12px',
              padding: '10px',
              borderRadius: '6px',
              background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
              maxHeight: '6rem',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {previewText || '(empty block)'}
            {previewText.length >= 150 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '1.5rem',
                  background: `linear-gradient(transparent, ${isDark ? 'rgba(0,0,0,0.9)' : 'rgba(245,245,245,0.9)'})`,
                }}
              />
            )}
          </div>

          {/* Backlinks Info */}
          {data && data.transcludingPages.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.6875rem',
                color: isDark ? 'rgba(155,150,137,0.6)' : 'rgba(0,0,0,0.45)',
                marginBottom: '10px',
              }}
            >
              <FileTextIcon style={{ width: '12px', height: '12px' }} />
              <span>
                Referenced in {data.transcludingPages.length} page
                {data.transcludingPages.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Actions */}
          {onNavigateToSource && (
            <button
              onClick={onNavigateToSource}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: `1px solid ${isDark ? 'rgba(var(--pfc-accent-rgb), 0.3)' : 'rgba(var(--pfc-accent-rgb), 0.25)'}`,
                background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.08)' : 'rgba(var(--pfc-accent-rgb), 0.06)',
                color: isDark ? 'rgba(var(--pfc-accent-rgb), 0.9)' : 'rgba(var(--pfc-accent-rgb), 0.95)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDark
                  ? 'rgba(var(--pfc-accent-rgb), 0.12)'
                  : 'rgba(var(--pfc-accent-rgb), 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDark
                  ? 'rgba(var(--pfc-accent-rgb), 0.08)'
                  : 'rgba(var(--pfc-accent-rgb), 0.06)';
              }}
            >
              <ExternalLinkIcon style={{ width: '12px', height: '12px' }} />
              Open Source Block
            </button>
          )}
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
