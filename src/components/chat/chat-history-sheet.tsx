'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { type ChatEntry, formatRelativeTime, parseTimestamp } from './recent-chats';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftIcon, MessageSquareIcon, SearchIcon } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// ChatsSidePanel — M3 side panel on landing (like Notes sidebar)
// Slides in from the left. Flat Material You cards, no blur.
// Typewriter summary reveals on hover per chat card.
// ═══════════════════════════════════════════════════════════════════

import { physicsSpring } from '@/lib/motion/motion-config';

const PANEL_SPRING = physicsSpring.chatPanel;

/** Typewriter hook for summary text — types out on hover, resets on leave */
function useSummaryTypewriter(text: string, active: boolean) {
  const [display, setDisplay] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!active || !text) { setDisplay(''); return; }
    let idx = 0;
    setDisplay('');
    function tick() {
      idx++;
      setDisplay(text.slice(0, idx));
      if (idx < text.length) {
        timerRef.current = setTimeout(tick, 18 + Math.random() * 12);
      }
    }
    timerRef.current = setTimeout(tick, 120);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [text, active]);

  return display;
}

function ChatCardSummary({ text, active, isDark }: { text: string; active: boolean; isDark: boolean }) {
  const display = useSummaryTypewriter(text, active);
  if (!active && !display) return null;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      style={{
        fontSize: '0.6875rem',
        fontWeight: 400,
        lineHeight: 1.45,
        color: isDark ? 'rgba(155,150,137,0.55)' : 'rgba(73,69,79,0.6)',
        fontFamily: 'var(--font-sans)',
        marginTop: '0.25rem',
        overflow: 'hidden',
      }}
    >
      {display}
      {display.length < text.length && (
        <span style={{
          display: 'inline-block',
          width: '1px',
          height: '0.625rem',
          backgroundColor: 'var(--pfc-accent)',
          marginLeft: '1px',
          verticalAlign: 'text-bottom',
          opacity: 0.7,
        }} />
      )}
    </motion.div>
  );
}

export function ChatsSidePanel({ isDark, isOled, isCosmic, isSunny, isSunset, onClose }: {
  isDark: boolean; isOled?: boolean; isCosmic?: boolean; isSunny?: boolean; isSunset?: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchChats() {
      try {
        const res = await fetch('/api/history?userId=local-user');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.chats) setChats(data.chats);
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    fetchChats();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return chats;
    const q = search.toLowerCase();
    return chats.filter((c) => c.title.toLowerCase().includes(q));
  }, [chats, search]);

  // M3 surface colors — flat, no blur
  const panelBg = isOled ? '#0c0c0c'
    : isCosmic ? '#161330'
    : isSunset ? '#1e1418'
    : isDark ? 'var(--m3-surface-container-low, #1c1b1f)'
    : isSunny ? 'var(--card)'
    : '#f7f2fa';

  const cardBg = isOled ? '#161616'
    : isCosmic ? '#1e1b35'
    : isSunset ? '#261a1e'
    : isDark ? 'var(--m3-surface-container, #211f26)'
    : isSunny ? 'var(--secondary)'
    : '#ece6f0';

  const cardHoverBg = isOled ? '#202020'
    : isCosmic ? '#26223e'
    : isSunset ? '#2e2025'
    : isDark ? 'var(--m3-surface-container-high, #2b2930)'
    : isSunny ? 'color-mix(in srgb, var(--secondary) 80%, white)'
    : '#e0dae4';

  const textPrimary = isDark ? 'rgba(232,228,222,0.92)' : 'rgba(28,27,31,0.87)';
  const textSecondary = isDark ? 'rgba(155,150,137,0.65)' : 'rgba(73,69,79,0.7)';
  const textTertiary = isDark ? 'rgba(155,150,137,0.4)' : 'rgba(73,69,79,0.45)';
  const searchBg = isOled ? '#1a1a1a'
    : isCosmic ? '#1e1b35'
    : isSunset ? '#261a1e'
    : isDark ? 'rgba(255,255,255,0.04)'
    : isSunny ? 'var(--secondary)'
    : '#ece6f0';

  return (
    <>
      {/* Scrim — flat, no blur */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          background: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.04)',
        }}
      />

      {/* Floating side panel — M3 rounded box */}
      <motion.div
        initial={{ x: '-110%', opacity: 0.5 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '-110%', opacity: 0 }}
        transition={PANEL_SPRING}
        style={{
          position: 'absolute',
          top: '1rem',
          left: '0.75rem',
          bottom: '1rem',
          zIndex: 11,
          width: '16.5rem',
          maxWidth: 'calc(80vw - 1.5rem)',
          display: 'flex',
          flexDirection: 'column',
          background: panelBg,
          borderRadius: '1.5rem',
          border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
          boxShadow: isDark
            ? '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)'
            : '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '0.75rem 0.75rem 0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '1.75rem',
              height: '1.75rem',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: textSecondary,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = cardBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ArrowLeftIcon style={{ height: '1.125rem', width: '1.125rem' }} />
          </motion.button>
          <span style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: textPrimary,
            fontFamily: 'var(--font-sans)',
          }}>
            All Chats
          </span>
          <span style={{
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-mono)',
            color: textTertiary,
            fontWeight: 500,
          }}>
            {chats.length}
          </span>
        </div>

        {/* Search */}
        <div style={{ padding: '0 0.625rem 0.375rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem 0.625rem',
            borderRadius: '1.25rem',
            background: searchBg,
            transition: 'background 0.15s',
          }}>
            <SearchIcon style={{
              height: '0.75rem', width: '0.75rem',
              color: textTertiary, flexShrink: 0,
            }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats..."
              aria-label="Search chats"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-sans)',
                color: textPrimary,
              }}
            />
          </div>
        </div>

        {/* Chat list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0.25rem 0.5rem 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          scrollbarWidth: 'thin',
          scrollbarColor: isDark ? 'rgba(155,150,137,0.2) transparent' : 'rgba(0,0,0,0.1) transparent',
        }}>
          {!loaded && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
              <div style={{
                width: '1.5rem', height: '1.5rem', borderRadius: '50%',
                border: '2px solid currentColor', borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto', color: textTertiary,
              }} />
            </div>
          )}
          {loaded && filtered.map((chat, idx) => {
            const isHovered = hoveredId === chat.id;
            const timeStr = formatRelativeTime(parseTimestamp(chat.updatedAt));
            // Build a summary preview from first assistant message
            const summary = (chat as ChatEntry & { preview?: string }).preview
              ?? chat.title;

            return (
              <motion.button
                key={chat.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  ease: [0.2, 0, 0, 1],
                  delay: Math.min(idx * 0.025, 0.25),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                  router.push(`/chat/${chat.id}`);
                }}
                onMouseEnter={() => setHoveredId(chat.id)}
                onMouseLeave={() => setHoveredId(null)}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '0.5rem 0.625rem',
                  borderRadius: '0.75rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  border: 'none',
                  background: isHovered ? cardHoverBg : cardBg,
                  transition: 'background 0.15s ease',
                }}
              >
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '50%',
                    background: isHovered
                      ? `rgba(var(--pfc-accent-rgb), ${isDark ? '0.12' : '0.08'})`
                      : 'transparent',
                    flexShrink: 0,
                    transition: 'background 0.15s',
                  }}>
                    <MessageSquareIcon style={{
                      height: '0.6875rem',
                      width: '0.6875rem',
                      color: isHovered ? 'var(--pfc-accent)' : textTertiary,
                      transition: 'color 0.15s',
                    }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      lineHeight: 1.35,
                      color: isHovered ? textPrimary : textSecondary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'var(--font-sans)',
                      transition: 'color 0.15s',
                    }}>
                      {chat.title}
                    </div>
                    <div style={{
                      fontSize: '0.5625rem',
                      fontWeight: 400,
                      color: textTertiary,
                      fontFamily: 'var(--font-sans)',
                      marginTop: '0.0625rem',
                    }}>
                      {timeStr}
                    </div>
                  </div>
                </div>
                {/* Typewriter summary — reveals on hover */}
                <AnimatePresence>
                  {isHovered && summary && (
                    <ChatCardSummary
                      text={summary.length > 120 ? summary.slice(0, 120) + '...' : summary}
                      active={isHovered}
                      isDark={isDark}
                    />
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
          {loaded && filtered.length === 0 && (
            <div style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              fontSize: '0.8125rem',
              color: textTertiary,
            }}>
              {search ? 'No chats found' : 'No conversations yet'}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ChatsOverlay — M3 standard side sheet (slides from left)
// Material You: flat surface, no blur, clean elevation, fluid spring
// ═══════════════════════════════════════════════════════════════════

const SHEET_SPRING = physicsSpring.chatSheet;

export function ChatsOverlay({ isDark, isOled, isCosmic, isSunny, onClose }: {
  isDark: boolean; isOled?: boolean; isCosmic?: boolean; isSunny?: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchChats() {
      try {
        setFetchError(false);
        const res = await fetch('/api/history?userId=local-user');
        if (!res.ok) { if (!cancelled) setFetchError(true); return; }
        const data = await res.json();
        if (!cancelled && data.chats) setChats(data.chats);
      } catch { if (!cancelled) setFetchError(true); }
    }
    fetchChats();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return chats;
    const q = search.toLowerCase();
    return chats.filter((c) => c.title.toLowerCase().includes(q));
  }, [chats, search]);

  // Surface colors — M3 surface-container-low
  const sheetBg = isOled ? '#0a0a0a'
    : isCosmic ? '#1a1730'
    : isDark ? 'var(--m3-surface-container-low, #1c1b1f)'
    : isSunny ? 'var(--card)'
    : '#f7f2fa';

  const itemBg = isOled ? '#141414'
    : isCosmic ? '#221f38'
    : isDark ? 'var(--m3-surface-container, #211f26)'
    : isSunny ? 'var(--secondary)'
    : '#ece6f0';

  const itemHoverBg = isOled ? '#1e1e1e'
    : isCosmic ? '#2a2640'
    : isDark ? 'var(--m3-surface-container-high, #2b2930)'
    : isSunny ? 'color-mix(in srgb, var(--secondary) 80%, white)'
    : '#e0dae4';

  const textPrimary = isDark ? 'rgba(232,228,222,0.92)' : 'rgba(28,27,31,0.87)';
  const textSecondary = isDark ? 'rgba(155,150,137,0.65)' : 'rgba(73,69,79,0.7)';
  const textTertiary = isDark ? 'rgba(155,150,137,0.4)' : 'rgba(73,69,79,0.45)';

  return (
    <>
      {/* M3 Scrim — flat, no blur */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 'var(--z-modal-backdrop)',
          background: isDark ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.04)',
        }}
      />

      {/* M3 Floating sheet — slides from left, rounded */}
      <motion.div
        initial={{ x: '-110%', opacity: 0.5 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '-110%', opacity: 0 }}
        transition={SHEET_SPRING}
        style={{
          position: 'absolute',
          top: '1rem',
          left: '0.75rem',
          bottom: '1rem',
          zIndex: 'var(--z-modal)',
          width: '16.5rem',
          maxWidth: 'calc(80vw - 1.5rem)',
          display: 'flex',
          flexDirection: 'column',
          background: sheetBg,
          borderRadius: '1.5rem',
          border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
          boxShadow: isDark
            ? '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)'
            : '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '0.75rem 0.75rem 0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '1.75rem',
              height: '1.75rem',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: textSecondary,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = itemBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ArrowLeftIcon style={{ height: '1.125rem', width: '1.125rem' }} />
          </motion.button>
          <span style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: textPrimary,
            fontFamily: 'var(--font-sans)',
          }}>
            All Chats
          </span>
          <span style={{
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-mono)',
            color: textTertiary,
            fontWeight: 500,
          }}>
            {chats.length}
          </span>
        </div>

        {/* Search */}
        <div style={{ padding: '0 0.625rem 0.375rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem 0.625rem',
            borderRadius: '1.25rem',
            background: itemBg,
            transition: 'background 0.15s',
          }}>
            <SearchIcon style={{
              height: '0.75rem', width: '0.75rem',
              color: textTertiary, flexShrink: 0,
            }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats..."
              aria-label="Search chats"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-sans)',
                color: textPrimary,
              }}
            />
          </div>
        </div>

        {/* Chat list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0.25rem 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.125rem',
          scrollbarWidth: 'thin',
          scrollbarColor: isDark ? 'rgba(155,150,137,0.2) transparent' : 'rgba(0,0,0,0.1) transparent',
        }}>
          {filtered.map((chat, idx) => {
            const isHovered = hoveredId === chat.id;
            const timeStr = formatRelativeTime(parseTimestamp(chat.updatedAt));

            return (
              <motion.button
                key={chat.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  ease: [0.2, 0, 0, 1],
                  delay: Math.min(idx * 0.02, 0.2),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                  router.push(`/chat/${chat.id}`);
                }}
                onMouseEnter={() => setHoveredId(chat.id)}
                onMouseLeave={() => setHoveredId(null)}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.625rem',
                  borderRadius: '0.75rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  border: 'none',
                  background: isHovered ? itemHoverBg : 'transparent',
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1.5rem',
                  height: '1.5rem',
                  borderRadius: '50%',
                  background: isHovered
                    ? `rgba(var(--pfc-accent-rgb), ${isDark ? '0.12' : '0.08'})`
                    : itemBg,
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}>
                  <MessageSquareIcon style={{
                    height: '0.6875rem',
                    width: '0.6875rem',
                    color: isHovered ? 'var(--pfc-accent)' : textTertiary,
                    transition: 'color 0.15s',
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    lineHeight: 1.35,
                    color: isHovered ? textPrimary : textSecondary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-sans)',
                    transition: 'color 0.15s',
                  }}>
                    {chat.title}
                  </div>
                  <div style={{
                    fontSize: '0.5625rem',
                    fontWeight: 400,
                    color: textTertiary,
                    fontFamily: 'var(--font-sans)',
                    marginTop: '0.0625rem',
                  }}>
                    {timeStr}
                  </div>
                </div>
              </motion.button>
            );
          })}
          {filtered.length === 0 && !fetchError && (
            <div style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              fontSize: '0.8125rem',
              color: textTertiary,
            }}>
              {search ? 'No chats found' : 'No conversations yet'}
            </div>
          )}
          {fetchError && (
            <div style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              fontSize: '0.8125rem',
              color: textTertiary,
            }}>
              Failed to load chats
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
