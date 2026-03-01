'use client';

import { memo, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { writeString } from '@/lib/storage-versioning';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import {
  FlaskConicalIcon,
  BookOpenIcon,
  SparklesIcon,
  SettingsIcon,
  CpuIcon,
  CloudIcon,
} from 'lucide-react';
import { getInferenceModeFeatures } from '@/lib/research/types';

interface ResearchModeBarProps {
  isDark: boolean;
}

const MODE_ICON: Record<string, typeof CpuIcon> = {
  local: CpuIcon,
  api: CloudIcon,
};

export const ResearchModeBar = memo(function ResearchModeBar({ isDark }: ResearchModeBarProps) {
  const inferenceMode = usePFCStore((s) => s.inferenceMode);
  const setInferenceMode = usePFCStore((s) => s.setInferenceMode);
  const apiKey = usePFCStore((s) => s.apiKey);
  const ollamaAvailable = usePFCStore((s) => s.ollamaAvailable);
  const [showControls, setShowControls] = useState(false);

  const features = useMemo(() => getInferenceModeFeatures(inferenceMode), [inferenceMode]);
  const ModeIcon = MODE_ICON[inferenceMode] || CloudIcon;

  const toggleBg = isDark ? 'rgba(244,189,111,0.03)' : 'rgba(0,0,0,0.02)';
  const activeBg = isDark ? 'rgba(52,211,153,0.12)' : 'rgba(52,211,153,0.1)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.625rem',
        borderRadius: '9999px',
        background: toggleBg,
        border: isDark ? '1px solid rgba(79,69,57,0.3)' : '1px solid rgba(0,0,0,0.06)',
      }}
    >
      {/* Research mode indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.25rem 0.5rem',
          borderRadius: '9999px',
          fontSize: '0.6875rem',
          fontWeight: 600,
          background: activeBg,
          color: 'var(--color-pfc-green)',
        }}
      >
        <FlaskConicalIcon style={{ height: '0.75rem', width: '0.75rem' }} />
        Research
      </div>

      {/* Divider */}
      <div
        style={{
          width: '1px',
          height: '1rem',
          background: isDark ? 'rgba(79,69,57,0.3)' : 'rgba(0,0,0,0.06)',
        }}
      />

      {/* Inference Mode Switcher — clickable to cycle modes */}
            <button
              onClick={() => {
                const modes = ['api', 'local'] as const;
                const idx = modes.indexOf(inferenceMode as typeof modes[number]);
                const next = modes[(idx + 1) % modes.length]!;
                // Validate before switching
                if (next === 'api' && !apiKey) {
                  usePFCStore.getState().addToast({
                    message: 'Set an API key in Settings first',
                    type: 'error',
                  });
                  return;
                }
                if (next === 'local' && !ollamaAvailable) {
                  usePFCStore.getState().addToast({
                    message: 'Ollama not detected — make sure it\'s running',
                    type: 'error',
                  });
                  return;
                }
                setInferenceMode(next);
                // Persist to localStorage for reload
                writeString('pfc-inference-mode', next);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.1875rem',
                padding: '0.125rem 0.3rem',
                borderRadius: '9999px',
                border: 'none',
                cursor: 'pointer',
                background: inferenceMode === 'local'
                  ? (isDark ? 'rgba(52,211,153,0.1)' : 'rgba(52,211,153,0.08)')
                  : (isDark ? 'rgba(244,189,111,0.1)' : 'rgba(244,189,111,0.08)'),
                fontSize: '0.5rem',
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
                color: inferenceMode === 'local'
                  ? 'var(--color-pfc-green)'
                  : 'var(--pfc-accent)',
                transition: 'all 0.15s',
              }}
              title={`${features.modeHint} — Click to switch mode`}
            >
              <ModeIcon style={{ height: '0.5rem', width: '0.5rem' }} />
              {features.modeLabel}
            </button>

            {/* Divider */}
            <div
              style={{
                width: '1px',
                height: '1rem',
                background: isDark ? 'rgba(79,69,57,0.3)' : 'rgba(0,0,0,0.06)',
                margin: '0 0.125rem',
              }}
            />

            {/* Research Controls Toggle */}
            <button
              onClick={() => setShowControls(!showControls)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.375rem',
                borderRadius: '9999px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.625rem',
                background: showControls ? (isDark ? 'rgba(244,189,111,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                color: isDark ? 'rgba(156,143,128,0.7)' : 'rgba(0,0,0,0.3)',
                transition: 'all 0.15s',
              }}
            >
              <SettingsIcon style={{ height: '0.625rem', width: '0.625rem' }} />
            </button>

      {/* Research Controls Popover */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: '0.5rem',
              padding: '0.75rem',
              borderRadius: '1rem',
              background: isDark ? 'rgba(28,27,25,0.95)' : 'rgba(255,255,255,0.95)',
              border: isDark ? '1px solid rgba(79,69,57,0.3)' : '1px solid rgba(0,0,0,0.1)',
              backdropFilter: 'blur(12px) saturate(1.3)',
              minWidth: '14rem',
              zIndex: 'var(--z-modal)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              transform: 'translateZ(0)',
            }}
          >
            <p style={{
              fontSize: '0.625rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.3)',
            }}>
              Research Controls
            </p>

            {/* Active features — all always-on */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <BookOpenIcon style={{ height: '0.75rem', width: '0.75rem', color: 'var(--color-pfc-green)' }} />
                <span style={{ fontSize: '0.6875rem', color: isDark ? 'rgba(237,224,212,0.8)' : 'rgba(0,0,0,0.55)' }}>
                  Auto-extract citations
                </span>
                <span style={{
                  fontSize: '0.5rem', fontWeight: 600, color: 'var(--color-pfc-green)',
                  padding: '0.0625rem 0.3rem', borderRadius: '9999px',
                  background: isDark ? 'rgba(52,211,153,0.1)' : 'rgba(52,211,153,0.08)',
                  marginLeft: 'auto',
                }}>ON</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <SparklesIcon style={{ height: '0.75rem', width: '0.75rem', color: 'var(--pfc-accent)' }} />
                <span style={{ fontSize: '0.6875rem', color: isDark ? 'rgba(237,224,212,0.8)' : 'rgba(0,0,0,0.55)' }}>
                  Deep analysis
                </span>
                <span style={{
                  fontSize: '0.5rem', fontWeight: 600, color: 'var(--pfc-accent)',
                  padding: '0.0625rem 0.3rem', borderRadius: '9999px',
                  background: isDark ? 'rgba(244,189,111,0.1)' : 'rgba(244,189,111,0.08)',
                  marginLeft: 'auto',
                }}>ON</span>
              </div>
            </div>

            {/* Mode hint at bottom */}
            <div style={{
              marginTop: '0.25rem',
              padding: '0.375rem 0.5rem',
              borderRadius: '9999px',
              background: isDark ? 'rgba(244,189,111,0.03)' : 'rgba(0,0,0,0.02)',
              border: isDark ? '1px solid rgba(79,69,57,0.2)' : '1px solid rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}>
              <ModeIcon style={{
                height: '0.625rem',
                width: '0.625rem',
                color: inferenceMode === 'local'
                  ? 'var(--color-pfc-green)'
                  : 'var(--pfc-accent)',
              }} />
              <span style={{
                fontSize: '0.5625rem',
                color: isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.3)',
                lineHeight: 1.4,
              }}>
                {features.modeHint}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
