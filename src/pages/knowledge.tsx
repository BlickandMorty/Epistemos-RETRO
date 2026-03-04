import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenLineIcon, PlusIcon, ImportIcon, CalendarIcon,
  StarIcon, PinIcon, EyeIcon, PencilIcon, NetworkIcon,
  WrenchIcon, XIcon, FileTextIcon, Maximize2Icon, Minimize2Icon,
  ArrowLeftIcon, SparklesIcon, ListIcon, HistoryIcon,
} from 'lucide-react';
import { NoteAIChat } from '@/components/notes/note-ai-chat';
import { NotesSidebar } from '@/components/notes/notes-sidebar';
import { BlockEditor } from '@/components/notes/block-editor/editor';
import { TableOfContents } from '@/components/notes/table-of-contents';
import { DiffSheet } from '@/components/notes/diff-sheet';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';
import { useIsDark } from '@/hooks/use-is-dark';
import { physicsSpring } from '@/lib/motion/motion-config';
import { SegmentedToggle, type KnowledgeMode } from '@/components/knowledge/segmented-toggle';
import type { NotePage } from '@/lib/notes/types';

// ── Tools icon button (right sidebar) ──────────────────────────

function ToolBtn({ icon, label, isActive, activeColor, onClick }: {
  icon: React.ReactNode; label: string; isActive?: boolean; activeColor?: string; onClick: () => void;
}) {
  const { isDark } = useIsDark();
  return (
    <motion.button
      onClick={onClick}
      title={label}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={{ opacity: { duration: 0.15 }, scale: { duration: 0.15 } }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '2rem', height: '2rem', borderRadius: '0.5rem',
        border: 'none', cursor: 'pointer',
        color: isActive ? (activeColor ?? '#B8C0FF') : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.4)'),
        background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
    </motion.button>
  );
}

// ── Tab bubble (bottom bar) ────────────────────────────────────

function TabBubble({ page, isActive, isDark, onClick, onClose }: {
  page: NotePage | undefined; isActive: boolean; isDark: boolean;
  onClick: () => void; onClose: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const expanded = hovered || isActive;
  const title = page?.title || 'Untitled';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: expanded ? '0.4rem' : '0rem',
        borderRadius: '9999px',
        padding: expanded ? '0.375rem 0.625rem' : '0.375rem 0.5rem',
        height: '2.125rem', fontSize: '0.8125rem',
        border: 'none', cursor: 'pointer',
        color: isActive
          ? (isDark ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.95)')
          : (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.5)'),
        background: isActive
          ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)')
          : 'transparent',
        maxWidth: expanded ? '12rem' : '2.125rem',
        overflow: 'hidden',
        transition: 'gap 0.3s cubic-bezier(0.32,0.72,0,1), padding 0.3s cubic-bezier(0.32,0.72,0,1), background 0.15s, color 0.15s, max-width 0.3s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      <FileTextIcon style={{ width: '0.9375rem', height: '0.9375rem', flexShrink: 0 }} />
      <span style={{
        maxWidth: expanded ? '8rem' : '0rem', opacity: expanded ? 1 : 0,
        textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden',
        transition: 'max-width 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.2s',
        fontWeight: 550,
      }}>
        {title}
      </span>
      {expanded && (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
            opacity: 0.5,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
        >
          <XIcon style={{ width: 8, height: 8 }} />
        </span>
      )}
    </button>
  );
}

// ── Knowledge page (Notes + Graph modes) ──────────────────────────

export default function KnowledgePage() {
  const { isDark } = useIsDark();
  const [mode, setMode] = useState<KnowledgeMode>('notes');

  // ── Notes state ─────────────────────────────────────────────────
  const activePageId = usePFCStore((s) => s.activePageId);
  const notePages = usePFCStore((s) => s.notePages);
  const openTabIds = usePFCStore((s) => s.openTabIds);
  const setActivePage = usePFCStore((s) => s.setActivePage);
  const createPage = usePFCStore((s) => s.createPage);
  const closeTab = usePFCStore((s) => s.closeTab);
  const togglePageFavorite = usePFCStore((s) => s.togglePageFavorite);
  const togglePagePin = usePFCStore((s) => s.togglePagePin);
  const addToast = usePFCStore((s) => s.addToast);
  const renamePage = usePFCStore((s) => s.renamePage);

  const activePage = notePages.find((p: NotePage) => p.id === activePageId) ?? null;

  const [toolsOpen, setToolsOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'write' | 'read'>('write');
  const [zenMode, setZenMode] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [diffSheetOpen, setDiffSheetOpen] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setTocOpen((v) => !v);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Editable title
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  const handleTitleClick = useCallback(() => {
    if (activePage) {
      setTitleDraft(activePage.title);
      setIsEditingTitle(true);
      setTimeout(() => titleRef.current?.select(), 50);
    }
  }, [activePage]);

  const handleTitleCommit = useCallback(() => {
    setIsEditingTitle(false);
    if (activePage && titleDraft.trim() && titleDraft.trim() !== activePage.title) {
      renamePage(activePage.id, titleDraft.trim());
    }
  }, [activePage, titleDraft, renamePage]);

  // Recent pages for landing state
  const recentPages = notePages
    .filter(() => true)
    .sort((a: NotePage, b: NotePage) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 6);

  const pillBg = isDark ? 'rgba(28,27,31,0.85)' : 'rgba(0,0,0,0.85)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: 'var(--chat-surface)', color: 'var(--foreground)',
    }}>
      {/* ── Top bar with centered toggle ──────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0.5rem 1rem',
        background: isDark ? 'rgba(20,19,24,0.85)' : 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)',
        flexShrink: 0,
        zIndex: 50,
      }}>
        <SegmentedToggle mode={mode} onModeChange={setMode} />
      </div>

      {/* ── Notes mode ────────────────────────────────────────── */}
      <div style={{
        display: mode === 'notes' ? 'flex' : 'none',
        flex: 1, overflow: 'hidden',
      }}>
        {/* ── Sidebar (hidden in zen mode) ─────────────── */}
        {!zenMode && (
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={physicsSpring.chatPanel}
            style={{
              width: '16rem', minWidth: '16rem', flexShrink: 0,
              borderRight: isDark ? '1px solid rgba(60,52,42,0.2)' : '1px solid rgba(0,0,0,0.06)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <NotesSidebar />
          </motion.div>
        )}

        {/* ── Main content area (editor + optional TOC) ───────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minWidth: 0, overflow: 'hidden' }}>
          {/* Editor content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
              <AnimatePresence mode="wait">
                {activePageId && activePage ? (
                  <motion.div
                    key={activePageId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={physicsSpring.chatEnter}
                    style={{
                      maxWidth: zenMode ? '48rem' : '44rem',
                      margin: '0 auto',
                      padding: zenMode ? '6rem 2rem 8rem' : '5rem 2rem 6rem',
                      width: '100%',
                    }}
                  >
                    {/* Journal badge */}
                    {activePage.isJournal && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                        fontSize: '0.6875rem', fontWeight: 600, color: '#34D399',
                        marginBottom: '0.5rem',
                      }}>
                        <CalendarIcon style={{ width: '0.625rem', height: '0.625rem' }} />
                        Journal
                      </div>
                    )}

                    {/* Editable title */}
                    <div style={{ minHeight: '3rem', marginBottom: '1.5rem' }}>
                      {isEditingTitle ? (
                        <input
                          ref={titleRef}
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onBlur={handleTitleCommit}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleTitleCommit(); if (e.key === 'Escape') setIsEditingTitle(false); }}
                          style={{
                            fontSize: '1.875rem', fontWeight: 400,
                            fontFamily: 'var(--font-heading)',
                            color: 'var(--foreground)', background: 'transparent',
                            border: 'none', outline: 'none', width: '100%',
                            letterSpacing: '-0.01em',
                          }}
                        />
                      ) : (
                        <h1
                          onClick={handleTitleClick}
                          style={{
                            fontSize: '1.875rem', fontWeight: 400,
                            fontFamily: 'var(--font-heading)',
                            letterSpacing: '-0.01em', cursor: 'text',
                            color: 'var(--foreground)',
                          }}
                        >
                          {activePage.title}
                        </h1>
                      )}
                    </div>

                    {/* Block editor */}
                    <div data-editor-scroll-area style={{ flex: 1, overflow: 'auto' }}>
                      <BlockEditor pageId={activePageId} readOnly={editorMode === 'read'} />
                    </div>
                  </motion.div>
                ) : (
                  /* ── Landing state ─────────────────────────────── */
                  <motion.div
                    key="landing"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={physicsSpring.header}
                    style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      height: '100%', gap: '1.5rem',
                      padding: '2rem',
                    }}
                  >
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ ...physicsSpring.card, delay: 0.1 }}
                    >
                      <PenLineIcon style={{
                        width: 56, height: 56, opacity: 0.12,
                        color: isDark ? 'rgba(232,228,222,0.9)' : 'rgba(0,0,0,0.6)',
                      }} />
                    </motion.div>

                    <div style={{ textAlign: 'center' }}>
                      <h2 style={{
                        fontFamily: 'var(--font-heading)', fontSize: '1.5rem',
                        fontWeight: 400, letterSpacing: '-0.01em',
                        marginBottom: '0.5rem',
                      }}>
                        Notes
                      </h2>
                      <p style={{
                        fontSize: '0.875rem', opacity: 0.4,
                        maxWidth: '24rem', lineHeight: 1.5,
                      }}>
                        Create a page or open today's journal to start taking notes.
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <GlassBubbleButton size="sm" onClick={() => createPage('Untitled')}>
                        <PlusIcon style={{ width: 12, height: 12 }} />
                        New Page
                      </GlassBubbleButton>
                      <GlassBubbleButton size="sm" onClick={() => {
                        usePFCStore.getState().getOrCreateTodayJournal();
                      }}>
                        <CalendarIcon style={{ width: 12, height: 12 }} />
                        Today's Journal
                      </GlassBubbleButton>
                      <GlassBubbleButton size="sm" onClick={() => setMode('graph')}>
                        <NetworkIcon style={{ width: 12, height: 12 }} />
                        Knowledge Graph
                      </GlassBubbleButton>
                      <GlassBubbleButton size="sm" onClick={async () => {
                        const res = await commands.importVault();
                        if (res.status === 'ok') {
                          addToast({ message: `Imported ${res.data} notes`, type: 'success' });
                          usePFCStore.getState().loadNotesFromStorage();
                        }
                      }}>
                        <ImportIcon style={{ width: 12, height: 12 }} />
                        Import Vault
                      </GlassBubbleButton>
                    </div>

                    {/* Recent pages grid */}
                    {recentPages.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...physicsSpring.card, delay: 0.2 }}
                        style={{ marginTop: '1rem', width: '100%', maxWidth: '32rem' }}
                      >
                        <h3 style={{
                          fontSize: '0.6875rem', fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          color: isDark ? 'rgba(156,143,128,0.4)' : 'rgba(0,0,0,0.25)',
                          marginBottom: '0.75rem',
                        }}>
                          Recent
                        </h3>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))',
                          gap: '0.5rem',
                        }}>
                          {recentPages.map((page: NotePage) => (
                            <motion.button
                              key={page.id}
                              onClick={() => setActivePage(page.id)}
                              whileHover={{ scale: 1.02, y: -1, transition: physicsSpring.button }}
                              whileTap={{ scale: 0.98, transition: physicsSpring.button }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.625rem 0.75rem', borderRadius: '0.75rem',
                                border: isDark ? '1px solid rgba(60,52,42,0.2)' : '1px solid rgba(0,0,0,0.06)',
                                background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                                cursor: 'pointer', textAlign: 'left', width: '100%',
                                color: 'var(--foreground)',
                              }}
                            >
                              <FileTextIcon style={{ width: 14, height: 14, opacity: 0.4, flexShrink: 0 }} />
                              <span style={{
                                fontSize: '0.8125rem', fontWeight: 500,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {page.title}
                              </span>
                              {page.isJournal && (
                                <CalendarIcon style={{ width: 10, height: 10, color: '#34D399', flexShrink: 0, marginLeft: 'auto' }} />
                              )}
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Bottom tab bar ─────────────────────────────────── */}
            {openTabIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={physicsSpring.chatEnter}
                style={{
                  position: 'fixed', bottom: '0.625rem',
                  left: zenMode ? 0 : '16rem', right: 0,
                  zIndex: 40, display: 'flex', justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.125rem',
                  borderRadius: '9999px', padding: '0.3125rem',
                  maxWidth: 'calc(100vw - 8rem)', overflowX: 'auto',
                  background: pillBg, backdropFilter: 'blur(20px) saturate(1.4)',
                  pointerEvents: 'auto',
                }}>
                  {openTabIds.map((tabId: string) => {
                    const tabPage = notePages.find((p: NotePage) => p.id === tabId);
                    return (
                      <TabBubble
                        key={tabId}
                        page={tabPage}
                        isActive={tabId === activePageId}
                        isDark={isDark}
                        onClick={() => setActivePage(tabId)}
                        onClose={() => closeTab(tabId)}
                      />
                    );
                  })}
                  <motion.button
                    onClick={() => createPage('Untitled')}
                    title="New page"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '2.125rem', height: '2.125rem', borderRadius: '50%',
                      border: 'none', cursor: 'pointer', background: 'transparent',
                      color: 'rgba(255,255,255,0.4)',
                    }}
                  >
                    <PlusIcon style={{ width: '0.875rem', height: '0.875rem' }} />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </div>

          {/* ── Table of Contents (right sidebar) ───────────────── */}
          <AnimatePresence>
            {activePageId && tocOpen && (
              <TableOfContents
                pageId={activePageId}
                isOpen={tocOpen}
                onClose={() => setTocOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* ── NoteAI Chat (Izmi) ────────────────────────────────── */}
        {activePageId && (
          <NoteAIChat
            pageId={activePageId}
            isOpen={aiChatOpen}
            onClose={() => setAiChatOpen(false)}
          />
        )}

        {/* ── Right tools bar ──────────────────────────────────── */}
        {activePageId && activePage && (
          <div style={{
            position: 'fixed', right: '0.625rem', top: '50%',
            transform: 'translateY(-50%)', zIndex: 40,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <motion.div
              layout
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '0.125rem', borderRadius: '0.75rem', padding: '0.25rem',
                background: pillBg, backdropFilter: 'blur(20px) saturate(1.4)',
              }}
            >
              <motion.button
                layout
                onClick={() => setToolsOpen((v) => !v)}
                title="Utilities"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '2rem', height: '2rem', borderRadius: '0.5rem',
                  border: 'none', cursor: 'pointer',
                  background: toolsOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: toolsOpen ? '#B8C0FF' : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.4)'),
                  transition: 'background 0.12s ease, color 0.12s ease, transform 0.2s cubic-bezier(0.32,0.72,0,1)',
                  transform: toolsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
              >
                <WrenchIcon style={{ width: '0.875rem', height: '0.875rem' }} />
              </motion.button>

              <AnimatePresence>
                {toolsOpen && (
                  <>
                    <motion.div
                      initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }}
                      style={{ width: '60%', height: 1, background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', margin: '0.125rem 0' }}
                    />
                    <ToolBtn
                      icon={<ArrowLeftIcon style={{ width: '0.875rem', height: '0.875rem' }} />}
                      label="Home" onClick={() => setActivePage(null)}
                    />
                    <ToolBtn
                      icon={<StarIcon style={{ width: '0.875rem', height: '0.875rem', fill: activePage.favorite ? '#FBBF24' : 'none' }} />}
                      label={activePage.favorite ? 'Unfavorite' : 'Favorite'}
                      isActive={activePage.favorite} activeColor="#FBBF24"
                      onClick={() => togglePageFavorite(activePage.id)}
                    />
                    <ToolBtn
                      icon={<PinIcon style={{ width: '0.875rem', height: '0.875rem', transform: activePage.pinned ? 'rotate(0deg)' : 'rotate(45deg)' }} />}
                      label={activePage.pinned ? 'Unpin' : 'Pin'}
                      isActive={activePage.pinned}
                      onClick={() => togglePagePin(activePage.id)}
                    />
                    <ToolBtn
                      icon={editorMode === 'write'
                        ? <EyeIcon style={{ width: '0.875rem', height: '0.875rem' }} />
                        : <PencilIcon style={{ width: '0.875rem', height: '0.875rem' }} />}
                      label={editorMode === 'write' ? 'Read mode' : 'Write mode'}
                      isActive onClick={() => setEditorMode((m) => m === 'write' ? 'read' : 'write')}
                    />
                    <ToolBtn
                      icon={zenMode
                        ? <Minimize2Icon style={{ width: '0.875rem', height: '0.875rem' }} />
                        : <Maximize2Icon style={{ width: '0.875rem', height: '0.875rem' }} />}
                      label={zenMode ? 'Exit Zen' : 'Zen mode'}
                      isActive={zenMode} onClick={() => setZenMode((v) => !v)}
                    />
                    <motion.div
                      initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }}
                      style={{ width: '60%', height: 1, background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', margin: '0.125rem 0' }}
                    />
                    <ToolBtn
                      icon={<NetworkIcon style={{ width: '0.875rem', height: '0.875rem' }} />}
                      label="Knowledge Graph" activeColor="var(--pfc-accent)"
                      onClick={() => setMode('graph')}
                    />
                    <ToolBtn
                      icon={<SparklesIcon style={{ width: '0.875rem', height: '0.875rem' }} />}
                      label={aiChatOpen ? 'Close AI Chat' : 'AI Chat'}
                      isActive={aiChatOpen} activeColor="#A78BFA"
                      onClick={() => setAiChatOpen((v) => !v)}
                    />
                    <ToolBtn
                      icon={<ListIcon style={{ width: '0.875rem', height: '0.875rem' }} />}
                      label={tocOpen ? 'Hide Contents' : 'Show Contents'}
                      isActive={tocOpen} activeColor="var(--pfc-accent)"
                      onClick={() => setTocOpen((v) => !v)}
                    />
                    <ToolBtn
                      icon={<HistoryIcon style={{ width: '0.875rem', height: '0.875rem' }} />}
                      label="Version History"
                      isActive={diffSheetOpen} activeColor="var(--pfc-accent)"
                      onClick={() => setDiffSheetOpen(true)}
                    />
                  </>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {/* ── Version History (Diff Sheet) ─────────────────────── */}
        {activePageId && activePage && (
          <DiffSheet
            isOpen={diffSheetOpen}
            onClose={() => setDiffSheetOpen(false)}
            pageId={activePageId}
            pageTitle={activePage.title}
            currentBody=""
          />
        )}
      </div>

      {/* ── Graph mode ────────────────────────────────────────── */}
      <div style={{
        display: mode === 'graph' ? 'block' : 'none',
        flex: 1, overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%',
        }}>
          <span style={{ fontSize: '0.875rem', opacity: 0.4 }}>Graph mode</span>
        </div>
      </div>
    </div>
  );
}
