import { lazy, Suspense, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useChatStream } from '@/hooks/use-chat-stream';
import { Messages } from './messages';
import { MultimodalInput } from './multimodal-input';
import { ResearchModeBar } from './research-mode-bar';
import { ThinkingControls } from './thinking-controls';
import { ErrorBoundary } from '../layout/error-boundary';
import { useIsDark } from '@/hooks/use-is-dark';
import { getInferenceModeFeatures } from '@/lib/types';
import { CloudIcon, MonitorIcon, ArrowLeftIcon, MessageSquareIcon, ExternalLinkIcon, ZapIcon, DownloadIcon, LockIcon, SettingsIcon, SparklesIcon } from 'lucide-react';
import { commands } from '@/lib/bindings';
import { GreetingTypewriter, SearchBarPlaceholder } from './greeting-typewriter';
import { ChatsSidePanel, ChatsOverlay } from './chat-history-sheet';

// ═══════════════════════════════════════════════════════════════════
// Dynamic imports — only loaded when the tier enables them
// ═══════════════════════════════════════════════════════════════════

const LiveControls = lazy(() => import('./live-controls').then((m) => ({ default: m.LiveControls })));
const ConceptHierarchyPanel = lazy(() => import('../viz/concept-hierarchy-panel').then((m) => ({ default: m.ConceptHierarchyPanel })));
const PortalSidebar = lazy(() => import('../viz/portal-sidebar').then((m) => ({ default: m.PortalSidebar })));

/* Spring configs — spring physics handle interruption gracefully
   (retarget mid-animation) unlike duration-based easing which
   queues up and glitches on rapid page cycling / All Chats toggle */


// ═══════════════════════════════════════════════════════════════════
// AllChatsBubble — pill button that toggles the ChatsSidePanel
// ═══════════════════════════════════════════════════════════════════

function AllChatsBubble({ isDark, isOled, isSunny, isCosmic, onToggle }: {
  isDark: boolean; isOled?: boolean; isSunny?: boolean; isCosmic?: boolean; onToggle: () => void;
}) {
  return (
    <div
      className="animate-spring-up"
      style={{ display: 'flex', justifyContent: 'center' }}
    >
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.4375rem 0.875rem',
          borderRadius: '9999px',
          border: 'none',
          background: isOled ? 'rgba(35,35,35,0.7)'
            : isCosmic ? 'rgba(14,12,26,0.45)'
              : isDark ? 'rgba(244,189,111,0.05)'
                : isSunny ? 'var(--card)'
                  : 'rgba(0,0,0,0.04)',
          cursor: 'pointer',
          fontSize: '0.625rem',
          fontWeight: 500,
          color: isOled ? 'rgba(200,200,200,0.85)'
            : isCosmic ? 'rgba(180,175,200,0.75)'
              : isDark ? 'rgba(155,150,137,0.7)'
                : isSunny ? 'var(--muted-foreground)'
                  : 'rgba(0,0,0,0.55)',
          fontFamily: 'var(--font-sans)',
          letterSpacing: '0.02em',
          boxShadow: 'none',
          transition: 'color 0.15s, background 0.15s',
        }}
      >
        <MessageSquareIcon style={{ height: '0.75rem', width: '0.75rem' }} />
        All Chats
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ActiveThreadsPills — shows mini-chat threads with messages on landing page
// ═══════════════════════════════════════════════════════════════════

function ActiveThreadsPills({ isDark, isCosmic }: { isDark: boolean; isCosmic?: boolean }) {
  const navigate = useNavigate();
  const chatThreads = usePFCStore((s) => s.chatThreads);
  const expandThreadToChat = usePFCStore((s) => s.expandThreadToChat);
  const setChatMinimized = usePFCStore((s) => s.setChatMinimized);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Only show threads that have at least 1 message
  const threadsWithMessages = chatThreads.filter((t) => t.messages.length > 0);
  if (threadsWithMessages.length === 0) return null;

  return (
    <div
      className="animate-spring-up"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
        width: '100%',
        maxWidth: '36rem',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.375rem',
        width: '100%', padding: '0 0.125rem',
      }}>
        <ZapIcon style={{
          height: '0.75rem', width: '0.75rem',
          color: isDark ? 'rgba(155,150,137,0.5)' : 'rgba(0,0,0,0.3)',
        }} />
        <span style={{
          fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: isDark ? 'rgba(155,150,137,0.5)' : 'rgba(0,0,0,0.3)',
          fontFamily: 'var(--font-sans)',
        }}>
          Active Threads
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', width: '100%' }}>
        {threadsWithMessages.map((thread) => {
          const isHovered = hoveredId === thread.id;
          const msgCount = thread.messages.length;
          const lastMsg = thread.messages[msgCount - 1];
          const preview = lastMsg?.content?.slice(0, 50) || '';
          return (
            <button
              key={thread.id}
              onClick={() => {
                if (thread.chatId) {
                  setChatMinimized(false);
                  navigate(`/chat/${thread.chatId}`);
                } else {
                  expandThreadToChat(thread.id);
                }
              }}
              onMouseEnter={() => setHoveredId(thread.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 0.875rem',
                borderRadius: 'var(--shape-lg)',
                border: 'none',
                background: isCosmic
                  ? (isHovered ? 'rgba(22,18,40,0.55)' : 'rgba(14,12,26,0.45)')
                  : isDark
                    ? (isHovered ? 'var(--glass-hover)' : 'var(--pfc-surface-dark)')
                    : (isHovered ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)'),
                cursor: 'pointer', textAlign: 'left', flex: '1 1 auto',
                minWidth: '10rem', maxWidth: '100%',
                backdropFilter: isCosmic ? 'blur(24px) saturate(1.3)' : 'blur(16px) saturate(1.4)',
                WebkitBackdropFilter: isCosmic ? 'blur(24px) saturate(1.3)' : 'blur(16px) saturate(1.4)',
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <MessageSquareIcon style={{
                height: '0.875rem', width: '0.875rem', flexShrink: 0,
                color: isHovered ? 'var(--pfc-accent)' : (isDark ? 'rgba(155,150,137,0.45)' : 'rgba(0,0,0,0.2)'),
                transition: 'color 0.15s',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.4,
                  color: isHovered
                    ? (isDark ? 'rgba(232,228,222,0.95)' : 'rgba(0,0,0,0.85)')
                    : (isDark ? 'rgba(155,150,137,0.75)' : 'rgba(0,0,0,0.5)'),
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-sans)', transition: 'color 0.15s',
                }}>
                  {thread.label}
                </div>
                {preview && (
                  <div style={{
                    fontSize: '0.6875rem', fontWeight: 400, marginTop: '0.125rem',
                    color: isDark ? 'rgba(155,150,137,0.35)' : 'rgba(0,0,0,0.2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {preview}{preview.length >= 50 ? '...' : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                <span style={{
                  fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', fontWeight: 500,
                  color: isDark ? 'rgba(155,150,137,0.4)' : 'rgba(0,0,0,0.2)',
                }}>
                  {msgCount} msg{msgCount !== 1 ? 's' : ''}
                </span>
                <ExternalLinkIcon style={{
                  height: '0.625rem', width: '0.625rem',
                  color: isHovered ? 'var(--pfc-accent)' : (isDark ? 'rgba(155,150,137,0.25)' : 'rgba(0,0,0,0.12)'),
                  transition: 'color 0.15s',
                }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ModelLockOverlay — shown when no API key or local model is configured
// ═══════════════════════════════════════════════════════════════════

function ModelLockOverlay({ isDark, inferenceMode }: { isDark: boolean; inferenceMode: string }) {
  const navigate = useNavigate();
  const isLocal = inferenceMode === 'local';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        padding: '1rem 1.25rem',
        cursor: 'pointer',
      }}
      onClick={() => navigate('/settings')}
    >
      <LockIcon
        style={{
          width: '1rem',
          height: '1rem',
          color: isDark ? 'rgba(232,228,222,0.35)' : 'rgba(0,0,0,0.25)',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          fontFamily: 'var(--font-display)',
          color: isDark ? 'rgba(232,228,222,0.45)' : 'rgba(0,0,0,0.35)',
        }}
      >
        {isLocal
          ? 'No local model found — start Ollama or switch to API mode'
          : 'Add your API key to get started'}
      </span>
      <SettingsIcon
        style={{
          width: '0.875rem',
          height: '0.875rem',
          color: 'var(--pfc-accent)',
          flexShrink: 0,
          opacity: 0.7,
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SoarStoneCard — interactive teaching stone from the SOAR protocol
// ═══════════════════════════════════════════════════════════════════

function SoarStoneCard({ isDark, chatId }: { isDark: boolean; chatId: string | null }) {
  const stone = usePFCStore((s) => s.pendingSoarStone);
  const setSoarStone = usePFCStore((s) => s.setSoarStone);
  const { sendQuery } = useChatStream();
  const [attempting, setAttempting] = useState(false);

  if (!stone) return null;

  const handleAttempt = async () => {
    setAttempting(true);
    try {
      if (chatId) {
        await commands.runSoarStone(chatId, stone.prompt);
      } else {
        // Fallback: send the stone prompt as a regular query
        sendQuery(stone.prompt);
      }
    } catch {
      // Stream errors handled by chat-stream listener
    }
    setSoarStone(null);
    setAttempting(false);
  };

  const handleDismiss = () => setSoarStone(null);

  return (
    <div
      className="animate-spring-up"
      style={{
        margin: '0 auto',
        maxWidth: '48rem',
        width: '100%',
        padding: '0.5rem 1rem',
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        padding: '0.875rem 1rem',
        borderRadius: 'var(--shape-lg)',
        background: isDark
          ? 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.06))'
          : 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))',
        border: isDark
          ? '1px solid rgba(139,92,246,0.15)'
          : '1px solid rgba(139,92,246,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <SparklesIcon style={{
            height: '0.875rem', width: '0.875rem',
            color: isDark ? 'rgba(167,139,250,0.9)' : 'rgba(124,58,237,0.8)',
          }} />
          <span style={{
            fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: isDark ? 'rgba(167,139,250,0.75)' : 'rgba(124,58,237,0.65)',
            fontFamily: 'var(--font-sans)',
          }}>
            SOAR Stone {stone.index + 1}
          </span>
        </div>
        <div style={{
          fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5,
          color: isDark ? 'rgba(232,228,222,0.9)' : 'rgba(0,0,0,0.75)',
          fontFamily: 'var(--font-sans)',
        }}>
          {stone.name}
        </div>
        <div style={{
          fontSize: '0.8125rem', lineHeight: 1.5,
          color: isDark ? 'rgba(200,196,190,0.6)' : 'rgba(0,0,0,0.45)',
          fontFamily: 'var(--font-sans)',
        }}>
          {stone.prompt}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
          <button
            onClick={handleAttempt}
            disabled={attempting}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.375rem 0.875rem',
              borderRadius: 'var(--shape-full)',
              border: 'none',
              cursor: attempting ? 'wait' : 'pointer',
              fontSize: '0.8125rem', fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              color: '#fff',
              background: isDark
                ? 'linear-gradient(135deg, rgba(139,92,246,0.7), rgba(99,102,241,0.6))'
                : 'linear-gradient(135deg, rgba(124,58,237,0.85), rgba(79,70,229,0.75))',
              opacity: attempting ? 0.6 : 1,
            }}
          >
            <SparklesIcon style={{ height: '0.75rem', width: '0.75rem' }} />
            {attempting ? 'Attempting...' : 'Attempt Stone'}
          </button>
          <button
            onClick={handleDismiss}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: 'var(--shape-full)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8125rem', fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              color: isDark ? 'rgba(200,196,190,0.5)' : 'rgba(0,0,0,0.35)',
              background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Chat — landing page ↔ chat interface with TOC sidebar
// ═══════════════════════════════════════════════════════════════════

export function Chat({ mode = 'landing' }: { mode?: 'landing' | 'conversation' }) {
  const navigate = useNavigate();
  const messages = usePFCStore((s) => s.messages);
  const isProcessing = usePFCStore((s) => s.isProcessing);
  const isStreaming = usePFCStore((s) => s.isStreaming);
  const inferenceMode = usePFCStore((s) => s.inferenceMode);
  const apiKey = usePFCStore((s) => s.apiKey);
  const ollamaAvailable = usePFCStore((s) => s.ollamaAvailable);
  const chatMinimized = usePFCStore((s) => s.chatMinimized);
  // const setChatMinimized = usePFCStore((s) => s.setChatMinimized);
  const clearMessages = usePFCStore((s) => s.clearMessages);
  const currentChatId = usePFCStore((s) => s.currentChatId);
  const { sendQuery, abort, pause, resume } = useChatStream();
  const { isDark, isOled, isCosmic, isSunny, isSunset, mounted } = useIsDark();

  // Landing mode: clear stale messages so the greeting always shows
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (mode === 'landing') {
      navigatedRef.current = false;
      clearMessages();
    }
  }, [mode, clearMessages]);

  // Landing → conversation: navigate to /chat/[id] once a NEW query creates a chat
  // Only fires when isStreaming (active query), preventing stale-state navigation
  useEffect(() => {
    if (mode === 'landing' && currentChatId && messages.length > 0 && isStreaming && !navigatedRef.current) {
      navigatedRef.current = true;
      navigate(`/chat/${currentChatId}`);
    }
  }, [mode, currentChatId, messages.length, isStreaming, navigate]);

  // Model readiness — lock input when no usable model is configured
  const modelReady = inferenceMode === 'local' ? ollamaAvailable : apiKey.length > 0;
  const [modeHintDismissed, setModeHintDismissed] = useState(false);
  const [showAllChats, setShowAllChats] = useState(false);
  const [showChatsOverlay, setShowChatsOverlay] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const lastBackClickRef = useRef(0);
  const lastChatsClickRef = useRef(0);

  const toggleAllChats = useCallback(() => {
    setShowAllChats((prev) => !prev);
  }, []);

  // Mode-driven UI: landing always shows greeting, conversation always shows chat
  const showLanding = mode === 'landing' || (mode === 'conversation' && messages.length === 0 && chatMinimized);
  // Hide full chat when minimized — mini-chat widget takes over
  const showFullChat = mode === 'conversation' && messages.length > 0 && !chatMinimized;
  const features = useMemo(() => getInferenceModeFeatures(inferenceMode), [inferenceMode]);
  const showModeHint = !features.playPause && !modeHintDismissed && showFullChat;

  return (
    <ErrorBoundary>
      <div style={{ position: 'relative', display: 'flex', height: '100%', flexDirection: 'column' }}>

        {/* ═══════════════════════════════════════════════════════════════
          Landing page — greeting + search bar
          Also shown when chat is minimized to floating widget
          ═══════════════════════════════════════════════════════════════ */}
        {showLanding && (
          <div
            style={{
              position: 'relative',
              zIndex: 'var(--z-base)',
              display: 'flex',
              flex: 1,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.5rem',
              padding: '0 24px',
              background: (isOled || isCosmic)
                ? 'transparent'
                : isDark
                  ? 'var(--background)'
                  : 'var(--m3-surface)',
            }}
          >
            {/* Wallpaper fade overlay — covers starfield/stars when search focused.
              Skipped for cosmic — wallpaper stays visible, search bar uses blur glass instead. */}
            {!isCosmic && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 0,
                  background: isOled ? '#000' : isDark ? 'var(--background)' : 'var(--m3-surface)',
                  opacity: (searchFocused && !showAllChats) ? 1 : 0,
                  transition: 'opacity 0.3s cubic-bezier(0.2, 0, 0, 1)',
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* All Chats side panel — overlay on landing */}
            {showAllChats && (
              <ChatsSidePanel
                isDark={isDark}
                isOled={isOled}
                isCosmic={isCosmic}
                isSunny={isSunny}
                isSunset={isSunset}
                onClose={() => setShowAllChats(false)}
              />
            )}

            <div
              className="animate-spring-up"
              style={{
                position: 'relative',
                zIndex: 'calc(var(--z-base) + 1)',
                width: '100%',
                maxWidth: '44rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem',
              }}
            >

              {/* Mascot + greeting — min-height container, overflow visible
                   so the mascot/sun never gets clipped when text wraps. */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  minHeight: (isDark || isSunny) ? '11rem' : '5.5rem',
                  gap: '1.5rem',
                  overflow: 'visible',
                }}
              >
                {/* Pixel mascot — sun on sunny, robot on all dark themes, hidden on default light */}
                {(isDark || isSunny) && (
                  <div
                    className="animate-spring-up"
                    style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <div
                      className="animate-spring-up"
                    >
                      <img
                        src={isSunny ? '/pixel-sun.gif' : '/pixel-robot.gif'}
                        alt={isSunny ? 'Brainiac Sun' : 'Brainiac Robot'}
                        style={{
                          imageRendering: 'pixelated',
                          width: '4.5rem',
                          height: '4.5rem',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Greeting title — RetroGaming font with typewriter */}
                <div
                  className="animate-spring-up"
                  style={{ textAlign: 'center', flexShrink: 0 }}
                >
                  <h1
                    style={{
                      fontFamily: "'RetroGaming', var(--font-display)",
                      fontSize: '1.625rem',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.3,
                      fontWeight: 400,
                      margin: 0,
                      color: isDark ? 'rgba(232,228,222,0.95)' : 'rgba(28,27,31,0.9)',
                    }}
                  >
                    <GreetingTypewriter isDark={isDark} isSunny={isSunny} />
                  </h1>
                </div>
              </div>

            </div>

            {/* Search bar — locked when no model configured */}
            {(
              <div
                data-search-bar
                className="animate-spring-up"
                style={{
                  position: 'relative',
                  borderRadius: '1.625rem',
                  overflow: 'hidden',
                  width: '100%',
                  maxWidth: '42rem',
                  background: isDark
                    ? (isOled ? 'rgba(8,8,8,0.92)' : isCosmic ? '#1a1730' : isSunset ? 'rgba(18,10,20,0.88)' : 'rgba(30,28,25,0.72)')
                    : 'rgba(255,255,255,0.92)',
                  backdropFilter: isCosmic ? 'none' : 'blur(24px) saturate(1.3)',
                  WebkitBackdropFilter: isCosmic ? 'none' : 'blur(24px) saturate(1.3)',
                  border: isCosmic ? '1px solid rgba(139,159,212,0.08)' : isDark ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  boxShadow: searchFocused
                    ? (isDark
                      ? '0 8px 40px -8px rgba(0,0,0,0.25), 0 2px 14px -2px rgba(0,0,0,0.12)'
                      : '0 8px 40px -8px rgba(0,0,0,0.06), 0 2px 14px -2px rgba(0,0,0,0.03)')
                    : '0 0px 0px 0px rgba(0,0,0,0)',
                  transition: 'box-shadow 0.3s cubic-bezier(0.2, 0, 0, 1)',
                }}
              >
                {modelReady ? (
                  <MultimodalInput
                    onSubmit={sendQuery}
                    onStop={abort}
                    isProcessing={isProcessing}
                    hero
                    onExpandChange={setSearchExpanded}
                    inputStyle={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1rem',
                      fontWeight: 500,
                      letterSpacing: '-0.01em',
                    }}
                    onFocusChange={setSearchFocused}
                    placeholderOverlay={mounted ? <SearchBarPlaceholder isDark={isDark} /> : undefined}
                  />
                ) : (
                  <ModelLockOverlay isDark={isDark} inferenceMode={inferenceMode} />
                )}
              </div>
            )}

            {/* All Chats bubble + Active threads */}
            {mounted && (
              <AllChatsBubble isDark={isDark} isOled={isOled} isSunny={isSunny} isCosmic={isCosmic} onToggle={toggleAllChats} />
            )}
            {!showAllChats && mounted && <ActiveThreadsPills isDark={isDark} isCosmic={isCosmic} />}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
          Chat interface — messages + chats overlay
          Hidden when chatMinimized (mini-chat widget takes over)
          ═══════════════════════════════════════════════════════════════ */}
        {showFullChat && (
          <div
            key="chat"
            className="animate-spring-up"
            style={{
              position: 'relative',
              zIndex: 'var(--z-base)',
              display: 'flex',
              flex: 1,
              minHeight: 0,
              background: isCosmic ? 'transparent' : isDark ? 'var(--background)' : 'var(--m3-surface)',
              transform: 'translateZ(0)',
            }}
          >
            {/* Chats overlay — domino bubbles */}
            {showChatsOverlay && (
              <ChatsOverlay isDark={isDark} isOled={isOled} isCosmic={isCosmic} isSunny={isSunny} onClose={() => setShowChatsOverlay(false)} />
            )}

            {/* Main chat column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
              {/* Header — M3 top app bar, frosted glass */}
              <div
                className="animate-fade-in"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  zIndex: 'var(--z-dropdown)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  pointerEvents: 'none',
                  background: isDark
                    ? 'linear-gradient(180deg, var(--background) 0%, transparent 100%)'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, transparent 100%)',
                }}
              >
                {/* Back button — M3 tonal icon button */}
                <button
                  onClick={() => {
                    if (Date.now() - lastBackClickRef.current < 300) return;
                    lastBackClickRef.current = Date.now();
                    navigate('/');
                  }}
                  style={{
                    pointerEvents: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    height: '2.25rem',
                    padding: '0 0.875rem',
                    borderRadius: 'var(--shape-full)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'var(--type-label-md)',
                    fontWeight: 500,
                    fontFamily: 'var(--font-sans)',
                    letterSpacing: '0.01em',
                    color: isDark ? 'rgba(232,228,222,0.75)' : 'rgba(0,0,0,0.5)',
                    background: isDark ? 'var(--m3-surface-container)' : 'var(--m3-surface-container)',
                    backdropFilter: 'blur(16px) saturate(1.5)',
                    WebkitBackdropFilter: 'blur(16px) saturate(1.5)',
                    boxShadow: isDark
                      ? '0 1px 3px rgba(0,0,0,0.2), 0 4px 12px -2px rgba(0,0,0,0.15)'
                      : '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px -2px rgba(0,0,0,0.03)',
                    transition: 'color 0.2s, background 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.95)' : 'rgba(0,0,0,0.8)';
                    e.currentTarget.style.background = isDark ? 'var(--m3-surface-container-high)' : 'var(--m3-surface-container-high)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.75)' : 'rgba(0,0,0,0.5)';
                    e.currentTarget.style.background = isDark ? 'var(--m3-surface-container)' : 'var(--m3-surface-container)';
                  }}
                >
                  <ArrowLeftIcon style={{ height: '0.875rem', width: '0.875rem' }} />
                  Back
                </button>

                {/* Chats overlay toggle */}
                <button
                  onClick={() => {
                    if (Date.now() - lastChatsClickRef.current < 300) return;
                    lastChatsClickRef.current = Date.now();
                    setShowChatsOverlay((v) => !v);
                  }}
                  style={{
                    pointerEvents: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    height: '2.25rem',
                    padding: '0 0.875rem',
                    borderRadius: 'var(--shape-full)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'var(--type-label-md)',
                    fontWeight: 500,
                    fontFamily: 'var(--font-sans)',
                    letterSpacing: '0.01em',
                    color: showChatsOverlay
                      ? 'var(--m3-primary)'
                      : (isDark ? 'rgba(232,228,222,0.75)' : 'rgba(0,0,0,0.5)'),
                    background: showChatsOverlay
                      ? (isDark ? 'rgba(var(--pfc-accent-rgb), 0.12)' : 'rgba(var(--pfc-accent-rgb), 0.08)')
                      : (isDark ? 'var(--m3-surface-container)' : 'var(--m3-surface-container)'),
                    backdropFilter: 'blur(16px) saturate(1.5)',
                    WebkitBackdropFilter: 'blur(16px) saturate(1.5)',
                    boxShadow: isDark
                      ? '0 1px 3px rgba(0,0,0,0.2), 0 4px 12px -2px rgba(0,0,0,0.15)'
                      : '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px -2px rgba(0,0,0,0.03)',
                    transition: 'color 0.2s, background 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!showChatsOverlay) {
                      e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.95)' : 'rgba(0,0,0,0.8)';
                      e.currentTarget.style.background = isDark ? 'var(--m3-surface-container-high)' : 'var(--m3-surface-container-high)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!showChatsOverlay) {
                      e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.75)' : 'rgba(0,0,0,0.5)';
                      e.currentTarget.style.background = isDark ? 'var(--m3-surface-container)' : 'var(--m3-surface-container)';
                    }
                  }}
                >
                  <MessageSquareIcon style={{ height: '0.875rem', width: '0.875rem' }} />
                  Chats
                </button>

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Export thread button — right-aligned */}
                {messages.length > 0 && (
                  <button
                    onClick={() => {
                      const lines = messages.map((m: { role: string; text?: string; content?: string }) => {
                        const role = m.role === 'user' ? 'You' : 'Assistant';
                        const text = m.text || m.content || '';
                        return `## ${role}\n\n${text}`;
                      });
                      const md = `# Chat Export — ${new Date().toLocaleDateString()}\n\n${lines.join('\n\n---\n\n')}`;
                      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{
                      pointerEvents: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      height: '2.25rem',
                      padding: '0 0.875rem',
                      borderRadius: 'var(--shape-full)',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 'var(--type-label-md)',
                      fontWeight: 500,
                      fontFamily: 'var(--font-sans)',
                      letterSpacing: '0.01em',
                      color: isDark ? 'rgba(232,228,222,0.75)' : 'rgba(0,0,0,0.5)',
                      background: isDark ? 'var(--m3-surface-container)' : 'var(--m3-surface-container)',
                      backdropFilter: 'blur(16px) saturate(1.5)',
                      WebkitBackdropFilter: 'blur(16px) saturate(1.5)',
                      boxShadow: isDark
                        ? '0 1px 3px rgba(0,0,0,0.2), 0 4px 12px -2px rgba(0,0,0,0.15)'
                        : '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px -2px rgba(0,0,0,0.03)',
                      transition: 'color 0.2s, background 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.95)' : 'rgba(0,0,0,0.8)';
                      e.currentTarget.style.background = isDark ? 'var(--m3-surface-container-high)' : 'var(--m3-surface-container-high)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.75)' : 'rgba(0,0,0,0.5)';
                      e.currentTarget.style.background = isDark ? 'var(--m3-surface-container)' : 'var(--m3-surface-container)';
                    }}
                  >
                    <DownloadIcon style={{ height: '0.875rem', width: '0.875rem' }} />
                    Export
                  </button>
                )}
              </div>

              <Messages />

              {/* SOAR teaching stone card */}
              <SoarStoneCard isDark={isDark} chatId={currentChatId} />

              {/* Bottom controls area */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>

                {/* Mode hint — M3 tonal surface */}
                {showModeHint && (
                  <div
                    className="animate-spring-up"
                    style={{ margin: '0 auto', maxWidth: '48rem', width: '100%', padding: '0.25rem 1rem', overflow: 'hidden', transform: 'translateZ(0)' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.375rem 0.75rem',
                        borderRadius: 'var(--shape-full)',
                        background: isDark ? 'var(--m3-surface-container)' : 'var(--m3-surface-container)',
                        border: 'none',
                        fontSize: 'var(--type-label-sm)',
                        color: isDark ? 'rgba(155,150,137,0.9)' : 'rgba(0,0,0,0.4)',
                      }}
                    >
                      {inferenceMode === 'api'
                        ? <CloudIcon style={{ height: '0.6875rem', width: '0.6875rem', flexShrink: 0, color: 'var(--m3-primary)' }} />
                        : <MonitorIcon style={{ height: '0.6875rem', width: '0.6875rem', flexShrink: 0, color: 'var(--m3-primary)' }} />
                      }
                      <span style={{ flex: 1 }}>
                        {features.modeHint} — Switch to local inference for full thinking controls.
                      </span>
                      <button
                        onClick={() => setModeHintDismissed(true)}
                        style={{
                          border: 'none',
                          background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.08)' : 'rgba(var(--pfc-accent-rgb), 0.06)',
                          cursor: 'pointer',
                          fontSize: 'var(--type-label-sm)',
                          color: 'var(--m3-primary)',
                          fontWeight: 600,
                          padding: '0.125rem 0.5rem',
                          borderRadius: 'var(--shape-full)',
                        }}
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                )}

                {/* Thinking Controls */}
                {(isProcessing || isStreaming) && (
                  <div style={{ margin: '0 auto', maxWidth: '48rem', width: '100%', padding: '0.375rem 1rem' }}>
                    <ThinkingControls
                      isDark={isDark}
                      onStop={abort}
                      onPause={pause}
                      onResume={resume}
                      onReroute={(instruction) => {
                        // Queue the reroute as a follow-up query after current stream
                        abort();
                        // Small delay to let abort propagate, then send reroute
                        setTimeout(() => sendQuery(instruction), 300);
                      }}
                    />
                  </div>
                )}

                <Suspense fallback={null}><LiveControls /></Suspense>
                <Suspense fallback={null}><ConceptHierarchyPanel /></Suspense>

                {/* Research Mode Bar + Input — M3 surface container */}
                <div style={{
                  margin: '0 auto',
                  maxWidth: '48rem',
                  width: '100%',
                  padding: '0.25rem 1rem 0.625rem',
                }}>
                  <div style={{ position: 'relative', marginBottom: '0.25rem' }}>
                    <ResearchModeBar isDark={isDark} />
                  </div>
                  <MultimodalInput
                    onSubmit={sendQuery}
                    onStop={abort}
                    isProcessing={isProcessing}
                    showControlsToggle
                  />
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Portal sidebar — code suggestions and artifacts */}
        {mounted && <Suspense fallback={null}><PortalSidebar /></Suspense>}
      </div>
    </ErrorBoundary>
  );
}

