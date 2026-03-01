'use client';

import { useRef, useState, useCallback, useEffect, useMemo, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpIcon, StopCircleIcon, SlidersHorizontalIcon, SearchIcon, PaperclipIcon, WrenchIcon, NetworkIcon, BookOpenIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { writeString } from '@/lib/storage-versioning';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useTheme } from 'next-themes';
import { useIsDark } from '@/hooks/use-is-dark';

// ---------------------------------------------------------------------------
// Research-ready prompt generation engine
// ---------------------------------------------------------------------------

interface PromptTemplate {
  pattern: RegExp;
  templates: string[];
}

const INTENT_TEMPLATES: PromptTemplate[] = [
  {
    pattern: /^(is|are|does|do|can|could|should|would)\b/i,
    templates: [
      '{input} — what does the meta-analytic evidence show?',
      '{input} — evaluate the causal mechanisms',
      '{input} across different populations and contexts?',
    ],
  },
  {
    pattern: /^(what|how|why|where|when|which)\b/i,
    templates: [
      '{input} — synthesize the strongest available evidence',
      '{input} from a Bayesian perspective?',
      '{input} — compare competing theoretical frameworks',
    ],
  },
  {
    pattern: /^(compare|versus|vs|difference|better|worse)\b/i,
    templates: [
      '{input} — systematic comparison with effect sizes',
      '{input} — what do head-to-head trials show?',
      '{input} controlling for confounding variables',
    ],
  },
  {
    pattern: /^(evidence|research|studies|data|literature)\b/i,
    templates: [
      '{input} — assess study quality and replication rates',
      '{input} — identify publication bias risks',
      '{input} — Bayesian synthesis across heterogeneous designs',
    ],
  },
  {
    pattern: /^(effect|impact|influence|cause|relationship)\b/i,
    templates: [
      '{input} — Bradford Hill causal criteria assessment',
      '{input} — what is the estimated effect size?',
      '{input} with potential confounders controlled?',
    ],
  },
];

const DOMAIN_EXPANSIONS: Array<{ trigger: RegExp; expansions: string[] }> = [
  { trigger: /\b(sleep|insomnia|circadian|rest)\b/i, expansions: [
    'on cognitive performance and decision-making?',
    'compared to pharmacological interventions?',
    'and its dose-response relationship with health outcomes?',
  ]},
  { trigger: /\b(diet|nutrition|food|eating|fasting|calori)\b/i, expansions: [
    'controlling for genetic and lifestyle confounders?',
    'in randomized versus observational study designs?',
    'and metabolic adaptation over time?',
  ]},
  { trigger: /\b(anxiety|depression|mental|therapy|cbt|ssri|psych)\b/i, expansions: [
    'with long-term follow-up data beyond 12 months?',
    'and placebo response rates in clinical trials?',
    'across different severity levels and comorbidities?',
  ]},
  { trigger: /\b(ai|machine.?learn|algorithm|model|neural|gpt|llm)\b/i, expansions: [
    'and benchmark reproducibility across hardware configurations?',
    'compared to human expert performance on equivalent tasks?',
    'accounting for data contamination and training set overlap?',
  ]},
  { trigger: /\b(climate|environment|carbon|emission|pollution|eco)\b/i, expansions: [
    'with uncertainty quantification from IPCC-class models?',
    'comparing observational data with model predictions?',
    'and the economic cost-benefit under different scenarios?',
  ]},
  { trigger: /\b(drug|medic|treat|vaccine|pharma|dose|clinical)\b/i, expansions: [
    'with number-needed-to-treat and adverse event profiles?',
    'in phase III trials versus real-world effectiveness?',
    'stratified by age, sex, and comorbidity subgroups?',
  ]},
  { trigger: /\b(education|school|student|learn|teach|test)\b/i, expansions: [
    'controlling for socioeconomic and cultural variables?',
    'with longitudinal tracking of academic outcomes?',
    'and the replication status of foundational studies?',
  ]},
  { trigger: /\b(exercise|fitness|workout|physical|sport|train)\b/i, expansions: [
    'and dose-response curves across intensity levels?',
    'in randomized trials with active control groups?',
    'for different age groups and baseline fitness levels?',
  ]},
];

const ANALYTICAL_FRAMES = [
  'What does the strongest evidence show about {input}?',
  'Is the research on {input} replicable and robust?',
  'Evaluate the causal evidence for {input}',
  'Compare competing explanations for {input}',
  'What are the key methodological concerns in {input} research?',
  'Synthesize the meta-analytic evidence on {input}',
  'How confident should we be about claims regarding {input}?',
  'What would change our understanding of {input}?',
];

function generateRealtimeSuggestions(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const results: string[] = [];

  for (const { pattern, templates } of INTENT_TEMPLATES) {
    if (pattern.test(trimmed)) {
      const picked = templates[Math.floor(Math.random() * templates.length)]!;
      results.push(picked.replace('{input}', trimmed));
      break;
    }
  }

  for (const { trigger, expansions } of DOMAIN_EXPANSIONS) {
    if (trigger.test(trimmed)) {
      const picked = expansions[Math.floor(Math.random() * expansions.length)];
      results.push(trimmed + ' ' + picked);
      break;
    }
  }

  if (results.length < 4) {
    const shuffledFrames = [...ANALYTICAL_FRAMES].sort(() => Math.random() - 0.5);
    for (const frame of shuffledFrames) {
      if (results.length >= 5) break;
      const suggestion = frame.replace('{input}', trimmed);
      if (!results.some((r) => r.startsWith(suggestion.slice(0, 30)))) {
        results.push(suggestion);
      }
    }
  }

  return results.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Mini PFC Brain icon for send button resting state
// ---------------------------------------------------------------------------

function MiniPFCBrain() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
      <path
        d="M10 3C7 3 5 5.5 5 8c0 1.5.5 2.5 1.5 3.3.3.3.5.7.5 1.2V14c0 .6.4 1 1 1h4c.6 0 1-.4 1-1v-1.5c0-.5.2-.9.5-1.2C14.5 10.5 15 9.5 15 8c0-2.5-2-5-5-5z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M10 4.5v9M7.5 6.5c1 .7 2 .7 2.5 0M10 6.5c.5.7 1.5.7 2.5 0M8 9.5c.8.5 1.5.5 2 0M10 9.5c.5.5 1.2.5 2 0"
        stroke="white"
        strokeWidth="0.6"
        fill="none"
        opacity="0.25"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Brain button with embedded theme toggle — replaces "what's up?" tooltip
// ---------------------------------------------------------------------------

function BrainButtonWithToggle({
  isDark,
  brainGlow,
  onBrainTap,
}: {
  isDark: boolean;
  brainGlow: boolean;
  onBrainTap: () => void;
}) {
  const { theme, setTheme } = useTheme();

  const handlePress = () => {
    // Disable system auto mode when manually cycling
    if (typeof window !== 'undefined') {
      writeString('pfc-system-auto', 'false');
    }
    // Cycle: sunny → sunset → oled → sunny
    const current = theme || 'light';
    setTheme(current === 'sunny' ? 'sunset' : current === 'sunset' ? 'oled' : 'sunny');
    onBrainTap();
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* PFC Brain logo — IS the theme toggle. Glowing = dark mode, dim = light mode */}
      <motion.button
        onClick={handlePress}
        aria-label="Cycle theme"
        animate={{
          rotate: brainGlow ? [0, -10, 10, -5, 5, 0] : 0,
        }}
        transition={brainGlow ? { duration: 0.6, ease: 'easeInOut' } : { duration: 0.3 }}
        style={{
          height: '2.5rem',
          width: '2.5rem',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          border: 'none',
          /* Dark mode: brain is white with a glow. Light mode: dim, no glow */
          background: isDark ? 'rgba(244,189,111,0.08)' : 'rgba(128,86,16,0.04)',
          color: isDark ? 'rgba(237,224,212,0.9)' : 'rgba(29,27,22,0.35)',
          boxShadow: 'none',
          transition: 'background 0.3s, color 0.3s, box-shadow 0.3s',
        }}
      >
        <MiniPFCBrain />
      </motion.button>

      {/* RGB chromatic ring flash on tap — gaming laptop style */}
      <AnimatePresence>
        {brainGlow && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: [0, 1, 1, 1, 1, 0],
              scale: [0.8, 1.02, 1.02, 1.02, 1.02, 1.12],
              boxShadow: [
                '0 0 8px rgba(244,189,111,0.7), inset 0 0 4px rgba(244,189,111,0.3)',
                '0 0 14px rgba(34,211,238,0.7), inset 0 0 6px rgba(34,211,238,0.3)',
                '0 0 14px rgba(52,211,153,0.7), inset 0 0 6px rgba(52,211,153,0.3)',
                '0 0 14px rgba(224,120,80,0.7), inset 0 0 6px rgba(224,120,80,0.3)',
                '0 0 14px rgba(251,191,36,0.7), inset 0 0 6px rgba(251,191,36,0.3)',
                '0 0 0px rgba(244,189,111,0), inset 0 0 0px rgba(244,189,111,0)',
              ],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              inset: '-3px',
              borderRadius: '50%',
              border: '2px solid rgba(244,189,111,0.4)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Persistent glow halo in dark mode */}
      {isDark && !brainGlow && (
        <div
          style={{
            position: 'absolute',
            inset: '-2px',
            borderRadius: '50%',
            border: '1.5px solid rgba(244,189,111,0.1)',
            boxShadow: '0 0 8px rgba(244,189,111,0.06)',
            pointerEvents: 'none',
            transition: 'opacity 0.3s',
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MultimodalInputProps {
  onSubmit: (query: string) => void;
  onStop?: () => void;
  isProcessing: boolean;
  className?: string;
  hero?: boolean;
  showControlsToggle?: boolean;
  inputStyle?: React.CSSProperties;
  onExpandChange?: (expanded: boolean) => void;
  /** Called when the textarea focus state changes */
  onFocusChange?: (focused: boolean) => void;
  /** Optional animated placeholder overlay shown when input is empty & not focused */
  placeholderOverlay?: React.ReactNode;
}

// Stable selectors
const selectToggleLiveControls = (s: { toggleLiveControls: () => void }) => s.toggleLiveControls;
const selectLiveControlsOpen = (s: { liveControlsOpen: boolean }) => s.liveControlsOpen;
const selectControls = (s: { controls: import('@/lib/engine/types').PipelineControls }) => s.controls;
const selectPendingAttachments = (s: { pendingAttachments: import('@/lib/engine/types').FileAttachment[] }) => s.pendingAttachments;
const selectRemoveAttachment = (s: { removeAttachment: (id: string) => void }) => s.removeAttachment;

export function MultimodalInput({
  onSubmit,
  onStop,
  isProcessing,
  className,
  hero,
  showControlsToggle,
  inputStyle,
  onExpandChange,
  onFocusChange,
  placeholderOverlay,
}: MultimodalInputProps) {
  const toggleLiveControls = usePFCStore(selectToggleLiveControls);
  const liveControlsOpen = usePFCStore(selectLiveControlsOpen);
  const controls = usePFCStore(selectControls);
  const pendingAttachments = usePFCStore(selectPendingAttachments);
  const removeAttachment = usePFCStore(selectRemoveAttachment);

  // Count how many live controls deviate from defaults
  const activeControlCount = useMemo(() => {
    let n = 0;
    if (controls.focusDepthOverride !== null) n++;
    if (controls.temperatureOverride !== null) n++;
    if (controls.complexityBias !== 0) n++;
    if (controls.adversarialIntensity !== 1.0) n++;
    if (controls.bayesianPriorStrength !== 1.0) n++;
    return n;
  }, [controls]);
  const { isDark, isCosmic } = useIsDark();
  const { theme, setTheme } = useTheme();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [typingSuggestions, setTypingSuggestions] = useState<string[]>([]);
  const [brainGlow, setBrainGlow] = useState(false);
  const [themeCycleFlash, setThemeCycleFlash] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsPos, setToolsPos] = useState({ bottom: 0, left: 0 });
  const toolsBtnRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brainGlowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeCycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmitRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Triple-click theme cycling on search bar
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Cleanup all timers on unmount
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
      if (brainGlowTimerRef.current) clearTimeout(brainGlowTimerRef.current);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      if (themeCycleTimerRef.current) clearTimeout(themeCycleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length < 3) {
      return;
    }

    debounceRef.current = setTimeout(() => {
      setTypingSuggestions(generateRealtimeSuggestions(trimmed));
    }, 80);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Close tools dropdown on outside click + calculate position
  useEffect(() => {
    if (!toolsOpen) return;
    // Calculate position from button ref
    if (toolsBtnRef.current) {
      const rect = toolsBtnRef.current.getBoundingClientRect();
      setToolsPos({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
      });
    }
    const close = () => setToolsOpen(false);
    const timer = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', close); };
  }, [toolsOpen]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isProcessing) return;
    // Debounce rapid submissions (300ms)
    if (Date.now() - lastSubmitRef.current < 300) return;
    lastSubmitRef.current = Date.now();

    onSubmit(trimmed);
    setValue('');
    setFocused(false);
    setTypingSuggestions([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.blur();
    }
  }, [value, isProcessing, onSubmit]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSubmit(suggestion);
    setFocused(false);
    setValue('');
    setTypingSuggestions([]);
    if (textareaRef.current) textareaRef.current.blur();
  };

  const handleFocus = () => {
    setFocused(true);
    onFocusChange?.(true);
  };

  const handleBlur = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      if (!mountedRef.current) return; // Guard: no state updates after unmount
      setFocused(false);
      onFocusChange?.(false);
    }, 200);
  };

  const handleBrainTap = useCallback(() => {
    setBrainGlow(true);
    if (brainGlowTimerRef.current) clearTimeout(brainGlowTimerRef.current);
    brainGlowTimerRef.current = setTimeout(() => {
      brainGlowTimerRef.current = null;
      if (!mountedRef.current) return; // Guard: no state updates after unmount
      setBrainGlow(false);
    }, 800);
  }, []);

  // Triple-click on search bar cycles theme: light → dark → oled → light
  const handleSearchBarClick = useCallback(() => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      // Cycle theme
      const current = theme || 'light';
      const next = current === 'light' ? 'dark' : current === 'dark' ? 'oled' : 'light';
      setTheme(next);
      // Visual flash feedback
      setThemeCycleFlash(true);
      if (themeCycleTimerRef.current) clearTimeout(themeCycleTimerRef.current);
      themeCycleTimerRef.current = setTimeout(() => {
        themeCycleTimerRef.current = null;
        setThemeCycleFlash(false);
      }, 600);
    } else {
      // Reset counter after 500ms if no further clicks
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
        clickTimerRef.current = null;
      }, 500);
    }
  }, [theme, setTheme]);

  const trimmedValue = value.trim();
  const visibleTypingSuggestions = trimmedValue.length >= 3 ? typingSuggestions : [];
  const showTyping = focused && visibleTypingSuggestions.length > 0 && !isProcessing;

  // Notify parent of expansion state (for border-radius animation on wrapper)
  useEffect(() => {
    onExpandChange?.(showTyping);
  }, [showTyping, onExpandChange]);

  // Label for the theme cycle flash
  const themeLabel = theme === 'oled' ? 'OLED' : theme === 'dark' ? 'Ember' : theme === 'cosmic' ? 'Cosmic' : theme === 'sunny' ? 'Sunny' : 'Light';

  return (
    <div className="relative">
      {/* Theme cycle flash indicator */}
      <AnimatePresence>
        {themeCycleFlash && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: -32, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 'var(--z-modal)',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.6875rem',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.04em',
              color: isDark ? 'rgba(232,228,222,0.9)' : 'rgba(28,27,31,0.8)',
              background: isDark ? 'var(--pfc-surface-dark)' : 'rgba(255,255,255,0.9)',
              border: 'none',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              pointerEvents: 'none',
            }}
          >
            {themeLabel} mode
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input container — border-radius controlled by parent wrapper in hero mode */}
      <div
        className={cn(
          'relative flex w-full flex-col',
          hero ? 'px-4 pt-3 pb-2' : 'p-3',
          !hero && 'rounded-2xl',
          !hero && !className?.includes('glass') && 'border-0 bg-card/80',
          className,
        )}
        style={{
          ...(!hero && !className?.includes('glass') ? {
            backdropFilter: 'blur(12px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(12px) saturate(1.3)',
          } : undefined),
        }}
      >
        {hero ? (
          /* ═══ HERO (Gemini-style) — two-row layout ═══ */
          <>
            {/* Row 1: Textarea spanning full width */}
            <div style={{ position: 'relative', width: '100%' }}>
              {/* Animated placeholder overlay — extends all the way left */}
              {placeholderOverlay && !value && (
                <div
                  onClick={() => textareaRef.current?.focus()}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'auto',
                    cursor: 'text',
                    zIndex: 1,
                  }}
                >
                  {placeholderOverlay}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onClick={handleSearchBarClick}
                placeholder={placeholderOverlay ? '' : 'Ask a research question...'}
                className="flex-1 resize-none bg-transparent leading-relaxed text-foreground placeholder:text-muted-foreground/40 outline-none border-0 focus:outline-none focus:border-0 focus-visible:outline-none px-0 text-[0.9375rem] min-h-[40px] max-h-[200px] py-[6px]"
                rows={1}
                maxLength={10000}
                disabled={isProcessing}
                style={{ boxShadow: 'none', width: '100%', ...inputStyle }}
              />
            </div>

            {/* Attachment Preview Strip */}
            {pendingAttachments.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.375rem 0',
                overflowX: 'auto',
                flexWrap: 'nowrap',
              }}>
                {pendingAttachments.map((att) => {
                  const isImage = att.type === 'image';
                  const sizeStr = att.size < 1024 * 1024
                    ? `${(att.size / 1024).toFixed(0)}KB`
                    : `${(att.size / (1024 * 1024)).toFixed(1)}MB`;
                  return (
                    <div
                      key={att.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: isImage ? '0.125rem' : '0.25rem 0.5rem',
                        borderRadius: isImage ? '0.5rem' : '999px',
                        background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                        border: 'none',
                        flexShrink: 0,
                        maxWidth: '200px',
                        fontSize: '0.75rem',
                        color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                      }}
                    >
                      {isImage && att.preview ? (
                        <img
                          src={att.preview}
                          alt={att.name}
                          style={{
                            width: '48px',
                            height: '48px',
                            objectFit: 'cover',
                            borderRadius: '0.375rem',
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: '0.875rem' }}>
                          {att.type === 'pdf' ? '📄' : att.type === 'csv' ? '📊' : '📎'}
                        </span>
                      )}
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: isImage ? '80px' : '120px',
                      }}>
                        {att.name}
                      </span>
                      {!isImage && (
                        <span style={{ opacity: 0.5, flexShrink: 0 }}>{sizeStr}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '0 0.125rem',
                          color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)',
                          fontSize: '0.875rem',
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                        aria-label={`Remove ${att.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Row 2: Buttons bottom row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              {/* Upload file button */}
              <button
                type="button"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.pdf,.txt,.md,.csv,.json,.doc,.docx,.png,.jpg,.jpeg,.webp';
                  input.style.display = 'none';
                  const cleanup = () => { input.remove(); };
                  input.multiple = true;
                  input.onchange = () => {
                    const files = input.files;
                    if (!files || files.length === 0) { cleanup(); return; }

                    Array.from(files).forEach((file) => {
                      const reader = new FileReader();
                      reader.onload = () => {
                        const base64 = reader.result as string;
                        const ext = file.name.split('.').pop()?.toLowerCase() || '';
                        const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
                        const store = usePFCStore.getState();
                        store.addAttachment({
                          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                          name: file.name,
                          type: isImage ? 'image' : ext === 'pdf' ? 'pdf' : ext === 'csv' ? 'csv' : ext === 'txt' || ext === 'md' ? 'text' : 'other',
                          uri: base64,
                          size: file.size,
                          mimeType: file.type,
                          preview: isImage ? base64 : undefined,
                        });
                      };
                      reader.readAsDataURL(file);
                    });
                    cleanup();
                  };
                  // Clean up if user cancels the file picker
                  input.addEventListener('cancel', cleanup);
                  document.body.appendChild(input);
                  input.click();
                }}
                style={{
                  height: '2rem',
                  width: '2rem',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: 'none',
                  flexShrink: 0,
                  background: 'transparent',
                  color: isDark ? 'rgba(200,200,200,0.4)' : 'rgba(0,0,0,0.25)',
                  transition: 'color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = isDark ? 'rgba(230,230,230,0.7)' : 'rgba(0,0,0,0.5)';
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isDark ? 'rgba(200,200,200,0.4)' : 'rgba(0,0,0,0.25)';
                  e.currentTarget.style.background = 'transparent';
                }}
                aria-label="Upload file"
              >
                <PaperclipIcon style={{ height: '1rem', width: '1rem' }} />
              </button>

              {/* Tools text button — like Gemini */}
              <div ref={toolsBtnRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setToolsOpen((p) => !p); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    height: '2rem',
                    padding: '0 0.625rem',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    border: 'none',
                    flexShrink: 0,
                    background: toolsOpen
                      ? (isDark ? 'rgba(var(--pfc-accent-rgb), 0.12)' : 'rgba(var(--pfc-accent-rgb), 0.08)')
                      : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    color: toolsOpen
                      ? 'var(--m3-primary)'
                      : (isDark ? 'rgba(200,200,200,0.45)' : 'rgba(0,0,0,0.3)'),
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    fontFamily: 'var(--font-sans)',
                    transition: 'color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!toolsOpen) {
                      e.currentTarget.style.color = isDark ? 'rgba(230,230,230,0.7)' : 'rgba(0,0,0,0.5)';
                      e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!toolsOpen) {
                      e.currentTarget.style.color = isDark ? 'rgba(200,200,200,0.45)' : 'rgba(0,0,0,0.3)';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                  aria-label="Research tools"
                >
                  <WrenchIcon style={{ height: '0.875rem', width: '0.875rem' }} />
                  Tools
                </button>
                {/* Tools popup rendered via portal to escape overflow:hidden */}
                {toolsOpen && typeof document !== 'undefined' && createPortal(
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'fixed',
                      bottom: toolsPos.bottom,
                      left: toolsPos.left,
                      minWidth: '13rem',
                      padding: '0.375rem',
                      borderRadius: '0.75rem',
                      background: isCosmic ? 'rgba(14,12,26,0.5)' : isDark ? 'rgba(30,28,26,0.55)' : 'rgba(255,255,255,0.55)',
                      border: 'none',
                      backdropFilter: 'blur(24px) saturate(1.4)',
                      WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
                      boxShadow: isDark
                        ? '0 8px 32px -4px rgba(0,0,0,0.5)'
                        : '0 8px 32px -4px rgba(0,0,0,0.10), 0 0 0 1px rgba(255,255,255,0.5) inset',
                      zIndex: 9999,
                    }}
                  >
                    {[
                      { icon: SparklesIcon, label: 'Meta-Analysis', desc: 'Synthesize evidence', action: () => { setValue('Synthesize the meta-analytic evidence on '); setToolsOpen(false); textareaRef.current?.focus(); } },
                      { icon: NetworkIcon, label: 'Compare Studies', desc: 'Head-to-head', action: () => { setValue('Compare competing explanations for '); setToolsOpen(false); textareaRef.current?.focus(); } },
                      { icon: BookOpenIcon, label: 'Literature Review', desc: 'Survey the field', action: () => { setValue('What does the strongest evidence show about '); setToolsOpen(false); textareaRef.current?.focus(); } },
                    ].map((tool) => (
                      <button
                        key={tool.label}
                        type="button"
                        onClick={tool.action}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          width: '100%',
                          padding: '0.5rem 0.625rem',
                          borderRadius: '0.5rem',
                          border: 'none',
                          cursor: 'pointer',
                          background: 'transparent',
                          color: 'var(--foreground)',
                          fontSize: '0.8125rem',
                          fontFamily: 'var(--font-secondary)',
                          textAlign: 'left',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <tool.icon style={{ height: '0.875rem', width: '0.875rem', flexShrink: 0, color: 'var(--muted-foreground)' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, lineHeight: 1.2 }}>{tool.label}</div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', opacity: 0.7, lineHeight: 1.2 }}>{tool.desc}</div>
                        </div>
                      </button>
                    ))}
                  </motion.div>,
                  document.body,
                )}
              </div>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Send / Stop / Brain button */}
              {isProcessing ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full"
                  onClick={onStop}
                  aria-label="Stop generation"
                >
                  <StopCircleIcon className="h-4 w-4 text-destructive" />
                </Button>
              ) : trimmedValue ? (
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={handleSubmit}
                  aria-label="Send message"
                  style={{
                    height: '2.25rem',
                    width: '2.25rem',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    border: 'none',
                    flexShrink: 0,
                    background: 'var(--m3-primary)',
                    color: 'var(--m3-on-primary)',
                    transition: 'background 0.15s',
                  }}
                >
                  <ArrowUpIcon style={{ height: '1.125rem', width: '1.125rem' }} />
                </motion.button>
              ) : (
                <BrainButtonWithToggle isDark={isDark} brainGlow={brainGlow} onBrainTap={handleBrainTap} />
              )}
            </div>
          </>
        ) : (
          /* ═══ NON-HERO (chat mode) — single-row layout ═══ */
          <div className="flex w-full items-center gap-2">
            {showControlsToggle && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-7 w-7 shrink-0 rounded-xl transition-all duration-200',
                    liveControlsOpen
                      ? 'text-pfc-violet bg-pfc-violet/10'
                      : activeControlCount > 0
                        ? 'text-pfc-violet/70 bg-pfc-violet/5'
                        : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40',
                  )}
                  onClick={toggleLiveControls}
                  aria-label={`Toggle live controls${activeControlCount > 0 ? ` (${activeControlCount} active)` : ''}`}
                >
                  <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                </Button>
                {activeControlCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      minWidth: '0.875rem',
                      height: '0.875rem',
                      borderRadius: '9999px',
                      background: 'var(--color-pfc-violet, #8B5CF6)',
                      color: '#fff',
                      fontSize: '0.5rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      pointerEvents: 'none',
                    }}
                  >
                    {activeControlCount}
                  </span>
                )}
              </div>
            )}
            <div style={{ flex: 1, position: 'relative' }}>
              {placeholderOverlay && !value && (
                <div
                  onClick={() => textareaRef.current?.focus()}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'auto',
                    cursor: 'text',
                    zIndex: 1,
                  }}
                >
                  {placeholderOverlay}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onClick={handleSearchBarClick}
                placeholder={placeholderOverlay ? '' : 'Ask a research question...'}
                className="flex-1 resize-none bg-transparent leading-relaxed text-foreground placeholder:text-muted-foreground/40 outline-none border-0 focus:outline-none focus:border-0 focus-visible:outline-none px-0 text-sm min-h-[24px] max-h-[200px] py-0"
                rows={1}
                maxLength={10000}
                disabled={isProcessing}
                style={{ boxShadow: 'none', width: '100%', ...inputStyle }}
              />
            </div>
            {isProcessing ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full"
                onClick={onStop}
                aria-label="Stop generation"
              >
                <StopCircleIcon className="h-4 w-4 text-destructive" />
              </Button>
            ) : trimmedValue ? (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleSubmit}
                aria-label="Send message"
                style={{
                  height: '2.5rem',
                  width: '2.5rem',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: 'none',
                  flexShrink: 0,
                  background: 'var(--m3-primary)',
                  color: 'var(--m3-on-primary)',
                  transition: 'background 0.15s',
                }}
              >
                <ArrowUpIcon style={{ height: '1.125rem', width: '1.125rem' }} />
              </motion.button>
            ) : (
              <BrainButtonWithToggle isDark={isDark} brainGlow={brainGlow} onBrainTap={handleBrainTap} />
            )}
          </div>
        )}

        {/* Grok-style inline suggestions — only appear when typing */}
        <AnimatePresence>
          {showTyping && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              style={{ overflow: 'hidden', willChange: 'height, opacity', transform: 'translateZ(0)' }}
            >
              <div style={{
                borderTop: 'none',
                paddingTop: '0.375rem',
                marginTop: '0.5rem',
              }}>
                {visibleTypingSuggestions.map((s, i) => (
                  <motion.button
                    key={`t-${i}-${s.slice(0, 20)}`}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.025, duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
                    onClick={() => handleSuggestionClick(s)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      width: '100%',
                      padding: '0.5rem 0.375rem',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.8125rem',
                      borderRadius: '9999px',
                      color: isDark ? 'rgba(237,224,212,0.8)' : 'rgba(29,27,22,0.55)',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isDark ? 'var(--m3-surface-container-high)' : 'rgba(0,0,0,0.03)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <SearchIcon style={{
                      height: '0.875rem',
                      width: '0.875rem',
                      flexShrink: 0,
                      opacity: 0.3,
                    }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontWeight: 600,
                        color: isDark ? 'rgba(237,224,212,0.95)' : 'rgba(29,27,22,0.85)',
                      }}>
                        {trimmedValue}
                      </span>
                      <span style={{ opacity: 0.45 }}>
                        {s.slice(trimmedValue.length)}
                      </span>
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
