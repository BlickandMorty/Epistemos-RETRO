'use client';

/* ═══════════════════════════════════════════════════════════════════
   MiniChat — PFC Assistant: Multi-Thread Deep Knowledge Panel

   A tabbed, draggable floating panel with multiple independent AI
   chat threads. Each thread can use a different provider (Claude,
   GPT, Gemini). 4 inner tabs: Chat, History, Notes, Research.
   Triggered by floating GIF. Persists across all pages.

   Shell only — tab content extracted to:
     mini-chat-chat-tab.tsx
     mini-chat-history-tab.tsx
     mini-chat-notes-tab.tsx
     mini-chat-research-tab.tsx
   ═══════════════════════════════════════════════════════════════════ */

import { useRef, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Maximize2,
  X,
  Minimize2,
  MessageSquare,
  ExternalLink,
  Plus,
  Server,
  StickyNote,
  GraduationCap,
  Clock,
  type LucideIcon,
} from 'lucide-react';

import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useAssistantStream } from '@/hooks/use-assistant-stream';
import { useIsDark } from '@/hooks/use-is-dark';
import { API_PROVIDERS } from '@/lib/engine/llm/config';
import type { MiniChatTab } from '@/lib/store/slices/ui';

import { ChatTabContent } from './mini-chat-chat-tab';
import { HistoryTabContent } from './mini-chat-history-tab';
import { NotesTabContent } from './mini-chat-notes-tab';
import { ResearchTabContent } from './mini-chat-research-tab';

/* ─── Constants ─── */

const DEFAULT_W = 280;
const DEFAULT_H = 440;
const MIN_W = 360;
const MIN_H = 300;
import { spring as motionSpring } from '@/lib/motion/motion-config';

const SPRING = motionSpring.standard;

/* ─── Inner tab definitions ─── */

const INNER_TABS: { id: MiniChatTab; label: string; icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'research', label: 'Research', icon: GraduationCap },
];

/* ═══════════════════════════════════════════════════════════════════ */

export function MiniChat() {
  const { isDark, isOled, isCosmic, isSunny, isSunset, mounted } = useIsDark();
  const router = useRouter();

  // Model readiness — if no API key and no local model, mini-chat is locked
  const inferenceMode = usePFCStore((s) => s.inferenceMode);
  const apiKey = usePFCStore((s) => s.apiKey);
  const ollamaAvailable = usePFCStore((s) => s.ollamaAvailable);
  const modelReady = inferenceMode === 'local' ? ollamaAvailable : apiKey.length > 0;

  // Mini-chat state
  const miniChatOpen = usePFCStore((s) => s.miniChatOpen);
  const miniPos = usePFCStore((s) => s.miniChatPosition);
  const setMiniPos = usePFCStore((s) => s.setMiniChatPosition);
  const setMiniChatOpen = usePFCStore((s) => s.setMiniChatOpen);
  const miniSize = usePFCStore((s) => s.miniChatSize);
  const setMiniSize = usePFCStore((s) => s.setMiniChatSize);

  // Inner tab state
  const activeInnerTab = usePFCStore((s) => s.miniChatTab);
  const setInnerTab = usePFCStore((s) => s.setMiniChatTab);

  // Thread state
  const chatThreads = usePFCStore((s) => s.chatThreads);
  const activeThreadId = usePFCStore((s) => s.activeThreadId);
  const setActiveThread = usePFCStore((s) => s.setActiveThread);
  const createThread = usePFCStore((s) => s.createThread);
  const closeThread = usePFCStore((s) => s.closeThread);
  const setThreadProvider = usePFCStore((s) => s.setThreadProvider);
  const setThreadModel = usePFCStore((s) => s.setThreadModel);
  const setThreadLocal = usePFCStore((s) => s.setThreadLocal);
  const _saveMessageToNotes = usePFCStore((s) => s.saveMessageToNotes);
  // Wrap to also navigate to /notes after saving
  const saveMessageToNotes = useCallback((content: string) => {
    const pageId = _saveMessageToNotes(content);
    if (pageId) router.push('/notes');
    return pageId;
  }, [_saveMessageToNotes, router]);
  const expandThreadToChat = usePFCStore((s) => s.expandThreadToChat);
  const setChatMinimized = usePFCStore((s) => s.setChatMinimized);
  const addToast = usePFCStore((s) => s.addToast);

  // Streaming state — per-thread (reads from active thread's streaming state)
  const assistantStreamText = usePFCStore((s) => s.threadStreamingText[s.activeThreadId] || '');
  const assistantIsStreaming = usePFCStore((s) => s.threadIsStreaming[s.activeThreadId] || false);

  // Hook
  const { sendQuery, abort } = useAssistantStream();

  const [collapsed, setCollapsed] = useState(false);
  const visible = mounted && miniChatOpen;

  // Active thread
  const activeThread = chatThreads.find((t) => t.id === activeThreadId);
  const activeMessages = activeThread?.messages || [];

  /* ─── Position to bottom-right on first show ─── */
  const hasPositioned = useRef(false);
  useEffect(() => {
    if (visible && !hasPositioned.current) {
      hasPositioned.current = true;
      const x = Math.max(16, window.innerWidth - miniSize.w - 24);
      const y = Math.max(16, window.innerHeight - miniSize.h - 24);
      setMiniPos({ x, y });
    }
  }, [visible, setMiniPos, miniSize.w, miniSize.h]);

  /* ─── Snap back on window resize (keep widget visible) ─── */
  useEffect(() => {
    const onResize = () => {
      const margin = 16;
      const maxX = Math.max(margin, window.innerWidth - miniSize.w - margin);
      const maxY = Math.max(margin, window.innerHeight - miniSize.h - margin);
      const pos = usePFCStore.getState().miniChatPosition;
      if (pos.x > maxX || pos.y > maxY) {
        setMiniPos({ x: Math.min(pos.x, maxX), y: Math.min(pos.y, maxY) });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setMiniPos, miniSize.w, miniSize.h]);

  /* ─── Drag logic ─── */
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { x: e.clientX - miniPos.x, y: e.clientY - miniPos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [miniPos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    // Clamp so entire widget stays within viewport (16px margin)
    const margin = 16;
    const maxX = Math.max(margin, window.innerWidth - miniSize.w - margin);
    const maxY = Math.max(margin, window.innerHeight - miniSize.h - margin);
    const newX = Math.max(margin, Math.min(maxX, e.clientX - dragStart.current.x));
    const newY = Math.max(margin, Math.min(maxY, e.clientY - dragStart.current.y));
    setMiniPos({ x: newX, y: newY });
  }, [setMiniPos, miniSize.w, miniSize.h]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  }, []);

  /* ─── Resize logic (8-direction) ─── */
  type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
  const resizing = useRef(false);
  const resizeEdge = useRef<ResizeEdge>('se');
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 });

  const onResizeDown = useCallback((e: React.PointerEvent, edge: ResizeEdge) => {
    e.stopPropagation();
    e.preventDefault();
    resizing.current = true;
    resizeEdge.current = edge;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: miniSize.w, h: miniSize.h, px: miniPos.x, py: miniPos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [miniSize, miniPos]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    const dx = e.clientX - resizeStart.current.x;
    const dy = e.clientY - resizeStart.current.y;
    const edge = resizeEdge.current;
    const hasN = edge.includes('n');
    const hasS = edge.includes('s');
    const hasE = edge === 'e' || edge === 'ne' || edge === 'se';
    const hasW = edge === 'w' || edge === 'nw' || edge === 'sw';

    let newW = resizeStart.current.w;
    let newH = resizeStart.current.h;
    let newX = resizeStart.current.px;
    let newY = resizeStart.current.py;

    if (hasE) newW = Math.max(MIN_W, resizeStart.current.w + dx);
    if (hasW) {
      newW = Math.max(MIN_W, resizeStart.current.w - dx);
      newX = resizeStart.current.px + (resizeStart.current.w - newW);
    }
    if (hasS) newH = Math.max(MIN_H, resizeStart.current.h + dy);
    if (hasN) {
      newH = Math.max(MIN_H, resizeStart.current.h - dy);
      newY = resizeStart.current.py + (resizeStart.current.h - newH);
    }

    // Clamp so widget stays within viewport
    const margin = 16;
    newX = Math.max(margin, Math.min(newX, window.innerWidth - newW - margin));
    newY = Math.max(margin, Math.min(newY, window.innerHeight - newH - margin));
    setMiniSize({ w: newW, h: newH });
    setMiniPos({ x: newX, y: newY });
  }, [setMiniSize, setMiniPos]);

  const onResizeUp = useCallback((e: React.PointerEvent) => {
    resizing.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ok */ }
  }, []);

  /* ─── Per-theme style tokens ─── */
  const surfaceBg = isOled ? '#1A1A1A'
    : isCosmic ? '#0F1528'
    : isSunset ? '#1E1614'
    : isSunny ? '#E8EEF6'
    : isDark ? '#1E1B18'
    : '#FFFFFF';

  const headerBg = isOled ? '#111111'
    : isCosmic ? '#0A0F1E'
    : isSunset ? '#151010'
    : isSunny ? '#D8E2EE'
    : isDark ? '#16140F'
    : '#111111';

  const headerText = isOled ? '#E0E0E0'
    : isCosmic ? '#B8C8DA'
    : isSunset ? '#D4B8A8'
    : isSunny ? '#2A3850'
    : isDark ? '#E6DCD0'
    : '#FFFFFF';

  const glassBorder = isOled ? 'rgba(50,50,50,0.4)'
    : isCosmic ? 'rgba(40,55,80,0.35)'
    : isSunset ? 'rgba(80,50,40,0.3)'
    : isSunny ? 'rgba(0,0,0,0.06)'
    : isDark ? 'rgba(60,52,42,0.3)'
    : 'rgba(0,0,0,0.06)';

  const textPrimary = isDark ? '#E6E1E5' : isSunny ? '#1A2840' : '#1C1B1F';
  const textSecondary = isDark ? '#CAC4D0' : isSunny ? '#4A5A6E' : '#49454F';
  const btnHover = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const tabActiveBg = isDark ? 'rgba(var(--pfc-accent-rgb), 0.16)' : 'rgba(var(--pfc-accent-rgb), 0.12)';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="mini-chat"
          initial={{ opacity: 0, scale: 0.85, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 30 }}
          transition={SPRING}
          style={{
            position: 'fixed',
            left: miniPos.x,
            top: miniPos.y,
            width: miniSize.w,
            height: collapsed ? 'auto' : miniSize.h,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 20,
            overflow: 'hidden',
            background: surfaceBg,
            border: 'none',
            boxShadow: 'none',
            transform: 'translateZ(0)',
          }}
        >
          {/* ─── Header (Material You flat) ─── */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.625rem 0.5rem 0.75rem',
              background: headerBg,
              cursor: 'grab',
              userSelect: 'none',
              touchAction: 'none',
              borderBottom: 'none',
              flexShrink: 0,
            }}
          >
            {/* Sun on sunny, robot on dark themes, profile icon on default light */}
            {isSunny ? (
              <img src="/pixel-sun.gif" alt="Sunny" style={{ width: 22, height: 22, imageRendering: 'pixelated' }} />
            ) : isDark ? (
              <img src="/pixel-robot.gif" alt="Izmi" style={{ width: 22, height: 22, imageRendering: 'pixelated' }} />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', color: '#FFFFFF' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
              </span>
            )}
            <span style={{
              flex: 1, fontSize: 13, fontWeight: 600, color: headerText,
              fontFamily: 'var(--font-heading)', letterSpacing: '0.01em',
            }}>
              Assistant
            </span>
            {assistantIsStreaming && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--pfc-accent)',
                animation: 'pulse 1.4s ease-in-out infinite', flexShrink: 0,
              }} />
            )}
            <HeaderButton
              icon={ExternalLink}
              onClick={() => {
                const thread = chatThreads.find((t) => t.id === activeThreadId);
                if (thread?.chatId) {
                  setChatMinimized(false);
                  window.location.href = `/chat/${thread.chatId}`;
                } else {
                  expandThreadToChat();
                }
              }}
              hoverBg={isDark ? btnHover : 'rgba(255,255,255,0.12)'}
              color={headerText}
              title="Open in main chat"
            />
            <HeaderButton icon={collapsed ? Maximize2 : Minimize2} onClick={() => setCollapsed((c) => !c)} hoverBg={isDark ? btnHover : 'rgba(255,255,255,0.12)'} color={headerText} title={collapsed ? 'Expand' : 'Collapse'} />
            <HeaderButton icon={X} onClick={() => setMiniChatOpen(false)} hoverBg={isDark ? btnHover : 'rgba(255,255,255,0.12)'} color={headerText} title="Close" />
          </div>

          {!collapsed && (
            <>
              {/* ─── Thread Tabs (Material You flat chips) ─── */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '0.25rem 0.5rem',
                borderBottom: 'none',
                flexShrink: 0,
                overflowX: 'auto',
                overflowY: 'hidden',
              }}>
                {chatThreads.map((thread) => {
                  const isActive = activeThreadId === thread.id;
                  const providerInfo = thread.provider
                    ? API_PROVIDERS.find((p) => p.value === thread.provider)
                    : null;
                  return (
                    <div
                      key={thread.id}
                      onClick={() => setActiveThread(thread.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '0.25rem 0.5rem',
                        borderRadius: 999,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: isActive ? 600 : 500,
                        fontFamily: 'var(--font-sans)',
                        color: isActive ? textPrimary : textSecondary,
                        background: isActive ? tabActiveBg : 'transparent',
                        border: isActive ? '1px solid rgba(var(--pfc-accent-rgb), 0.2)' : '1px solid transparent',
                        transition: 'all 0.18s ease',
                        whiteSpace: 'nowrap',
                        maxWidth: 140,
                        flexShrink: 0,
                      }}
                    >
                      {thread.useLocal ? (
                        <Server style={{ width: 9, height: 9, color: '#f59e0b', flexShrink: 0 }} />
                      ) : providerInfo ? (
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: providerInfo.color, flexShrink: 0,
                        }} />
                      ) : null}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {thread.label}
                      </span>
                      {chatThreads.length > 1 && thread.id !== 'pfc-main' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); closeThread(thread.id); }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 14, height: 14, borderRadius: 4, border: 'none',
                            background: 'transparent', color: textSecondary,
                            cursor: 'pointer', fontSize: 10, flexShrink: 0,
                            padding: 0,
                          }}
                        >
                          <X style={{ width: 10, height: 10 }} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {chatThreads.length < 8 && (
                  <button
                    onClick={() => createThread('assistant')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: 999, border: 'none',
                      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      color: textSecondary,
                      cursor: 'pointer', flexShrink: 0,
                      transition: 'background 0.18s',
                    }}
                    title="New chat thread"
                    onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(var(--pfc-accent-rgb), 0.15)' : 'rgba(var(--pfc-accent-rgb), 0.1)'; e.currentTarget.style.color = 'var(--pfc-accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = textSecondary; }}
                  >
                    <Plus style={{ width: 12, height: 12 }} />
                  </button>
                )}
              </div>

              {/* ─── Inner Tab Bar (Material You segmented row) ─── */}
              <div style={{
                display: 'flex',
                gap: 0,
                padding: '0 0.5rem',
                flexShrink: 0,
                position: 'relative',
              }}>
                {INNER_TABS.map((tab) => {
                  const isActive = activeInnerTab === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setInnerTab(tab.id)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        padding: '0.5rem 0.25rem 0.375rem',
                        borderRadius: 0,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: isActive ? 600 : 500,
                        fontFamily: 'var(--font-sans)',
                        color: isActive ? 'var(--pfc-accent)' : textSecondary,
                        background: 'transparent',
                        borderBottom: isActive ? '2px solid var(--pfc-accent)' : '2px solid transparent',
                        transition: 'all 0.18s ease',
                      }}
                    >
                      <Icon style={{ width: 12, height: 12 }} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* ─── Tab Content ─── */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {activeInnerTab === 'chat' && (
                  <ChatTabContent
                    isDark={isDark}
                    glassBorder={glassBorder}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                    btnHover={btnHover}
                    messages={activeMessages}
                    streamText={assistantStreamText}
                    isStreaming={assistantIsStreaming}
                    thread={activeThread}
                    sendQuery={sendQuery}
                    abort={abort}
                    saveToNotes={saveMessageToNotes}
                    addToast={addToast}
                    setThreadProvider={setThreadProvider}
                    setThreadModel={setThreadModel}
                    setThreadLocal={setThreadLocal}
                    modelReady={modelReady}
                  />
                )}
                {activeInnerTab === 'history' && (
                  <HistoryTabContent
                    isDark={isDark}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                    btnHover={btnHover}
                  />
                )}
                {activeInnerTab === 'notes' && (
                  <NotesTabContent
                    isDark={isDark}
                    glassBorder={glassBorder}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                    btnHover={btnHover}
                  />
                )}
                {activeInnerTab === 'research' && (
                  <ResearchTabContent
                    isDark={isDark}
                    glassBorder={glassBorder}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                    btnHover={btnHover}
                  />
                )}
              </div>
            </>
          )}

          {/* ─── Resize handles (8 directions) ─── */}
          {!collapsed && (
            <>
              {/* Top edge */}
              <div onPointerDown={(e) => onResizeDown(e, 'n')} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
                style={{ position: 'absolute', top: -2, left: 16, right: 16, height: 10, cursor: 'ns-resize', touchAction: 'none' }} />
              {/* Bottom edge */}
              <div onPointerDown={(e) => onResizeDown(e, 's')} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
                style={{ position: 'absolute', bottom: -2, left: 16, right: 16, height: 10, cursor: 'ns-resize', touchAction: 'none' }} />
              {/* Left edge */}
              <div onPointerDown={(e) => onResizeDown(e, 'w')} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
                style={{ position: 'absolute', left: -2, top: 16, bottom: 16, width: 10, cursor: 'ew-resize', touchAction: 'none' }} />
              {/* Right edge */}
              <div onPointerDown={(e) => onResizeDown(e, 'e')} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
                style={{ position: 'absolute', right: -2, top: 16, bottom: 16, width: 10, cursor: 'ew-resize', touchAction: 'none' }} />
              {/* NW corner */}
              <div onPointerDown={(e) => onResizeDown(e, 'nw')} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
                style={{ position: 'absolute', left: 0, top: 0, width: 14, height: 14, cursor: 'nwse-resize', touchAction: 'none' }} />
              {/* NE corner */}
              <div onPointerDown={(e) => onResizeDown(e, 'ne')} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
                style={{ position: 'absolute', right: 0, top: 0, width: 14, height: 14, cursor: 'nesw-resize', touchAction: 'none' }} />
              {/* SW corner */}
              <div onPointerDown={(e) => onResizeDown(e, 'sw')} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
                style={{ position: 'absolute', left: 0, bottom: 0, width: 14, height: 14, cursor: 'nesw-resize', touchAction: 'none' }} />
              {/* SE corner — visible grip */}
              <div onPointerDown={(e) => onResizeDown(e, 'se')} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
                style={{ position: 'absolute', right: 2, bottom: 2, width: 14, height: 14, cursor: 'nwse-resize', touchAction: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="8" height="8" viewBox="0 0 8 8" style={{ opacity: 0.2 }}>
                  <circle cx="6" cy="6" r="1" fill={textSecondary} />
                  <circle cx="3" cy="6" r="1" fill={textSecondary} />
                  <circle cx="6" cy="3" r="1" fill={textSecondary} />
                </svg>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Header icon button (reusable)
   ═══════════════════════════════════════════════════════════════════ */

function HeaderButton({ icon: Icon, onClick, hoverBg, color, title }: {
  icon: LucideIcon; onClick: () => void; hoverBg: string; color: string; title: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 999, border: 'none',
        background: 'transparent', color, cursor: 'pointer',
        transition: 'background 0.18s', flexShrink: 0, pointerEvents: 'auto',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon style={{ width: 14, height: 14 }} />
    </button>
  );
}
