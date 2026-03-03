// ═══════════════════════════════════════════════════════════════════
// Command Palette — System-wide quick actions, search, and navigation
// Port of macOS CommandPaletteOverlay.swift (1,709 lines)
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';
import type { Page, Chat, HybridSearchResult } from '@/lib/bindings';
import { API_PROVIDERS } from '@/lib/types';
import { emit } from '@tauri-apps/api/event';
import {
  SearchIcon,
  FileTextIcon,
  MessageSquareIcon,
  SettingsIcon,
  PlusIcon,
  CommandIcon,
  ClockIcon,
  ZapIcon,
  ArrowRightIcon,
  XIcon,
  ChevronRightIcon,
  HashIcon,
  LayoutGridIcon,
  BookmarkIcon,
  SparklesIcon,
  type LucideIcon,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

type CommandCategory = 'recent' | 'notes' | 'chats' | 'actions' | 'navigation' | 'providers';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: CommandCategory;
  icon: LucideIcon;
  shortcut?: string;
  action: () => void | Promise<void>;
  score?: number;
}

interface RecentItem {
  id: string;
  type: 'note' | 'chat' | 'page';
  title: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════
// Local Storage Keys
// ═══════════════════════════════════════════════════════════════════

const RECENT_ITEMS_KEY = 'pfc-command-palette-recent';
const MAX_RECENT_ITEMS = 10;

// ═══════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════

function loadRecentItems(): RecentItem[] {
  try {
    const stored = localStorage.getItem(RECENT_ITEMS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveRecentItems(items: RecentItem[]) {
  try {
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(items.slice(0, MAX_RECENT_ITEMS)));
  } catch {
    // Ignore storage errors
  }
}

function addRecentItem(item: Omit<RecentItem, 'timestamp'>) {
  const existing = loadRecentItems();
  const filtered = existing.filter((i) => !(i.id === item.id && i.type === item.type));
  const newItem: RecentItem = { ...item, timestamp: Date.now() };
  saveRecentItems([newItem, ...filtered]);
}

// Simple fuzzy match - returns score (higher = better match)
function fuzzyMatch(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  
  if (t === q) return 1000; // Exact match
  if (t.startsWith(q)) return 500; // Starts with
  if (t.includes(q)) return 100; // Contains
  
  // Fuzzy match: check if all chars in query appear in order
  let qIdx = 0;
  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) qIdx++;
  }
  if (qIdx === q.length) return 50; // Fuzzy match
  
  return 0;
}

// ═══════════════════════════════════════════════════════════════════
// Command Palette Component
// ═══════════════════════════════════════════════════════════════════

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { isDark, isOled, isCosmic, mounted } = useIsDark();
  
  // Store selectors
  const apiProvider = usePFCStore((s) => s.apiProvider);
  const inferenceMode = usePFCStore((s) => s.inferenceMode);
  const setApiProvider = usePFCStore((s) => s.setApiProvider);
  const createPage = usePFCStore((s) => s.createPage);
  const setActivePage = usePFCStore((s) => s.setActivePage);
  const addToast = usePFCStore((s) => s.addToast);
  
  // Local state
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [searchResults, setSearchResults] = useState<HybridSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Load data on open
  useEffect(() => {
    if (isOpen) {
      setRecentItems(loadRecentItems());
      setQuery('');
      setSelectedIndex(0);
      setSearchResults([]);
      
      // Load pages and chats
      commands.listPages().then((result) => {
        if (result.status === 'ok') {
          setPages(result.data);
        }
      });
      commands.listChats().then((result) => {
        if (result.status === 'ok') {
          setChats(result.data);
        }
      });
      
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);
  
  // Search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const result = await commands.searchHybrid(query, 10);
      if (result.status === 'ok') {
        setSearchResults(result.data);
      }
      setIsSearching(false);
    }, 150);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query]);
  
  // Keyboard shortcut to open (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // We need to call open function from parent
          emit('command-palette:open');
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  // Build command items based on query and data
  const commandItems = useMemo((): CommandItem[] => {
    const items: CommandItem[] = [];
    const q = query.toLowerCase().trim();
    
    // ── Recent Items (only when no query) ──
    if (!q && recentItems.length > 0) {
      recentItems.slice(0, 5).forEach((item) => {
        if (item.type === 'note') {
          items.push({
            id: `recent-${item.id}`,
            title: item.title,
            subtitle: 'Recent note',
            category: 'recent',
            icon: ClockIcon,
            action: () => {
              addRecentItem({ id: item.id, type: 'note', title: item.title });
              setActivePage(item.id);
              navigate('/notes');
              onClose();
            },
          });
        } else if (item.type === 'chat') {
          items.push({
            id: `recent-${item.id}`,
            title: item.title,
            subtitle: 'Recent chat',
            category: 'recent',
            icon: MessageSquareIcon,
            action: () => {
              addRecentItem({ id: item.id, type: 'chat', title: item.title });
              navigate(`/chat/${item.id}`);
              onClose();
            },
          });
        }
      });
    }
    
    // ── Search Results (from hybrid search) ──
    if (q && searchResults.length > 0) {
      searchResults.forEach((result) => {
        items.push({
          id: `search-${result.page_id}`,
          title: result.title,
          subtitle: result.snippet || 'Search result',
          category: 'notes',
          icon: FileTextIcon,
          score: result.score,
          action: () => {
            addRecentItem({ id: result.page_id, type: 'note', title: result.title });
            setActivePage(result.page_id);
            navigate('/notes');
            onClose();
          },
        });
      });
    }
    
    // ── Notes (fuzzy match on title) ──
    const matchedNotes = pages
      .map((page) => ({
        page,
        score: q ? fuzzyMatch(q, page.title) : (page.is_pinned ? 100 : 0),
      }))
      .filter((m) => (!q && m.page.is_pinned) || m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, q ? 5 : 3);
    
    matchedNotes.forEach(({ page }) => {
      items.push({
        id: `note-${page.id}`,
        title: page.title,
        subtitle: page.is_pinned ? 'Pinned note' : 'Note',
        category: 'notes',
        icon: page.is_pinned ? BookmarkIcon : FileTextIcon,
        action: () => {
          addRecentItem({ id: page.id, type: 'note', title: page.title });
          setActivePage(page.id);
          navigate('/notes');
          onClose();
        },
      });
    });
    
    // ── Chats ──
    const matchedChats = chats
      .map((chat) => ({
        chat,
        score: q ? fuzzyMatch(q, chat.title) : 0,
      }))
      .filter((m) => m.score > 0 || (!q && chats.indexOf(m.chat) < 3))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    matchedChats.forEach(({ chat }) => {
      items.push({
        id: `chat-${chat.id}`,
        title: chat.title,
        subtitle: 'Chat conversation',
        category: 'chats',
        icon: MessageSquareIcon,
        action: () => {
          addRecentItem({ id: chat.id, type: 'chat', title: chat.title });
          navigate(`/chat/${chat.id}`);
          onClose();
        },
      });
    });
    
    // ── Quick Actions ──
    const actions: CommandItem[] = [
      {
        id: 'action-new-note',
        title: 'Create New Note',
        subtitle: 'Start a new note page',
        category: 'actions',
        icon: PlusIcon,
        shortcut: 'N',
        action: () => {
          const title = q || 'Untitled Note';
          const pageId = createPage(title);
          addRecentItem({ id: pageId, type: 'note', title });
          navigate('/notes');
          addToast({ type: 'success', message: `Created note: ${title}` });
          onClose();
        },
      },
      {
        id: 'action-new-chat',
        title: 'Start New Chat',
        subtitle: 'Begin a new conversation',
        category: 'actions',
        icon: SparklesIcon,
        shortcut: 'C',
        action: async () => {
          const title = q || 'New Chat';
          const result = await commands.createChat(title);
          if (result.status === 'ok') {
            addRecentItem({ id: result.data.id, type: 'chat', title: result.data.title });
            navigate(`/chat/${result.data.id}`);
            addToast({ type: 'success', message: 'Chat created' });
          }
          onClose();
        },
      },
      {
        id: 'action-quick-chat',
        title: 'Quick Thread',
        subtitle: 'Open mini-chat thread',
        category: 'actions',
        icon: ZapIcon,
        action: () => {
          // Quick thread creation via store
          usePFCStore.getState().createThread('assistant', q || 'Quick Chat');
          addToast({ type: 'success', message: 'Thread created' });
          onClose();
        },
      },
    ];
    
    // Filter actions by query
    const filteredActions = q 
      ? actions.filter(a => fuzzyMatch(q, a.title) > 0 || fuzzyMatch(q, a.subtitle || '') > 0)
      : actions;
    
    items.push(...filteredActions);
    
    // ── Navigation ──
    const navItems: CommandItem[] = [
      {
        id: 'nav-home',
        title: 'Go to Home',
        subtitle: 'Landing page',
        category: 'navigation',
        icon: LayoutGridIcon,
        shortcut: 'G H',
        action: () => {
          navigate('/');
          onClose();
        },
      },
      {
        id: 'nav-notes',
        title: 'Go to Notes',
        subtitle: 'Note library',
        category: 'navigation',
        icon: FileTextIcon,
        shortcut: 'G N',
        action: () => {
          navigate('/notes');
          onClose();
        },
      },
      {
        id: 'nav-graph',
        title: 'Go to Graph',
        subtitle: 'Knowledge graph view',
        category: 'navigation',
        icon: HashIcon,
        shortcut: 'G G',
        action: () => {
          navigate('/graph');
          onClose();
        },
      },
      {
        id: 'nav-library',
        title: 'Go to Library',
        subtitle: 'Research library',
        category: 'navigation',
        icon: BookmarkIcon,
        shortcut: 'G L',
        action: () => {
          navigate('/library');
          onClose();
        },
      },
      {
        id: 'nav-settings',
        title: 'Go to Settings',
        subtitle: 'App configuration',
        category: 'navigation',
        icon: SettingsIcon,
        shortcut: 'G S',
        action: () => {
          navigate('/settings');
          onClose();
        },
      },
    ];
    
    const filteredNav = q
      ? navItems.filter(n => fuzzyMatch(q, n.title) > 0)
      : navItems;
    
    items.push(...filteredNav);
    
    // ── Provider Switching (only when query mentions provider) ──
    if (!q || q.includes('provider') || q.includes('model') || q.includes('ai')) {
      API_PROVIDERS.forEach((provider) => {
        const isActive = apiProvider === provider.id && inferenceMode === 'api';
        items.push({
          id: `provider-${provider.id}`,
          title: `Switch to ${provider.label}`,
          subtitle: isActive ? 'Currently active' : 'Change AI provider',
          category: 'providers',
          icon: SparklesIcon,
          action: () => {
            setApiProvider(provider.id);
            addToast({ type: 'success', message: `Switched to ${provider.label}` });
            onClose();
          },
        });
      });
    }
    
    return items;
  }, [query, recentItems, searchResults, pages, chats, apiProvider, inferenceMode, navigate, onClose, createPage, setActivePage, setApiProvider, addToast]);
  
  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);
  
  // Scroll selected item into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const selectedEl = container.querySelector('[data-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);
  
  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % commandItems.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + commandItems.length) % commandItems.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (commandItems[selectedIndex]) {
          commandItems[selectedIndex].action();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [commandItems, selectedIndex, onClose]);
  
  // Group items by category
  const groupedItems = useMemo(() => {
    const groups: { category: CommandCategory; label: string; items: CommandItem[] }[] = [];
    
    const categoryLabels: Record<CommandCategory, string> = {
      recent: 'Recent',
      notes: 'Notes',
      chats: 'Chats',
      actions: 'Actions',
      navigation: 'Navigation',
      providers: 'AI Providers',
    };
    
    const categoryOrder: CommandCategory[] = ['recent', 'notes', 'chats', 'actions', 'navigation', 'providers'];
    
    for (const cat of categoryOrder) {
      const items = commandItems.filter((item) => item.category === cat);
      if (items.length > 0) {
        groups.push({ category: cat, label: categoryLabels[cat], items });
      }
    }
    
    return groups;
  }, [commandItems]);
  
  if (!isOpen || !mounted) return null;
  
  // Calculate flat index for selection across groups
  let flatIndex = -1;
  
  // Theme-based colors
  const bgColor = isOled 
    ? 'rgba(10,10,10,0.98)' 
    : isCosmic 
      ? 'rgba(14,12,26,0.95)'
      : isDark 
        ? 'rgba(22,21,19,0.95)' 
        : 'rgba(250,250,250,0.97)';
  
  const textColor = isDark ? 'rgba(232,228,222,0.95)' : 'rgba(28,27,31,0.9)';
  const mutedColor = isDark ? 'rgba(155,150,137,0.7)' : 'rgba(0,0,0,0.5)';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const accentBg = isDark ? 'rgba(var(--pfc-accent-rgb), 0.12)' : 'rgba(var(--pfc-accent-rgb), 0.08)';
  
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        background: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fade-in 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          background: bgColor,
          borderRadius: 'var(--shape-lg)',
          border: `1px solid ${borderColor}`,
          boxShadow: isDark 
            ? '0 24px 64px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)' 
            : '0 24px 64px -12px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
          overflow: 'hidden',
          animation: 'spring-up 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <SearchIcon 
            style={{ 
              width: '1.25rem', 
              height: '1.25rem', 
              color: mutedColor,
              flexShrink: 0,
            }} 
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, chats, or run commands..."
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: '1rem',
              fontFamily: 'var(--font-sans)',
              color: textColor,
              outline: 'none',
              padding: 0,
            }}
          />
          {isSearching ? (
            <div
              style={{
                width: '1rem',
                height: '1rem',
                border: `2px solid ${borderColor}`,
                borderTopColor: 'var(--pfc-accent)',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }}
            />
          ) : query ? (
            <button
              onClick={() => setQuery('')}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '0.25rem',
                borderRadius: 'var(--shape-sm)',
                color: mutedColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <XIcon style={{ width: '1rem', height: '1rem' }} />
            </button>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.5rem',
                borderRadius: 'var(--shape-sm)',
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                color: mutedColor,
              }}
            >
              <CommandIcon style={{ width: '0.75rem', height: '0.75rem' }} />
              <span>K</span>
            </div>
          )}
        </div>
        
        {/* Results */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.5rem 0',
            maxHeight: 'calc(60vh - 70px)',
          }}
        >
          {commandItems.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3rem 1.5rem',
                gap: '0.75rem',
              }}
            >
              <SearchIcon style={{ width: '2rem', height: '2rem', color: mutedColor, opacity: 0.5 }} />
              <p style={{ margin: 0, color: mutedColor, fontSize: '0.875rem' }}>
                No results found for "{query}"
              </p>
            </div>
          ) : (
            groupedItems.map((group) => (
              <div key={group.category}>
                <div
                  style={{
                    padding: '0.5rem 1.25rem 0.375rem',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: mutedColor,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {group.label}
                </div>
                {group.items.map((item) => {
                  flatIndex++;
                  const isSelected = flatIndex === selectedIndex;
                  const Icon = item.icon;
                  
                  return (
                    <button
                      key={item.id}
                      data-selected={isSelected}
                      onClick={() => item.action()}
                      onMouseEnter={() => setSelectedIndex(flatIndex)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.875rem',
                        width: '100%',
                        padding: '0.625rem 1.25rem',
                        border: 'none',
                        background: isSelected ? accentBg : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <div
                        style={{
                          width: '2rem',
                          height: '2rem',
                          borderRadius: 'var(--shape-md)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                          flexShrink: 0,
                        }}
                      >
                        <Icon 
                          style={{ 
                            width: '1rem', 
                            height: '1rem', 
                            color: isSelected ? 'var(--pfc-accent)' : mutedColor,
                          }} 
                        />
                      </div>
                      
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.9375rem',
                            fontWeight: 500,
                            color: textColor,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: mutedColor,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontFamily: 'var(--font-sans)',
                            }}
                          >
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      
                      {item.shortcut && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: 'var(--shape-sm)',
                            background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)',
                            color: mutedColor,
                            flexShrink: 0,
                          }}
                        >
                          {item.shortcut.split(' ').map((key, i) => (
                            <span key={i}>
                              {i > 0 && <ChevronRightIcon style={{ width: '0.625rem', height: '0.625rem', display: 'inline', verticalAlign: 'middle' }} />}
                              {key}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {isSelected && (
                        <ArrowRightIcon 
                          style={{ 
                            width: '1rem', 
                            height: '1rem', 
                            color: 'var(--pfc-accent)',
                            flexShrink: 0,
                          }} 
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        
        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.625rem 1.25rem',
            borderTop: `1px solid ${borderColor}`,
            fontSize: '0.75rem',
            color: mutedColor,
            fontFamily: 'var(--font-sans)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span>{commandItems.length} results</span>
            {inferenceMode === 'api' && apiProvider && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <SparklesIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                {API_PROVIDERS.find(p => p.id === apiProvider)?.label || apiProvider}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <kbd style={{ padding: '0.125rem 0.375rem', borderRadius: '4px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', fontFamily: 'var(--font-mono)' }}>↑↓</kbd>
              Navigate
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <kbd style={{ padding: '0.125rem 0.375rem', borderRadius: '4px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', fontFamily: 'var(--font-mono)' }}>Enter</kbd>
              Select
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <kbd style={{ padding: '0.125rem 0.375rem', borderRadius: '4px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', fontFamily: 'var(--font-mono)' }}>Esc</kbd>
              Close
            </span>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes spring-up {
          0% { opacity: 0; transform: translateY(-20px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Command Palette Trigger Hook
// ═══════════════════════════════════════════════════════════════════

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  
  const openPalette = useCallback(() => setIsOpen(true), []);
  const closePalette = useCallback(() => setIsOpen(false), []);
  const togglePalette = useCallback(() => setIsOpen((prev) => !prev), []);
  
  // Listen for global open event
  useEffect(() => {
    const handleOpen = () => openPalette();
    window.addEventListener('command-palette:open' as never, handleOpen);
    return () => window.removeEventListener('command-palette:open' as never, handleOpen);
  }, [openPalette]);
  
  return { isOpen, open: openPalette, close: closePalette, toggle: togglePalette };
}

// ═══════════════════════════════════════════════════════════════════
// Command Palette Provider (add to AppShell)
// ═══════════════════════════════════════════════════════════════════

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const { isOpen, close, toggle } = useCommandPalette();
  
  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);
  
  return (
    <>
      {children}
      <CommandPalette isOpen={isOpen} onClose={close} />
    </>
  );
}
