'use client';

/* ═══════════════════════════════════════════════════════════════════
   MiniChat — Research Tab Content
   Button-based research actions: Deep Dive, Find Gaps, Synthesize,
   Challenge, Next Steps, Simplify. Streams response with copy/notes.
   Extracted from mini-chat.tsx (surgery — code as-is)
   ═══════════════════════════════════════════════════════════════════ */

import { useRef, useCallback, useEffect, useState } from 'react';
import {
  Microscope,
  Search,
  Brain,
  Zap,
  ChevronRight,
  BookOpen,
  Square,
  Copy,
  Check,
  ClipboardPaste,
  type LucideIcon,
} from 'lucide-react';

import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useAssistantStream } from '@/hooks/use-assistant-stream';

/* ─── Props ─── */

export interface ResearchTabContentProps {
  isDark: boolean;
  glassBorder: string;
  textPrimary: string;
  textSecondary: string;
  btnHover: string;
}

/* ─── Research Actions ─── */

interface ResearchAction {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  desc: string;
  prompt: string;
}

const RESEARCH_ACTIONS: ResearchAction[] = [
  {
    id: 'deep-dive',
    label: 'Deep Dive',
    icon: Microscope,
    color: 'var(--color-pfc-violet)',
    desc: 'Comprehensive analysis of the current topic',
    prompt: 'Based on my recent queries and notes, give me a deep-dive analysis of the topic I\'ve been exploring. Identify the key debates, strongest evidence, and open questions. Be thorough and intellectually honest.',
  },
  {
    id: 'find-gaps',
    label: 'Find Gaps',
    icon: Search,
    color: 'var(--color-pfc-cyan)',
    desc: 'Identify blind spots in your research',
    prompt: 'Look at the concepts I\'ve been researching and identify blind spots — what am I missing? What adjacent areas should I explore? What counter-evidence have I overlooked? What assumptions am I making that I haven\'t examined?',
  },
  {
    id: 'synthesize',
    label: 'Synthesize',
    icon: Brain,
    color: 'var(--color-pfc-green)',
    desc: 'Connect threads across your research',
    prompt: 'Synthesize the threads across my recent research and notes into a unified picture. What patterns emerge? Where do different areas of inquiry converge or conflict? Give me a coherent narrative that ties everything together.',
  },
  {
    id: 'challenge',
    label: 'Challenge',
    icon: Zap,
    color: 'var(--color-pfc-red)',
    desc: 'Stress-test your conclusions',
    prompt: 'Play adversary against my current research conclusions. What\'s the strongest counterargument? What evidence would overturn my working hypotheses? Where am I most likely wrong? Be rigorous and don\'t hold back.',
  },
  {
    id: 'next-steps',
    label: 'Next Steps',
    icon: ChevronRight,
    color: 'var(--color-pfc-ember)',
    desc: 'Suggest where to go from here',
    prompt: 'Based on what I\'ve been researching, suggest 3-5 concrete next steps to deepen my understanding. For each, explain why it matters and what specific questions to investigate. Prioritize the most impactful directions.',
  },
  {
    id: 'eli5',
    label: 'Simplify',
    icon: BookOpen,
    color: 'var(--muted-foreground)',
    desc: 'Explain your research simply',
    prompt: 'Take the core findings from my research so far and explain them in plain language a smart teenager would understand. Use concrete analogies. Be honest about what\'s uncertain. No jargon.',
  },
];

/* ═══════════════════════════════════════════════════════════════════
   Research Tab — Button-based research actions
   ═══════════════════════════════════════════════════════════════════ */

export function ResearchTabContent({ isDark, glassBorder, textPrimary, textSecondary, btnHover }: ResearchTabContentProps) {
  const { sendQuery, abort } = useAssistantStream();
  const streamText = usePFCStore((s) => s.threadStreamingText[s.activeThreadId] || '');
  const isStreaming = usePFCStore((s) => s.threadIsStreaming[s.activeThreadId] || false);
  const activeThreadId = usePFCStore((s) => s.activeThreadId);
  const activeThread = usePFCStore((s) => s.chatThreads.find((t) => t.id === s.activeThreadId));
  const lastAssistantMsg = activeThread?.messages.filter((m) => m.role === 'assistant').slice(-1)[0];

  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  // Notes context
  const activePageId = usePFCStore((s) => s.activePageId);
  const createBlock = usePFCStore((s) => s.createBlock);
  const addToast = usePFCStore((s) => s.addToast);
  const editingBlockId = usePFCStore((s) => s.editingBlockId);

  // Auto-scroll during streaming
  useEffect(() => {
    if (isStreaming && responseRef.current) responseRef.current.scrollTop = responseRef.current.scrollHeight;
  }, [isStreaming, streamText]);

  const handleAction = useCallback((action: ResearchAction) => {
    setActiveAction(action.id);
    sendQuery(action.prompt, activeThreadId);
  }, [sendQuery, activeThreadId]);

  const handleCopy = useCallback(async () => {
    const text = streamText || lastAssistantMsg?.content;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }, [streamText, lastAssistantMsg]);

  const handleToNotes = useCallback(() => {
    const text = streamText || lastAssistantMsg?.content;
    if (!text || !activePageId) {
      if (!activePageId) addToast({ type: 'warning', message: 'Open a note page first' });
      return;
    }
    createBlock(activePageId, null, editingBlockId ?? null, text);
    addToast({ type: 'success', message: 'Research added to notes' });
  }, [streamText, lastAssistantMsg, activePageId, editingBlockId, createBlock, addToast]);

  const hasResponse = isStreaming || (streamText.length > 0) || (lastAssistantMsg && activeAction);
  const displayText = streamText || lastAssistantMsg?.content || '';

  return (
    <>
      {/* Action buttons grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
        padding: '0.5rem', flexShrink: 0,
        borderBottom: hasResponse ? `1px solid ${glassBorder}` : 'none',
      }}>
        {RESEARCH_ACTIONS.map((action) => {
          const Icon = action.icon;
          const isActive = activeAction === action.id && isStreaming;
          return (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              disabled={isStreaming}
              title={action.desc}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0.4rem 0.5rem', borderRadius: 10,
                border: isActive
                  ? `1.5px solid ${action.color}`
                  : `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                background: isActive
                  ? `color-mix(in srgb, ${action.color} 10%, transparent)`
                  : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                color: isActive ? action.color : textPrimary,
                cursor: isStreaming ? 'default' : 'pointer',
                opacity: isStreaming && !isActive ? 0.4 : 1,
                fontSize: 11, fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                transition: 'all 0.18s ease',
                textAlign: 'left',
              }}
            >
              <Icon style={{ width: 13, height: 13, flexShrink: 0, color: isActive ? action.color : textSecondary }} />
              <div>
                <div style={{ lineHeight: 1.3 }}>{action.label}</div>
                <div style={{ fontSize: 9, color: textSecondary, fontWeight: 400, lineHeight: 1.2, marginTop: 1 }}>{action.desc}</div>
              </div>
              {isActive && (
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0, marginLeft: 'auto',
                  background: action.color, animation: 'pulse 1.4s ease-in-out infinite',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Response area */}
      {hasResponse ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div ref={responseRef} style={{
            flex: 1, overflowY: 'auto', padding: '0.5rem', minHeight: 0,
            fontSize: 12, lineHeight: 1.6, color: textPrimary, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {displayText}
            {isStreaming && <span style={{ animation: 'pulse 1s ease-in-out infinite', opacity: 0.6 }}>|</span>}
          </div>
          {!isStreaming && displayText && (
            <div style={{ display: 'flex', gap: 4, padding: '0.25rem 0.5rem 0.375rem', flexShrink: 0, borderTop: `1px solid ${glassBorder}` }}>
              <button onClick={handleCopy} style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                color: copied ? '#34D399' : textSecondary, fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>
                {copied ? <Check style={{ width: 9, height: 9 }} /> : <Copy style={{ width: 9, height: 9 }} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={handleToNotes} style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                color: textSecondary, fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>
                <ClipboardPaste style={{ width: 9, height: 9 }} />To Notes
              </button>
              {isStreaming && (
                <button onClick={abort} style={{
                  display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, marginLeft: 'auto',
                  border: 'none', background: 'rgba(var(--pfc-accent-rgb), 0.12)',
                  color: 'var(--pfc-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                }}>
                  <Square style={{ width: 9, height: 9 }} />Stop
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', color: textSecondary, fontSize: 11, textAlign: 'center', lineHeight: 1.5 }}>
          Press a research action to analyze your current topics and notes context.
        </div>
      )}
    </>
  );
}
