import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenLineIcon, PlusIcon, ImportIcon, CalendarIcon,
  StarIcon, PinIcon, EyeIcon, PencilIcon, NetworkIcon,
  WrenchIcon, XIcon, FileTextIcon, Maximize2Icon, Minimize2Icon,
  ArrowLeftIcon, SparklesIcon, ListIcon, HistoryIcon,
  LoaderIcon, SearchIcon,
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
import { GraphCanvas, GRAPH_QUALITY } from '@/components/graph/graph-canvas';
import { GraphControls } from '@/components/graph/graph-controls';
import { GraphInspector } from '@/components/graph/graph-inspector';
import { GraphSidebar } from '@/components/graph/graph-sidebar';
import { getNodePositions, getFpsCamera } from '@/lib/store/physics-positions';
import { PERF_TIER } from '@/lib/perf';
import type { NotePage } from '@/lib/notes/types';
import type { GraphNode, GraphEdge, NeighborInfo } from '@/lib/bindings';

const QUALITY = GRAPH_QUALITY[PERF_TIER];

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
  const { isDark, isOled } = useIsDark();
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

  // ── Graph state ─────────────────────────────────────────────────
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphSearchQuery, setGraphSearchQuery] = useState('');
  const [graphSearchResults, setGraphSearchResults] = useState<GraphNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [nodeDetails, setNodeDetails] = useState<{ content: string; neighbors: NeighborInfo[] } | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [physicsRunning, setPhysicsRunning] = useState(false);
  const [graphSidebarOpen, setGraphSidebarOpen] = useState(true);
  const [fpsMode, setFpsMode] = useState(false);
  const [graphSplitPageId, setGraphSplitPageId] = useState<string | null>(null);
  const fpsKeysRef = useRef<Record<string, boolean>>({});

  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const panelBg = isDark ? 'rgba(20,19,24,0.85)' : 'rgba(255,255,255,0.88)';
  const panelBorder = isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)';

  // ── Graph callbacks ─────────────────────────────────────────────

  const loadGraph = useCallback(async () => {
    setGraphLoading(true);
    const res = await commands.getGraph();
    if (res.status === 'ok') {
      if (res.data.nodes.length === 0) {
        const rebuild = await commands.rebuildGraph();
        if (rebuild.status === 'ok') {
          setGraphNodes(rebuild.data.nodes);
          setGraphEdges(rebuild.data.edges);
          if (rebuild.data.nodes.length > 0) {
            addToast({ type: 'success', message: `Graph built: ${rebuild.data.nodes.length} nodes` });
          }
          setGraphLoading(false);
          return;
        }
      }
      setGraphNodes(res.data.nodes);
      setGraphEdges(res.data.edges);
    }
    setGraphLoading(false);
  }, [addToast]);

  const handleSelectNode = useCallback(async (node: GraphNode | null) => {
    if (!node) {
      setSelectedNode(null);
      setNodeDetails(null);
      setGraphSplitPageId(null);
      return;
    }
    setSelectedNode(node);
    setNodeDetails(null);

    // For Note nodes, open split editor
    if (node.node_type === 'Note' && node.source_id) {
      setGraphSplitPageId(node.source_id);
      setActivePage(node.source_id);
    } else {
      setGraphSplitPageId(null);
    }

    try {
      const details = await commands.getNodeDetails(node.id);
      if (details.status === 'ok') {
        setNodeDetails({
          content: details.data.content_preview ?? '',
          neighbors: details.data.neighbors ?? [],
        });
      }
    } catch { /* ignore */ }
  }, [setActivePage]);

  const handleTogglePhysics = useCallback(async () => {
    if (physicsRunning) {
      await commands.stopPhysics();
      setPhysicsRunning(false);
    } else {
      await commands.startPhysics();
      setPhysicsRunning(true);
    }
  }, [physicsRunning]);

  const handleRebuild = useCallback(async () => {
    const res = await commands.rebuildGraph();
    if (res.status === 'ok') {
      addToast({ type: 'success', message: 'Graph rebuilt' });
      await loadGraph();
    }
  }, [addToast, loadGraph]);

  const handleZoomToFit = useCallback(() => {
    const positions = getNodePositions();
    if (positions.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of positions) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    window.dispatchEvent(new CustomEvent('graph-zoom-to-fit', {
      detail: { minX, maxX, minY, maxY },
    }));
  }, []);

  const toggleFps = useCallback(async () => {
    const res = await commands.toggleFpsMode();
    if (res.status === 'ok') {
      const isFps = res.data === 'Fps';
      setFpsMode(isFps);
      const canvas = document.querySelector('canvas');
      if (isFps && canvas) canvas.requestPointerLock();
      else document.exitPointerLock();
    }
  }, []);

  const handleOpenNote = useCallback((sourceId: string) => {
    usePFCStore.getState().setActivePage(sourceId);
    setMode('notes');
  }, [setMode]);

  // Type distribution
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of graphNodes) counts[n.node_type] = (counts[n.node_type] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [graphNodes]);

  // ── Graph effects ───────────────────────────────────────────────

  // Initial load
  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Set physics tick rate based on hardware tier
  useEffect(() => {
    commands.setPhysicsTargetFps(QUALITY.physicsFps);
  }, []);

  // Start/stop physics based on mode
  useEffect(() => {
    if (mode === 'graph' && graphNodes.length > 0) {
      commands.startPhysics().then((res) => {
        if (res.status === 'ok') setPhysicsRunning(true);
      });
    } else if (mode === 'notes') {
      commands.stopPhysics().catch(() => {});
      setPhysicsRunning(false);
    }
    return () => {
      commands.stopPhysics().catch(() => {});
    };
  }, [mode, graphNodes.length]);

  // Poll physics status
  useEffect(() => {
    if (mode !== 'graph') return;
    const interval = setInterval(async () => {
      const res = await commands.isPhysicsRunning();
      if (res.status === 'ok') setPhysicsRunning(res.data);
    }, 3000);
    return () => clearInterval(interval);
  }, [mode]);

  // Search handler
  useEffect(() => {
    if (!graphSearchQuery.trim()) { setGraphSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      const res = await commands.searchHybrid(graphSearchQuery, 20);
      if (res.status === 'ok') {
        const pageIds = new Set(res.data.map((r) => r.page_id));
        setGraphSearchResults(graphNodes.filter((n) => pageIds.has(n.source_id) || n.label.toLowerCase().includes(graphSearchQuery.toLowerCase())));
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [graphSearchQuery, graphNodes]);

  // FPS input loop
  useEffect(() => {
    if (!fpsMode || mode !== 'graph') return;
    const keys = fpsKeysRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') return;
      keys[e.key.toLowerCase()] = e.type === 'keydown';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    let raf: number;
    let mouseDx = 0, mouseDy = 0;
    const onMouse = (e: MouseEvent) => {
      mouseDx += e.movementX;
      mouseDy += e.movementY;
    };
    document.addEventListener('mousemove', onMouse);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const forward = (keys['w'] ? 1 : 0) + (keys['s'] ? -1 : 0);
      const strafe = (keys['d'] ? 1 : 0) + (keys['a'] ? -1 : 0);
      const vertical = (keys[' '] ? 1 : 0) + (keys['shift'] ? -1 : 0);
      commands.fpsInput({ forward, strafe, vertical, mouse_dx: mouseDx, mouse_dy: mouseDy, toggle_stabilization: false });
      mouseDx = 0;
      mouseDy = 0;
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      document.removeEventListener('mousemove', onMouse);
      for (const k in keys) delete keys[k];
    };
  }, [fpsMode, mode]);

  // Global F key for FPS toggle (only in graph mode)
  useEffect(() => {
    if (mode !== 'graph') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (document.activeElement?.tagName === 'INPUT') return;
        toggleFps();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFps, mode]);

  // ── Notes state (continued) ─────────────────────────────────────
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
        background: isDark ? '#0a0a0e' : '#f5f5f7',
      }}>
        {/* Canvas / loading / empty */}
        {graphLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.75rem' }}>
            <LoaderIcon style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', color: mutedColor }} />
            <span style={{ fontSize: '0.875rem', color: mutedColor }}>Loading graph...</span>
          </div>
        ) : graphNodes.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
            <NetworkIcon style={{ width: 48, height: 48, opacity: 0.15, color: mutedColor }} />
            <p style={{ fontSize: '0.875rem', color: mutedColor }}>No nodes in graph yet</p>
            <GlassBubbleButton size="sm" onClick={() => setMode('notes')}>
              <FileTextIcon style={{ width: 12, height: 12 }} /> Create notes to populate the graph
            </GlassBubbleButton>
          </div>
        ) : (
          <GraphCanvas
            nodes={graphNodes}
            edges={graphEdges}
            selectedNodeId={selectedNode?.id ?? null}
            typeFilter={typeFilter}
            onSelectNode={handleSelectNode}
            onDoubleClickNode={(node) => {
              if (node.node_type === 'Note' && node.source_id) {
                setMode('notes');
                setActivePage(node.source_id);
              }
            }}
            isDark={isDark}
          />
        )}

        {/* Split editor panel (slides in from right for Note nodes) */}
        <AnimatePresence>
          {graphSplitPageId && (
            <motion.div
              key="graph-split-editor"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={physicsSpring.chatPanel}
              style={{
                position: 'absolute', top: 0, right: 0, bottom: 0,
                overflow: 'hidden',
                background: panelBg,
                borderLeft: panelBorder,
                backdropFilter: 'blur(24px) saturate(1.5)',
                display: 'flex', flexDirection: 'column',
                zIndex: 20,
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: panelBorder,
                minHeight: 44,
              }}>
                <span style={{
                  fontSize: '0.875rem', fontWeight: 600,
                  color: 'var(--foreground)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {notePages.find((p: NotePage) => p.id === graphSplitPageId)?.title ?? 'Note'}
                </span>
                <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                  <button
                    onClick={() => { setMode('notes'); setActivePage(graphSplitPageId); }}
                    title="Open in Notes mode"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 6,
                      border: 'none', cursor: 'pointer',
                      background: 'transparent',
                      color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Maximize2Icon size={14} />
                  </button>
                  <button
                    onClick={() => setGraphSplitPageId(null)}
                    title="Close editor"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 6,
                      border: 'none', cursor: 'pointer',
                      background: 'transparent',
                      color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              </div>

              {/* BlockEditor */}
              <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
                <BlockEditor pageId={graphSplitPageId} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left sidebar (search + node list) */}
        <AnimatePresence>
          {graphSidebarOpen && (
            <GraphSidebar
              nodes={graphNodes}
              searchQuery={graphSearchQuery}
              onSearchChange={setGraphSearchQuery}
              searchResults={graphSearchResults}
              selectedNodeId={selectedNode?.id ?? null}
              onSelectNode={handleSelectNode}
              isDark={isDark}
              isOled={isOled}
              edgeCount={graphEdges.length}
            />
          )}
        </AnimatePresence>

        {/* Right inspector panel (hidden when split editor is open for Note nodes) */}
        {!graphSplitPageId && (
          <GraphInspector
            node={selectedNode}
            details={nodeDetails}
            nodes={graphNodes}
            onClose={() => setSelectedNode(null)}
            onSelectNeighbor={handleSelectNode}
            onOpenNote={handleOpenNote}
            isDark={isDark}
            isOled={isOled}
          />
        )}

        {/* Bottom floating controls */}
        <GraphControls
          typeCounts={typeCounts}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          physicsRunning={physicsRunning}
          onTogglePhysics={handleTogglePhysics}
          onRebuild={handleRebuild}
          onZoomToFit={handleZoomToFit}
          fpsMode={fpsMode}
          onToggleFps={toggleFps}
          isDark={isDark}
        />

        {/* FPS HUD */}
        {fpsMode && (
          <div style={{
            position: 'absolute', top: '0.75rem', left: '50%', transform: 'translateX(-50%)',
            zIndex: 25, display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.375rem 0.75rem', borderRadius: '0.5rem',
            background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.6875rem',
            fontFamily: 'monospace', backdropFilter: 'blur(8px)',
          }}>
            <span>FPS MODE</span>
            <span style={{ opacity: 0.6 }}>WASD move · Mouse look · Space/Shift up/down · F exit</span>
            {(() => {
              const cam = getFpsCamera();
              if (!cam) return null;
              return (
                <>
                  <span style={{ opacity: 0.6 }}>|</span>
                  <span>Speed: {cam.speed.toFixed(1)}</span>
                  {cam.proximityNode && (
                    <span style={{ color: '#5E9EFF' }}>Near: {cam.proximityNode.node_id.slice(0, 8)}…</span>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Sidebar toggle (when hidden) */}
        {!graphSidebarOpen && (
          <button
            onClick={() => setGraphSidebarOpen(true)}
            style={{
              position: 'absolute', top: '4rem', left: '0.75rem', zIndex: 20,
              width: '2rem', height: '2rem', borderRadius: '0.5rem',
              background: panelBg, backdropFilter: 'blur(20px)',
              border: panelBorder, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: mutedColor,
            }}
          >
            <SearchIcon style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
    </div>
  );
}
