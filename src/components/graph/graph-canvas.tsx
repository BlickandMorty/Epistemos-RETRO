import { useRef, useEffect, useCallback, useMemo } from 'react';
import {
  FileTextIcon, LightbulbIcon, BookOpenIcon, HashIcon, MessageSquareIcon,
  FolderIcon, BoxIcon, QuoteIcon,
} from 'lucide-react';
import { commands } from '@/lib/bindings';
import { getNodePositions, getPhysicsFrameCount } from '@/lib/store/physics-positions';
import type { GraphNode, GraphEdge } from '@/lib/bindings';
import { SpatialGrid } from '@/lib/graph/spatial-index';
import { PERF_TIER } from '@/lib/perf';

// ── Performance-adaptive quality tiers ─────────────────────────────
export const GRAPH_QUALITY = {
  low:  { edgeZoomMin: 0.6, labelZoomMin: 2.0, maxEdgesDrawn: 300,  physicsFps: 30 },
  mid:  { edgeZoomMin: 0.3, labelZoomMin: 0.8, maxEdgesDrawn: 2000, physicsFps: 60 },
  high: { edgeZoomMin: 0.3, labelZoomMin: 0.8, maxEdgesDrawn: 10000, physicsFps: 90 },
} as const;
const QUALITY = GRAPH_QUALITY[PERF_TIER];

// ── Constants ──────────────────────────────────────────────────────

export const NODE_COLORS: Record<string, string> = {
  Note: '#5E9EFF', Chat: '#30D158', Idea: '#FFD60A', Source: '#FF9F0A',
  Folder: '#BF5AF2', Quote: '#FF6482', Tag: '#64D2FF', Block: '#AC8E68',
};

export const NODE_ICONS: Record<string, typeof FileTextIcon> = {
  Note: FileTextIcon, Chat: MessageSquareIcon, Idea: LightbulbIcon,
  Source: BookOpenIcon, Folder: FolderIcon, Quote: QuoteIcon,
  Tag: HashIcon, Block: BoxIcon,
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

// ── Canvas graph renderer ──────────────────────────────────────────

export function GraphCanvas({
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
      // Cap DPR on low-end to reduce pixel fill cost
      const rawDpr = window.devicePixelRatio || 1;
      const dpr = PERF_TIER === 'low' ? Math.min(rawDpr, 1) : rawDpr;
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

      const rawDpr = window.devicePixelRatio || 1;
      const dpr = PERF_TIER === 'low' ? Math.min(rawDpr, 1) : rawDpr;
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

      // ── Draw edges (zoom-aware + perf-tier culling) ──
      if (cam.zoom >= QUALITY.edgeZoomMin) {
        ctx.lineWidth = 0.5 / cam.zoom;
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
        ctx.beginPath();

        let edgesDrawn = 0;
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
            if (++edgesDrawn >= QUALITY.maxEdgesDrawn) break;
          }
        } else {
          // Zoomed in: all visible edges (capped by perf tier)
          for (const edge of edges) {
            const src = posMap.get(edge.source_node_id);
            const tgt = posMap.get(edge.target_node_id);
            if (src && tgt) { ctx.moveTo(src.x, src.y); ctx.lineTo(tgt.x, tgt.y); }
            if (++edgesDrawn >= QUALITY.maxEdgesDrawn) break;
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

        // Glow for selected/hovered (skip on low-end to save fill cost)
        if ((isSelected || isHovered) && PERF_TIER !== 'low') {
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

        // ── Label LOD (perf-tier adaptive) ──
        if (node.label) {
          const showLabel = cam.zoom > QUALITY.labelZoomMin
            ? true
            : cam.zoom > 0.8 && (isSelected || isHovered || node.weight > 3);
          if (showLabel) {
            const fontSize = Math.max(8, 11 / cam.zoom);
            ctx.font = `500 ${fontSize}px -apple-system, system-ui, sans-serif`;
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.65)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(
              node.label.length > 20 ? node.label.slice(0, 18) + '\u2026' : node.label,
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
