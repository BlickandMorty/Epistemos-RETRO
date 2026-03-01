'use client';

import { memo, useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { useIsDark } from '@/hooks/use-is-dark';
import { motion, AnimatePresence } from 'framer-motion';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import type { NotePage, NoteBook } from '@/lib/notes/types';
import {
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  SearchIcon,
  PlusIcon,
  CalendarIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  StarIcon,
  PinIcon,
  TrashIcon,
  PencilIcon,
  XIcon,
  BookOpenIcon,
  FileIcon,
  ClockIcon,
  FolderPlusIcon,
  NetworkIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const GraphView = lazy(() =>
  import('@/components/notes/graph-view').then((m) => ({ default: m.GraphView })),
);

/* ------------------------------------------------------------------ */
/*  Constants & Easing                                                  */
/* ------------------------------------------------------------------ */

import { ease, spring as motionSpring } from '@/lib/motion/motion-config';

const CUPERTINO = ease.emphasized;
const SPRING = motionSpring.bouncy;

/* ------------------------------------------------------------------ */
/*  Theme                                                               */
/* ------------------------------------------------------------------ */

function t(isDark: boolean, isOled = false, isCosmic = false, isSunny = false, isSunset = false) {
  if (isOled) {
    return {
      bg:        'rgba(26,26,26,0.96)',
      text:      'rgba(220,220,220,0.9)',
      muted:     'rgba(130,130,130,0.5)',
      border:    'rgba(50,50,50,0.4)',
      hover:     'rgba(255,255,255,0.04)',
      active:    'rgba(255,255,255,0.10)',
      accent:    'var(--pfc-accent)',
      icon:      'rgba(140,140,140,0.45)',
      inputBg:   'rgba(48,48,48,0.5)',
      danger:    '#E05252',
      tabBg:     'rgba(30,30,30,0.3)',
      tabActive: 'rgba(255,255,255,0.12)',
    };
  }
  if (isCosmic) {
    return {
      bg:        'rgba(15,21,40,0.96)',
      text:      'rgba(184,200,218,0.9)',
      muted:     'rgba(100,140,190,0.55)',
      border:    'rgba(40,55,80,0.35)',
      hover:     'rgba(100,140,190,0.06)',
      active:    'rgba(100,140,190,0.15)',
      accent:    'var(--pfc-accent)',
      icon:      'rgba(100,140,190,0.45)',
      inputBg:   'rgba(100,140,190,0.12)',
      danger:    '#E05252',
      tabBg:     'rgba(100,140,190,0.08)',
      tabActive: 'rgba(100,140,190,0.18)',
    };
  }
  if (isSunset) {
    return {
      bg:        'rgba(30,22,20,0.96)',
      text:      'rgba(212,184,168,0.9)',
      muted:     'rgba(160,120,100,0.55)',
      border:    'rgba(80,50,40,0.3)',
      hover:     'rgba(200,140,100,0.06)',
      active:    'rgba(200,140,100,0.15)',
      accent:    'var(--pfc-accent)',
      icon:      'rgba(160,120,100,0.45)',
      inputBg:   'rgba(160,120,100,0.12)',
      danger:    '#E05252',
      tabBg:     'rgba(160,120,100,0.08)',
      tabActive: 'rgba(200,140,100,0.18)',
    };
  }
  if (isSunny) {
    return {
      bg:        'rgba(232,238,246,0.96)',
      text:      'rgba(26,40,64,0.9)',
      muted:     'rgba(60,80,110,0.5)',
      border:    'rgba(0,0,0,0.06)',
      hover:     'rgba(0,0,0,0.03)',
      active:    'rgba(40,100,200,0.10)',
      accent:    'var(--pfc-accent)',
      icon:      'rgba(60,80,110,0.4)',
      inputBg:   'rgba(0,0,0,0.04)',
      danger:    '#E05252',
      tabBg:     'rgba(0,0,0,0.03)',
      tabActive: 'rgba(40,100,200,0.12)',
    };
  }
  return {
    bg:        isDark ? 'rgba(30,27,24,0.96)'       : 'rgba(255,255,255,0.96)',
    text:      isDark ? 'rgba(237,224,212,0.9)'      : 'rgba(28,27,31,0.9)',
    muted:     isDark ? 'rgba(156,143,128,0.5)'      : 'rgba(0,0,0,0.35)',
    border:    isDark ? 'rgba(60,52,42,0.3)'          : 'rgba(0,0,0,0.06)',
    hover:     isDark ? 'rgba(244,189,111,0.06)'      : 'rgba(0,0,0,0.04)',
    active:    isDark ? 'rgba(244,189,111,0.12)'      : 'rgba(0,0,0,0.08)',
    accent:    'var(--pfc-accent)',
    icon:      isDark ? 'rgba(156,143,128,0.45)'      : 'rgba(0,0,0,0.28)',
    inputBg:   isDark ? 'rgba(79,69,57,0.35)' : 'rgba(0,0,0,0.04)',
    danger:    '#E05252',
    tabBg:     isDark ? 'rgba(79,69,57,0.2)'          : 'rgba(0,0,0,0.03)',
    tabActive: isDark ? 'rgba(244,189,111,0.15)'      : 'rgba(0,0,0,0.08)',
  };
}

type SidebarView = 'pages' | 'journals' | 'books' | 'concepts';

/* ------------------------------------------------------------------ */
/*  Main Sidebar                                                        */
/* ------------------------------------------------------------------ */

export const NotesSidebar = memo(function NotesSidebar() {
  const { isDark, isOled, isCosmic, isSunny, isSunset } = useIsDark();
  const c = t(isDark, isOled, isCosmic, isSunny, isSunset);

  const notePages          = usePFCStore((s) => s.notePages);
  const noteBooks          = usePFCStore((s) => s.noteBooks);
  const activePageId       = usePFCStore((s) => s.activePageId);
  const setActivePage      = usePFCStore((s) => s.setActivePage);
  const createPage         = usePFCStore((s) => s.createPage);
  const deletePage         = usePFCStore((s) => s.deletePage);
  const renamePage         = usePFCStore((s) => s.renamePage);
  const togglePageFavorite = usePFCStore((s) => s.togglePageFavorite);
  const togglePagePin      = usePFCStore((s) => s.togglePagePin);
  const searchNotes        = usePFCStore((s) => s.searchNotes);
  const getOrCreateTodayJournal = usePFCStore((s) => s.getOrCreateTodayJournal);
  const createNoteBook     = usePFCStore((s) => s.createNoteBook);
  const movePageToBook     = usePFCStore((s) => s.movePageToBook);
  const addPageToBook      = usePFCStore((s) => s.addPageToBook);

  // Local state
  const [view, setView] = useState<SidebarView>('pages');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Search
  const searchResults = useMemo(
    () => (searchQuery.trim() ? searchNotes(searchQuery) : []),
    [searchQuery, searchNotes],
  );
  const isSearching = searchQuery.trim().length > 0;

  // Derived data
  const pinnedPages = useMemo(
    () => notePages.filter((p) => p.pinned).sort((a, b) => b.updatedAt - a.updatedAt),
    [notePages],
  );

  const favoritePages = useMemo(
    () => notePages.filter((p) => p.favorite && !p.pinned).sort((a, b) => b.updatedAt - a.updatedAt),
    [notePages],
  );

  const journalPages = useMemo(
    () => notePages
      .filter((p) => p.isJournal)
      .sort((a, b) => (b.journalDate ?? '').localeCompare(a.journalDate ?? '')),
    [notePages],
  );

  const bookPageIds = useMemo(() => {
    const ids = new Set<string>();
    noteBooks.forEach((b) => b.pageIds.forEach((id) => ids.add(id)));
    return ids;
  }, [noteBooks]);

  const recentPages = useMemo(
    () => notePages
      .filter((p) => !p.isJournal && !p.pinned)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20),
    [notePages],
  );

  const standalonePages = useMemo(
    () => notePages
      .filter((p) => !p.pinned && !p.isJournal && !bookPageIds.has(p.id))
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [notePages, bookPageIds],
  );

  const booksWithPages = useMemo(
    () => noteBooks.map((book) => ({
      ...book,
      pages: book.pageIds
        .map((id) => notePages.find((p) => p.id === id))
        .filter(Boolean) as NotePage[],
    })),
    [noteBooks, notePages],
  );

  // Handlers
  const handleNewPage = useCallback(() => { createPage('Untitled'); }, [createPage]);
  const handleTodayJournal = useCallback(() => { getOrCreateTodayJournal(); }, [getOrCreateTodayJournal]);

  const toggleBook = useCallback((bookId: string) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }, []);

  const startRename = useCallback((id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renamePage(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, renamePage]);

  const handleNewBook = useCallback(() => {
    createNoteBook('New Notebook');
  }, [createNoteBook]);

  const handleNewSubBook = useCallback((parentId: string) => {
    const bookId = createNoteBook('New Notebook', [], parentId);
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      next.add(parentId); // expand parent to show new child
      next.add(bookId);   // expand new child
      return next;
    });
  }, [createNoteBook]);

  const handleNewPageInBook = useCallback((bookId: string) => {
    const pageId = createPage('Untitled');
    addPageToBook(bookId, pageId);
    setActivePage(pageId);
  }, [createPage, addPageToBook, setActivePage]);

  const handleMovePageToBook = useCallback((pageId: string, targetBookId: string | null) => {
    movePageToBook(pageId, targetBookId);
  }, [movePageToBook]);

  const viewTabs: { id: SidebarView; label: string; icon: React.ReactNode }[] = [
    { id: 'pages', label: 'Pages', icon: <FileIcon style={{ width: 12, height: 12 }} /> },
    { id: 'journals', label: 'Journal', icon: <CalendarIcon style={{ width: 12, height: 12 }} /> },
    { id: 'books', label: 'Books', icon: <BookOpenIcon style={{ width: 12, height: 12 }} /> },
    { id: 'concepts', label: 'Concepts', icon: <NetworkIcon style={{ width: 12, height: 12 }} /> },
  ];

  return (
    <aside
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'transparent',
        fontFamily: 'var(--font-sans)',
        fontSize: '14px',
        color: c.text,
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* ── Header: Search ── */}
      <div style={{
        padding: '12px 10px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        flexShrink: 0,
      }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <SearchIcon style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 12,
            height: 12,
            color: searchFocused ? c.accent : c.icon,
            pointerEvents: 'none',
            transition: 'color 0.15s',
          }} />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              width: '100%',
              height: 28,
              paddingLeft: 26,
              paddingRight: searchQuery ? 24 : 8,
              fontSize: '12px',
              fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              borderRadius: 6,
              border: `1px solid ${searchFocused ? c.accent + '40' : c.border}`,
              background: c.inputBg,
              color: c.text,
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 5,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 3,
                border: 'none',
                background: 'transparent',
                color: c.muted,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <XIcon style={{ width: 10, height: 10 }} />
            </button>
          )}
        </div>

        {/* View tabs */}
        {!isSearching && (
          <div style={{
            display: 'flex',
            gap: '2px',
            padding: '2px',
            borderRadius: 6,
            background: c.tabBg,
          }}>
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  height: 26,
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s cubic-bezier(0.32,0.72,0,1)',
                  background: view === tab.id ? c.tabActive : 'transparent',
                  color: view === tab.id ? c.accent : c.muted,
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Scrollable tree area ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'thin',
          padding: '4px 0',
        }}
      >
        <AnimatePresence mode="wait">
          {isSearching ? (
            <motion.div
              key="search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <SearchResults
                c={c}
                results={searchResults}
                query={searchQuery}
                activePageId={activePageId}
                onSelectPage={setActivePage}
              />
            </motion.div>
          ) : view === 'pages' ? (
            <motion.div
              key="pages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <PagesView
                c={c}
                pinnedPages={pinnedPages}
                favoritePages={favoritePages}
                recentPages={recentPages}
                booksWithPages={booksWithPages}
                standalonePages={standalonePages}
                expandedBooks={expandedBooks}
                activePageId={activePageId}
                renamingId={renamingId}
                renameValue={renameValue}
                onToggleBook={toggleBook}
                onSelectPage={setActivePage}
                onDelete={deletePage}
                onToggleFavorite={togglePageFavorite}
                onTogglePin={togglePagePin}
                onStartRename={startRename}
                onRenameChange={setRenameValue}
                onCommitRename={commitRename}
                onMovePageToBook={handleMovePageToBook}
                onNewPageInBook={handleNewPageInBook}
                onNewSubBook={handleNewSubBook}
              />
            </motion.div>
          ) : view === 'journals' ? (
            <motion.div
              key="journals"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <JournalsView
                c={c}
                journalPages={journalPages}
                activePageId={activePageId}
                onSelectPage={setActivePage}
                onDelete={deletePage}
              />
            </motion.div>
          ) : view === 'books' ? (
            <motion.div
              key="books"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <BooksView
                c={c}
                booksWithPages={booksWithPages}
                expandedBooks={expandedBooks}
                activePageId={activePageId}
                renamingId={renamingId}
                renameValue={renameValue}
                onToggleBook={toggleBook}
                onSelectPage={setActivePage}
                onDelete={deletePage}
                onToggleFavorite={togglePageFavorite}
                onTogglePin={togglePagePin}
                onStartRename={startRename}
                onRenameChange={setRenameValue}
                onCommitRename={commitRename}
                onNewBook={handleNewBook}
                onMovePageToBook={handleMovePageToBook}
                onNewPageInBook={handleNewPageInBook}
                onNewSubBook={handleNewSubBook}
              />
            </motion.div>
          ) : (
            <motion.div
              key="concepts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{ height: '100%' }}
            >
              <Suspense fallback={
                <div style={{ padding: '2rem', textAlign: 'center', color: c.muted, fontSize: '12px' }}>
                  Loading concepts...
                </div>
              }>
                <GraphView />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom bar ── */}
      <BottomBar c={c} onNewPage={handleNewPage} onTodayJournal={handleTodayJournal} />
    </aside>
  );
});

/* ================================================================== */
/*  Pages View                                                          */
/* ================================================================== */

interface PagesViewProps {
  c: ReturnType<typeof t>;
  pinnedPages: NotePage[];
  favoritePages: NotePage[];
  recentPages: NotePage[];
  booksWithPages: (NoteBook & { pages: NotePage[] })[];
  standalonePages: NotePage[];
  expandedBooks: Set<string>;
  activePageId: string | null;
  renamingId: string | null;
  renameValue: string;
  onToggleBook: (id: string) => void;
  onSelectPage: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onTogglePin: (id: string) => void;
  onStartRename: (id: string, title: string) => void;
  onRenameChange: (val: string) => void;
  onCommitRename: () => void;
  onMovePageToBook: (pageId: string, targetBookId: string | null) => void;
  onNewPageInBook: (bookId: string) => void;
  onNewSubBook: (parentId: string) => void;
}

function PagesView({
  c, pinnedPages, favoritePages, recentPages, booksWithPages, standalonePages,
  expandedBooks, activePageId, renamingId, renameValue,
  onToggleBook, onSelectPage, onDelete, onToggleFavorite, onTogglePin,
  onStartRename, onRenameChange, onCommitRename, onMovePageToBook, onNewPageInBook,
  onNewSubBook,
}: PagesViewProps) {
  const hasAnything = pinnedPages.length > 0 || favoritePages.length > 0 || standalonePages.length > 0 || booksWithPages.length > 0;

  if (!hasAnything) {
    return (
      <EmptyState c={c} message="No pages yet. Create one to get started." />
    );
  }

  return (
    <>
      {/* Pinned */}
      {pinnedPages.length > 0 && (
        <Section c={c} label="Pinned" icon={<PinIcon style={{ width: 10, height: 10 }} />}>
          {pinnedPages.map((page) => (
            <FileItem
              key={page.id} c={c} page={page}
              isActive={page.id === activePageId}
              isRenaming={page.id === renamingId}
              renameValue={renameValue} depth={0}
              onSelect={onSelectPage} onDelete={onDelete}
              onToggleFavorite={onToggleFavorite}
              onTogglePin={onTogglePin}
              onStartRename={onStartRename}
              onRenameChange={onRenameChange}
              onCommitRename={onCommitRename}
              onMovePageToBook={onMovePageToBook}
              allBooks={booksWithPages}
            />
          ))}
        </Section>
      )}

      {/* Favorites */}
      {favoritePages.length > 0 && (
        <Section c={c} label="Favorites" icon={<StarIcon style={{ width: 10, height: 10 }} />}>
          {favoritePages.map((page) => (
            <FileItem
              key={page.id} c={c} page={page}
              isActive={page.id === activePageId}
              isRenaming={page.id === renamingId}
              renameValue={renameValue} depth={0}
              onSelect={onSelectPage} onDelete={onDelete}
              onToggleFavorite={onToggleFavorite}
              onTogglePin={onTogglePin}
              onStartRename={onStartRename}
              onRenameChange={onRenameChange}
              onCommitRename={onCommitRename}
              onMovePageToBook={onMovePageToBook}
              allBooks={booksWithPages}
            />
          ))}
        </Section>
      )}

      {/* Notebooks — render only root-level books (no parentId) */}
      {booksWithPages.length > 0 && (
        <Section c={c} label="Notebooks">
          {booksWithPages
            .filter((book) => !book.parentId)
            .map((book) => (
            <FolderItem
              key={book.id} c={c} book={book}
              isExpanded={expandedBooks.has(book.id)}
              activePageId={activePageId}
              renamingId={renamingId} renameValue={renameValue}
              depth={0}
              onToggle={onToggleBook} onSelectPage={onSelectPage}
              onDelete={onDelete} onToggleFavorite={onToggleFavorite}
              onTogglePin={onTogglePin} onStartRename={onStartRename}
              onRenameChange={onRenameChange} onCommitRename={onCommitRename}
              onMovePageToBook={onMovePageToBook}
              onNewPageInBook={onNewPageInBook}
              onNewSubBook={onNewSubBook}
              allBooks={booksWithPages}
              expandedBooks={expandedBooks}
            />
          ))}
        </Section>
      )}

      {/* Recent / standalone pages */}
      {standalonePages.length > 0 && (
        <Section c={c} label="Recent" icon={<ClockIcon style={{ width: 10, height: 10 }} />}>
          {standalonePages.map((page) => (
            <FileItem
              key={page.id} c={c} page={page}
              isActive={page.id === activePageId}
              isRenaming={page.id === renamingId}
              renameValue={renameValue} depth={0}
              onSelect={onSelectPage} onDelete={onDelete}
              onToggleFavorite={onToggleFavorite}
              onTogglePin={onTogglePin}
              onStartRename={onStartRename}
              onRenameChange={onRenameChange}
              onCommitRename={onCommitRename}
              onMovePageToBook={onMovePageToBook}
              allBooks={booksWithPages}
            />
          ))}
        </Section>
      )}
    </>
  );
}

/* ================================================================== */
/*  Journals View                                                       */
/* ================================================================== */

interface JournalsViewProps {
  c: ReturnType<typeof t>;
  journalPages: NotePage[];
  activePageId: string | null;
  onSelectPage: (id: string) => void;
  onDelete: (id: string) => void;
}

function JournalsView({ c, journalPages, activePageId, onSelectPage, onDelete }: JournalsViewProps) {
  // Group by month
  const grouped = useMemo(() => {
    const groups: Record<string, NotePage[]> = {};
    for (const page of journalPages) {
      const date = page.journalDate ?? '';
      const month = date.slice(0, 7); // YYYY-MM
      if (!groups[month]) groups[month] = [];
      groups[month].push(page);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [journalPages]);

  if (journalPages.length === 0) {
    return (
      <EmptyState c={c} message="No journal entries yet. Start today's journal below." />
    );
  }

  return (
    <>
      {grouped.map(([month, pages]) => {
        const d = new Date(month + '-01T00:00:00');
        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return (
          <Section key={month} c={c} label={label}>
            {pages.map((page) => {
              const isActive = page.id === activePageId;
              return (
                <JournalItem
                  key={page.id}
                  c={c}
                  page={page}
                  isActive={isActive}
                  onSelect={onSelectPage}
                  onDelete={onDelete}
                />
              );
            })}
          </Section>
        );
      })}
    </>
  );
}

/* ================================================================== */
/*  Books View                                                          */
/* ================================================================== */

interface BooksViewProps {
  c: ReturnType<typeof t>;
  booksWithPages: (NoteBook & { pages: NotePage[] })[];
  expandedBooks: Set<string>;
  activePageId: string | null;
  renamingId: string | null;
  renameValue: string;
  onToggleBook: (id: string) => void;
  onSelectPage: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onTogglePin: (id: string) => void;
  onStartRename: (id: string, title: string) => void;
  onRenameChange: (val: string) => void;
  onCommitRename: () => void;
  onNewBook: () => void;
  onMovePageToBook: (pageId: string, targetBookId: string | null) => void;
  onNewPageInBook: (bookId: string) => void;
  onNewSubBook: (parentId: string) => void;
}

function BooksView({
  c, booksWithPages, expandedBooks, activePageId,
  renamingId, renameValue, onToggleBook, onSelectPage, onDelete,
  onToggleFavorite, onTogglePin, onStartRename, onRenameChange,
  onCommitRename, onNewBook, onMovePageToBook, onNewPageInBook,
  onNewSubBook,
}: BooksViewProps) {
  if (booksWithPages.length === 0) {
    return (
      <div style={{ padding: '30px 16px', textAlign: 'center' }}>
        <EmptyState c={c} message="No notebooks yet." />
        <button
          onClick={onNewBook}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            marginTop: 12,
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            borderRadius: 6,
            border: 'none',
            background: `${c.accent}18`,
            color: c.accent,
            cursor: 'pointer',
          }}
        >
          <FolderPlusIcon style={{ width: 13, height: 13 }} />
          New Notebook
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px 4px',
      }}>
        <SectionLabel c={c} label="Notebooks" />
        <button
          onClick={onNewBook}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 4, border: 'none',
            background: 'transparent', color: c.muted, cursor: 'pointer', padding: 0,
          }}
        >
          <PlusIcon style={{ width: 12, height: 12 }} />
        </button>
      </div>
      {booksWithPages
        .filter((book) => !book.parentId)
        .map((book) => (
        <FolderItem
          key={book.id} c={c} book={book}
          isExpanded={expandedBooks.has(book.id)}
          activePageId={activePageId}
          renamingId={renamingId} renameValue={renameValue}
          depth={0}
          onToggle={onToggleBook} onSelectPage={onSelectPage}
          onDelete={onDelete} onToggleFavorite={onToggleFavorite}
          onTogglePin={onTogglePin} onStartRename={onStartRename}
          onRenameChange={onRenameChange} onCommitRename={onCommitRename}
          onMovePageToBook={onMovePageToBook}
          onNewPageInBook={onNewPageInBook}
          onNewSubBook={onNewSubBook}
          allBooks={booksWithPages}
          expandedBooks={expandedBooks}
        />
      ))}
    </>
  );
}

/* ================================================================== */
/*  Shared components                                                   */
/* ================================================================== */

function EmptyState({ c, message }: { c: ReturnType<typeof t>; message: string }) {
  return (
    <div style={{
      padding: '36px 20px',
      textAlign: 'center',
      color: c.muted,
      fontSize: '12px',
      lineHeight: 1.5,
    }}>
      {message}
    </div>
  );
}

function SectionLabel({ c, label, icon }: { c: ReturnType<typeof t>; label: string; icon?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: c.muted,
    }}>
      {icon}
      {label}
    </div>
  );
}

function Section({
  c, label, icon, children,
}: {
  c: ReturnType<typeof t>;
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ padding: '8px 12px 3px' }}>
        <SectionLabel c={c} label={label} icon={icon} />
      </div>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Folder Item (Notebook)                                              */
/* ================================================================== */

interface FolderItemProps {
  c: ReturnType<typeof t>;
  book: NoteBook & { pages: NotePage[] };
  isExpanded: boolean;
  activePageId: string | null;
  renamingId: string | null;
  renameValue: string;
  depth?: number;
  onToggle: (id: string) => void;
  onSelectPage: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onTogglePin: (id: string) => void;
  onStartRename: (id: string, title: string) => void;
  onRenameChange: (val: string) => void;
  onCommitRename: () => void;
  onMovePageToBook: (pageId: string, targetBookId: string | null) => void;
  onNewPageInBook: (bookId: string) => void;
  onNewSubBook?: (parentId: string) => void;
  allBooks: (NoteBook & { pages: NotePage[] })[];
  expandedBooks?: Set<string>;
}

const FolderItem = memo(function FolderItem({
  c, book, isExpanded, activePageId, renamingId, renameValue, depth = 0,
  onToggle, onSelectPage, onDelete, onToggleFavorite, onTogglePin,
  onStartRename, onRenameChange, onCommitRename,
  onMovePageToBook, onNewPageInBook, onNewSubBook, allBooks, expandedBooks,
}: FolderItemProps) {
  const [hovered, setHovered] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const FolderIco = isExpanded ? FolderOpenIcon : FolderIcon;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const pageId = e.dataTransfer.types.includes('application/x-page-id');
    if (!pageId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const pageId = e.dataTransfer.getData('application/x-page-id');
    if (pageId) onMovePageToBook(pageId, book.id);
  }, [book.id, onMovePageToBook]);

  return (
    <div style={{ marginBottom: 1 }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setDragOver(false); }}
        onClick={() => onToggle(book.id)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 8px 4px 12px',
          paddingLeft: `${12 + depth * 18}px`,
          cursor: 'pointer',
          borderRadius: 5,
          margin: '0 4px',
          transition: 'background 0.1s, outline 0.1s',
          background: dragOver ? `${c.accent}18` : hovered ? c.hover : 'transparent',
          outline: dragOver ? `2px dashed ${c.accent}` : '2px dashed transparent',
          outlineOffset: -2,
        }}
      >
        <ChevronRightIcon style={{
          width: 13,
          height: 13,
          color: c.muted,
          flexShrink: 0,
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s cubic-bezier(0.32,0.72,0,1)',
        }} />
        <FolderIco style={{
          width: 14,
          height: 14,
          color: dragOver ? c.text : c.accent,
          flexShrink: 0,
        }} />
        <span style={{
          flex: 1,
          fontFamily: 'var(--font-sans)',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: c.text,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {book.title}
        </span>
        {hovered && !dragOver ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            {onNewSubBook && (
              <button
                onClick={(e) => { e.stopPropagation(); onNewSubBook(book.id); }}
                title="New sub-notebook"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 3, border: 'none',
                  background: 'transparent', color: c.muted, cursor: 'pointer',
                  padding: 0, flexShrink: 0,
                }}
              >
                <FolderIcon style={{ width: 10, height: 10 }} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onNewPageInBook(book.id); }}
              title="New page in notebook"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: 3, border: 'none',
                background: 'transparent', color: c.muted, cursor: 'pointer',
                padding: 0, flexShrink: 0,
              }}
            >
              <PlusIcon style={{ width: 12, height: 12 }} />
            </button>
          </div>
        ) : !dragOver && (
          <span style={{
            fontSize: '10px',
            fontWeight: 500,
            color: c.muted,
            flexShrink: 0,
            background: c.tabBg,
            borderRadius: 3,
            padding: '1px 5px',
          }}>
            {book.pageIds.length}
          </span>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: CUPERTINO }}
            style={{ overflow: 'hidden', transform: 'translateZ(0)' }}
          >
            {/* Child notebooks (recursive nesting) */}
            {allBooks
              .filter((b) => b.parentId === book.id)
              .map((childBook) => (
                <FolderItem
                  key={childBook.id} c={c} book={childBook}
                  isExpanded={expandedBooks?.has(childBook.id) ?? false}
                  activePageId={activePageId}
                  renamingId={renamingId} renameValue={renameValue}
                  depth={depth + 1}
                  onToggle={onToggle} onSelectPage={onSelectPage}
                  onDelete={onDelete} onToggleFavorite={onToggleFavorite}
                  onTogglePin={onTogglePin} onStartRename={onStartRename}
                  onRenameChange={onRenameChange} onCommitRename={onCommitRename}
                  onMovePageToBook={onMovePageToBook}
                  onNewPageInBook={onNewPageInBook}
                  onNewSubBook={onNewSubBook}
                  allBooks={allBooks}
                  expandedBooks={expandedBooks}
                />
              ))}

            {/* Child pages */}
            {book.pages.map((page) => (
              <FileItem
                key={page.id} c={c} page={page}
                isActive={page.id === activePageId}
                isRenaming={page.id === renamingId}
                renameValue={renameValue} depth={depth + 1}
                onSelect={onSelectPage} onDelete={onDelete}
                onToggleFavorite={onToggleFavorite}
                onTogglePin={onTogglePin}
                onStartRename={onStartRename}
                onRenameChange={onRenameChange}
                onCommitRename={onCommitRename}
                onMovePageToBook={onMovePageToBook}
                allBooks={allBooks}
              />
            ))}
            {book.pages.length === 0 && allBooks.filter((b) => b.parentId === book.id).length === 0 && (
              <div style={{
                padding: '6px 12px 6px 42px',
                paddingLeft: `${42 + depth * 18}px`,
                fontSize: '11px',
                color: c.muted,
                fontStyle: 'italic',
              }}>
                Drop pages here or click + to create
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/* ================================================================== */
/*  File Item (Page)                                                    */
/* ================================================================== */

interface FileItemProps {
  c: ReturnType<typeof t>;
  page: NotePage;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  depth: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onTogglePin: (id: string) => void;
  onStartRename: (id: string, title: string) => void;
  onRenameChange: (val: string) => void;
  onCommitRename: () => void;
  onMovePageToBook?: (pageId: string, targetBookId: string | null) => void;
  allBooks?: (NoteBook & { pages: NotePage[] })[];
}

const FileItem = memo(function FileItem({
  c, page, isActive, isRenaming, renameValue, depth,
  onSelect, onDelete, onToggleFavorite, onTogglePin,
  onStartRename, onRenameChange, onCommitRename,
  onMovePageToBook, allBooks,
}: FileItemProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-page-id', page.id);
    e.dataTransfer.setData('text/plain', page.title);
    setDragging(true);
  }, [page.id, page.title]);

  const handleDragEnd = useCallback(() => setDragging(false), []);

  const paddingLeft = 12 + depth * 18;

  return (
    <div
      draggable={!isRenaming}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!menuOpen) setHovered(false); }}
      onClick={() => { if (!isRenaming) onSelect(page.id); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: `3px 8px 3px ${paddingLeft}px`,
        cursor: dragging ? 'grabbing' : 'pointer',
        borderRadius: 5,
        margin: '0 4px',
        transition: 'background 0.1s, opacity 0.15s',
        background: isActive ? c.active : hovered ? c.hover : 'transparent',
        minHeight: 27,
        opacity: dragging ? 0.45 : 1,
      }}
    >
      {page.icon ? (
        <span style={{ fontSize: '13px', flexShrink: 0, lineHeight: 1 }}>{page.icon}</span>
      ) : page.isJournal ? (
        <CalendarIcon style={{
          width: 13, height: 13,
          color: isActive ? '#34D399' : c.icon,
          flexShrink: 0,
        }} />
      ) : (
        <FileTextIcon style={{
          width: 13, height: 13,
          color: isActive ? c.accent : c.icon,
          flexShrink: 0,
        }} />
      )}

      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename();
            if (e.key === 'Escape') { e.currentTarget.blur(); }
          }}
          onBlur={onCommitRename}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            fontSize: '12px',
            fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            background: c.inputBg,
            border: `1px solid ${c.accent}`,
            borderRadius: 4,
            color: c.text,
            padding: '1px 6px',
            outline: 'none',
            minWidth: 0,
            height: 22,
          }}
        />
      ) : (
        <span style={{
          flex: 1,
          fontFamily: 'var(--font-sans)',
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: c.text,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          opacity: isActive ? 1 : 0.82,
        }}>
          {page.title || 'Untitled'}
        </span>
      )}

      {/* Indicators */}
      {page.pinned && !hovered && (
        <PinIcon style={{ width: 10, height: 10, color: c.accent, flexShrink: 0 }} />
      )}
      {page.favorite && !page.pinned && !hovered && (
        <StarIcon style={{ width: 10, height: 10, color: '#FBBF24', fill: '#FBBF24', flexShrink: 0 }} />
      )}

      {/* Context menu on hover */}
      {(hovered || menuOpen) && !isRenaming && (
        <ItemContextMenu
          c={c} page={page}
          onDelete={onDelete}
          onToggleFavorite={onToggleFavorite}
          onTogglePin={onTogglePin}
          onStartRename={onStartRename}
          onMovePageToBook={onMovePageToBook}
          allBooks={allBooks}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) setHovered(false);
          }}
        />
      )}
    </div>
  );
});

/* ================================================================== */
/*  Journal Item                                                        */
/* ================================================================== */

interface JournalItemProps {
  c: ReturnType<typeof t>;
  page: NotePage;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const JournalItem = memo(function JournalItem({ c, page, isActive, onSelect, onDelete }: JournalItemProps) {
  const [hovered, setHovered] = useState(false);

  // Format journal date nicely
  const dateLabel = useMemo(() => {
    if (!page.journalDate) return page.title;
    const d = new Date(page.journalDate + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (page.journalDate === today.toISOString().slice(0, 10)) return 'Today';
    if (page.journalDate === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  }, [page.journalDate, page.title]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(page.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px 3px 12px',
        cursor: 'pointer',
        borderRadius: 5,
        margin: '0 4px',
        transition: 'background 0.1s',
        background: isActive ? c.active : hovered ? c.hover : 'transparent',
        minHeight: 27,
      }}
    >
      <CalendarIcon style={{
        width: 13, height: 13,
        color: isActive ? '#34D399' : c.icon,
        flexShrink: 0,
      }} />
      <span style={{
        flex: 1,
        fontSize: '13.5px',
        fontWeight: isActive ? 700 : 550,
        color: c.text,
        opacity: isActive ? 1 : 0.82,
      }}>
        {dateLabel}
      </span>
      <span style={{
        fontSize: '10px',
        color: c.muted,
        flexShrink: 0,
      }}>
        {page.journalDate?.slice(5) /* MM-DD */}
      </span>

      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(page.id); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, borderRadius: 3, border: 'none',
            background: 'transparent', color: c.danger, cursor: 'pointer',
            padding: 0, flexShrink: 0,
          }}
        >
          <TrashIcon style={{ width: 11, height: 11 }} />
        </button>
      )}
    </div>
  );
});

/* ================================================================== */
/*  Context Menu                                                        */
/* ================================================================== */

interface ItemContextMenuProps {
  c: ReturnType<typeof t>;
  page: NotePage;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onTogglePin: (id: string) => void;
  onStartRename: (id: string, title: string) => void;
  onMovePageToBook?: (pageId: string, targetBookId: string | null) => void;
  allBooks?: (NoteBook & { pages: NotePage[] })[];
  onOpenChange?: (open: boolean) => void;
}

const ItemContextMenu = memo(function ItemContextMenu({
  c, page, onDelete, onToggleFavorite, onTogglePin, onStartRename,
  onMovePageToBook, allBooks, onOpenChange,
}: ItemContextMenuProps) {
  // Find which book this page is currently in (if any)
  const currentBook = allBooks?.find((b) => b.pageIds.includes(page.id));

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 18, height: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 3, border: 'none',
            background: 'transparent', color: c.muted,
            cursor: 'pointer', flexShrink: 0, padding: 0,
            opacity: 0.65,
          }}
        >
          <MoreHorizontalIcon style={{ width: 13, height: 13 }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        style={{
          minWidth: 150,
          background: c.bg,
          border: `1px solid ${c.border}`,
          borderRadius: 8,
          padding: 4,
          fontSize: '12px',
          backdropFilter: 'blur(12px)',
        }}
      >
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onStartRename(page.id, page.title); }}
          className="gap-2 cursor-pointer"
          style={{ fontSize: '12px', padding: '5px 8px', borderRadius: 4 }}
        >
          <PencilIcon style={{ width: 12, height: 12 }} />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(page.id); }}
          className="gap-2 cursor-pointer"
          style={{ fontSize: '12px', padding: '5px 8px', borderRadius: 4 }}
        >
          <StarIcon style={{
            width: 12, height: 12,
            fill: page.favorite ? '#FBBF24' : 'none',
            color: page.favorite ? '#FBBF24' : 'currentColor',
          }} />
          {page.favorite ? 'Unfavorite' : 'Favorite'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onTogglePin(page.id); }}
          className="gap-2 cursor-pointer"
          style={{ fontSize: '12px', padding: '5px 8px', borderRadius: 4 }}
        >
          <PinIcon style={{
            width: 12, height: 12,
            color: page.pinned ? c.accent : 'currentColor',
          }} />
          {page.pinned ? 'Unpin' : 'Pin to top'}
        </DropdownMenuItem>

        {/* Move to Notebook sub-section */}
        {onMovePageToBook && allBooks && allBooks.length > 0 && (
          <>
            <DropdownMenuSeparator style={{ background: c.border, margin: '3px 0' }} />
            <div style={{
              padding: '3px 8px 2px',
              fontSize: '10px',
              fontWeight: 700,
              color: c.muted,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}>
              Move to
            </div>
            {allBooks.map((book) => {
              const isCurrent = book.id === currentBook?.id;
              return (
                <DropdownMenuItem
                  key={book.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isCurrent) onMovePageToBook(page.id, book.id);
                  }}
                  className="gap-2 cursor-pointer"
                  style={{
                    fontSize: '12px',
                    padding: '5px 8px',
                    borderRadius: 4,
                    opacity: isCurrent ? 0.5 : 1,
                  }}
                >
                  <FolderIcon style={{ width: 12, height: 12, color: c.accent }} />
                  {book.title}
                  {isCurrent && (
                    <span style={{ fontSize: '10px', color: c.muted, marginLeft: 'auto' }}>current</span>
                  )}
                </DropdownMenuItem>
              );
            })}
            {currentBook && (
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onMovePageToBook(page.id, null); }}
                className="gap-2 cursor-pointer"
                style={{ fontSize: '12px', padding: '5px 8px', borderRadius: 4, color: c.muted }}
              >
                <FileIcon style={{ width: 12, height: 12 }} />
                Remove from notebook
              </DropdownMenuItem>
            )}
          </>
        )}

        <DropdownMenuSeparator style={{ background: c.border, margin: '3px 0' }} />
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onDelete(page.id); }}
          className="gap-2 cursor-pointer"
          style={{ fontSize: '12px', padding: '5px 8px', borderRadius: 4, color: c.danger }}
        >
          <TrashIcon style={{ width: 12, height: 12 }} />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

/* ================================================================== */
/*  Search Results                                                      */
/* ================================================================== */

interface SearchResultsProps {
  c: ReturnType<typeof t>;
  results: Array<{
    type: 'page' | 'block';
    pageId: string;
    blockId?: string;
    title: string;
    snippet: string;
    score: number;
  }>;
  query: string;
  activePageId: string | null;
  onSelectPage: (id: string) => void;
}

function SearchResults({ c, results, query, activePageId, onSelectPage }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <EmptyState c={c} message={`No results for \u201c${query}\u201d`} />
    );
  }

  return (
    <div>
      <div style={{ padding: '6px 12px 3px' }}>
        <SectionLabel c={c} label={`${results.length} result${results.length !== 1 ? 's' : ''}`} icon={<SearchIcon style={{ width: 10, height: 10 }} />} />
      </div>
      {results.map((result, idx) => (
        <SearchResultItem
          key={`${result.pageId}-${result.blockId ?? idx}`}
          c={c}
          result={result}
          query={query}
          isActive={result.pageId === activePageId}
          onSelect={onSelectPage}
        />
      ))}
    </div>
  );
}

const SearchResultItem = memo(function SearchResultItem({
  c, result, query, isActive, onSelect,
}: {
  c: ReturnType<typeof t>;
  result: { type: 'page' | 'block'; pageId: string; blockId?: string; title: string; snippet: string; score: number };
  query: string;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(result.pageId)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        padding: '5px 8px 5px 12px',
        margin: '0 4px',
        borderRadius: 5,
        cursor: 'pointer',
        transition: 'background 0.1s',
        background: isActive ? c.active : hovered ? c.hover : 'transparent',
      }}
    >
      <FileTextIcon style={{
        width: 13, height: 13,
        color: isActive ? c.accent : c.icon,
        flexShrink: 0, marginTop: 2,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13.5px', fontWeight: 700, color: c.text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          opacity: isActive ? 1 : 0.85,
        }}>
          {result.title}
        </div>
        {result.snippet && result.type === 'block' && (
          <div
            style={{
              fontSize: '11px', fontWeight: 400, color: c.muted,
              marginTop: 1, lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
            dangerouslySetInnerHTML={{
              __html: highlightQuery(result.snippet, query, c),
            }}
          />
        )}
      </div>
      {result.type === 'block' && (
        <span style={{
          fontSize: '9px', fontWeight: 600, color: c.muted,
          background: c.tabBg, borderRadius: 3, padding: '1px 4px',
          flexShrink: 0, marginTop: 2,
        }}>
          Block
        </span>
      )}
    </div>
  );
});

/* ================================================================== */
/*  Bottom Bar                                                          */
/* ================================================================== */

interface BottomBarProps {
  c: ReturnType<typeof t>;
  onNewPage: () => void;
  onTodayJournal: () => void;
}

const BottomBar = memo(function BottomBar({ c, onNewPage, onTodayJournal }: BottomBarProps) {
  return (
    <div style={{
      padding: '6px 6px',
      borderTop: `1px solid ${c.border}`,
      display: 'flex',
      gap: 3,
      flexShrink: 0,
    }}>
      <BottomButton c={c} onClick={onNewPage} hoverColor={c.text}>
        <PlusIcon style={{ width: 13, height: 13 }} />
        New Page
      </BottomButton>
      <BottomButton c={c} onClick={onTodayJournal} hoverColor={c.accent}>
        <CalendarIcon style={{ width: 13, height: 13 }} />
        Today
      </BottomButton>
    </div>
  );
});

function BottomButton({
  c, onClick, hoverColor, children,
}: {
  c: ReturnType<typeof t>;
  onClick: () => void;
  hoverColor: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        height: 30,
        fontSize: '0.6875rem',
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        borderRadius: 5,
        border: 'none',
        background: hovered ? c.hover : 'transparent',
        color: hovered ? hoverColor : c.muted,
        cursor: 'pointer',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {children}
    </button>
  );
}

/* ================================================================== */
/*  Utilities                                                           */
/* ================================================================== */

function highlightQuery(text: string, query: string, c: ReturnType<typeof t>): string {
  if (!query.trim()) return escapeHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return escapeHtml(text).replace(
    regex,
    `<mark style="background:rgba(244,189,111,0.25);color:${c.text};border-radius:2px;padding:0 1px;">$1</mark>`,
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
