'use client';

import { memo, useCallback, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import {
  SquareIcon,
  PauseIcon,
  PlayIcon,
  RouteIcon,
  FocusIcon,
  SearchIcon,
  SwordsIcon,
  MergeIcon,
  MinimizeIcon,
  CpuIcon,
  CloudIcon,
  ActivityIcon,
  SigmaIcon,
  WavesIcon,
  BrainIcon,
  BarChart3Icon,
  LightbulbIcon,
} from 'lucide-react';
import type { RerouteInstruction } from '@/lib/research/types';
import { getInferenceModeFeatures } from '@/lib/research/types';

const REROUTE_OPTIONS: { type: RerouteInstruction['type']; label: string; icon: typeof FocusIcon; desc: string }[] = [
  { type: 'focus', label: 'Focus', icon: FocusIcon, desc: 'Narrow down on key evidence' },
  { type: 'explore', label: 'Explore', icon: SearchIcon, desc: 'Branch out to related areas' },
  { type: 'challenge', label: 'Challenge', icon: SwordsIcon, desc: 'Apply adversarial scrutiny' },
  { type: 'synthesize', label: 'Synthesize', icon: MergeIcon, desc: 'Combine findings into conclusion' },
  { type: 'simplify', label: 'Simplify', icon: MinimizeIcon, desc: 'Reduce complexity of reasoning' },
];

const STEER_SUGGESTIONS: { label: string; icon: typeof ActivityIcon; hint: string }[] = [
  { label: 'Signal', icon: ActivityIcon, hint: 'Adjust confidence signals and evidence weighting' },
  { label: 'Maths', icon: SigmaIcon, hint: 'Apply more rigorous statistical reasoning' },
  { label: 'Patterns', icon: WavesIcon, hint: 'Look for recurring patterns in the data' },
  { label: 'Cognition', icon: BrainIcon, hint: 'Shift cognitive strategy or reasoning depth' },
  { label: 'Metrics', icon: BarChart3Icon, hint: 'Focus on quantitative metrics and effect sizes' },
  { label: 'Creative', icon: LightbulbIcon, hint: 'Try unconventional angles and lateral thinking' },
];

interface ThinkingControlsProps {
  isDark: boolean;
  onStop?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onReroute?: (instruction: string) => void;
}

const MODE_ICON: Record<string, typeof CpuIcon> = {
  local: CpuIcon,
  api: CloudIcon,
};

export const ThinkingControls = memo(function ThinkingControls({ isDark, onStop, onPause, onResume, onReroute }: ThinkingControlsProps) {
  const isProcessing = usePFCStore((s) => s.isProcessing);
  const isStreaming = usePFCStore((s) => s.isStreaming);
  const isThinkingPaused = usePFCStore((s) => s.isThinkingPaused);
  const inferenceMode = usePFCStore((s) => s.inferenceMode);
  const [showReroute, setShowReroute] = useState(false);
  const [activeReroute, setActiveReroute] = useState<string | null>(null);

  const features = useMemo(() => getInferenceModeFeatures(inferenceMode), [inferenceMode]);
  const isActive = isProcessing || isStreaming;

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  const handlePauseResume = useCallback(() => {
    if (isThinkingPaused) {
      onResume?.();
    } else {
      onPause?.();
    }
  }, [isThinkingPaused, onPause, onResume]);

  const [showSteer, setShowSteer] = useState(false);

  const handleReroute = useCallback(
    (type: RerouteInstruction['type'], desc: string) => {
      const REROUTE_PROMPTS: Record<string, string> = {
        focus: 'Now narrow your analysis: identify the single strongest piece of evidence and the single weakest claim. Strip away tangential threads and drill into the core argument.',
        explore: 'Now broaden: what adjacent fields, analogies, or unexpected connections could illuminate this question? Look for cross-domain evidence and lateral perspectives you haven\'t considered.',
        challenge: 'Now play adversary: what is the strongest possible counterargument to your conclusion? What evidence would overturn it? Where are you most likely wrong?',
        synthesize: 'Now synthesize everything into a unified conclusion: reconcile the conflicting evidence, state your best assessment with calibrated confidence, and explain what a decision-maker should actually do with this information.',
        simplify: 'Now simplify: explain your key finding in one paragraph a smart 16-year-old would understand. Strip jargon, use concrete analogies, and be honest about what you\'re uncertain about.',
      };
      const prompt = REROUTE_PROMPTS[type] ?? desc;
      setActiveReroute(type);
      setShowReroute(false);
      onReroute?.(prompt);
      // Clear the active indicator after a short delay
      setTimeout(() => setActiveReroute(null), 2000);
    },
    [onReroute],
  );

  const handleSteer = useCallback(
    (hint: string) => {
      const prompt = `[Steering adjustment] ${hint}. Please re-examine your current analysis with this lens applied. Show how this changes your conclusions.`;
      setActiveReroute('steer');
      setShowSteer(false);
      onReroute?.(prompt);
      setTimeout(() => setActiveReroute(null), 2000);
    },
    [onReroute],
  );

  if (!isActive) return null;

  const ModeIcon = MODE_ICON[inferenceMode] || CloudIcon;

  const btnBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '9999px',
    cursor: 'pointer',
    transition: 'background 0.15s, transform 0.1s',
    padding: '0.375rem',
    background: isDark ? 'rgba(244,189,111,0.05)' : 'rgba(0,0,0,0.04)',
    color: isDark ? 'rgba(156,143,128,0.7)' : 'rgba(0,0,0,0.45)',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.375rem 0.5rem',
        borderRadius: '9999px',
        background: isDark ? 'rgba(244,189,111,0.03)' : 'rgba(0,0,0,0.02)',
        border: isDark ? '1px solid rgba(79,69,57,0.3)' : '1px solid rgba(0,0,0,0.06)',
        transform: 'translateZ(0)',
      }}
    >
      {/* Mode Indicator Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.125rem 0.375rem',
          borderRadius: '9999px',
          background: inferenceMode === 'local'
            ? (isDark ? 'rgba(52,211,153,0.1)' : 'rgba(52,211,153,0.08)')
            : (isDark ? 'rgba(244,189,111,0.1)' : 'rgba(244,189,111,0.08)'),
          fontSize: '0.5rem',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          color: inferenceMode === 'local'
            ? 'var(--color-pfc-green)'
            : 'var(--pfc-accent)',
        }}
        title={features.modeHint}
      >
        <ModeIcon style={{ height: '0.5625rem', width: '0.5625rem' }} />
        {features.modeLabel}
      </div>

      {/* Active reroute indicator */}
      {activeReroute && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.125rem 0.375rem',
            borderRadius: '9999px',
            background: isDark ? 'rgba(34,211,238,0.1)' : 'rgba(34,211,238,0.08)',
            fontSize: '0.5rem',
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.06em',
            color: '#22D3EE',
          }}
        >
          <RouteIcon style={{ height: '0.5rem', width: '0.5rem' }} />
          Redirecting
        </motion.div>
      )}

      {/* Divider */}
      <div
        style={{
          width: '1px',
          height: '1rem',
          background: isDark ? 'rgba(79,69,57,0.3)' : 'rgba(0,0,0,0.06)',
          margin: '0 0.125rem',
        }}
      />

      {/* Stop — actually aborts the stream */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={handleStop}
        style={{ ...btnBase, color: 'var(--color-pfc-red)' }}
        title="Stop thinking"
      >
        <SquareIcon style={{ height: '0.75rem', width: '0.75rem' }} />
      </motion.button>

      {/* Pause/Resume — local mode only, buffers stream events */}
      {features.playPause && (
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handlePauseResume}
          style={{
            ...btnBase,
            gap: '0.25rem',
            padding: '0.25rem 0.5rem',
            fontSize: '0.625rem',
            fontWeight: 500,
            color: isThinkingPaused ? 'var(--color-pfc-green)' : (isDark ? 'rgba(156,143,128,0.7)' : 'rgba(0,0,0,0.45)'),
          }}
          title={isThinkingPaused ? 'Resume thinking' : 'Pause thinking'}
        >
          {isThinkingPaused
            ? <PlayIcon style={{ height: '0.75rem', width: '0.75rem' }} />
            : <PauseIcon style={{ height: '0.75rem', width: '0.75rem' }} />
          }
          <span>{isThinkingPaused ? 'Resume' : 'Pause'}</span>
        </motion.button>
      )}

      {/* Reroute — available on all modes */}
      {features.rerouteThinking && (
        <>
          <div
            style={{
              width: '1px',
              height: '1rem',
              background: isDark ? 'rgba(79,69,57,0.3)' : 'rgba(0,0,0,0.06)',
              margin: '0 0.25rem',
            }}
          />
          <div style={{ position: 'relative' }}>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setShowReroute(!showReroute)}
              style={{
                ...btnBase,
                gap: '0.25rem',
                padding: '0.25rem 0.5rem',
                fontSize: '0.625rem',
                fontWeight: 500,
              }}
              title="Reroute thinking"
            >
              <RouteIcon style={{ height: '0.75rem', width: '0.75rem' }} />
              <span>Reroute</span>
            </motion.button>

            <AnimatePresence>
              {showReroute && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%) translateZ(0)',
                    marginBottom: '0.5rem',
                    padding: '0.5rem',
                    borderRadius: '1rem',
                    background: isDark ? 'rgba(28,27,25,0.95)' : 'rgba(255,255,255,0.95)',
                    border: isDark ? '1px solid rgba(79,69,57,0.3)' : '1px solid rgba(0,0,0,0.1)',
                    backdropFilter: 'blur(12px) saturate(1.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    minWidth: '12rem',
                    zIndex: 'var(--z-modal)',
                  }}
                >
                  <p
                    style={{
                      fontSize: '0.5625rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.3)',
                      padding: '0.25rem 0.375rem',
                    }}
                  >
                    Redirect Thinking
                  </p>
                  {REROUTE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.type}
                        onClick={() => handleReroute(opt.type, opt.desc)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.375rem',
                          borderRadius: '9999px',
                          border: 'none',
                          cursor: 'pointer',
                          background: 'transparent',
                          color: isDark ? 'rgba(237,224,212,0.8)' : 'rgba(0,0,0,0.6)',
                          textAlign: 'left',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isDark
                            ? 'rgba(244,189,111,0.06)'
                            : 'rgba(0,0,0,0.04)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <Icon style={{ height: '0.875rem', width: '0.875rem', flexShrink: 0, color: 'var(--pfc-accent)' }} />
                        <div>
                          <p style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{opt.label}</p>
                          <p style={{ fontSize: '0.5625rem', color: isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.35)' }}>
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Steer Suggestions */}
      {features.rerouteThinking && (
        <>
          <div
            style={{
              width: '1px',
              height: '1rem',
              background: isDark ? 'rgba(79,69,57,0.3)' : 'rgba(0,0,0,0.06)',
              margin: '0 0.125rem',
            }}
          />
          <div style={{ position: 'relative' }}>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setShowSteer(!showSteer)}
              style={{
                ...btnBase,
                gap: '0.25rem',
                padding: '0.25rem 0.5rem',
                fontSize: '0.625rem',
                fontWeight: 500,
              }}
              title="Steering suggestions"
            >
              <ActivityIcon style={{ height: '0.75rem', width: '0.75rem' }} />
              <span>Steer</span>
            </motion.button>

            <AnimatePresence>
              {showSteer && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%) translateZ(0)',
                    marginBottom: '0.5rem',
                    padding: '0.5rem',
                    borderRadius: '1rem',
                    background: isDark ? 'rgba(28,27,25,0.95)' : 'rgba(255,255,255,0.95)',
                    border: isDark ? '1px solid rgba(79,69,57,0.3)' : '1px solid rgba(0,0,0,0.1)',
                    backdropFilter: 'blur(12px) saturate(1.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    minWidth: '13rem',
                    zIndex: 'var(--z-modal)',
                  }}
                >
                  <p
                    style={{
                      fontSize: '0.5625rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.3)',
                      padding: '0.25rem 0.375rem',
                    }}
                  >
                    Suggest Changes
                  </p>
                  {STEER_SUGGESTIONS.map((sug) => {
                    const Icon = sug.icon;
                    return (
                      <button
                        key={sug.label}
                        onClick={() => handleSteer(sug.hint)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.375rem',
                          borderRadius: '9999px',
                          border: 'none',
                          cursor: 'pointer',
                          background: 'transparent',
                          color: isDark ? 'rgba(237,224,212,0.8)' : 'rgba(0,0,0,0.6)',
                          textAlign: 'left',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isDark
                            ? 'rgba(244,189,111,0.06)'
                            : 'rgba(0,0,0,0.04)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <Icon style={{ height: '0.875rem', width: '0.875rem', flexShrink: 0, color: '#22D3EE' }} />
                        <div>
                          <p style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{sug.label}</p>
                          <p style={{ fontSize: '0.5625rem', color: isDark ? 'rgba(156,143,128,0.5)' : 'rgba(0,0,0,0.35)' }}>
                            {sug.hint}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </motion.div>
  );
});
