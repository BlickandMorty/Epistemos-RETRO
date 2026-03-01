'use client';

import { useState, useRef, memo, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { MessageLayman } from './message-layman';
import { MessageResearch } from './message-research';
import { TruthBotCard } from './truth-bot-card';
import { ThinkingAccordion } from './thinking-accordion';
import { MarkdownContent } from '../shared/markdown';
import type { ChatMessage } from '@/lib/engine/types';
import {
  UserIcon,
  ChevronDownIcon,
  CopyIcon,
  CheckIcon,
  FileTextIcon,
  StickyNoteIcon,
} from 'lucide-react';
import { useIsDark } from '@/hooks/use-is-dark';
import { ConceptMiniMap } from '../viz/concept-mini-map';
import { SteeringFeedback } from './steering-feedback';
import { useSteeringStore } from '@/lib/store/use-steering-store';

import { spring } from '@/lib/motion/motion-config';

/* M3 emphasized easing for message entrance — smooth slide, no recoil */
const MSG_SPRING = spring.standard;

interface MessageProps {
  message: ChatMessage;
}

const selectShowTruthBot = (s: { showTruthBot: boolean }) => s.showTruthBot;
const selectInferenceMode = (s: { inferenceMode: string }) => s.inferenceMode;
const selectLatestSynthesisKeyId = (s: { latestSynthesisKeyId: string | null }) => s.latestSynthesisKeyId;
const selectSteeringExemplars = (s: { memory?: { exemplars?: Array<{ key: { timestamp: number; id: string } }> } }) => s.memory?.exemplars ?? [];

/**
 * Build a full markdown export including summary, research analysis,
 * reflection, arbitration, and uncertainty tags.
 */
function buildFullExport(
  message: ChatMessage,
  cleanText: string,
  safeText: string,
  safeDualMessage: ChatMessage['dualMessage'] | null,
): string {
  const sections: string[] = [];

  // Summary / main response
  sections.push(cleanText || safeText);

  if (safeDualMessage) {
    const ls = safeDualMessage.laymanSummary;

    // Layman breakdown
    if (ls) {
      sections.push('\n---\n\n## Layman Summary');
      if (ls.whatWasTried) sections.push(`### ${ls.sectionLabels?.whatWasTried || 'What Was Tried'}\n${ls.whatWasTried}`);
      if (ls.whatIsLikelyTrue) sections.push(`### ${ls.sectionLabels?.whatIsLikelyTrue || 'What Is Likely True'}\n${ls.whatIsLikelyTrue}`);
      if (ls.confidenceExplanation) sections.push(`### ${ls.sectionLabels?.confidenceExplanation || 'Confidence Explanation'}\n${ls.confidenceExplanation}`);
      if (ls.whatCouldChange) sections.push(`### ${ls.sectionLabels?.whatCouldChange || 'What Could Change This'}\n${ls.whatCouldChange}`);
      if (ls.whoShouldTrust) sections.push(`### ${ls.sectionLabels?.whoShouldTrust || 'Who Should Trust This'}\n${ls.whoShouldTrust}`);
    }

    // Raw analysis
    if (safeDualMessage.rawAnalysis) {
      sections.push('\n---\n\n## Research Analysis\n' + safeDualMessage.rawAnalysis);
    }

    // Reflection
    const ref = safeDualMessage.reflection;
    if (ref) {
      sections.push('\n---\n\n## Reflection');
      if (ref.selfCriticalQuestions?.length) {
        sections.push('### Self-Critical Questions\n' + ref.selfCriticalQuestions.map(q => `- ${q}`).join('\n'));
      }
      if (ref.adjustments?.length) {
        sections.push('### Adjustments\n' + ref.adjustments.map(a => `- ${a}`).join('\n'));
      }
      if (ref.leastDefensibleClaim) {
        sections.push(`### Least Defensible Claim\n${ref.leastDefensibleClaim}`);
      }
      if (ref.precisionVsEvidenceCheck) {
        sections.push(`### Precision vs Evidence\n${ref.precisionVsEvidenceCheck}`);
      }
    }

    // Arbitration
    const arb = safeDualMessage.arbitration;
    if (arb) {
      sections.push('\n---\n\n## Arbitration');
      sections.push(`**Consensus:** ${arb.consensus ? 'Yes' : 'No'}`);
      if (arb.resolution) sections.push(`**Resolution:** ${arb.resolution}`);
      if (arb.votes?.length) {
        sections.push('### Engine Votes');
        for (const v of arb.votes) {
          sections.push(`- **${v.engine}** — ${v.position} (${(v.confidence * 100).toFixed(0)}%): ${v.reasoning}`);
        }
      }
      if (arb.disagreements?.length) {
        sections.push('### Disagreements\n' + arb.disagreements.map(d => `- ${d}`).join('\n'));
      }
    }

    // Uncertainty tags
    if (safeDualMessage.uncertaintyTags?.length) {
      sections.push('\n---\n\n## Uncertainty Tags');
      for (const t of safeDualMessage.uncertaintyTags) {
        sections.push(`- **[${t.tag}]** ${t.claim}`);
      }
    }

    // Data vs model flags
    if (safeDualMessage.modelVsDataFlags?.length) {
      sections.push('\n---\n\n## Data vs Model Flags');
      for (const f of safeDualMessage.modelVsDataFlags) {
        sections.push(`- **${f.source}**: ${f.claim}`);
      }
    }
  }

  // Confidence & evidence grade
  if (typeof message.confidence === 'number' && !isNaN(message.confidence)) {
    sections.push(`\n---\n\n**Confidence:** ${(message.confidence * 100).toFixed(0)}%`);
    if (message.evidenceGrade) sections.push(`**Evidence Grade:** ${message.evidenceGrade}`);
  }

  return sections.join('\n\n');
}

function MessageInner({ message }: MessageProps) {
  const showTruthBot = usePFCStore(selectShowTruthBot);
  const inferenceMode = usePFCStore(selectInferenceMode);
  const latestSynthesisKeyId = useSteeringStore(selectLatestSynthesisKeyId);
  const exemplars = useSteeringStore(selectSteeringExemplars);
  const { isDark, isSunny } = useIsDark();
  const router = useRouter();
  const isUser = message.role === 'user';
  const [deepOpen, setDeepOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const messageSynthesisKeyId = useMemo(() => {
    if (isUser || message.confidence === undefined) return null;
    return exemplars.find(
      ex => Math.abs(ex.key.timestamp - message.timestamp) < 5000,
    )?.key.id ?? latestSynthesisKeyId;
  }, [isUser, message.confidence, message.timestamp, exemplars, latestSynthesisKeyId]);

  // ── Defensive defaults for potentially missing fields ──
  const safeText = message.text ?? '';
  const safeDualMessage = message.dualMessage ?? null;
  const safeConfidence = typeof message.confidence === 'number' && !isNaN(message.confidence) ? message.confidence : null;

  // Strip epistemic markers like [DATA], [CONFLICT], [UNCERTAIN], [MODEL] from display text
  // Only collapse horizontal whitespace (spaces/tabs) — preserve newlines for markdown formatting
  const stripMarkers = (text: string) =>
    text.replace(/\s*\[(DATA|CONFLICT|UNCERTAIN|MODEL)\]\s*/g, ' ').replace(/[^\S\n]{2,}/g, ' ').trim();

  // Main answer — "completified" version: the core response the AI gives,
  // slightly better than stock but not as complex as the deep analysis.
  // This is whatIsLikelyTrue — the direct answer to the user's question.
  const cleanText = useMemo(() => {
    if (!safeDualMessage?.laymanSummary) return stripMarkers(safeText);
    const ls = safeDualMessage.laymanSummary;
    // The main answer is just the core finding — direct, complete, no section headers
    return stripMarkers(ls.whatIsLikelyTrue || safeText);
  }, [safeDualMessage, safeText]);

  // ── Smart heading — extracts a concise topic title (not just first sentence) ──
  const responseHeading = useMemo(() => {
    if (isUser) return null;
    const text = cleanText || safeText;
    if (!text || text.length < 40) return null;

    // 1. If the response starts with a markdown heading, use it directly
    const mdHeadingMatch = text.match(/^#{1,3}\s+(.{5,80})/);
    if (mdHeadingMatch) {
      const h = mdHeadingMatch[1]!.trim();
      return h.length > 50 ? h.slice(0, 50).replace(/\s\S*$/, '') + '...' : h;
    }

    // 2. Extract first two sentences for analysis
    const sentences = text.replace(/\n+/g, ' ').match(/[^.!?]+[.!?]+/g);
    if (!sentences || sentences.length === 0) return null;
    const firstSentence = sentences[0].trim();

    // 3. Remove filler/boilerplate openings to get to the meat
    const fillerPatterns = [
      /^(okay|ok|sure|yes|no|well|so|right|great|absolutely|certainly|definitely|of course|here'?s?|let me|i'?d? be happy to|i'?ll|that'?s a|this is a)\s*/i,
      /^(based on|according to|in (this|that|the)|from (what|the))\s*/i,
    ];
    let core = firstSentence;
    for (const pat of fillerPatterns) {
      core = core.replace(pat, '');
    }
    core = core.replace(/^[,\s]+/, '');

    // 4. Extract key noun phrases — take the subject/topic
    // Split on common verb phrases to isolate the topic portion
    const verbSplitters = /\s+(is|are|was|were|has|have|had|can|could|will|would|may|might|should|does|do|did|involves?|requires?|means?|refers? to|works?|plays?|offers?|provides?|represents?|demonstrates?|shows?|suggests?|indicates?|reveals?|explores?|examines?|describes?|explains?|addresses?|covers?|focuses?|highlights?|illustrates?)\s+/i;
    const parts = core.split(verbSplitters);
    let topic = parts[0]!.trim();

    // 5. Clean up the topic — remove leading articles, cap length
    topic = topic.replace(/^(the|a|an|this|that|these|those)\s+/i, '').trim();

    // If topic is too short (< 3 chars) or too generic, fall back to first ~6 key words
    if (topic.length < 3) {
      const words = core.split(/\s+/).slice(0, 6).join(' ');
      topic = words;
    }

    // 6. Cap at ~50 chars, break at word boundary
    if (topic.length > 50) {
      topic = topic.slice(0, 50).replace(/\s\S*$/, '') + '...';
    }

    // 7. Capitalize first letter
    topic = topic.charAt(0).toUpperCase() + topic.slice(1);

    // Don't show headings that are too short or basically the whole first sentence
    return topic.length > 3 ? topic : null;
  }, [isUser, cleanText, safeText]);

  // ── Copy text ──
  const copyText = useCallback(() => {
    navigator.clipboard.writeText(cleanText || safeText);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [cleanText, safeText]);

  // Clean up copy timer on unmount
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  // ── Send to notes (creates page, splits content into blocks, navigates) ──
  const sendToNotes = useCallback(() => {
    const store = usePFCStore.getState();
    const fullContent = buildFullExport(message, cleanText, safeText, safeDualMessage);
    const pageId = store.createPage(responseHeading || `Chat Export — ${new Date().toLocaleDateString()}`);

    // Split markdown into blocks — one per paragraph/heading/section
    const lines = fullContent.split('\n');
    const chunks: { content: string; type: 'paragraph' | 'heading' | 'quote' }[] = [];
    let currentChunk = '';

    for (const line of lines) {
      const trimmed = line.trim();
      // Heading → flush current, start heading block
      if (/^#{1,6}\s/.test(trimmed)) {
        if (currentChunk.trim()) {
          chunks.push({ content: currentChunk.trim(), type: 'paragraph' });
          currentChunk = '';
        }
        chunks.push({ content: trimmed.replace(/^#+\s+/, ''), type: 'heading' });
      // Horizontal rule → flush current paragraph
      } else if (/^---+$/.test(trimmed)) {
        if (currentChunk.trim()) {
          chunks.push({ content: currentChunk.trim(), type: 'paragraph' });
          currentChunk = '';
        }
      // Empty line → flush paragraph
      } else if (trimmed === '') {
        if (currentChunk.trim()) {
          chunks.push({ content: currentChunk.trim(), type: 'paragraph' });
          currentChunk = '';
        }
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }
    if (currentChunk.trim()) {
      chunks.push({ content: currentChunk.trim(), type: 'paragraph' });
    }

    // Fill the first block, create additional blocks for the rest
    const firstBlock = store.noteBlocks.find((b: { pageId: string }) => b.pageId === pageId);
    let lastBlockId = firstBlock?.id ?? null;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      if (i === 0 && firstBlock) {
        store.updateBlockContent(firstBlock.id, chunk.content);
        // Update block type if it's a heading
        if (chunk.type === 'heading') {
          store.changeBlockType(firstBlock.id, 'heading');
        }
      } else {
        lastBlockId = store.createBlock(pageId, null, lastBlockId, chunk.content, chunk.type);
      }
    }

    store.setActivePage(pageId);
    store.saveNotesToStorage();
    router.push('/notes');
  }, [cleanText, safeText, safeDualMessage, message, responseHeading, router]);

  // ── Export single message as full doc (includes research analysis) ──
  const exportMessage = useCallback(() => {
    const fullContent = buildFullExport(message, cleanText, safeText, safeDualMessage);
    const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `message-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [cleanText, safeText, safeDualMessage, message]);

  // ════════════════════════════════════════════════
  // USER MESSAGE — bubble style
  // ════════════════════════════════════════════════
  if (isUser) {
    return (
      <motion.div
        role="article"
        aria-label="User message"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MSG_SPRING}
        style={{
          display: 'flex',
          gap: '0.75rem',
          width: '100%',
          justifyContent: 'flex-end',
        }}
      >
        <div style={{
          maxWidth: '75%',
          borderRadius: '1.25rem 1.25rem 0.375rem 1.25rem',
          padding: '0.75rem 1.125rem',
          background: 'var(--m3-primary)',
          color: 'var(--m3-on-primary)',
        }}>
          <p style={{
            fontSize: 'var(--type-chat-user)',
            lineHeight: 1.65,
            margin: 0,
          }}>
            {safeText}
          </p>
          {/* Attachment badges/thumbnails */}
          {message.attachments && message.attachments.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.375rem',
              marginTop: '0.5rem',
            }}>
              {message.attachments.map((att) => {
                const isImage = att.type === 'image';
                return isImage && att.preview ? (
                  <img
                    key={att.id}
                    src={att.preview}
                    alt={att.name}
                    style={{
                      width: '64px',
                      height: '64px',
                      objectFit: 'cover',
                      borderRadius: '0.5rem',
                      border: '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                    }}
                    onClick={() => window.open(att.preview, '_blank')}
                  />
                ) : (
                  <span
                    key={att.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '999px',
                      background: 'rgba(255,255,255,0.15)',
                      fontSize: 'var(--type-label-sm)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {att.type === 'pdf' ? '📄' : att.type === 'csv' ? '📊' : '📎'}
                    {att.name}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div style={{
          display: 'flex',
          height: '1.625rem',
          width: '1.625rem',
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--shape-full)',
          background: 'var(--m3-surface-container-high)',
          marginTop: '0.25rem',
        }}>
          <UserIcon style={{
            height: '0.8125rem',
            width: '0.8125rem',
            color: isDark ? 'rgba(155,150,137,0.6)' : 'rgba(0,0,0,0.35)',
          }} />
        </div>
      </motion.div>
    );
  }

  // ════════════════════════════════════════════════
  // ASSISTANT MESSAGE — clean text (Gemini-style), no bubble
  // ════════════════════════════════════════════════
  return (
    <motion.div
      role="article"
      aria-label="Assistant response"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MSG_SPRING}
      style={{
        display: 'flex',
        gap: '0.75rem',
        width: '100%',
        justifyContent: 'flex-start',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* AI avatar — sun on sunny, robot on dark themes, profile icon on default light */}
      <div style={{ flexShrink: 0, marginTop: '0.125rem' }}>
        {isSunny ? (
          <img src="/pixel-sun.gif" alt="Sun" width={26} height={26} style={{ width: 26, height: 26, imageRendering: 'pixelated' }} />
        ) : isDark ? (
          <img src="/pixel-robot.gif" alt="Robot" width={26} height={26} style={{ width: 26, height: 26, imageRendering: 'pixelated' }} />
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.08)', color: 'rgba(0,0,0,0.45)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
          </span>
        )}
      </div>

      {/* Content — no bubble, clean text */}
      <div style={{
        flex: 1,
        minWidth: 0,
        maxWidth: '100%',
        position: 'relative',
        paddingBottom: '3.5rem',
      }}>
        {/* Reasoning accordion */}
        {message.reasoning?.content && (
          <div style={{ marginBottom: '0.5rem' }}>
            <ThinkingAccordion
              content={message.reasoning.content}
              duration={message.reasoning.duration}
              isThinking={false}
            />
          </div>
        )}

        {/* Response heading — Gemini-style bold title */}
        {responseHeading && (
          <h3 style={{
            margin: '0 0 0.5rem 0',
            fontSize: 'var(--type-chat-heading)',
            fontWeight: 700,
            lineHeight: 1.35,
            color: isDark ? '#FFFFFF' : 'var(--foreground)',
            fontFamily: "'RetroGaming', var(--font-display)",
            letterSpacing: '-0.01em',
          }}>
            {responseHeading}
          </h3>
        )}

        {/* Main text — rendered markdown */}
        <div
          style={{
            fontSize: 'var(--type-chat-response)',
            lineHeight: 1.8,
            color: isDark ? '#FFFFFF' : 'var(--foreground)',
            fontFamily: 'var(--font-secondary)',
          }}
        >
            {safeDualMessage ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {/* ── Summary response — full standalone answer ── */}
                  <div style={{ paddingBottom: '1.25rem' }}>
                    <MarkdownContent content={cleanText} />
                  </div>

                  {/* ── Confidence + Grade bar ── */}
                  {safeConfidence !== null && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: 'var(--type-label-sm)',
                      fontFamily: 'var(--font-mono)',
                      color: isDark ? 'rgba(155,150,137,0.4)' : 'rgba(0,0,0,0.3)',
                      paddingBottom: '1rem',
                    }}>
                      <span>{(safeConfidence! * 100).toFixed(0)}% confidence</span>
                      {message.evidenceGrade && (
                        <span style={{
                          padding: '0.0625rem 0.375rem',
                          borderRadius: 'var(--shape-full)',
                          fontSize: 'var(--type-label-sm)',
                          fontWeight: 600,
                          background: message.evidenceGrade === 'A'
                            ? isDark ? 'rgba(52,211,153,0.08)' : 'rgba(52,211,153,0.06)'
                            : message.evidenceGrade === 'B'
                              ? isDark ? 'rgba(212,168,67,0.08)' : 'rgba(212,168,67,0.06)'
                              : isDark ? 'rgba(199,94,94,0.08)' : 'rgba(199,94,94,0.06)',
                          color: message.evidenceGrade === 'A'
                            ? '#34D399'
                            : message.evidenceGrade === 'B'
                              ? '#D4A843'
                              : '#C75E5E',
                        }}>
                          Grade {message.evidenceGrade}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ── Separator line between summary and analysis ── */}
                  <div style={{
                    height: '1px',
                    background: isDark
                      ? 'linear-gradient(90deg, rgba(79,69,57,0.3) 0%, rgba(79,69,57,0.08) 100%)'
                      : 'linear-gradient(90deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.02) 100%)',
                    marginBottom: '1rem',
                  }} />

                  {/* ── Deep analysis toggle — M3 tonal button ── */}
                  <button
                    aria-expanded={deepOpen}
                    onClick={(e) => { e.stopPropagation(); setDeepOpen(!deepOpen); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.4375rem 0.875rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 'var(--type-label-md)',
                      fontWeight: 500,
                      letterSpacing: '0.01em',
                      color: deepOpen
                        ? 'var(--m3-primary)'
                        : isDark ? 'rgba(232,228,222,0.55)' : 'rgba(0,0,0,0.45)',
                      background: deepOpen
                        ? isDark ? 'rgba(var(--pfc-accent-rgb), 0.1)' : 'rgba(var(--pfc-accent-rgb), 0.08)'
                        : isDark ? 'var(--m3-surface-container)' : 'var(--m3-surface-container)',
                      boxShadow: isDark
                        ? '0 1px 3px rgba(0,0,0,0.15)'
                        : '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'color 0.2s, background 0.2s, box-shadow 0.2s',
                      alignSelf: 'flex-start',
                    }}
                  >
                    <ChevronDownIcon style={{
                      height: '0.75rem',
                      width: '0.75rem',
                      transition: 'transform 0.2s',
                      transform: deepOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }} />
                    {deepOpen ? 'Hide' : 'View'} deep analysis
                  </button>

                  {/* ── Expandable deep analysis section — M3 flat surface ── */}
                  <AnimatePresence>
                    {deepOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
                        style={{ overflow: 'hidden', transform: 'translateZ(0)' }}
                      >
                        <div style={{
                          marginTop: '0.75rem',
                          borderRadius: '1rem',
                          background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
                          padding: '1.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1.25rem',
                        }}>
                          {/* Methodology + Confidence + Caveats — structured breakdown from layman summary */}
                          {safeDualMessage!.laymanSummary && (() => {
                            const ls = safeDualMessage!.laymanSummary;
                            const deepSections: string[] = [];
                            if (ls.whatWasTried) {
                              deepSections.push(`### ${ls.sectionLabels?.whatWasTried || 'Research Approach'}\n${ls.whatWasTried}`);
                            }
                            if (ls.confidenceExplanation) {
                              deepSections.push(`### ${ls.sectionLabels?.confidenceExplanation || 'Confidence Assessment'}\n${ls.confidenceExplanation}`);
                            }
                            if (ls.whatCouldChange) {
                              deepSections.push(`### ${ls.sectionLabels?.whatCouldChange || 'What Could Change This'}\n${ls.whatCouldChange}`);
                            }
                            if (ls.whoShouldTrust) {
                              deepSections.push(`### ${ls.sectionLabels?.whoShouldTrust || 'Applicability'}\n${ls.whoShouldTrust}`);
                            }
                            return deepSections.length > 0 ? (
                              <MarkdownContent content={deepSections.join('\n\n')} />
                            ) : null;
                          })()}

                          {/* Raw research analysis — full pipeline output */}
                          <div>
                            <p style={{
                              fontSize: 'var(--type-label-sm)',
                              fontWeight: 600,
                              color: isDark ? 'rgba(155,150,137,0.4)' : 'rgba(0,0,0,0.3)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              marginBottom: '0.75rem',
                            }}>
                              Research Analysis
                            </p>
                            <MessageResearch dualMessage={safeDualMessage!} />
                          </div>

                          {/* Layman structured breakdown (reflection, arbitration) */}
                          <MessageLayman layman={safeDualMessage!.laymanSummary} />

                          {/* Concepts */}
                          {message.concepts && message.concepts.length > 0 && (
                            <ConceptMiniMap messageConcepts={message.concepts} />
                          )}

                          {/* Steering */}
                          <SteeringFeedback synthesisKeyId={messageSynthesisKeyId} />

                          {/* Truth Assessment — slightly darker sub-surface */}
                          {showTruthBot && message.truthAssessment && (
                            <TruthBotCard assessment={message.truthAssessment} />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
            ) : (
              <MarkdownContent content={safeText} />
            )}
          </div>

        {/* ── Hover action toolbar — M3 grouped surface container ── */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.125rem',
                position: 'absolute',
                bottom: '0',
                left: 0,
                zIndex: 5,
                padding: '0.25rem',
                borderRadius: '0.75rem',
                background: isDark ? 'var(--m3-surface-container)' : 'var(--m3-surface-container-high)',
                boxShadow: isDark
                  ? '0 2px 8px -1px rgba(0,0,0,0.25)'
                  : '0 1px 4px rgba(0,0,0,0.06), 0 2px 8px -2px rgba(0,0,0,0.04)',
              }}
            >
              {/* Copy */}
              <button
                onClick={(e) => { e.stopPropagation(); copyText(); }}
                title="Copy text"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.3125rem 0.625rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--type-label-sm)',
                  fontWeight: 500,
                  color: isDark ? 'rgba(232,228,222,0.6)' : 'rgba(0,0,0,0.45)',
                  background: 'transparent',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                  e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.9)' : 'rgba(0,0,0,0.7)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.6)' : 'rgba(0,0,0,0.45)';
                }}
              >
                {copied ? <CheckIcon style={{ height: 12, width: 12 }} /> : <CopyIcon style={{ height: 12, width: 12 }} />}
                {copied ? 'Copied' : 'Copy'}
              </button>

              {/* Separator */}
              <div style={{ width: '1px', height: '1rem', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />

              {/* Export as doc */}
              <button
                onClick={(e) => { e.stopPropagation(); exportMessage(); }}
                title="Export as document"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.3125rem 0.625rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--type-label-sm)',
                  fontWeight: 500,
                  color: isDark ? 'rgba(232,228,222,0.6)' : 'rgba(0,0,0,0.45)',
                  background: 'transparent',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                  e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.9)' : 'rgba(0,0,0,0.7)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.6)' : 'rgba(0,0,0,0.45)';
                }}
              >
                <FileTextIcon style={{ height: 12, width: 12 }} />
                Export
              </button>

              {/* Separator */}
              <div style={{ width: '1px', height: '1rem', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />

              {/* Send to notes */}
              <button
                onClick={(e) => { e.stopPropagation(); sendToNotes(); }}
                title="Send to notes"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.3125rem 0.625rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--type-label-sm)',
                  fontWeight: 500,
                  color: isDark ? 'rgba(232,228,222,0.6)' : 'rgba(0,0,0,0.45)',
                  background: 'transparent',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                  e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.9)' : 'rgba(0,0,0,0.7)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.6)' : 'rgba(0,0,0,0.45)';
                }}
              >
                <StickyNoteIcon style={{ height: 12, width: 12 }} />
                Notes
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export const Message = memo(MessageInner, (prev, next) =>
  prev.message.id === next.message.id &&
  prev.message.text === next.message.text &&
  prev.message.confidence === next.message.confidence &&
  prev.message.dualMessage === next.message.dualMessage &&
  prev.message.reasoning === next.message.reasoning &&
  prev.message.truthAssessment === next.message.truthAssessment,
);
