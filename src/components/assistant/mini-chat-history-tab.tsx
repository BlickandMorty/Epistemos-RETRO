'use client';

/* ═══════════════════════════════════════════════════════════════════
   MiniChat — History Tab Content
   Browse ALL past chat sessions from DB, load into mini-chat thread
   or open in full chat page.
   Extracted from mini-chat.tsx (surgery — code as-is)
   ═══════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Search,
  ExternalLink,
} from 'lucide-react';

import { usePFCStore } from '@/lib/store/use-pfc-store';
import type { ChatEntry } from '@/components/chat/recent-chats';
import { parseTimestamp, formatRelativeTime } from '@/components/chat/recent-chats';

/* ─── Props ─── */

export interface HistoryTabContentProps {
  isDark: boolean;
  textPrimary: string;
  textSecondary: string;
  btnHover: string;
}

/* ═══════════════════════════════════════════════════════════════════
   History Tab — Browse ALL past chat sessions from DB
   ═══════════════════════════════════════════════════════════════════ */

export function HistoryTabContent({ isDark, textPrimary, textSecondary, btnHover }: HistoryTabContentProps) {
  const router = useRouter();
  const loadChatIntoThread = usePFCStore((s) => s.loadChatIntoThread);
  const setInnerTab = usePFCStore((s) => s.setMiniChatTab);
  const [allChats, setAllChats] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/history?userId=local-user')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data?.chats) setAllChats(data.chats);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return allChats;
    const q = searchQuery.toLowerCase();
    return allChats.filter((c) => c.title.toLowerCase().includes(q));
  }, [allChats, searchQuery]);

  const openInThread = useCallback(async (chatId: string, title: string) => {
    setLoadingId(chatId);
    try {
      const res = await fetch(`/api/history?chatId=${chatId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.messages) return;
      const messages = (data.messages as Array<{ role: string; text: string; timestamp: number }>).map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text || '',
        timestamp: m.timestamp || Date.now(),
      }));
      loadChatIntoThread(chatId, title, messages);
      setInnerTab('chat'); // Switch to chat tab to see loaded conversation
    } catch {
      // Silently fail
    } finally {
      setLoadingId(null);
    }
  }, [loadChatIntoThread, setInnerTab]);

  const openInMainChat = useCallback((chatId: string) => {
    router.push(`/chat/${chatId}`);
  }, [router]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Search bar */}
      <div style={{ padding: '0.5rem 0.625rem 0.375rem', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0.3rem 0.5rem', borderRadius: 8,
          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        }}>
          <Search style={{ width: 11, height: 11, color: textSecondary, flexShrink: 0 }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 11, color: textPrimary, fontFamily: 'var(--font-sans)',
            }}
          />
        </div>
      </div>

      {/* Chat list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.5rem 0.5rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', fontSize: 11, color: textSecondary }}>
            Loading...
          </div>
        ) : filteredChats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', fontSize: 11, color: textSecondary }}>
            {searchQuery ? 'No chats match your search' : 'No chat history yet'}
          </div>
        ) : (
          filteredChats.map((chat) => {
            const isHovered = hoveredId === chat.id;
            const isLoading = loadingId === chat.id;
            return (
              <div
                key={chat.id}
                onMouseEnter={() => setHoveredId(chat.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 6px', borderRadius: 8, marginBottom: 1,
                  background: isHovered ? btnHover : 'transparent',
                  transition: 'background 0.12s',
                }}
              >
                {/* Main click — load into mini-chat thread */}
                <button
                  onClick={() => openInThread(chat.id, chat.title)}
                  disabled={isLoading}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                    background: 'none', border: 'none', cursor: isLoading ? 'wait' : 'pointer',
                    textAlign: 'left', padding: 0, minWidth: 0,
                    opacity: isLoading ? 0.5 : 1,
                  }}
                >
                  <MessageSquare style={{
                    width: 10, height: 10, flexShrink: 0,
                    color: isHovered ? 'var(--pfc-accent)' : textSecondary,
                    opacity: isHovered ? 0.8 : 0.4,
                  }} />
                  <span style={{
                    fontSize: 11, color: isHovered ? 'var(--pfc-accent)' : textPrimary,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-sans)', flex: 1,
                  }}>
                    {chat.title}
                  </span>
                  <span style={{ fontSize: 9.5, color: textSecondary, flexShrink: 0 }}>
                    {formatRelativeTime(parseTimestamp(chat.updatedAt || chat.createdAt))}
                  </span>
                </button>

                {/* Open in main chat */}
                {isHovered && (
                  <button
                    onClick={() => openInMainChat(chat.id)}
                    title="Open in full chat"
                    style={{
                      display: 'flex', alignItems: 'center', padding: 3,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: textSecondary, borderRadius: 4, flexShrink: 0,
                    }}
                  >
                    <ExternalLink style={{ width: 10, height: 10 }} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
