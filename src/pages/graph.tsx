import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  NetworkIcon, LoaderIcon, SearchIcon, RefreshCwIcon,
  FileTextIcon, LightbulbIcon, BookOpenIcon, HashIcon, MessageSquareIcon,
  FolderIcon, BoxIcon, QuoteIcon, PlayIcon, PauseIcon, XIcon,
  CalendarIcon, LinkIcon, Maximize2Icon, CrosshairIcon,
} from 'lucide-react';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { Input } from '@/components/ui/input';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';
import { getNodePositions, getPhysicsFrameCount, getFpsCamera } from '@/lib/store/physics-positions';
import { physicsSpring } from '@/lib/motion/motion-config';
import type { GraphNode, GraphEdge, NeighborInfo } from '@/lib/bindings';
import { SpatialGrid } from '@/lib/graph/spatial-index';

// ── Constants ──────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  Note: '#5E9EFF', Chat: '#30D158', Idea: '#FFD60A', Source: '#FF9F0A',
  Folder: '#BF5AF2', Quote: '#FF6482', Tag: '#64D2FF', Block: '#AC8E68',
};

const NODE_ICONS: Record<string, typeof FileTextIcon> = {
  Note: FileTextIcon, Chat: MessageSquareIcon, Idea: LightbulbIcon,
  Source: BookOpenIcon, Folder: FolderIcon, Quote: QuoteIcon,
  Tag: HashIcon, Block: BoxIcon,
};

// ── Canvas graph renderer ──────────────────────────────────────────

function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  typeFilter,
  onSelectNode,
  isDark,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  typeFilter: string | null;
  onSelectNode: (node: GraphNode | null) => void;
  isDark: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera state (not React state — mutated in animation loop)
  const camRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null);
  const nodeDragRef = useRef<{ nodeId: string } | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const gridRef = useRef(new SpatialGrid(80));

  // Build lookup maps
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const visibleNodeIds = useMemo(() => {
    if (!typeFilter) return new Set(nodes.map((n) => n.id));
    return new Set(nodes.filter((n) => n.node_type === typeFilter).map((n) => n.id));
  }, [nodes, typeFilter]);

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  // Render loop — optimized with viewport culling, label LOD, edge culling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    let lastFrame = 0;

    const render = () => {
      raf = requestAnimationFrame(render);

      const currentFrame = getPhysicsFrameCount();
      if (currentFrame === lastFrame && !dragRef.current) return;
      lastFrame = currentFrame;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width;
      const h = canvas.height;
      const cam = camRef.current;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      ctx.setTransform(
        cam.zoom * dpr, 0, 0, cam.zoom * dpr,
        w / 2 + cam.x * dpr, h / 2 + cam.y * dpr,
      );

      const positions = getNodePositions();
      if (positions.length === 0) return;

      // ── Viewport culling bounds ──
      const halfW = (w / dpr) / (2 * cam.zoom);
      const halfH = (h / dpr) / (2 * cam.zoom);
      const viewCx = -cam.x / cam.zoom;
      const viewCy = -cam.y / cam.zoom;
      const pad = 40; // padding in world coords for labels/glow
      const minX = viewCx - halfW - pad;
      const maxX = viewCx + halfW + pad;
      const minY = viewCy - halfH - pad;
      const maxY = viewCy + halfH + pad;

      // Build visible position lookup with frustum cull
      const posMap = new Map<string, { x: number; y: number }>();
      const gridPositions: { id: string; x: number; y: number }[] = [];
      for (const p of positions) {
        if (!visibleNodeIds.has(p.id)) continue;
        if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
        posMap.set(p.id, { x: p.x, y: p.y });
        gridPositions.push(p);
      }

      // Rebuild spatial index for hit testing
      gridRef.current.rebuild(gridPositions);

      // ── Draw edges (zoom-aware culling) ──
      if (cam.zoom >= 0.3) {
        ctx.lineWidth = 0.5 / cam.zoom;
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
        ctx.beginPath();

        if (cam.zoom < 0.8) {
          // Zoomed out: only edges connected to selected/hovered node
          const showEdgesFor = new Set<string>();
          if (selectedNodeId) showEdgesFor.add(selectedNodeId);
          if (hoveredRef.current) showEdgesFor.add(hoveredRef.current);
          for (const edge of edges) {
            if (!showEdgesFor.has(edge.source_node_id) && !showEdgesFor.has(edge.target_node_id)) continue;
            const src = posMap.get(edge.source_node_id);
            const tgt = posMap.get(edge.target_node_id);
            if (src && tgt) { ctx.moveTo(src.x, src.y); ctx.lineTo(tgt.x, tgt.y); }
          }
        } else {
          // Zoomed in: all visible edges
          for (const edge of edges) {
            const src = posMap.get(edge.source_node_id);
            const tgt = posMap.get(edge.target_node_id);
            if (src && tgt) { ctx.moveTo(src.x, src.y); ctx.lineTo(tgt.x, tgt.y); }
          }
        }
        ctx.stroke();
      }

      // ── Draw nodes ──
      for (const [nodeId, pos] of posMap) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;

        const baseRadius = Math.max(2, Math.min(8, Math.sqrt(node.weight) * 0.5));
        const isSelected = nodeId === selectedNodeId;
        const isHovered = nodeId === hoveredRef.current;
        const r = isSelected ? baseRadius * 1.4 : isHovered ? baseRadius * 1.2 : baseRadius;
        const color = NODE_COLORS[node.node_type] ?? '#888';

        // Glow for selected/hovered
        if (isSelected || isHovered) {
          const [cr, cg, cb] = hexToRgb(color);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r + 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${isSelected ? 0.25 : 0.15})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = isSelected ? 1 : 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;

        // ── Label LOD (3 tiers) ──
        if (node.label) {
          const showLabel = cam.zoom > 1.5
            || (cam.zoom > 0.8 && (isSelected || isHovered || node.weight > 3))
            // zoom < 0.8: no labels
          ;
          if (showLabel) {
            const fontSize = Math.max(8, 11 / cam.zoom);
            ctx.font = `500 ${fontSize}px -apple-system, system-ui, sans-serif`;
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.65)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(
              node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label,
              pos.x, pos.y + r + 3,
            );
          }
        }
      }
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges, nodeMap, visibleNodeIds, selectedNodeId, isDark]);

  // Mouse handlers
  const worldFromScreen = useCallback((sx: number, sy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cam = camRef.current;
    return {
      x: (sx - rect.left - rect.width / 2 - cam.x) / cam.zoom,
      y: (sy - rect.top - rect.height / 2 - cam.y) / cam.zoom,
    };
  }, []);

  const findNodeAt = useCallback((wx: number, wy: number): GraphNode | null => {
    // O(1) spatial index lookup instead of O(n) scan
    const hit = gridRef.current.queryNearest(wx, wy, 14);
    if (!hit) return null;
    return nodeMap.get(hit.id) ?? null;
  }, [nodeMap]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = worldFromScreen(e.clientX, e.clientY);
    const hit = findNodeAt(x, y);
    if (hit) {
      // Node drag — pin the node in physics
      nodeDragRef.current = { nodeId: hit.id };
      commands.pinNode(hit.id);
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = 'grabbing';
    } else {
      // Camera pan
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        camX: camRef.current.x,
        camY: camRef.current.y,
      };
    }
  }, [worldFromScreen, findNodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (nodeDragRef.current) {
      // Move dragged node in world coords
      const { x, y } = worldFromScreen(e.clientX, e.clientY);
      commands.moveNode(nodeDragRef.current.nodeId, x, y, 0);
    } else if (dragRef.current) {
      camRef.current.x = dragRef.current.camX + (e.clientX - dragRef.current.startX);
      camRef.current.y = dragRef.current.camY + (e.clientY - dragRef.current.startY);
    } else {
      const { x, y } = worldFromScreen(e.clientX, e.clientY);
      const hit = findNodeAt(x, y);
      hoveredRef.current = hit?.id ?? null;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = hit ? 'pointer' : 'grab';
    }
  }, [worldFromScreen, findNodeAt]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (nodeDragRef.current) {
      commands.unpinNode(nodeDragRef.current.nodeId);
      nodeDragRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = 'grab';
    } else if (dragRef.current) {
      const dx = Math.abs(e.clientX - dragRef.current.startX);
      const dy = Math.abs(e.clientY - dragRef.current.startY);
      // Click (not drag)
      if (dx < 4 && dy < 4) {
        const { x, y } = worldFromScreen(e.clientX, e.clientY);
        const hit = findNodeAt(x, y);
        onSelectNode(hit);
      }
      dragRef.current = null;
    }
  }, [worldFromScreen, findNodeAt, onSelectNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    camRef.current.zoom = Math.max(0.1, Math.min(5, camRef.current.zoom * factor));
  }, []);

  // Listen for zoom-to-fit events from parent
  useEffect(() => {
    const handler = (e: Event) => {
      const { minX, maxX, minY, maxY } = (e as CustomEvent).detail;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const rangeX = maxX - minX + 100;
      const rangeY = maxY - minY + 100;
      const zoom = Math.min((canvas.width / dpr) / rangeX, (canvas.height / dpr) / rangeY, 2);
      camRef.current = { x: -cx * zoom, y: -cy * zoom, zoom };
    };
    window.addEventListener('graph-zoom-to-fit', handler);
    return () => window.removeEventListener('graph-zoom-to-fit', handler);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0 }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

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
      setNodes(res.data.nodes);
      setEdges(res.data.edges);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Auto-start physics when graph loads
  useEffect(() => {
    if (nodes.length > 0 && !physicsRunning) {
      commands.startPhysics().then((res) => {
        if (res.status === 'ok') setPhysicsRunning(true);
      });
    }
    return () => {
      // Stop physics when leaving the page
      commands.stopPhysics().catch(() => {});
    };
    // Only run on mount and when nodes first load
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
        // Match search results (page_id) to graph nodes (source_id)
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
      if (e.key === 'f' || e.key === 'F') return; // handled by toggle
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
      // Clear all keys
      for (const k in keys) delete keys[k];
    };
  }, [fpsMode]);

  // FPS toggle handler
  const toggleFps = useCallback(async () => {
    const res = await commands.toggleFpsMode();
    if (res.status === 'ok') {
      const isFps = res.data === 'Fps';
      setFpsMode(isFps);
      // Pointer lock for mouse look
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
    // We can't access camRef inside GraphCanvas from here, but we can
    // use a custom event that GraphCanvas listens for.
    window.dispatchEvent(new CustomEvent('graph-zoom-to-fit', {
      detail: { minX, maxX, minY, maxY },
    }));
  }, []);

  const displayNodes = searchQuery.trim() ? searchResults : nodes;

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
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={physicsSpring.chatPanel}
            style={{
              position: 'absolute', top: '4rem', left: '0.75rem', bottom: '4.5rem',
              width: '16rem', zIndex: 20,
              background: panelBg, backdropFilter: 'blur(24px) saturate(1.5)',
              border: panelBorder, borderRadius: '0.75rem',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Search */}
            <div style={{ padding: '0.625rem', borderBottom: panelBorder }}>
              <div style={{ position: 'relative' }}>
                <SearchIcon style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: mutedColor, pointerEvents: 'none' }} />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search nodes..."
                  style={{
                    paddingLeft: '1.75rem', fontSize: '0.75rem', height: '2rem',
                    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    borderRadius: '0.5rem',
                  }}
                />
              </div>
            </div>

            {/* Node list */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0.25rem' }}>
              {displayNodes.slice(0, 80).map((node) => {
                const Icon = NODE_ICONS[node.node_type] ?? BoxIcon;
                const isActive = selectedNode?.id === node.id;
                return (
                  <button
                    key={node.id}
                    onClick={() => handleSelectNode(node)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.375rem',
                      padding: '0.375rem 0.5rem', borderRadius: '0.375rem',
                      border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                      background: isActive
                        ? (isDark ? 'rgba(94,158,255,0.12)' : 'rgba(94,158,255,0.08)')
                        : 'transparent',
                      color: 'inherit', fontSize: '0.75rem',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Icon style={{ width: 12, height: 12, color: NODE_COLORS[node.node_type] ?? mutedColor, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {node.label}
                    </span>
                  </button>
                );
              })}
              {displayNodes.length > 80 && (
                <p style={{ fontSize: '0.625rem', color: mutedColor, padding: '0.375rem', textAlign: 'center' }}>
                  +{displayNodes.length - 80} more
                </p>
              )}
              {displayNodes.length === 0 && (
                <p style={{ fontSize: '0.75rem', color: mutedColor, padding: '1rem', textAlign: 'center' }}>
                  {searchQuery ? 'No matches' : 'No nodes'}
                </p>
              )}
            </div>

            {/* Stats footer */}
            <div style={{ padding: '0.5rem 0.625rem', borderTop: panelBorder, fontSize: '0.625rem', color: mutedColor, display: 'flex', gap: '0.75rem' }}>
              <span>{nodes.length} nodes</span>
              <span>{edges.length} edges</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Right inspector panel ──────────────────────────────── */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={physicsSpring.card}
            style={{
              position: 'absolute', top: '4rem', right: '0.75rem',
              width: '18rem', maxHeight: 'calc(100vh - 8rem)', zIndex: 20,
              background: panelBg, backdropFilter: 'blur(24px) saturate(1.5)',
              border: panelBorder, borderRadius: '0.75rem',
              overflow: 'auto', padding: '1rem',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {(() => { const Icon = NODE_ICONS[selectedNode.node_type] ?? BoxIcon; return <Icon style={{ width: 16, height: 16, color: NODE_COLORS[selectedNode.node_type] ?? mutedColor, flexShrink: 0, marginTop: 2 }} />; })()}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {selectedNode.label}
                </h3>
                <div style={{ fontSize: '0.6875rem', color: mutedColor, marginTop: '0.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ color: NODE_COLORS[selectedNode.node_type] }}>{selectedNode.node_type}</span>
                  <span>wt: {selectedNode.weight.toFixed(1)}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: mutedColor, padding: 2, flexShrink: 0 }}
              >
                <XIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* Created date */}
            {selectedNode.created_at > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.625rem', color: mutedColor, marginBottom: '0.75rem' }}>
                <CalendarIcon style={{ width: 10, height: 10 }} />
                {new Date(selectedNode.created_at).toLocaleDateString()}
              </div>
            )}

            {/* Content preview */}
            {nodeDetails?.content && (
              <div style={{
                fontSize: '0.6875rem', color: mutedColor, marginBottom: '0.75rem',
                padding: '0.5rem', borderRadius: '0.5rem', lineHeight: 1.5,
                background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                maxHeight: '8rem', overflow: 'auto',
              }}>
                {nodeDetails.content.slice(0, 400)}
                {nodeDetails.content.length > 400 && '…'}
              </div>
            )}

            {/* Connections */}
            {nodeDetails?.neighbors && nodeDetails.neighbors.length > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.625rem', color: mutedColor, marginBottom: '0.375rem' }}>
                  <LinkIcon style={{ width: 10, height: 10 }} />
                  {nodeDetails.neighbors.length} connections
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                  {nodeDetails.neighbors.slice(0, 8).map((nb) => {
                    const neighbor = nodes.find((n) => n.id === nb.node_id);
                    const NIcon = NODE_ICONS[nb.node_type] ?? BoxIcon;
                    return (
                      <button
                        key={nb.node_id}
                        onClick={() => { if (neighbor) handleSelectNode(neighbor); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.375rem',
                          padding: '0.25rem 0.375rem', borderRadius: '0.25rem',
                          border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                          background: 'transparent', color: 'inherit', fontSize: '0.6875rem',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <NIcon style={{ width: 10, height: 10, color: NODE_COLORS[nb.node_type] ?? mutedColor }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {nb.label}
                        </span>
                        <span style={{ fontSize: '0.5625rem', color: mutedColor, flexShrink: 0 }}>{nb.edge_type}</span>
                      </button>
                    );
                  })}
                  {nodeDetails.neighbors.length > 8 && (
                    <span style={{ fontSize: '0.625rem', color: mutedColor, padding: '0.125rem 0.375rem' }}>
                      +{nodeDetails.neighbors.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {selectedNode.node_type === 'Note' && (
                <GlassBubbleButton
                  onClick={() => {
                    usePFCStore.getState().setActivePage(selectedNode.source_id);
                    navigate('/notes');
                  }}
                  size="sm"
                >
                  <FileTextIcon style={{ width: 12, height: 12 }} /> Open
                </GlassBubbleButton>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom floating controls ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={physicsSpring.chatEnter}
        style={{
          position: 'absolute', bottom: '0.75rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, display: 'flex', alignItems: 'center', gap: '0.25rem',
          padding: '0.3125rem', borderRadius: '9999px',
          background: isDark ? 'rgba(20,19,24,0.88)' : 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          border: panelBorder,
        }}
      >
        {/* Type filter pills */}
        <GlassBubbleButton size="sm" active={typeFilter === null} onClick={() => setTypeFilter(null)}>
          All
        </GlassBubbleButton>
        {typeCounts.map(([type, count]) => {
          const Icon = NODE_ICONS[type] ?? BoxIcon;
          return (
            <GlassBubbleButton
              key={type}
              size="sm"
              active={typeFilter === type}
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
            >
              <Icon style={{ width: 10, height: 10, color: NODE_COLORS[type] ?? mutedColor }} />
              {count}
            </GlassBubbleButton>
          );
        })}

        {/* Divider */}
        <div style={{ width: 1, height: '1.25rem', background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', margin: '0 0.125rem' }} />

        {/* Physics toggle */}
        <GlassBubbleButton
          size="sm"
          active={physicsRunning}
          onClick={async () => {
            if (physicsRunning) {
              await commands.stopPhysics();
              setPhysicsRunning(false);
            } else {
              await commands.startPhysics();
              setPhysicsRunning(true);
            }
          }}
        >
          {physicsRunning ? <PauseIcon style={{ width: 10, height: 10 }} /> : <PlayIcon style={{ width: 10, height: 10 }} />}
        </GlassBubbleButton>

        {/* Rebuild */}
        <GlassBubbleButton
          size="sm"
          onClick={async () => {
            const res = await commands.rebuildGraph();
            if (res.status === 'ok') {
              addToast({ type: 'success', message: 'Graph rebuilt' });
              await loadGraph();
            }
          }}
        >
          <RefreshCwIcon style={{ width: 10, height: 10 }} />
        </GlassBubbleButton>

        {/* Zoom to fit */}
        <GlassBubbleButton size="sm" onClick={handleZoomToFit}>
          <Maximize2Icon style={{ width: 10, height: 10 }} />
        </GlassBubbleButton>

        {/* FPS mode */}
        <GlassBubbleButton size="sm" active={fpsMode} onClick={toggleFps}>
          <CrosshairIcon style={{ width: 10, height: 10 }} />
        </GlassBubbleButton>
      </motion.div>

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
