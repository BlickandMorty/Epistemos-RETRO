import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  NetworkIcon, LoaderIcon, SearchIcon, FileTextIcon,
} from 'lucide-react';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';
import { getNodePositions, getFpsCamera } from '@/lib/store/physics-positions';
import type { GraphNode, GraphEdge, NeighborInfo } from '@/lib/bindings';
import { GraphCanvas, GRAPH_QUALITY } from '@/components/graph/graph-canvas';
import { GraphControls } from '@/components/graph/graph-controls';
import { GraphInspector } from '@/components/graph/graph-inspector';
import { GraphSidebar } from '@/components/graph/graph-sidebar';
import { PERF_TIER } from '@/lib/perf';

const QUALITY = GRAPH_QUALITY[PERF_TIER];

// ── Graph page (full-bleed, macOS-style overlay layout) ────────────

export default function GraphPage() {
  const { isDark, isOled } = useIsDark();
  const addToast = usePFCStore((s) => s.addToast);
  const navigate = useNavigate();

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GraphNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [nodeDetails, setNodeDetails] = useState<{ content: string; neighbors: NeighborInfo[] } | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [physicsRunning, setPhysicsRunning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fpsMode, setFpsMode] = useState(false);
  const fpsKeysRef = useRef<Record<string, boolean>>({});

  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const panelBg = isDark ? 'rgba(20,19,24,0.85)' : 'rgba(255,255,255,0.88)';
  const panelBorder = isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)';

  const loadGraph = useCallback(async () => {
    setLoading(true);
    const res = await commands.getGraph();
    if (res.status === 'ok') {
      if (res.data.nodes.length === 0) {
        const rebuild = await commands.rebuildGraph();
        if (rebuild.status === 'ok') {
          setNodes(rebuild.data.nodes);
          setEdges(rebuild.data.edges);
          if (rebuild.data.nodes.length > 0) {
            addToast({ type: 'success', message: `Graph built: ${rebuild.data.nodes.length} nodes` });
          }
          setLoading(false);
          return;
        }
      }
      setNodes(res.data.nodes);
      setEdges(res.data.edges);
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Set physics tick rate based on hardware tier (before starting physics)
  useEffect(() => {
    commands.setPhysicsTargetFps(QUALITY.physicsFps);
  }, []);

  // Auto-start physics when graph loads
  useEffect(() => {
    if (nodes.length > 0 && !physicsRunning) {
      commands.startPhysics().then((res) => {
        if (res.status === 'ok') setPhysicsRunning(true);
      });
    }
    return () => {
      commands.stopPhysics().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length > 0]);

  // Poll physics status
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await commands.isPhysicsRunning();
      if (res.status === 'ok') setPhysicsRunning(res.data);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Search handler
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      const res = await commands.searchHybrid(searchQuery, 20);
      if (res.status === 'ok') {
        const pageIds = new Set(res.data.map((r) => r.page_id));
        setSearchResults(nodes.filter((n) => pageIds.has(n.source_id) || n.label.toLowerCase().includes(searchQuery.toLowerCase())));
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, nodes]);

  const handleSelectNode = useCallback(async (node: GraphNode | null) => {
    setSelectedNode(node);
    setNodeDetails(null);
    if (!node) return;
    const res = await commands.getNodeDetails(node.id);
    if (res.status === 'ok') {
      setNodeDetails({
        content: res.data.content_preview ?? '',
        neighbors: res.data.neighbors ?? [],
      });
    }
  }, []);

  // Type distribution
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of nodes) counts[n.node_type] = (counts[n.node_type] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  // FPS mode: keyboard tracking + input loop
  useEffect(() => {
    if (!fpsMode) return;
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
  }, [fpsMode]);

  // FPS toggle handler
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

  // Global F key for FPS toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (document.activeElement?.tagName === 'INPUT') return;
        toggleFps();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFps]);

  // Zoom to fit
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

  // Controls callbacks
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

  const handleOpenNote = useCallback((sourceId: string) => {
    usePFCStore.getState().setActivePage(sourceId);
    navigate('/notes');
  }, [navigate]);

  return (
    <div style={{ height: '100vh', width: '100%', overflow: 'hidden', position: 'relative', background: isDark ? '#0a0a0e' : '#f5f5f7' }}>
      {/* ── Canvas graph ──────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.75rem' }}>
          <LoaderIcon style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', color: mutedColor }} />
          <span style={{ fontSize: '0.875rem', color: mutedColor }}>Loading graph...</span>
        </div>
      ) : nodes.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
          <NetworkIcon style={{ width: 48, height: 48, opacity: 0.15, color: mutedColor }} />
          <p style={{ fontSize: '0.875rem', color: mutedColor }}>No nodes in graph yet</p>
          <GlassBubbleButton size="sm" onClick={() => navigate('/notes')}>
            <FileTextIcon style={{ width: 12, height: 12 }} /> Create notes to populate the graph
          </GlassBubbleButton>
        </div>
      ) : (
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNode?.id ?? null}
          typeFilter={typeFilter}
          onSelectNode={handleSelectNode}
          isDark={isDark}
        />
      )}

      {/* ── Left sidebar (search + node list) ─────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <GraphSidebar
            nodes={nodes}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchResults={searchResults}
            selectedNodeId={selectedNode?.id ?? null}
            onSelectNode={handleSelectNode}
            isDark={isDark}
            isOled={isOled}
            edgeCount={edges.length}
          />
        )}
      </AnimatePresence>

      {/* ── Right inspector panel ──────────────────────────────── */}
      <GraphInspector
        node={selectedNode}
        details={nodeDetails}
        nodes={nodes}
        onClose={() => setSelectedNode(null)}
        onSelectNeighbor={handleSelectNode}
        onOpenNote={handleOpenNote}
        isDark={isDark}
        isOled={isOled}
      />

      {/* ── Bottom floating controls ───────────────────────────── */}
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

      {/* ── FPS HUD ──────────────────────────────────────────── */}
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

      {/* ── Sidebar toggle (when hidden) ─────────────────────── */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
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
  );
}
