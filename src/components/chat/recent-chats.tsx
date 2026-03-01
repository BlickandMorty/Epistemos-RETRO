'use client';

import { useState, useEffect, memo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { MessageSquareIcon, ClockIcon, ArrowRightIcon } from 'lucide-react';

import { spring } from '@/lib/motion/motion-config';

const ENTER_SPRING = spring.standard;

export interface ChatEntry {
  id: string;
  title: string;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
}

export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const ts = date.getTime();
  const diffMs = now - ts;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function parseTimestamp(value: string | number | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  return new Date(value);
}

interface RecentChatsProps {
  isDark: boolean;
  isOled?: boolean;
  onShowAll?: (allChats: ChatEntry[]) => void;
}

function RecentChatsBase({ isDark, isOled, onShowAll }: RecentChatsProps) {
  const router = useRouter();
  const [allChats, setAllChats] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchChats() {
      try {
        const res = await fetch('/api/history?userId=local-user');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (!cancelled && data.chats) {
          setAllChats(data.chats);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchChats();
    return () => { cancelled = true; };
  }, []);

  if (loading || allChats.length === 0) return null;

  const displayChats = allChats.slice(0, 4);
  const hasMore = allChats.length > 4;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ENTER_SPRING, delay: 0.28 }}
      style={{
        width: '100%',
        maxWidth: '36rem',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
      }}
    >
      {/* Header with optional "All Chats" button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0 0.125rem',
        }}
      >
        <ClockIcon
          style={{
            height: '0.8125rem',
            width: '0.8125rem',
            color: isDark ? 'rgba(155,150,137,0.5)' : 'rgba(0,0,0,0.3)',
          }}
        />
        <span
          style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: isDark ? 'rgba(155,150,137,0.5)' : 'rgba(0,0,0,0.3)',
            fontFamily: 'var(--font-sans)',
            flex: 1,
          }}
        >
          Recent Sessions
        </span>

        {/* "All Chats" pill button — only when overflow */}
        {hasMore && onShowAll && (
          <motion.button
            onClick={() => onShowAll(allChats)}
            whileTap={{ scale: 0.97 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.625rem',
              borderRadius: '9999px',
              border: `1px solid ${isDark ? 'var(--border)' : 'rgba(0,0,0,0.06)'}`,
              background: isDark ? 'var(--pfc-surface-dark)' : 'rgba(255,255,255,0.92)',
              cursor: 'pointer',
              fontSize: '0.625rem',
              fontWeight: 600,
              color: isDark ? 'rgba(155,150,137,0.7)' : 'rgba(0,0,0,0.4)',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.02em',
              transition: 'color 0.15s, background 0.15s',
            }}
          >
            All Chats
            <ArrowRightIcon style={{ height: '0.5625rem', width: '0.5625rem' }} />
          </motion.button>
        )}
      </div>

      {/* Octa-style full-width card rows */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
        }}
      >
        {displayChats.map((chat, idx) => {
          const isHovered = hoveredId === chat.id;
          const updatedDate = parseTimestamp(chat.updatedAt);
          const timeStr = formatRelativeTime(updatedDate);

          return (
            <motion.button
              key={chat.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...ENTER_SPRING, delay: 0.3 + idx * 0.04 }}
              onClick={() => router.push(`/chat/${chat.id}`)}
              onMouseEnter={() => setHoveredId(chat.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--shape-lg)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                minHeight: '2.5rem',
                background: isDark
                  ? (isHovered ? 'var(--glass-hover)' : 'var(--pfc-surface-dark)')
                  : (isHovered ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)'),
                border: `1px solid ${isDark ? 'var(--border)' : 'rgba(0,0,0,0.05)'}`,
                transition: 'background 0.15s ease',
              }}
            >
              <MessageSquareIcon
                style={{
                  height: '0.8125rem',
                  width: '0.8125rem',
                  flexShrink: 0,
                  color: isHovered
                    ? 'var(--pfc-accent)'
                    : (isDark ? 'rgba(155,150,137,0.45)' : 'rgba(0,0,0,0.2)'),
                  transition: 'color 0.15s',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    lineHeight: 1.4,
                    color: isHovered
                      ? (isDark ? 'rgba(232,228,222,0.95)' : 'rgba(0,0,0,0.85)')
                      : (isDark ? 'rgba(155,150,137,0.75)' : 'rgba(0,0,0,0.5)'),
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-sans)',
                    transition: 'color 0.15s',
                  }}
                >
                  {chat.title}
                </div>
                <div
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    color: isDark ? 'rgba(155,150,137,0.35)' : 'rgba(0,0,0,0.2)',
                    fontFamily: 'var(--font-sans)',
                    marginTop: '0.1875rem',
                  }}
                >
                  {timeStr}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

export const RecentChats = memo(RecentChatsBase);
