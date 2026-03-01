'use client';

/* ═══════════════════════════════════════════════════════════════════
   MiniChat — Notes Tab Content
   Ask AI + Learn (ported from NoteAIChat). Two inner modes:
   "ask" for AI writing assistance, "learn" for learning protocol.
   Extracted from mini-chat.tsx (surgery — code as-is)
   ═══════════════════════════════════════════════════════════════════ */

import { useRef, useCallback, useEffect, useState } from 'react';
import {
  PenLine,
  FileText,
  Maximize2,
  RefreshCw,
  CornerDownLeft,
  Copy,
  Check,
  Brain,
  Pause,
  Play,
  CircleDot,
  RotateCcw,
  Square,
  StickyNote,
  X,
} from 'lucide-react';

import { usePFCStore } from '@/lib/store/use-pfc-store';
import type { LearningSession } from '@/lib/notes/learning-protocol';

/* ─── Props ─── */

export interface NotesTabContentProps {
  isDark: boolean;
  glassBorder: string;
  textPrimary: string;
  textSecondary: string;
  btnHover: string;
}

/* ─── Constants ─── */

const NOTES_QUICK_ACTIONS = [
  { id: 'continue', label: 'Continue writing', icon: PenLine, prompt: 'Continue writing from where this note left off. Match the tone and style.', requiresBlock: false },
  { id: 'summarize', label: 'Summarize page', icon: FileText, prompt: 'Summarize the key points of this note page concisely.', requiresBlock: false },
  { id: 'expand', label: 'Expand', icon: Maximize2, prompt: 'Expand on this block with more detail and supporting points.', requiresBlock: true },
  { id: 'rewrite', label: 'Rewrite', icon: RefreshCw, prompt: 'Rewrite this block to be clearer and more concise.', requiresBlock: true },
];

const PROTOCOL_STEP_TITLES = [
  'Content extraction', 'Pattern recognition', 'Concept mapping',
  'Gap analysis', 'Insight synthesis', 'Cross-reference linking', 'Knowledge consolidation',
];

type LearningDepth = 'shallow' | 'moderate' | 'deep';
type StepStatus = 'pending' | 'running' | 'completed' | 'error';

const DEPTH_LABELS: Record<LearningDepth, { label: string; passes: number }> = {
  shallow: { label: 'Shallow', passes: 1 },
  moderate: { label: 'Moderate', passes: 2 },
  deep: { label: 'Deep', passes: 5 },
};

function deriveSteps(session: LearningSession | null): { id: string; title: string; status: StepStatus; insightCount?: number }[] {
  if (!session) return PROTOCOL_STEP_TITLES.map((title, i) => ({ id: `step-${i}`, title, status: 'pending' as StepStatus }));
  return session.steps.map((step, i) => ({
    id: step.id,
    title: step.title || PROTOCOL_STEP_TITLES[i] || `Step ${i + 1}`,
    status: (step.status === 'skipped' ? 'completed' : step.status) as StepStatus,
    insightCount: step.insights.length || undefined,
  }));
}

function getLearnProgress(session: LearningSession | null): number {
  if (!session) return 0;
  if (session.status === 'completed') return 1;
  const total = session.steps.length;
  if (total === 0) return 0;
  const done = session.steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
  const running = session.steps.filter((s) => s.status === 'running').length;
  return Math.min((done + running * 0.5) / total, 0.99);
}

/* ═══════════════════════════════════════════════════════════════════
   Notes Tab — Ask AI + Learn
   ═══════════════════════════════════════════════════════════════════ */

export function NotesTabContent({ isDark, glassBorder, textPrimary, textSecondary, btnHover }: NotesTabContentProps) {
  const [notesMode, setNotesMode] = useState<'ask' | 'learn'>('ask');
  const [inputVal, setInputVal] = useState('');
  const [copied, setCopied] = useState(false);
  const [learnDepth, setLearnDepth] = useState<LearningDepth>('moderate');

  // Note context from store
  const activePageId = usePFCStore((s) => s.activePageId);
  const editingBlockId = usePFCStore((s) => s.editingBlockId);
  const notePages = usePFCStore((s) => s.notePages);
  const noteBlocks = usePFCStore((s) => s.noteBlocks);

  // Ask AI actions
  const noteAI = usePFCStore((s) => s.noteAI);
  const startNoteAIGeneration = usePFCStore((s) => s.startNoteAIGeneration);
  const stopNoteAIGeneration = usePFCStore((s) => s.stopNoteAIGeneration);
  const createBlock = usePFCStore((s) => s.createBlock);
  const updateBlockContent = usePFCStore((s) => s.updateBlockContent);
  const pushTransaction = usePFCStore((s) => s.pushTransaction);

  // Learn actions
  const learningSession = usePFCStore((s) => s.learningSession);
  const learningStreamText = usePFCStore((s) => s.learningStreamText);
  const startLearningSession = usePFCStore((s) => s.startLearningSession);
  const pauseLearningSession = usePFCStore((s) => s.pauseLearningSession);
  const resumeLearningSession = usePFCStore((s) => s.resumeLearningSession);
  const stopLearningSession = usePFCStore((s) => s.stopLearningSession);

  const isGenerating = noteAI?.isGenerating ?? false;
  const generatedText = noteAI?.generatedText ?? '';
  const [hasResponse, setHasResponse] = useState(false);
  const [responseText, setResponseText] = useState('');
  const responseRef = useRef<HTMLDivElement>(null);
  const learnStreamRef = useRef<HTMLDivElement>(null);

  // Sync generated text
  useEffect(() => {
    if (generatedText) { setResponseText(generatedText); setHasResponse(true); }
  }, [generatedText]);

  // Auto-scroll
  useEffect(() => {
    if (isGenerating && responseRef.current) responseRef.current.scrollTop = responseRef.current.scrollHeight;
  }, [isGenerating, responseText]);
  useEffect(() => {
    if (learningSession?.status === 'running' && learnStreamRef.current) learnStreamRef.current.scrollTop = learnStreamRef.current.scrollHeight;
  }, [learningSession?.status, learningStreamText]);

  // Auto-switch to learn when session starts
  useEffect(() => {
    const s = learningSession?.status;
    if (s === 'running' || s === 'paused' || s === 'completed') setNotesMode('learn');
  }, [learningSession?.status]);

  const activePage = notePages.find((p: { id: string }) => p.id === activePageId);
  const learnStatus = learningSession?.status ?? 'idle';
  const learnIsRunning = learnStatus === 'running';
  const learnIsPaused = learnStatus === 'paused';
  const learnIsCompleted = learnStatus === 'completed';
  const learnIsActive = learnIsRunning || learnIsPaused;
  const learnSteps = deriveSteps(learningSession);
  const learnProgress = getLearnProgress(learningSession);

  const handleSend = useCallback(() => {
    if (!inputVal.trim() || isGenerating || !activePageId) return;
    setHasResponse(false); setResponseText('');
    startNoteAIGeneration(activePageId, editingBlockId ?? null, inputVal.trim());
    setInputVal('');
  }, [inputVal, isGenerating, activePageId, editingBlockId, startNoteAIGeneration]);

  const handleQuickAction = useCallback((action: typeof NOTES_QUICK_ACTIONS[number]) => {
    if (isGenerating || !activePageId) return;
    if (action.requiresBlock && !editingBlockId) return;
    setHasResponse(false); setResponseText('');
    startNoteAIGeneration(activePageId, action.requiresBlock ? (editingBlockId ?? null) : null, action.prompt);
  }, [isGenerating, activePageId, editingBlockId, startNoteAIGeneration]);

  const handleInsert = useCallback(() => {
    if (!responseText || !activePageId) return;
    createBlock(activePageId, null, editingBlockId ?? null, responseText);
    setHasResponse(false); setResponseText('');
  }, [responseText, activePageId, editingBlockId, createBlock]);

  const handleReplace = useCallback(() => {
    if (!responseText || !editingBlockId || !activePageId) return;
    const oldBlock = noteBlocks.find((b: { id: string }) => b.id === editingBlockId);
    if (oldBlock) {
      pushTransaction(
        [{ action: 'update' as const, blockId: editingBlockId, pageId: activePageId, data: { content: responseText } }],
        [{ action: 'update' as const, blockId: editingBlockId, pageId: activePageId, previousData: { content: oldBlock.content } }],
      );
    }
    updateBlockContent(editingBlockId, responseText);
    setHasResponse(false); setResponseText('');
  }, [responseText, editingBlockId, activePageId, noteBlocks, pushTransaction, updateBlockContent]);

  const handleCopy = useCallback(async () => {
    if (!responseText) return;
    try { await navigator.clipboard.writeText(responseText); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }, [responseText]);

  // No active page → prompt user
  if (!activePageId) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '2rem 1rem' }}>
        <StickyNote style={{ width: 24, height: 24, color: textSecondary, opacity: 0.5 }} />
        <p style={{ fontSize: 12, color: textSecondary, textAlign: 'center', lineHeight: 1.5 }}>
          Open a note page to use AI writing assistance and learning tools.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Page context badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '0.25rem 0.5rem',
        borderBottom: `1px solid ${glassBorder}`, flexShrink: 0, fontSize: 10.5,
      }}>
        <StickyNote style={{ width: 10, height: 10, color: 'var(--pfc-accent)', flexShrink: 0 }} />
        <span style={{ color: textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activePage?.title || 'Untitled'}
        </span>
        {editingBlockId && (
          <span style={{
            padding: '1px 6px', borderRadius: 999, fontSize: 9, fontWeight: 500,
            background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.12)' : 'rgba(var(--pfc-accent-rgb), 0.08)',
            color: 'var(--pfc-accent)',
          }}>block selected</span>
        )}
        {/* Mode toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderRadius: 999, padding: 2 }}>
          <button onClick={() => setNotesMode('ask')} style={{
            padding: '2px 8px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: notesMode === 'ask' ? 600 : 400,
            color: notesMode === 'ask' ? 'var(--pfc-accent)' : textSecondary,
            background: notesMode === 'ask' ? (isDark ? 'rgba(var(--pfc-accent-rgb), 0.15)' : 'rgba(var(--pfc-accent-rgb), 0.1)') : 'transparent',
          }}>Ask</button>
          <button onClick={() => setNotesMode('learn')} style={{
            padding: '2px 8px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: notesMode === 'learn' ? 600 : 400,
            color: notesMode === 'learn' ? 'var(--pfc-accent)' : textSecondary,
            background: notesMode === 'learn' ? (isDark ? 'rgba(var(--pfc-accent-rgb), 0.15)' : 'rgba(var(--pfc-accent-rgb), 0.1)') : 'transparent',
          }}>
            <Brain style={{ width: 9, height: 9, display: 'inline', verticalAlign: '-1px', marginRight: 2 }} />Learn
            {learnIsRunning && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#34D399', display: 'inline-block', marginLeft: 3, animation: 'pulse 1.5s ease-in-out infinite' }} />}
          </button>
        </div>
      </div>

      {/* ── Ask AI mode ── */}
      {notesMode === 'ask' && (
        <>
          {/* Quick actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0.375rem 0.5rem', borderBottom: `1px solid ${glassBorder}`, flexShrink: 0 }}>
            {NOTES_QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              const disabled = isGenerating || (action.requiresBlock && !editingBlockId);
              return (
                <button key={action.id} onClick={() => handleQuickAction(action)} disabled={disabled}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: 10.5, fontWeight: 500,
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    color: disabled ? textSecondary : textPrimary,
                    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
                    fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                  }}
                  title={action.requiresBlock && !editingBlockId ? 'Select a block first' : action.label}
                >
                  <Icon style={{ width: 10, height: 10 }} />{action.label}
                </button>
              );
            })}
          </div>

          {/* Response area */}
          {(isGenerating || hasResponse) && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${glassBorder}` }}>
              <div ref={responseRef} style={{
                flex: 1, overflowY: 'auto', padding: '0.5rem', minHeight: 0,
                fontSize: 12, lineHeight: 1.55, color: textPrimary, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {responseText}
                {isGenerating && <span style={{ animation: 'pulse 1s ease-in-out infinite', opacity: 0.6 }}>|</span>}
              </div>
              {hasResponse && !isGenerating && (
                <div style={{ display: 'flex', gap: 4, padding: '0.25rem 0.5rem 0.375rem', flexShrink: 0 }}>
                  <button onClick={handleInsert} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', color: textSecondary, fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                    <CornerDownLeft style={{ width: 9, height: 9 }} />Insert
                  </button>
                  {editingBlockId && (
                    <button onClick={handleReplace} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', color: textSecondary, fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                      <RefreshCw style={{ width: 9, height: 9 }} />Replace
                    </button>
                  )}
                  <button onClick={handleCopy} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', color: textSecondary, fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                    {copied ? <Check style={{ width: 9, height: 9, color: '#34D399' }} /> : <Copy style={{ width: 9, height: 9 }} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!isGenerating && !hasResponse && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', color: textSecondary, fontSize: 11.5, textAlign: 'center' }}>
              Ask anything about your notes, or use a quick action above.
            </div>
          )}

          {/* Input */}
          <div style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '0.375rem 0.5rem 0.5rem', borderTop: `1px solid ${glassBorder}`, marginTop: 'auto' }}>
            <input value={inputVal} onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask about your notes..." maxLength={10000} disabled={isGenerating}
              style={{
                flex: 1, padding: '0.4rem 0.625rem', borderRadius: 999,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                color: textPrimary, fontSize: 12, fontFamily: 'var(--font-sans)', outline: 'none',
              }}
            />
            {isGenerating ? (
              <button onClick={stopNoteAIGeneration} style={{ padding: '0.4rem 0.625rem', borderRadius: 999, border: 'none', background: 'rgba(var(--pfc-accent-rgb), 0.15)', color: 'var(--pfc-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Square style={{ width: 12, height: 12 }} />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!inputVal.trim()} style={{
                padding: '0.4rem 0.625rem', borderRadius: 999, border: 'none',
                background: inputVal.trim() ? 'var(--pfc-accent)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                color: inputVal.trim() ? '#fff' : textSecondary, fontSize: 12, fontWeight: 600,
                cursor: inputVal.trim() ? 'pointer' : 'default', transition: 'all 0.15s',
              }}>Ask</button>
            )}
          </div>
        </>
      )}

      {/* ── Learn mode ── */}
      {notesMode === 'learn' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {(learnIsActive || learnIsCompleted) ? (
            <>
              {/* Progress */}
              <div style={{ height: 2, width: '100%', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', flexShrink: 0 }}>
                <div style={{ height: '100%', width: `${learnProgress * 100}%`, background: learnIsCompleted ? '#34D399' : 'var(--pfc-accent)', borderRadius: 1, transition: 'width 0.4s ease' }} />
              </div>

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.375rem 0.5rem', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 10, fontWeight: 500, borderRadius: 999,
                    background: learnIsRunning ? 'rgba(52,211,153,0.12)' : learnIsPaused ? 'rgba(251,191,36,0.12)' : 'rgba(52,211,153,0.12)',
                    color: learnIsRunning ? '#34D399' : learnIsPaused ? '#FBBF24' : '#34D399',
                  }}>
                    {learnIsRunning && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34D399', animation: 'pulse 1.5s ease-in-out infinite' }} />}
                    {learnIsRunning ? 'Running' : learnIsPaused ? 'Paused' : 'Done'}
                    {learnIsCompleted && <Check style={{ width: 9, height: 9 }} />}
                  </span>
                  <span style={{ fontSize: 10, color: textSecondary }}>
                    Pass {learningSession?.iteration ?? 1}/{learningSession?.maxIterations ?? 1}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(learnIsRunning || learnIsPaused) && (
                    <button onClick={learnIsPaused ? resumeLearningSession : pauseLearningSession}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: textSecondary }}>
                      {learnIsPaused ? <Play style={{ width: 11, height: 11 }} /> : <Pause style={{ width: 11, height: 11 }} />}
                    </button>
                  )}
                  <button onClick={stopLearningSession}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: textSecondary }}>
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              </div>

              {/* Steps */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0.5rem', minHeight: 0 }}>
                {learnSteps.map((step) => (
                  <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                    <span style={{
                      width: 12, height: 12, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: step.status === 'completed' ? 'rgba(52,211,153,0.15)' : step.status === 'running' ? 'rgba(var(--pfc-accent-rgb), 0.15)' : step.status === 'error' ? 'rgba(248,113,113,0.12)' : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                    }}>
                      {step.status === 'completed' && <Check style={{ width: 7, height: 7, color: '#34D399' }} />}
                      {step.status === 'running' && <CircleDot style={{ width: 7, height: 7, color: 'var(--pfc-accent)' }} />}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, fontWeight: step.status === 'running' ? 500 : 400, color: step.status === 'completed' ? textPrimary : step.status === 'running' ? 'var(--pfc-accent)' : textSecondary }}>
                      {step.title}
                    </span>
                    {step.status === 'completed' && step.insightCount != null && step.insightCount > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 500, padding: '1px 5px', borderRadius: 999, background: 'rgba(52,211,153,0.1)', color: '#34D399' }}>{step.insightCount}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Stream preview */}
              {learnIsRunning && learningStreamText && (
                <div ref={learnStreamRef} style={{ maxHeight: 40, overflowY: 'auto', padding: '0.25rem 0.5rem', borderTop: `1px solid ${glassBorder}`, fontSize: 10, lineHeight: 1.4, color: textSecondary, opacity: 0.5, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono, monospace)' }}>
                  {learningStreamText}
                </div>
              )}

              {/* Completed summary */}
              {learnIsCompleted && (
                <div style={{ padding: '0.375rem 0.5rem', borderTop: `1px solid ${glassBorder}`, flexShrink: 0 }}>
                  <p style={{ fontSize: 11, color: textPrimary, margin: '0 0 6px' }}>
                    <span style={{ color: '#34D399', fontWeight: 600 }}>{learningSession?.totalInsights ?? 0}</span> insights · <span style={{ color: 'var(--pfc-accent)', fontWeight: 600 }}>{learningSession?.totalPagesCreated ?? 0}</span> pages · <span style={{ fontWeight: 600 }}>{learningSession?.totalBlocksCreated ?? 0}</span> blocks
                  </p>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => startLearningSession(learnDepth, DEPTH_LABELS[learnDepth].passes)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0.3rem', fontSize: 11, fontWeight: 500, color: 'var(--pfc-accent)', background: 'rgba(var(--pfc-accent-rgb), 0.1)', border: '1px solid rgba(var(--pfc-accent-rgb), 0.2)', borderRadius: 999, cursor: 'pointer' }}>
                      <RotateCcw style={{ width: 10, height: 10 }} />Again
                    </button>
                    <button onClick={stopLearningSession} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.3rem', fontSize: 11, fontWeight: 500, color: textPrimary, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', border: `1px solid ${glassBorder}`, borderRadius: 999, cursor: 'pointer' }}>
                      Close
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Idle — depth selector + start */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: '0.75rem' }}>
              <p style={{ fontSize: 11, lineHeight: 1.5, color: textSecondary, margin: 0 }}>
                Recursively analyze and deepen your notes with AI.
              </p>
              <div style={{ display: 'flex', gap: 4, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderRadius: 999, padding: 2 }}>
                {(['shallow', 'moderate', 'deep'] as LearningDepth[]).map((d) => (
                  <button key={d} onClick={() => setLearnDepth(d)} style={{
                    flex: 1, padding: '4px 0', fontSize: 10.5, fontWeight: learnDepth === d ? 600 : 400,
                    color: learnDepth === d ? 'var(--pfc-accent)' : textSecondary,
                    background: learnDepth === d ? (isDark ? 'rgba(var(--pfc-accent-rgb), 0.12)' : 'rgba(var(--pfc-accent-rgb), 0.1)') : 'transparent',
                    border: learnDepth === d ? '1px solid rgba(var(--pfc-accent-rgb), 0.2)' : '1px solid transparent',
                    borderRadius: 999, cursor: 'pointer', transition: 'all 0.15s',
                  }}>{DEPTH_LABELS[d].label}</button>
                ))}
              </div>
              <button onClick={() => startLearningSession(learnDepth, DEPTH_LABELS[learnDepth].passes)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '0.5rem', fontSize: 12, fontWeight: 600,
                color: '#fff', background: 'var(--pfc-accent)', border: 'none',
                borderRadius: 999, cursor: 'pointer',
              }}>
                <Brain style={{ width: 13, height: 13 }} />Start Learning
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
