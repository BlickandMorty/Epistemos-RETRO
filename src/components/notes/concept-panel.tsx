'use client';

import { memo, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import type { Concept, NotePage } from '@/lib/notes/types';
import {
  XIcon,
  LinkIcon,
  ArrowRightIcon,
  BrainIcon,
  LayersIcon,
  GitBranchIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';

import { ease } from '@/lib/motion/motion-config';

const CUPERTINO = ease.cupertino;

const TYPE_ICONS: Record<string, LucideIcon> = {
  'shared-concept': LinkIcon,
  'causal': ZapIcon,
  'hierarchical': GitBranchIcon,
  'opposing': XIcon,
  'supporting': LayersIcon,
};

const TYPE_COLORS: Record<string, string> = {
  'shared-concept': 'var(--pfc-accent)',
  'causal': '#E07850',
  'hierarchical': '#8B7CF6',
  'opposing': '#EF4444',
  'supporting': '#34D399',
};

interface ConceptCorrelationPanelProps {
  pageAId: string;
  pageBId: string;
  onClose: () => void;
}

export const ConceptCorrelationPanel = memo(function ConceptCorrelationPanel({
  pageAId,
  pageBId,
  onClose,
}: ConceptCorrelationPanelProps) {
  const { isDark } = useIsDark();

  const notePages = usePFCStore((s) => s.notePages);
  const extractConcepts = usePFCStore((s) => s.extractConcepts);
  const correlatePages = usePFCStore((s) => s.correlatePages);
  const concepts = usePFCStore((s) => s.concepts);

  const pageA = notePages.find((p: NotePage) => p.id === pageAId);
  const pageB = notePages.find((p: NotePage) => p.id === pageBId);

  useEffect(() => {
    extractConcepts(pageAId);
    extractConcepts(pageBId);
  }, [pageAId, pageBId, extractConcepts]);

  const conceptsA = useMemo(
    () => concepts.filter((c: Concept) => c.sourcePageId === pageAId),
    [concepts, pageAId],
  );
  const conceptsB = useMemo(
    () => concepts.filter((c: Concept) => c.sourcePageId === pageBId),
    [concepts, pageBId],
  );
  const correlations = useMemo(
    () => correlatePages(pageAId, pageBId),
    [pageAId, pageBId, correlatePages, concepts],
  );

  const glassBg = isDark ? 'rgba(25,23,20,0.96)' : 'rgba(255,255,255,0.97)';
  const border = isDark ? 'rgba(79,69,57,0.35)' : 'rgba(208,196,180,0.3)';
  const text = isDark ? 'rgba(237,224,212,0.95)' : 'rgba(28,27,31,0.9)';
  const muted = isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.35)';
  const accent = 'var(--pfc-accent)';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-popover)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ duration: 0.35, ease: CUPERTINO }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          background: glassBg,
          border: `1px solid ${border}`,
          borderRadius: 16,
          backdropFilter: 'blur(12px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(12px) saturate(1.2)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BrainIcon style={{ width: 18, height: 18, color: accent }} />
            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: text, letterSpacing: '-0.01em' }}>
              Concept Correlation
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6, border: 'none',
              background: 'transparent', color: muted, cursor: 'pointer',
            }}
          >
            <XIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Pages being compared */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.03)' : 'rgba(var(--pfc-accent-rgb), 0.02)',
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
        }}>
          <div style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.06)' : 'rgba(var(--pfc-accent-rgb), 0.04)',
            border: `1px solid ${accent}20`,
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text }}>
              {pageA?.title ?? 'Unknown'}
            </div>
            <div style={{ fontSize: '0.625rem', color: muted, marginTop: 2 }}>
              {conceptsA.length} concept{conceptsA.length !== 1 ? 's' : ''}
            </div>
          </div>

          <ArrowRightIcon style={{ width: 16, height: 16, color: muted, flexShrink: 0 }} />

          <div style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            background: isDark ? 'rgba(139,124,246,0.06)' : 'rgba(139,124,246,0.04)',
            border: `1px solid rgba(139,124,246,0.2)`,
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text }}>
              {pageB?.title ?? 'Unknown'}
            </div>
            <div style={{ fontSize: '0.625rem', color: muted, marginTop: 2 }}>
              {conceptsB.length} concept{conceptsB.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Correlations */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          scrollbarWidth: 'thin',
        }}>
          {correlations.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '2rem', color: muted, fontSize: '0.8125rem',
              lineHeight: 1.6,
            }}>
              No direct correlations found between these pages.
              <br />
              Try adding [[links]] or shared terminology.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                fontSize: '0.6875rem', fontWeight: 700, color: muted,
                textTransform: 'uppercase', letterSpacing: '0.05em',
                marginBottom: 4,
              }}>
                {correlations.length} Connection{correlations.length !== 1 ? 's' : ''} Found
              </div>

              {correlations.map((corr) => {
                const TypeIcon = TYPE_ICONS[corr.correlationType] ?? LinkIcon;
                const typeColor = TYPE_COLORS[corr.correlationType] ?? accent;

                return (
                  <motion.div
                    key={corr.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: isDark ? 'rgba(244,189,111,0.03)' : 'rgba(0,0,0,0.015)',
                      border: `1px solid ${border}`,
                    }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 6,
                      background: `${typeColor}12`,
                      border: `1px solid ${typeColor}25`,
                      flexShrink: 0,
                      marginTop: 1,
                    }}>
                      <TypeIcon style={{ width: 13, height: 13, color: typeColor }} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: text,
                        lineHeight: 1.4,
                      }}>
                        {corr.description}
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 4,
                      }}>
                        <span style={{
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          color: typeColor,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}>
                          {corr.correlationType.replace('-', ' ')}
                        </span>
                        <div style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 2,
                          background: isDark ? 'rgba(79,69,57,0.3)' : 'rgba(0,0,0,0.05)',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${corr.strength * 100}%`,
                            height: '100%',
                            borderRadius: 2,
                            background: typeColor,
                          }} />
                        </div>
                        <span style={{
                          fontSize: '0.5625rem',
                          fontWeight: 500,
                          color: muted,
                        }}>
                          {Math.round(corr.strength * 100)}%
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
});
