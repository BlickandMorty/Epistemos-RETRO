'use client';

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { InfoIcon, BookOpenIcon, SparklesIcon } from 'lucide-react';
import type { EducationalTooltip as EducationalTooltipType } from '@/lib/research/types';

interface EducationalTooltipProps {
  tooltip: EducationalTooltipType;
  isDark: boolean;
  /** Position relative to trigger */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: '#34D399',
  intermediate: '#FBBF24',
  advanced: '#F87171',
};

export const EducationalTooltipButton = memo(function EducationalTooltipButton({
  tooltip,
  isDark,
  position = 'top',
}: EducationalTooltipProps) {
  const [open, setOpen] = useState(false);

  const positionStyles: Record<string, React.CSSProperties> = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '0.5rem' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '0.5rem' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '0.5rem' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '0.5rem' },
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1.125rem',
          height: '1.125rem',
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: isDark ? 'rgba(244,189,111,0.05)' : 'rgba(0,0,0,0.04)',
          color: isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.25)',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        <InfoIcon style={{ height: '0.625rem', width: '0.625rem' }} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: position === 'top' ? 4 : position === 'bottom' ? -4 : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              ...positionStyles[position],
              zIndex: 'var(--z-modal)',
              width: '18rem',
              padding: '0.875rem',
              borderRadius: '0.75rem',
              background: isDark ? 'rgba(28,27,25,0.97)' : 'rgba(255,255,255,0.97)',
              border: isDark ? '1px solid rgba(79,69,57,0.3)' : '1px solid rgba(0,0,0,0.08)',
              backdropFilter: 'blur(12px) saturate(1.3)',
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h4 style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: isDark ? 'rgba(237,224,212,0.9)' : 'var(--foreground)',
              }}>
                {tooltip.title}
              </h4>
              <span
                style={{
                  fontSize: '0.5rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '9999px',
                  background: `${DIFFICULTY_COLORS[tooltip.difficulty]}15`,
                  color: DIFFICULTY_COLORS[tooltip.difficulty],
                }}
              >
                {tooltip.difficulty}
              </span>
            </div>

            {/* Description */}
            <p style={{
              fontSize: '0.6875rem',
              lineHeight: 1.6,
              color: isDark ? 'rgba(156,143,128,0.7)' : 'rgba(0,0,0,0.5)',
              marginBottom: '0.625rem',
            }}>
              {tooltip.description}
            </p>

            {/* Use Cases */}
            <div style={{ marginBottom: tooltip.learnMore ? '0.625rem' : 0 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                marginBottom: '0.375rem',
              }}>
                <SparklesIcon style={{ height: '0.625rem', width: '0.625rem', color: 'var(--pfc-accent)' }} />
                <span style={{
                  fontSize: '0.5625rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.3)',
                }}>
                  What is this used for
                </span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {tooltip.useCases.map((useCase, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                      fontSize: '0.625rem',
                      lineHeight: 1.5,
                      color: isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)',
                      paddingLeft: '0.75rem',
                      position: 'relative',
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      color: 'var(--pfc-accent)',
                    }}>
                      \u2022
                    </span>
                    {useCase}
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Learn More */}
            {tooltip.learnMore && (
              <div
                style={{
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  background: isDark ? 'rgba(244,189,111,0.03)' : 'rgba(0,0,0,0.02)',
                  border: isDark ? '1px solid rgba(79,69,57,0.2)' : '1px solid rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                  <BookOpenIcon style={{ height: '0.5rem', width: '0.5rem', color: 'var(--color-pfc-ember)' }} />
                  <span style={{
                    fontSize: '0.5rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-pfc-ember)',
                  }}>
                    Context
                  </span>
                </div>
                <p style={{
                  fontSize: '0.5625rem',
                  lineHeight: 1.6,
                  color: isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.35)',
                  fontStyle: 'italic',
                }}>
                  {tooltip.learnMore}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
