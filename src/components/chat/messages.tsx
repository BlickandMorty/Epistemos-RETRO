'use client';

import { memo } from 'react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { Message } from './message';
import type { ChatMessage } from '@/lib/engine/types';
import { StreamingText } from './streaming-text';
import { ThinkingAccordion } from './thinking-accordion';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';
import { ArrowDownIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { PixelBook } from '../decorative/pixel-mascots';
import { useIsDark } from '@/hooks/use-is-dark';
import { useComposedRefs } from '@radix-ui/react-compose-refs';

import { spring } from '@/lib/motion/motion-config';

/* M3 emphasized easing — smooth slide, no recoil */
const HARMONOID_SPRING = spring.standard;

// Stable selectors
const selectMessages = (s: { messages: ChatMessage[] }) => s.messages;
const selectIsStreaming = (s: { isStreaming: boolean }) => s.isStreaming;
const selectIsProcessing = (s: { isProcessing: boolean }) => s.isProcessing;
const selectReasoningText = (s: { reasoningText: string }) => s.reasoningText;
const selectReasoningDuration = (s: { reasoningDuration: number | null }) => s.reasoningDuration;
const selectIsReasoning = (s: { isReasoning: boolean }) => s.isReasoning;

function MessagesInner({
  scrollContainerRef,
}: {
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const messages = usePFCStore(selectMessages);
  const isStreaming = usePFCStore(selectIsStreaming);
  const isProcessing = usePFCStore(selectIsProcessing);
  const reasoningText = usePFCStore(selectReasoningText);
  const reasoningDuration = usePFCStore(selectReasoningDuration);
  const isReasoning = usePFCStore(selectIsReasoning);
  const { containerRef, isAtBottom, scrollToBottom } = useScrollToBottom<HTMLDivElement>();
  const { isDark, isSunny } = useIsDark();

  // Merge the scroll-to-bottom ref with the externally provided ref for TOC
  const setRefs = useComposedRefs(containerRef, scrollContainerRef);

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      <div
        ref={setRefs}
        style={{
          position: 'relative',
          height: '100%',
          overflowY: 'auto',
          padding: '3.75rem 1rem 6rem',
          willChange: 'scroll-position',
          overscrollBehavior: 'contain',
          transform: 'translateZ(0)',
        }}
      >
        <div
          role="log"
          aria-label="Chat messages"
          style={{
          maxWidth: '48rem',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          contain: 'layout style',
          contentVisibility: 'auto',
        }}>
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
          </AnimatePresence>

          {/* Thinking / streaming — Gemini-style: avatar + clean text, no bubble */}
          {(isStreaming || isProcessing) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={HARMONOID_SPRING}
              style={{
                display: 'flex',
                gap: '0.75rem',
                width: '100%',
                justifyContent: 'flex-start',
                transform: 'translateZ(0)',
              }}
            >
              {/* Avatar — sun on sunny, robot on dark themes, profile icon on default light */}
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

              {/* Content — clean text, no bubble */}
              <div style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                fontSize: 'var(--type-chat-stream)',
                lineHeight: 1.8,
                color: isDark ? '#FFFFFF' : 'var(--foreground)',
                fontFamily: 'var(--font-secondary)',
              }}>
                {/* Reasoning accordion */}
                {(isReasoning || reasoningText) && (
                  <ThinkingAccordion
                    content={reasoningText}
                    duration={reasoningDuration}
                    isThinking={isReasoning}
                  />
                )}
                {isStreaming ? (
                  <StreamingText />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <PixelBook size={24} />
                    <span style={{
                      color: 'var(--m3-primary)',
                      fontSize: 'var(--type-body-md)',
                      fontWeight: 500,
                    }}>
                      {isReasoning ? 'Reasoning...' : 'Thinking...'}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Scroll to bottom — M3 tonal surface button */}
      <AnimatePresence>
        {!isAtBottom && (
          <motion.div
            initial={{ opacity: 0, y: 10, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 10, x: '-50%' }}
            transition={HARMONOID_SPRING}
            style={{
              position: 'absolute',
              bottom: '2rem',
              left: '50%',
              zIndex: 10,
            }}
          >
            <button
              onClick={scrollToBottom}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.3125rem 0.75rem',
                borderRadius: 'var(--shape-full)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'var(--type-label-sm)',
                fontWeight: 500,
                background: 'var(--m3-surface-container-highest)',
                color: 'var(--foreground)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
            >
              <ArrowDownIcon style={{ height: '0.625rem', width: '0.625rem' }} />
              Scroll to bottom
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const Messages = memo(MessagesInner);
