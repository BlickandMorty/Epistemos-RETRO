'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsDark } from '@/hooks/use-is-dark';
import {
  Sparkles,
  X,
  ArrowUp,
  Square,
  Copy,
  Check,
  PenLine,
  FileText,
  Maximize2,
  RefreshCw,
  CornerDownLeft,
  Brain,
  Pause,
  Play,
  CircleDot,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { Switch } from '@/components/ui/switch';
import type { LearningSession } from '@/lib/notes/learning-protocol';

/* ═══════════════════════════════════════════════════════════════════
   NoteAIChat — Izmi's thought bubble AI assistant

   A speech-bubble-styled, draggable AI panel that spawns next to the
   floating Izmi character. Features an animated greeting on first open,
   staggered option reveal, and the full Ask AI / Learn workflow.
   ═══════════════════════════════════════════════════════════════════ */

// ── Types ──────────────────────────────────────────────────────────

interface NoteAIChatProps {
  pageId: string;
  activeBlockId?: string | null;
  isOpen?: boolean;
  onClose?: () => void;
  /** Position of the Izmi character so bubble spawns next to it */
  charPos?: { x: number; y: number };
}

type QuickAction = {
  id: string;
  label: string;
  icon: React.ElementType;
  prompt: string;
  requiresBlock: boolean;
};

// ── Constants ──────────────────────────────────────────────────────

import { ease } from '@/lib/motion/motion-config';

const CUPERTINO_EASE = ease.cupertino;

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'continue',
    label: 'Continue writing',
    icon: PenLine,
    prompt: 'Continue writing from where this note left off. Match the tone and style.',
    requiresBlock: false,
  },
  {
    id: 'summarize',
    label: 'Summarize page',
    icon: FileText,
    prompt: 'Summarize the key points of this note page concisely.',
    requiresBlock: false,
  },
  {
    id: 'expand',
    label: 'Expand',
    icon: Maximize2,
    prompt: 'Expand on this block with more detail and supporting points.',
    requiresBlock: true,
  },
  {
    id: 'rewrite',
    label: 'Rewrite',
    icon: RefreshCw,
    prompt: 'Rewrite this block to be clearer and more concise.',
    requiresBlock: true,
  },
];

const BUBBLE_WIDTH = 310;
const BUBBLE_OFFSET_X = 60; // pixels to the right of character
const BUBBLE_OFFSET_Y = -20; // slightly above character center

// ── Animations ─────────────────────────────────────────────────────

const bubbleVariants = {
  initial: { opacity: 0, scale: 0.6, y: 10, filter: 'blur(8px)' },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.45, ease: CUPERTINO_EASE },
  },
  exit: {
    opacity: 0,
    scale: 0.7,
    y: 10,
    filter: 'blur(6px)',
    transition: { duration: 0.25, ease: CUPERTINO_EASE },
  },
};

const responseVariants = {
  initial: { opacity: 0, filter: 'blur(6px)', y: 4 },
  animate: {
    opacity: 1,
    filter: 'blur(0px)',
    y: 0,
    transition: { duration: 0.3, ease: CUPERTINO_EASE },
  },
  exit: {
    opacity: 0,
    filter: 'blur(6px)',
    y: 4,
    transition: { duration: 0.2, ease: CUPERTINO_EASE },
  },
};

// ── Greeting typewriter ────────────────────────────────────────────
// Izmi (dark): 3 lines — greeting → joke → transition
// Sunny (light): 2 lines — greeting → question

const IZMI_LINES = [
  'hello...Izmi get it....',
  'cuz my name is Izmi? 😂',
  'anyways.....',
];
const SUNNY_LINES = [
  'whats up wit it? ☀️',
  'anything in mind?',
];
const TYPE_SPEED = 35; // ms per char

function useGreetingTypewriter(shouldAnimate: boolean, isDark: boolean) {
  const lines = isDark ? IZMI_LINES : SUNNY_LINES;
  const characterKey = isDark ? 'izmi' : 'sunny';
  const [typedLines, setTypedLines] = useState<string[]>(() => lines.map(() => ''));
  const [showOptions, setShowOptions] = useState(false);
  const [done, setDone] = useState(false);
  // Track which character has played — keyed per character so switching resets
  const hasPlayedRef = useRef<Record<string, boolean>>({});
  const lastCharRef = useRef(characterKey);

  useEffect(() => {
    // Detect character switch → reset state for fresh typewriter
    if (lastCharRef.current !== characterKey) {
      lastCharRef.current = characterKey;
      setTypedLines(lines.map(() => ''));
      setShowOptions(false);
      setDone(false);
    }

    if (!shouldAnimate) return;

    if (hasPlayedRef.current[characterKey]) {
      // Already played for this character → show full text immediately
      setTypedLines(lines.map((l) => l));
      setShowOptions(true);
      setDone(true);
      return;
    }
    hasPlayedRef.current[characterKey] = true;

    let cancelled = false;
    let lineIdx = 0;
    let charIdx = 0;

    const typeNext = () => {
      if (cancelled) return;
      if (lineIdx >= lines.length) {
        setDone(true);
        setTimeout(() => { if (!cancelled) setShowOptions(true); }, 300);
        return;
      }
      if (charIdx <= lines[lineIdx]!.length) {
        setTypedLines((prev) => {
          const next = [...prev];
          next[lineIdx] = lines[lineIdx]!.slice(0, charIdx);
          return next;
        });
        charIdx++;
        setTimeout(typeNext, TYPE_SPEED);
      } else {
        // Move to next line with a pause
        lineIdx++;
        charIdx = 0;
        setTimeout(typeNext, 400);
      }
    };

    // Start after a short delay
    setTimeout(typeNext, 200);
    return () => { cancelled = true; };
  // SAFETY: lines is derived from characterKey and intentionally not listed — the
  // effect should only restart when the character changes or animation toggles.
  // hasPlayedRef and lastCharRef are stable refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAnimate, characterKey]);

  return { typedLines, showOptions, done };
}

// ── AI Learn types & helpers ─────────────────────────────────────

type LearningDepth = 'shallow' | 'moderate' | 'deep';
type StepStatus = 'pending' | 'running' | 'completed' | 'error';

interface ProtocolStep {
  id: string;
  title: string;
  status: StepStatus;
  insightCount?: number;
}

const PROTOCOL_STEP_TITLES = [
  'Content extraction',
  'Pattern recognition',
  'Concept mapping',
  'Gap analysis',
  'Insight synthesis',
  'Cross-reference linking',
  'Knowledge consolidation',
];

const DEPTH_LABELS: Record<LearningDepth, { label: string; passes: number }> = {
  shallow:  { label: 'Shallow',  passes: 1 },
  moderate: { label: 'Moderate', passes: 2 },
  deep:     { label: 'Deep',     passes: 5 },
};

const INTERVAL_OPTIONS = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 120, label: '2h' },
  { value: 240, label: '4h' },
  { value: 480, label: '8h' },
];

function deriveSteps(session: LearningSession | null): ProtocolStep[] {
  if (!session) {
    return PROTOCOL_STEP_TITLES.map((title, i) => ({
      id: `step-${i}`,
      title,
      status: 'pending' as StepStatus,
    }));
  }
  return session.steps.map((step, i) => ({
    id: step.id,
    title: step.title || PROTOCOL_STEP_TITLES[i] || `Step ${i + 1}`,
    status: (step.status === 'skipped' ? 'completed' : step.status) as StepStatus,
    insightCount: step.insights.length || undefined,
  }));
}

function getOverallProgress(session: LearningSession | null): number {
  if (!session) return 0;
  if (session.status === 'completed') return 1;
  const total = session.steps.length;
  if (total === 0) return 0;
  const completed = session.steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
  const running = session.steps.filter((s) => s.status === 'running').length;
  return Math.min((completed + running * 0.5) / total, 0.99);
}

type AITab = 'ask' | 'learn';

// ── Component ──────────────────────────────────────────────────────

export function NoteAIChat({ pageId, activeBlockId, isOpen, onClose, charPos }: NoteAIChatProps) {
  const { isDark, isSunny } = useIsDark();

  // ── Greeting animation (only on very first open, resets per character) ──
  const [greetingMode, setGreetingMode] = useState(true);
  const hasEverInteracted = useRef(false);
  const prevCharRef = useRef(isDark ? 'izmi' : 'sunny');
  const { typedLines, showOptions, done: greetingDone } = useGreetingTypewriter(isOpen ?? false, isDark);
  const charName = isDark ? 'Izmi' : 'Sunny';

  // Reset greeting when character changes (theme switch)
  useEffect(() => {
    const currentChar = isDark ? 'izmi' : 'sunny';
    if (prevCharRef.current !== currentChar) {
      prevCharRef.current = currentChar;
      // Re-enter greeting mode so the new character introduces itself
      if (!hasEverInteracted.current) {
        setGreetingMode(true);
      }
    }
  }, [isDark]);

  // ── Bubble position — always attached to the character GIF ──
  // The bubble derives its position from charPos (the GIF), not independently draggable.
  // When the user drags the GIF, the bubble follows automatically.
  const headerRef = useRef<HTMLDivElement>(null);

  const currentPos = (() => {
    if (!charPos) {
      return { x: typeof window !== 'undefined' ? window.innerWidth - 340 : 800, y: 200 };
    }
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    // Position bubble to the right of the GIF, clamped to viewport
    let x = charPos.x + BUBBLE_OFFSET_X;
    let y = charPos.y + BUBBLE_OFFSET_Y;
    // If bubble would overflow right edge, flip to left side
    if (x + BUBBLE_WIDTH + 16 > vw) {
      x = charPos.x - BUBBLE_WIDTH - 12;
    }
    x = Math.max(8, Math.min(vw - BUBBLE_WIDTH - 8, x));
    y = Math.max(48, Math.min(vh - 200, y));
    return { x, y };
  })();

  // ── Controlled vs internal expansion ──
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isOpen ?? internalExpanded;
  const setIsExpanded = onClose
    ? (v: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof v === 'function' ? v(isExpanded) : v;
        if (!next && onClose) onClose();
        else setInternalExpanded(next);
      }
    : setInternalExpanded;
  const [inputValue, setInputValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [hasResponse, setHasResponse] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [activeTab, setActiveTab] = useState<AITab>('ask');

  const inputRef = useRef<HTMLInputElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const miscTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  // Clear any pending misc timers on unmount (copy feedback, focus delay)
  useEffect(() => () => { if (miscTimerRef.current) clearTimeout(miscTimerRef.current); }, []);

  // ── Store state — Ask AI ──
  const noteAI = usePFCStore((s) => s.noteAI);
  const startNoteAIGeneration = usePFCStore((s) => s.startNoteAIGeneration);
  const stopNoteAIGeneration = usePFCStore((s) => s.stopNoteAIGeneration);
  const createBlock = usePFCStore((s) => s.createBlock);
  const updateBlockContent = usePFCStore((s) => s.updateBlockContent);
  const pushTransaction = usePFCStore((s) => s.pushTransaction);
  const noteBlocks = usePFCStore((s) => s.noteBlocks);

  // ── Store state — AI Learn ──
  const learningSession = usePFCStore((s) => s.learningSession);
  const learningStreamText = usePFCStore((s) => s.learningStreamText);
  const learningAutoRun = usePFCStore((s) => s.learningAutoRun);
  const startLearningSession = usePFCStore((s) => s.startLearningSession);
  const pauseLearningSession = usePFCStore((s) => s.pauseLearningSession);
  const resumeLearningSession = usePFCStore((s) => s.resumeLearningSession);
  const stopLearningSession = usePFCStore((s) => s.stopLearningSession);
  const setLearningAutoRun = usePFCStore((s) => s.setLearningAutoRun);
  const schedulerConfig = usePFCStore((s) => s.schedulerConfig);
  const updateSchedulerConfig = usePFCStore((s) => s.updateSchedulerConfig);
  const [learnDepth, setLearnDepth] = useState<LearningDepth>('moderate');

  // ── Derived learning state ──
  const learnStatus: string = learningSession?.status ?? 'idle';
  const learnIsRunning = learnStatus === 'running';
  const learnIsPaused = learnStatus === 'paused';
  const learnIsCompleted = learnStatus === 'completed';
  const learnIsActive = learnIsRunning || learnIsPaused;
  const learnSteps = deriveSteps(learningSession);
  const learnProgress = getOverallProgress(learningSession);
  const learnCurrentPass: number = learningSession?.iteration ?? 1;
  const learnTotalPasses: number = learningSession?.maxIterations ?? 1;
  const learnInsights: number = learningSession?.totalInsights ?? 0;
  const learnPagesCreated: number = learningSession?.totalPagesCreated ?? 0;
  const learnBlocksAdded: number = learningSession?.totalBlocksCreated ?? 0;

  const learnStreamRef = useRef<HTMLDivElement>(null);

  // Auto-scroll learn stream
  useEffect(() => {
    if (learnIsRunning && learnStreamRef.current) {
      learnStreamRef.current.scrollTop = learnStreamRef.current.scrollHeight;
    }
  }, [learnIsRunning, learningStreamText]);

  // Auto-switch to learn tab when session starts
  useEffect(() => {
    if (learnIsActive || learnIsCompleted) {
      setActiveTab('learn');
      setGreetingMode(false);
      if (!isExpanded) setInternalExpanded(true);
    }
  }, [learnIsActive, learnIsCompleted, isExpanded]);

  const isGenerating = noteAI?.isGenerating ?? false;
  const generatedText = noteAI?.generatedText ?? '';

  // Sync generated text to local response state
  useEffect(() => {
    if (generatedText) {
      setResponseText(generatedText);
      setHasResponse(true);
    }
  }, [generatedText]);

  // Auto-scroll response area during streaming
  useEffect(() => {
    if (isGenerating && responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [isGenerating, responseText]);

  // Focus input on expand (when not in greeting mode)
  useEffect(() => {
    if (isExpanded && !greetingMode) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isExpanded, greetingMode]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape' && isExpanded) {
        if (isGenerating) {
          stopNoteAIGeneration();
        } else if (onClose) {
          onClose();
        } else {
          setInternalExpanded(false);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, isGenerating, stopNoteAIGeneration, onClose]);

  // ── Handlers ──

  const handleSend = useCallback(() => {
    const prompt = inputValue.trim();
    if (!prompt || isGenerating) return;
    setGreetingMode(false);
    hasEverInteracted.current = true;
    setHasResponse(false);
    setResponseText('');
    startNoteAIGeneration(pageId, activeBlockId ?? null, prompt);
    setInputValue('');
  }, [inputValue, isGenerating, pageId, activeBlockId, startNoteAIGeneration]);

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      if (isGenerating) return;
      if (action.requiresBlock && !activeBlockId) return;
      setGreetingMode(false);
      hasEverInteracted.current = true;
      setHasResponse(false);
      setResponseText('');
      startNoteAIGeneration(
        pageId,
        action.requiresBlock ? (activeBlockId ?? null) : null,
        action.prompt,
      );
    },
    [isGenerating, activeBlockId, pageId, startNoteAIGeneration],
  );

  const handleStop = useCallback(() => {
    stopNoteAIGeneration();
  }, [stopNoteAIGeneration]);

  const handleInsert = useCallback(() => {
    if (!responseText) return;
    createBlock(pageId, null, activeBlockId ?? null, responseText);
    setHasResponse(false);
    setResponseText('');
  }, [responseText, pageId, activeBlockId, createBlock]);

  const handleReplace = useCallback(() => {
    if (!responseText || !activeBlockId) return;
    // Push undo transaction so Cmd+Z can revert the AI replacement
    const oldBlock = noteBlocks.find((b: { id: string }) => b.id === activeBlockId);
    if (oldBlock) {
      pushTransaction(
        [{ action: 'update' as const, blockId: activeBlockId, pageId: pageId, data: { content: responseText } }],
        [{ action: 'update' as const, blockId: activeBlockId, pageId: pageId, previousData: { content: oldBlock.content } }],
      );
    }
    updateBlockContent(activeBlockId, responseText);
    setHasResponse(false);
    setResponseText('');
  }, [responseText, activeBlockId, updateBlockContent, noteBlocks, pushTransaction, pageId]);

  const handleCopy = useCallback(async () => {
    if (!responseText) return;
    try {
      await navigator.clipboard.writeText(responseText);
      setCopied(true);
      if (miscTimerRef.current) clearTimeout(miscTimerRef.current);
      miscTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch { /* Clipboard API may fail */ }
  }, [responseText]);

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleClose = useCallback(() => {
    if (isGenerating) stopNoteAIGeneration();
    if (onClose) onClose();
    else setInternalExpanded(false);
  }, [isGenerating, stopNoteAIGeneration, onClose]);

  // ── Transition from greeting → full panel ──
  const enterFullMode = useCallback(() => {
    setGreetingMode(false);
    hasEverInteracted.current = true;
    if (miscTimerRef.current) clearTimeout(miscTimerRef.current);
    miscTimerRef.current = setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ── Styles — distinct designs per character ──
  // Izmi (dark): deep midnight glass with amber accents
  // Sunny (light): warm sky-blue glass with golden accents

  const glassBackground = isDark
    ? 'rgba(20, 20, 28, 0.88)'
    : 'rgba(235, 245, 255, 0.92)';

  const glassBorder = isDark
    ? 'rgba(255, 255, 255, 0.06)'
    : 'rgba(130, 180, 220, 0.22)';

  const subtleText = isDark
    ? 'rgba(255, 255, 255, 0.45)'
    : 'rgba(60, 90, 120, 0.55)';

  const bodyText = isDark
    ? 'rgba(255, 255, 255, 0.8)'
    : 'rgba(30, 55, 85, 0.85)';

  const inputBg = isDark
    ? 'rgba(255, 255, 255, 0.05)'
    : 'rgba(100, 160, 220, 0.06)';

  const inputBorder = isDark
    ? 'rgba(255, 255, 255, 0.08)'
    : 'rgba(100, 160, 220, 0.14)';

  const hoverBg = isDark
    ? 'rgba(255, 255, 255, 0.06)'
    : 'rgba(100, 160, 220, 0.1)';

  // Determine tail direction (point toward Izmi)
  const tailOnLeft = charPos ? currentPos.x > charPos.x + 24 : false;

  // ── Collapsed → render nothing ──
  if (!isExpanded) return null;

  // ── Main bubble render ──
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={isDark ? 'izmi-bubble' : 'sunny-bubble'}
        variants={bubbleVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{
          position: 'fixed',
          left: currentPos.x,
          top: currentPos.y,
          width: BUBBLE_WIDTH,
          maxHeight: greetingMode ? 300 : 440,
          display: 'flex',
          flexDirection: 'column',
          background: glassBackground,
          border: `1px solid ${glassBorder}`,
          borderRadius: isDark ? '1.125rem' : '1.25rem',
          backdropFilter: isDark ? 'blur(14px) saturate(1.3)' : 'blur(16px) saturate(1.2)',
          WebkitBackdropFilter: isDark ? 'blur(14px) saturate(1.3)' : 'blur(16px) saturate(1.2)',
          boxShadow: isDark
            ? '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)'
            : '0 8px 32px rgba(100,160,220,0.15), 0 2px 8px rgba(100,160,220,0.08), inset 0 1px 0 rgba(255,255,255,0.5)',
          overflow: 'visible',
          zIndex: 'calc(var(--z-modal) + 1)',
          touchAction: 'none',
        }}
      >
        {/* ── Speech bubble tail ── */}
        <div
          style={{
            position: 'absolute',
            bottom: tailOnLeft ? undefined : undefined,
            top: 18,
            [tailOnLeft ? 'left' : 'right']: undefined,
            // Position the tail on the side closer to Izmi
            ...(tailOnLeft
              ? { left: -8 }
              : { left: -8 }),
            width: 0,
            height: 0,
            borderTop: '6px solid transparent',
            borderBottom: '6px solid transparent',
            borderRight: `8px solid ${glassBackground}`,
            filter: isDark ? 'drop-shadow(-2px 0 2px rgba(0,0,0,0.3))' : 'drop-shadow(-2px 0 2px rgba(100,160,220,0.1))',
            zIndex: 1,
          }}
        />

        {/* ── Header (no drag — bubble follows the GIF) ── */}
        <div
          ref={headerRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 0.625rem 0.375rem 0.625rem',
            borderBottom: greetingMode ? 'none' : `1px solid ${glassBorder}`,
            cursor: 'default',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          {/* Character name badge — theme-aware */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            {isSunny ? (
              <img src="/pixel-sun.gif" alt="" draggable={false} style={{ width: 20, height: 20, imageRendering: 'pixelated', borderRadius: '50%', pointerEvents: 'none' }} />
            ) : isDark ? (
              <img src="/pixel-robot.gif" alt="" draggable={false} style={{ width: 20, height: 20, imageRendering: 'pixelated', borderRadius: '50%', pointerEvents: 'none' }} />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.08)', color: 'rgba(0,0,0,0.45)', pointerEvents: 'none' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
              </span>
            )}
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 500,
              fontFamily: 'var(--font-secondary)',
              color: bodyText,
              letterSpacing: '-0.01em',
            }}>
              {charName}
            </span>
            <span style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: isDark ? '#34D399' : '#F4B860',
              flexShrink: 0,
            }} />
          </div>

          {/* Tab pills (hidden during greeting) + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {!greetingMode && (
              <div style={{
                display: 'flex', gap: '0.15rem', background: inputBg,
                borderRadius: '9999px', padding: '0.125rem',
              }}>
                <TabPill
                  active={activeTab === 'ask'}
                  onClick={() => setActiveTab('ask')}
                  isDark={isDark}
                  subtleText={subtleText}
                >
                  <Sparkles style={{ width: 9, height: 9 }} />Ask
                </TabPill>
                <TabPill
                  active={activeTab === 'learn'}
                  onClick={() => setActiveTab('learn')}
                  isDark={isDark}
                  subtleText={subtleText}
                >
                  <Brain style={{ width: 9, height: 9 }} />Learn
                  {learnIsRunning && (
                    <span style={{
                      width: 4, height: 4, borderRadius: '50%',
                      background: '#34D399', animation: 'izmi-pulse 1.5s ease-in-out infinite',
                    }} />
                  )}
                </TabPill>
              </div>
            )}
            <motion.button
              onClick={handleClose}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: '50%',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: subtleText,
              }}
              aria-label="Close"
            >
              <X style={{ width: 12, height: 12 }} />
            </motion.button>
          </div>
        </div>

        {/* ═══ GREETING MODE ═══ */}
        {greetingMode && (
          <div style={{ padding: '0.5rem 0.75rem 0.625rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Typewriter greeting — dynamic lines for Izmi (3) or Sunny (2) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {typedLines.map((text, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === typedLines.length - 1;
                // Show cursor on the line currently being typed (non-empty, and next line hasn't started)
                const isActivelyTyping = !greetingDone && text.length > 0 &&
                  (idx === typedLines.length - 1 || typedLines[idx + 1]!.length === 0);
                if (text.length === 0 && !isFirst) return null;
                return (
                  <span key={idx} style={{
                    fontSize: isFirst ? '0.8125rem' : '0.75rem',
                    fontWeight: isFirst ? 500 : 400,
                    fontFamily: 'var(--font-secondary)',
                    color: isFirst ? bodyText : (isLast && !isFirst) ? subtleText : bodyText,
                    letterSpacing: isFirst ? '-0.01em' : undefined,
                    minHeight: '1.2em',
                  }}>
                    {text}
                    {isActivelyTyping && (
                      <span className="izmi-cursor" style={{
                        display: 'inline-block', width: 2, height: '0.85em',
                        marginLeft: 1, background: 'var(--pfc-accent)',
                        verticalAlign: 'text-bottom', borderRadius: 1,
                      }} />
                    )}
                  </span>
                );
              })}
            </div>

            {/* Animated option buttons */}
            <AnimatePresence>
              {showOptions && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.25rem' }}
                >
                  {[
                    { label: '✍️ Help me write', action: () => { enterFullMode(); setActiveTab('ask'); } },
                    { label: '📝 Summarize this page', action: () => handleQuickAction(QUICK_ACTIONS[1]!) },
                    { label: '🧠 Learn from my notes', action: () => { enterFullMode(); setActiveTab('learn'); } },
                    { label: '💬 Ask something else', action: () => { enterFullMode(); setActiveTab('ask'); } },
                  ].map((opt, i) => (
                    <motion.button
                      key={opt.label}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: i * 0.08,
                        duration: 0.3,
                        ease: CUPERTINO_EASE,
                      }}
                      onClick={opt.action}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.97 }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.625rem',
                        fontSize: '0.6875rem',
                        fontWeight: 400,
                        fontFamily: 'var(--font-secondary)',
                        color: bodyText,
                        background: inputBg,
                        border: `1px solid ${inputBorder}`,
                        borderRadius: '0.625rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s, border-color 0.15s',
                        letterSpacing: '-0.005em',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = hoverBg;
                        (e.currentTarget as HTMLElement).style.borderColor = isDark
                          ? 'rgba(var(--pfc-accent-rgb), 0.25)'
                          : 'rgba(100, 160, 220, 0.35)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = inputBg;
                        (e.currentTarget as HTMLElement).style.borderColor = inputBorder;
                      }}
                    >
                      {opt.label}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ═══ FULL PANEL — ASK AI TAB ═══ */}
        {!greetingMode && activeTab === 'ask' && (
          <>
            {/* Quick actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', padding: '0.5rem 0.625rem 0.375rem', flexShrink: 0 }}>
              {QUICK_ACTIONS.map((action) => {
                const ActionIcon = action.icon;
                const disabled = isGenerating || (action.requiresBlock && !activeBlockId);
                return (
                  <motion.button
                    key={action.id}
                    onClick={() => handleQuickAction(action)}
                    disabled={disabled}
                    whileTap={disabled ? undefined : { scale: 0.92 }}
                    transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                      padding: '0.2rem 0.5rem', fontSize: '0.625rem', fontWeight: 500,
                      letterSpacing: '-0.005em',
                      color: disabled ? subtleText : bodyText,
                      background: inputBg, border: `1px solid ${inputBorder}`,
                      borderRadius: '9999px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap',
                      transition: 'background 0.15s, opacity 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = inputBg; }}
                    title={action.requiresBlock && !activeBlockId ? 'Select a block first' : action.label}
                  >
                    <ActionIcon style={{ width: 10, height: 10, flexShrink: 0 }} />
                    {action.label}
                  </motion.button>
                );
              })}
            </div>

            {/* Response area */}
            <AnimatePresence>
              {(isGenerating || hasResponse) && (
                <motion.div
                  variants={responseVariants}
                  initial="initial" animate="animate" exit="exit"
                  style={{ flexShrink: 0, overflow: 'hidden', transform: 'translateZ(0)' }}
                >
                  <div ref={responseRef} style={{
                    maxHeight: 100, overflowY: 'auto', padding: '0.375rem 0.75rem',
                    fontSize: '0.6875rem', lineHeight: 1.55, color: bodyText, scrollbarWidth: 'thin',
                    scrollbarColor: isDark ? 'rgba(244,189,111,0.15) transparent' : 'rgba(0,0,0,0.1) transparent',
                  }}>
                    {responseText || ''}
                    {isGenerating && (
                      <span className="animate-blink" style={{
                        display: 'inline-block', width: 6, height: 13, marginLeft: 2,
                        background: 'var(--pfc-accent)', borderRadius: 1.5, verticalAlign: 'text-bottom',
                      }} />
                    )}
                  </div>
                  {hasResponse && !isGenerating && (
                    <div style={{ display: 'flex', gap: '0.3rem', padding: '0.25rem 0.625rem 0.375rem', borderTop: `1px solid ${glassBorder}` }}>
                      <ActionButton onClick={handleInsert} isDark={isDark} inputBg={inputBg} inputBorder={inputBorder} hoverBg={hoverBg} bodyText={bodyText}>
                        <CornerDownLeft style={{ width: 9, height: 9 }} />Insert
                      </ActionButton>
                      {activeBlockId && (
                        <ActionButton onClick={handleReplace} isDark={isDark} inputBg={inputBg} inputBorder={inputBorder} hoverBg={hoverBg} bodyText={bodyText}>
                          <RefreshCw style={{ width: 9, height: 9 }} />Replace
                        </ActionButton>
                      )}
                      <ActionButton onClick={handleCopy} isDark={isDark} inputBg={inputBg} inputBorder={inputBorder} hoverBg={hoverBg} bodyText={bodyText}>
                        {copied ? <Check style={{ width: 9, height: 9, color: '#34D399' }} /> : <Copy style={{ width: 9, height: 9 }} />}
                        {copied ? 'Copied' : 'Copy'}
                      </ActionButton>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.5rem 0.5rem', marginTop: 'auto', flexShrink: 0 }}>
              <input
                ref={inputRef} type="text" value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                disabled={isGenerating}
                placeholder={`Ask ${charName} anything...`}
                style={{
                  flex: 1, height: 28, padding: '0 0.5rem', fontSize: '0.6875rem', fontFamily: 'var(--font-secondary)',
                  color: bodyText, background: inputBg, border: `1px solid ${inputBorder}`,
                  borderRadius: '0.5rem', outline: 'none',
                  opacity: isGenerating ? 0.5 : 1, transition: 'border-color 0.15s, opacity 0.15s',
                }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = isDark ? 'rgba(196,149,106,0.4)' : 'rgba(100,160,220,0.4)'; }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = inputBorder; }}
              />
              {isGenerating ? (
                <motion.button onClick={handleStop} whileTap={{ scale: 0.92 }}
                  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(224,120,80,0.15)', border: '1px solid rgba(224,120,80,0.25)',
                    cursor: 'pointer', color: '#E07850', flexShrink: 0,
                  }} aria-label="Stop generation">
                  <Square style={{ width: 11, height: 11, fill: 'currentColor' }} />
                </motion.button>
              ) : (
                <motion.button onClick={handleSend} disabled={!inputValue.trim()}
                  whileTap={inputValue.trim() ? { scale: 0.92 } : undefined}
                  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: '50%',
                    background: inputValue.trim()
                      ? (isDark ? 'rgba(196,149,106,0.15)' : 'rgba(91,143,199,0.12)')
                      : inputBg,
                    border: `1px solid ${inputValue.trim()
                      ? (isDark ? 'rgba(196,149,106,0.3)' : 'rgba(91,143,199,0.25)')
                      : inputBorder}`,
                    cursor: inputValue.trim() ? 'pointer' : 'default',
                    color: inputValue.trim() ? 'var(--pfc-accent)' : subtleText,
                    flexShrink: 0, opacity: inputValue.trim() ? 1 : 0.5,
                    transition: 'background 0.15s, border-color 0.15s, opacity 0.15s',
                  }} aria-label="Send prompt">
                  <ArrowUp style={{ width: 13, height: 13 }} />
                </motion.button>
              )}
            </div>
            <div style={{ textAlign: 'right', padding: '0 0.625rem 0.375rem', fontSize: '0.5625rem', color: subtleText, letterSpacing: '-0.005em', flexShrink: 0 }}>
              {isGenerating ? 'Esc to stop' : 'Cmd+Enter to send  ·  Esc to close'}
            </div>
          </>
        )}

        {/* ═══ FULL PANEL — AI LEARN TAB ═══ */}
        {!greetingMode && activeTab === 'learn' && (
          <>
            {(learnIsActive || learnIsCompleted) ? (
              <>
                {/* Progress bar */}
                <div style={{ height: 2, width: '100%', background: isDark ? 'rgba(79,69,57,0.3)' : 'rgba(0,0,0,0.04)', flexShrink: 0 }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${learnProgress * 100}%` }}
                    transition={{ duration: 0.4, ease: CUPERTINO_EASE }}
                    style={{ height: '100%', background: learnIsCompleted ? '#34D399' : 'linear-gradient(90deg, #C4956A, #D4B896)', borderRadius: 1 }}
                  />
                </div>

                {/* Status header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.625rem 0.25rem 0.75rem', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                      padding: '0.1rem 0.4rem', fontSize: '0.5625rem', fontWeight: 500,
                      borderRadius: '0.5rem',
                      background: learnIsRunning ? 'rgba(52,211,153,0.12)' : learnIsPaused ? 'rgba(251,191,36,0.12)' : 'rgba(52,211,153,0.12)',
                      color: learnIsRunning ? '#34D399' : learnIsPaused ? '#FBBF24' : '#34D399',
                      border: `1px solid ${learnIsRunning ? 'rgba(52,211,153,0.2)' : learnIsPaused ? 'rgba(251,191,36,0.2)' : 'rgba(52,211,153,0.2)'}`,
                    }}>
                      {learnIsRunning && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34D399', animation: 'izmi-pulse 1.5s ease-in-out infinite' }} />}
                      {learnIsRunning ? 'Running' : learnIsPaused ? 'Paused' : 'Done'}
                      {learnIsCompleted && <Check style={{ width: 8, height: 8 }} />}
                    </span>
                    <span style={{ fontSize: '0.5625rem', fontWeight: 500, color: subtleText }}>
                      Pass {learnCurrentPass}/{learnTotalPasses}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {(learnIsRunning || learnIsPaused) && (
                      <motion.button onClick={learnIsPaused ? resumeLearningSession : pauseLearningSession}
                        whileTap={{ scale: 0.92 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '0.375rem', background: 'transparent', border: 'none', cursor: 'pointer', color: subtleText }}
                        aria-label={learnIsPaused ? 'Resume' : 'Pause'}>
                        {learnIsPaused ? <Play style={{ width: 12, height: 12 }} /> : <Pause style={{ width: 12, height: 12 }} />}
                      </motion.button>
                    )}
                    <motion.button onClick={stopLearningSession}
                      whileTap={{ scale: 0.92 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '0.375rem', background: 'transparent', border: 'none', cursor: 'pointer', color: subtleText }}
                      aria-label="Stop learning">
                      <X style={{ width: 13, height: 13 }} />
                    </motion.button>
                  </div>
                </div>

                {/* Steps */}
                <div style={{ padding: '0.375rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', maxHeight: 180, overflowY: 'auto', scrollbarWidth: 'thin' }}>
                  {learnSteps.map((step) => (
                    <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0' }}>
                      <LearnStepIcon status={step.status} isDark={isDark} />
                      <span style={{
                        flex: 1, fontSize: '0.6875rem', fontWeight: step.status === 'running' ? 500 : 400,
                        color: step.status === 'completed' ? bodyText : step.status === 'running' ? '#D4B896' : step.status === 'error' ? '#F87171' : subtleText,
                      }}>
                        {step.title}
                      </span>
                      {step.status === 'completed' && step.insightCount != null && step.insightCount > 0 && (
                        <span style={{ fontSize: '0.5625rem', fontWeight: 500, padding: '0.05rem 0.35rem', borderRadius: '0.375rem', background: 'rgba(52,211,153,0.1)', color: '#34D399', border: '1px solid rgba(52,211,153,0.15)', flexShrink: 0 }}>
                          {step.insightCount}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Stream preview */}
                {learnIsRunning && learningStreamText && (
                  <div style={{ borderTop: `1px solid ${glassBorder}`, flexShrink: 0 }}>
                    <div ref={learnStreamRef} style={{
                      maxHeight: 48, overflowY: 'auto', padding: '0.375rem 0.75rem',
                      fontSize: '0.625rem', lineHeight: 1.5, fontFamily: 'var(--font-mono)',
                      color: isDark ? 'rgba(237,224,212,0.35)' : 'rgba(0,0,0,0.3)',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word', scrollbarWidth: 'none',
                    }}>
                      {learningStreamText}
                    </div>
                  </div>
                )}

                {/* Completed summary */}
                {learnIsCompleted && (
                  <div style={{ borderTop: `1px solid ${glassBorder}`, padding: '0.5rem 0.75rem', flexShrink: 0 }}>
                    <p style={{ fontSize: '0.6875rem', color: bodyText, marginBottom: '0.5rem', lineHeight: 1.5 }}>
                      <span style={{ color: '#34D399', fontWeight: 600 }}>{learnInsights}</span> insights,{' '}
                      <span style={{ color: '#D4B896', fontWeight: 600 }}>{learnPagesCreated}</span> pages,{' '}
                      <span style={{ color: '#E07850', fontWeight: 600 }}>{learnBlocksAdded}</span> blocks
                    </p>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <motion.button onClick={() => startLearningSession(learnDepth, DEPTH_LABELS[learnDepth].passes)}
                        whileTap={{ scale: 0.92 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                        style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.35rem 0.625rem', fontSize: '0.6875rem', fontWeight: 500, color: '#D4B896', background: 'rgba(196,149,106,0.1)', border: '1px solid rgba(196,149,106,0.2)', borderRadius: '9999px', cursor: 'pointer' }}>
                        <RotateCcw style={{ width: 11, height: 11 }} />Run Again
                      </motion.button>
                      <motion.button onClick={stopLearningSession}
                        whileTap={{ scale: 0.92 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                        style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.35rem 0.625rem', fontSize: '0.6875rem', fontWeight: 500, color: bodyText, background: inputBg, border: `1px solid ${glassBorder}`, borderRadius: '9999px', cursor: 'pointer' }}>
                        Close
                      </motion.button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Idle learn state — depth selector + start */
              <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <p style={{ fontSize: '0.625rem', lineHeight: 1.5, color: subtleText, margin: 0 }}>
                  {charName} will recursively analyze and deepen your notes
                </p>

                {/* Depth selector */}
                <div style={{ display: 'flex', gap: '0.3rem', background: inputBg, borderRadius: '9999px', padding: '0.2rem' }}>
                  {(['shallow', 'moderate', 'deep'] as LearningDepth[]).map((d) => (
                    <motion.button key={d} onClick={() => setLearnDepth(d)}
                      whileTap={{ scale: 0.97 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                      style={{
                        flex: 1, padding: '0.3rem 0', fontSize: '0.625rem',
                        fontWeight: learnDepth === d ? 600 : 400,
                        color: learnDepth === d ? '#D4B896' : subtleText,
                        background: learnDepth === d ? (isDark ? 'rgba(196,149,106,0.12)' : 'rgba(196,149,106,0.1)') : 'transparent',
                        border: learnDepth === d ? '1px solid rgba(196,149,106,0.2)' : '1px solid transparent',
                        borderRadius: '9999px', cursor: 'pointer',
                        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                      }}>
                      {DEPTH_LABELS[d].label}
                    </motion.button>
                  ))}
                </div>

                {/* Auto-learn toggle + config */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 450, color: bodyText }}>Auto-learn</span>
                    <Switch
                      checked={learningAutoRun}
                      onCheckedChange={(v) => setLearningAutoRun(!!v)}
                      size="sm"
                      activeColor="#C4956A"
                    />
                  </div>

                  {/* Expanded auto-learn settings when enabled */}
                  <AnimatePresence>
                    {learningAutoRun && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: CUPERTINO_EASE }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', paddingTop: '0.25rem' }}>
                          {/* Interval selector */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.5625rem', color: subtleText }}>Interval</span>
                            <div style={{ display: 'flex', gap: '0.125rem' }}>
                              {INTERVAL_OPTIONS.map(opt => (
                                <button key={opt.value} onClick={() => updateSchedulerConfig({ intervalMinutes: opt.value })}
                                  style={{
                                    padding: '0.15rem 0.375rem', fontSize: '0.5rem', fontWeight: schedulerConfig.intervalMinutes === opt.value ? 600 : 400,
                                    color: schedulerConfig.intervalMinutes === opt.value ? '#D4B896' : subtleText,
                                    background: schedulerConfig.intervalMinutes === opt.value ? (isDark ? 'rgba(196,149,106,0.12)' : 'rgba(196,149,106,0.1)') : 'transparent',
                                    border: schedulerConfig.intervalMinutes === opt.value ? '1px solid rgba(196,149,106,0.2)' : '1px solid transparent',
                                    borderRadius: '9999px', cursor: 'pointer', transition: 'all 0.15s',
                                  }}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Auto depth selector */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.5625rem', color: subtleText }}>Auto depth</span>
                            <div style={{ display: 'flex', gap: '0.125rem' }}>
                              {(['shallow', 'moderate', 'deep'] as const).map(d => (
                                <button key={d} onClick={() => updateSchedulerConfig({ depth: d })}
                                  style={{
                                    padding: '0.15rem 0.375rem', fontSize: '0.5rem', fontWeight: schedulerConfig.depth === d ? 600 : 400,
                                    color: schedulerConfig.depth === d ? '#D4B896' : subtleText,
                                    background: schedulerConfig.depth === d ? (isDark ? 'rgba(196,149,106,0.12)' : 'rgba(196,149,106,0.1)') : 'transparent',
                                    border: schedulerConfig.depth === d ? '1px solid rgba(196,149,106,0.2)' : '1px solid transparent',
                                    borderRadius: '9999px', cursor: 'pointer', transition: 'all 0.15s',
                                  }}>
                                  {d[0]!.toUpperCase() + d.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Daily brief toggle */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.5625rem', color: subtleText }}>Daily brief</span>
                            <Switch
                              checked={schedulerConfig.enableDailyBrief}
                              onCheckedChange={(v) => updateSchedulerConfig({ enableDailyBrief: !!v })}
                              size="sm"
                              activeColor="#34D399"
                            />
                          </div>

                          {/* Status line */}
                          <p style={{ fontSize: '0.5rem', color: subtleText, margin: 0, lineHeight: 1.3 }}>
                            Runs every {schedulerConfig.intervalMinutes < 60 ? `${schedulerConfig.intervalMinutes}min` : `${schedulerConfig.intervalMinutes / 60}h`} when notes change{schedulerConfig.enableDailyBrief ? ` · daily brief at ${schedulerConfig.dailyBriefHour}:00` : ''}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Start button */}
                <motion.button onClick={() => { startLearningSession(learnDepth, DEPTH_LABELS[learnDepth].passes); }}
                  whileTap={{ scale: 0.92 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                    padding: '0.5rem', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '-0.01em',
                    color: '#fff', background: 'linear-gradient(135deg, #C4956A, #D4B896)', border: 'none',
                    borderRadius: '9999px', cursor: 'pointer',
                  }}>
                  <Brain style={{ width: 13, height: 13 }} />
                  Start Learning
                </motion.button>
              </div>
            )}
          </>
        )}

        {/* Keyframes */}
        <style>{`
          @keyframes izmi-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes izmi-cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
          .izmi-cursor { animation: izmi-cursor-blink 0.6s step-end infinite; }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TabPill — tiny tab button for header
   ═══════════════════════════════════════════════════════════════════ */

function TabPill({
  active,
  onClick,
  isDark,
  subtleText,
  children,
}: {
  active: boolean;
  onClick: () => void;
  isDark: boolean;
  subtleText: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.2rem',
        padding: '0.2rem 0.5rem',
        fontSize: '0.625rem',
        fontWeight: active ? 650 : 450,
        borderRadius: '9999px',
        border: 'none',
        cursor: 'pointer',
        background: active
          ? (isDark ? 'rgba(196,149,106,0.15)' : 'rgba(196,149,106,0.12)')
          : 'transparent',
        color: active ? 'var(--pfc-accent)' : subtleText,
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   LearnStepIcon — step indicator for learning protocol
   ═══════════════════════════════════════════════════════════════════ */

function LearnStepIcon({ status, isDark }: { status: StepStatus; isDark: boolean }) {
  const size = 14;
  if (status === 'completed') return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Check style={{ width: 8, height: 8, color: '#34D399' }} />
    </div>
  );
  if (status === 'running') return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(196,149,106,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: 'izmi-pulse 1.5s ease-in-out infinite' }}>
      <CircleDot style={{ width: 8, height: 8, color: '#D4B896' }} />
    </div>
  );
  if (status === 'error') return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(248,113,113,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <AlertCircle style={{ width: 8, height: 8, color: '#F87171' }} />
    </div>
  );
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: isDark ? 'rgba(244,189,111,0.06)' : 'rgba(0,0,0,0.04)', border: `1px solid ${isDark ? 'rgba(79,69,57,0.5)' : 'rgba(0,0,0,0.06)'}`, flexShrink: 0 }} />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ActionButton — tiny pill button for response actions
   ═══════════════════════════════════════════════════════════════════ */

function ActionButton({
  children,
  onClick,
  isDark,
  inputBg,
  inputBorder,
  hoverBg,
  bodyText,
}: {
  children: React.ReactNode;
  onClick: () => void;
  isDark: boolean;
  inputBg: string;
  inputBorder: string;
  hoverBg: string;
  bodyText: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.2rem',
        padding: '0.175rem 0.4rem',
        fontSize: '0.59375rem',
        fontWeight: 500,
        color: bodyText,
        background: inputBg,
        border: `1px solid ${inputBorder}`,
        borderRadius: '9999px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = inputBg;
      }}
    >
      {children}
    </motion.button>
  );
}
