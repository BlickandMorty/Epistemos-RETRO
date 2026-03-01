'use client';

/* ═══════════════════════════════════════════════════════════════════
   MiniChat — Chat Tab Content
   Thread-aware conversation with message actions, provider/model picker,
   empty state with recent chats from DB.
   Extracted from mini-chat.tsx (surgery — code as-is)
   ═══════════════════════════════════════════════════════════════════ */

import { useRef, useCallback, useEffect, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Square,
  FileText,
  BookmarkPlus,
  CornerDownLeft,
  Server,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

import { usePFCStore } from '@/lib/store/use-pfc-store';
import { API_PROVIDERS, OPENAI_MODELS, ANTHROPIC_MODELS, GOOGLE_MODELS } from '@/lib/engine/llm/config';
import type { ApiProvider } from '@/lib/engine/llm/config';
import type { ChatThread, AssistantMessage } from '@/lib/store/slices/ui';
import type { ChatEntry } from '@/components/chat/recent-chats';
import { parseTimestamp, formatRelativeTime } from '@/components/chat/recent-chats';

/* ─── Props ─── */

export interface ChatTabContentProps {
  isDark: boolean;
  glassBorder: string;
  textPrimary: string;
  textSecondary: string;
  btnHover: string;
  messages: AssistantMessage[];
  streamText: string;
  isStreaming: boolean;
  thread?: ChatThread;
  sendQuery: (q: string, threadId?: string) => void;
  abort: () => void;
  saveToNotes: (content: string) => string;
  addToast: (toast: { type: 'info' | 'success' | 'error' | 'warning'; message: string }) => void;
  setThreadProvider: (threadId: string, provider: ApiProvider) => void;
  setThreadModel: (threadId: string, model: string | undefined) => void;
  setThreadLocal: (threadId: string, useLocal: boolean) => void;
  modelReady: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
   Chat Tab — Thread-aware conversation with message actions
   ═══════════════════════════════════════════════════════════════════ */

export function ChatTabContent({ isDark, glassBorder, textPrimary, textSecondary, btnHover, messages, streamText, isStreaming, thread, sendQuery, abort, saveToNotes, addToast, setThreadProvider, setThreadModel, setThreadLocal, modelReady }: ChatTabContentProps) {
  const [inputVal, setInputVal] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Track if user is near bottom (within 80px)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // Auto-scroll only if user is near bottom
  useEffect(() => {
    if (scrollRef.current && isNearBottom.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, streamText]);

  const handleSubmit = useCallback(() => {
    if (!inputVal.trim()) return;
    sendQuery(inputVal.trim(), thread?.id);
    setInputVal('');
    isNearBottom.current = true; // snap to bottom on own message
  }, [inputVal, sendQuery, thread?.id]);

  const isLocal = thread?.useLocal === true;
  const currentProvider = thread?.provider
    ? API_PROVIDERS.find((p) => p.value === thread.provider)
    : null;

  // Model list for the currently selected provider
  const modelsForProvider = thread?.provider === 'openai' ? OPENAI_MODELS
    : thread?.provider === 'anthropic' ? ANTHROPIC_MODELS
    : thread?.provider === 'google' ? GOOGLE_MODELS
    : [];

  // Current model label
  const currentModelLabel = thread?.model
    ? modelsForProvider.find((m) => m.value === thread.model)?.label ?? thread.model
    : null;

  return (
    <>
      {/* Provider + model picker bar */}
      {thread && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 0,
          borderBottom: `1px solid ${glassBorder}`, flexShrink: 0,
          fontSize: 10.5,
        }}>
          {/* Row 1: Provider selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.25rem 0.5rem' }}>
            <span style={{ color: textSecondary, flexShrink: 0 }}>Provider:</span>
            <button
              onClick={() => { setShowProviderPicker(!showProviderPicker); setShowModelPicker(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 999,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                color: isLocal ? '#f59e0b' : currentProvider ? currentProvider.color : textSecondary,
                fontSize: 10.5, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {isLocal ? (
                <Server style={{ width: 10, height: 10, color: '#f59e0b' }} />
              ) : currentProvider ? (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: currentProvider.color }} />
              ) : null}
              {isLocal ? 'Local (Ollama)' : currentProvider?.label || 'Default (Global)'}
              <ChevronDown style={{ width: 10, height: 10 }} />
            </button>
            <AnimatePresence>
              {showProviderPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
                >
                  {API_PROVIDERS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => {
                        setThreadProvider(thread.id, p.value);
                        setShowProviderPicker(false);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        padding: '2px 6px', borderRadius: 999,
                        border: `1px solid ${p.color}33`,
                        background: !isLocal && thread.provider === p.value ? `${p.color}22` : 'transparent',
                        color: p.color, fontSize: 10, fontWeight: 500, cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.color }} />
                      {p.label}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setThreadLocal(thread.id, !isLocal);
                      setShowProviderPicker(false);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '2px 6px', borderRadius: 999,
                      border: '1px solid #f59e0b33',
                      background: isLocal ? '#f59e0b22' : 'transparent',
                      color: '#f59e0b', fontSize: 10, fontWeight: 500, cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <Server style={{ width: 9, height: 9 }} />
                    Local
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Row 2: Model selector — only shown when an API provider is selected */}
          {!isLocal && thread.provider && modelsForProvider.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.125rem 0.5rem 0.25rem', position: 'relative' }}>
              <span style={{ color: textSecondary, flexShrink: 0 }}>Model:</span>
              <button
                onClick={() => { setShowModelPicker(!showModelPicker); setShowProviderPicker(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 999,
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                  color: currentProvider?.color ?? textSecondary,
                  fontSize: 10.5, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {currentModelLabel || 'Default'}
                <ChevronDown style={{ width: 10, height: 10, transform: showModelPicker ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
              </button>
              <AnimatePresence>
                {showModelPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    style={{
                      position: 'absolute', top: '100%', left: 8, right: 8,
                      zIndex: 50, padding: '4px 0',
                      borderRadius: 8,
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                      background: isDark ? 'rgba(20,18,16,0.97)' : 'rgba(255,255,255,0.97)',
                      backdropFilter: 'blur(12px)',
                      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.12)',
                      maxHeight: 200, overflowY: 'auto',
                    }}
                  >
                    {modelsForProvider.map((m) => {
                      const isActive = thread.model === m.value;
                      return (
                        <button
                          key={m.value}
                          onClick={() => {
                            setThreadModel(thread.id, m.value);
                            setShowModelPicker(false);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            width: '100%', padding: '5px 10px',
                            border: 'none', cursor: 'pointer',
                            background: isActive
                              ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
                              : 'transparent',
                            color: isActive ? (currentProvider?.color ?? textPrimary) : textPrimary,
                            fontSize: 11, fontWeight: isActive ? 600 : 400,
                            fontFamily: 'var(--font-sans)',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: isActive ? (currentProvider?.color ?? '#888') : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'),
                            flexShrink: 0,
                          }} />
                          {m.label}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0,
        padding: '0.5rem', fontSize: 12.5, lineHeight: 1.6,
      }}>
        {messages.length === 0 && !streamText && (
          <EmptyStateWithRecent isDark={isDark} textPrimary={textPrimary} textSecondary={textSecondary} btnHover={btnHover} />
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={`${msg.role}-${msg.timestamp}-${i}`}
            msg={msg}
            isDark={isDark}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            btnHover={btnHover}
            onSaveToNotes={saveToNotes}
            onSaveForLater={(content) => {
              addToast({ type: 'success', message: 'Bookmarked for later' });
            }}
          />
        ))}
        {streamText && (
          <div style={{
            padding: '0.5rem 0.625rem', borderRadius: 10,
            color: textPrimary,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {streamText}
            <span style={{ animation: 'pulse 1s ease-in-out infinite', opacity: 0.6 }}>|</span>
          </div>
        )}
      </div>

      {/* Input area (Material You tonal surface) */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '0.5rem 0.625rem 0.625rem', borderTop: `1px solid ${glassBorder}`,
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center',
          padding: '0.4rem 0.75rem', borderRadius: 999,
          background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        }}>
          <input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder={modelReady ? 'Ask a research question...' : 'Configure a model in Settings...'}
            maxLength={10000}
            disabled={isStreaming || !modelReady}
            style={{
              flex: 1, border: 'none', background: 'none',
              color: modelReady ? textPrimary : textSecondary,
              fontSize: 12, fontFamily: 'var(--font-sans)', outline: 'none',
              cursor: modelReady ? 'text' : 'not-allowed',
            }}
          />
        </div>
        {isStreaming ? (
          <button onClick={abort} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 999, border: 'none',
            background: 'rgba(var(--pfc-accent-rgb), 0.12)', color: 'var(--pfc-accent)',
            cursor: 'pointer', flexShrink: 0,
          }}>
            <Square style={{ width: 13, height: 13 }} />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={!inputVal.trim()} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 999, border: 'none',
            background: inputVal.trim() ? 'var(--pfc-accent)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
            color: inputVal.trim() ? '#fff' : textSecondary,
            cursor: inputVal.trim() ? 'pointer' : 'default',
            transition: 'all 0.18s', flexShrink: 0,
          }}>
            <CornerDownLeft style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Empty state — shows recent main-chat sessions from DB
   ═══════════════════════════════════════════════════════════════════ */

function EmptyStateWithRecent({ isDark, textPrimary, textSecondary, btnHover }: {
  isDark: boolean; textPrimary: string; textSecondary: string; btnHover: string;
}) {
  const loadChatIntoThread = usePFCStore((s) => s.loadChatIntoThread);
  const [recentChats, setRecentChats] = useState<ChatEntry[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/history?userId=local-user')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data?.chats) setRecentChats(data.chats.slice(0, 5));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const openChat = useCallback(async (chatId: string, title: string) => {
    setLoadingId(chatId);
    try {
      const res = await fetch(`/api/history?chatId=${chatId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.messages) return;

      // Convert ChatMessage[] → AssistantMessage[] for the mini-chat thread
      const messages = (data.messages as Array<{ role: string; text: string; timestamp: number }>).map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text || '',
        timestamp: m.timestamp || Date.now(),
      }));

      loadChatIntoThread(chatId, title, messages);
    } catch {
      // Silently fail
    } finally {
      setLoadingId(null);
    }
  }, [loadChatIntoThread]);

  return (
    <div style={{ padding: '1rem 0.75rem', fontSize: 12 }}>
      <div style={{ color: textSecondary, textAlign: 'center', marginBottom: recentChats.length ? 12 : 0 }}>
        Ask anything about the PFC system — signals, pipeline, steering, debugging, or anything else.
      </div>
      {recentChats.length > 0 && (
        <div>
          <div style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: textSecondary, marginBottom: 6,
            opacity: 0.6,
          }}>
            Recent sessions
          </div>
          {recentChats.map((chat) => {
            const isHovered = hoveredId === chat.id;
            const isLoading = loadingId === chat.id;
            return (
              <button
                key={chat.id}
                onClick={() => openChat(chat.id, chat.title)}
                onMouseEnter={() => setHoveredId(chat.id)}
                onMouseLeave={() => setHoveredId(null)}
                disabled={isLoading}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '6px 8px', borderRadius: 8, marginBottom: 2,
                  fontSize: 11, color: isHovered ? 'var(--pfc-accent)' : textPrimary,
                  background: isHovered ? btnHover : 'transparent',
                  border: 'none', cursor: isLoading ? 'wait' : 'pointer', textAlign: 'left',
                  fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                  <MessageSquare style={{ width: 10, height: 10, display: 'inline', verticalAlign: '-1px', marginRight: 4, opacity: isHovered ? 0.8 : 0.4 }} />
                  {chat.title}
                </span>
                <span style={{ fontSize: 9.5, color: textSecondary, flexShrink: 0 }}>
                  {formatRelativeTime(parseTimestamp(chat.updatedAt || chat.createdAt))}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Message Bubble with actions (Save to Notes / Save for Later)
   ═══════════════════════════════════════════════════════════════════ */

const MessageBubble = memo(function MessageBubble({ msg, isDark, textPrimary, textSecondary, btnHover, onSaveToNotes, onSaveForLater }: {
  msg: AssistantMessage; isDark: boolean;
  textPrimary: string; textSecondary: string; btnHover: string;
  onSaveToNotes: (content: string) => string;
  onSaveForLater: (content: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const isUser = msg.role === 'user';

  return (
    <div
      onMouseEnter={() => !isUser && setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      style={{
        marginBottom: '0.5rem',
        padding: '0.5rem 0.625rem',
        borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        background: isUser
          ? (isDark ? 'rgba(var(--pfc-accent-rgb), 0.12)' : 'rgba(var(--pfc-accent-rgb), 0.08)')
          : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
        color: textPrimary,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        position: 'relative',
      }}
    >
      {isUser && (
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--pfc-accent)', display: 'block', marginBottom: 2 }}>You</span>
      )}
      {msg.content.replace(/\s*\[(DATA|CONFLICT|UNCERTAIN|MODEL)\]\s*/g, ' ')}

      {/* Message actions (assistant messages only) */}
      {!isUser && showActions && (
        <div style={{
          display: 'flex', gap: 4, marginTop: 6,
        }}>
          <ActionButton
            icon={FileText}
            label="Add to Notes"
            isDark={isDark}
            textSecondary={textSecondary}
            btnHover={btnHover}
            onClick={() => onSaveToNotes(msg.content)}
          />
          <ActionButton
            icon={BookmarkPlus}
            label="Save for Later"
            isDark={isDark}
            textSecondary={textSecondary}
            btnHover={btnHover}
            onClick={() => onSaveForLater(msg.content)}
          />
        </div>
      )}
    </div>
  );
});

function ActionButton({ icon: Icon, label, isDark, textSecondary, btnHover, onClick }: {
  icon: LucideIcon; label: string; isDark: boolean; textSecondary: string; btnHover: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 999,
        border: 'none',
        background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        color: textSecondary, fontSize: 10, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
        transition: 'all 0.18s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isDark ? 'rgba(var(--pfc-accent-rgb), 0.15)' : 'rgba(var(--pfc-accent-rgb), 0.1)';
        e.currentTarget.style.color = 'var(--pfc-accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
        e.currentTarget.style.color = textSecondary;
      }}
    >
      <Icon style={{ width: 10, height: 10 }} />
      {label}
    </button>
  );
}
