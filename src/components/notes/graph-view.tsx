'use client';

import { memo, useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { select, pointer } from 'd3-selection';
import {
  zoom,
  zoomIdentity,
  type ZoomTransform,
  type D3ZoomEvent,
} from 'd3-zoom';
import { drag, type D3DragEvent } from 'd3-drag';
import { useTheme } from 'next-themes';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import type { Concept } from '@/lib/notes/types';
import { stripHtml } from '@/lib/notes/types';

// ═══════════════════════════════════════════════════════════════════
// Live Concepts View — semantic knowledge graph
// Nodes = concepts extracted from notes (headings, bold terms, links)
// Edges = concepts that co-occur on the same page
// ═══════════════════════════════════════════════════════════════════

// ── Types ──

interface ConceptNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: Concept['type'];
  /** How many pages this concept appears on */
  pageCount: number;
  /** Page IDs where this concept appears */
  pageIds: Set<string>;
  radius: number;
  isHovered: boolean;
}

interface ConceptEdge extends SimulationLinkDatum<ConceptNode> {
  source: ConceptNode | string;
  target: ConceptNode | string;
  /** Number of shared pages */
  weight: number;
}

// ── Colors by concept type ──

const TYPE_COLORS: Record<string, string> = {
  heading:    '#F4BD6F', // warm amber
  'key-term': '#22D3EE', // cyan
  entity:     '#A78BFA', // violet
  definition: '#34D399', // emerald
  custom:     '#FB923C', // orange
};

const TYPE_COLORS_DIM: Record<string, string> = {
  heading:    'rgba(244,189,111,0.5)',
  'key-term': 'rgba(34,211,238,0.5)',
  entity:     'rgba(167,139,250,0.5)',
  definition: 'rgba(52,211,153,0.5)',
  custom:     'rgba(251,146,60,0.5)',
};

const MIN_RADIUS = 5;
const MAX_RADIUS = 22;
const LABEL_FONT = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const LABEL_FONT_BOLD = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// ── Concept extraction helpers ──

function extractConceptsFromBlocks(
  blocks: Array<{ id: string; pageId: string; type: string; content: string; properties: Record<string, string> }>,
): Map<string, { name: string; type: Concept['type']; pageIds: Set<string> }> {
  const conceptMap = new Map<string, { name: string; type: Concept['type']; pageIds: Set<string> }>();

  for (const block of blocks) {
    const text = stripHtml(block.content).trim();
    if (!text || text.length < 2) continue;

    // Headings → concept
    if (block.type === 'heading') {
      const clean = text.replace(/^#{1,3}\s*/, '').trim();
      if (clean.length >= 2 && clean.length <= 80) {
        const key = clean.toLowerCase();
        const existing = conceptMap.get(key);
        if (existing) {
          existing.pageIds.add(block.pageId);
        } else {
          conceptMap.set(key, { name: clean, type: 'heading', pageIds: new Set([block.pageId]) });
        }
      }
    }

    // Bold/strong terms → key-term
    const boldRegex = /<(?:strong|b)>([^<]+)<\/(?:strong|b)>/gi;
    let boldMatch;
    while ((boldMatch = boldRegex.exec(block.content)) !== null) {
      const term = boldMatch[1]!.trim();
      if (term.length >= 2 && term.length <= 60) {
        const key = term.toLowerCase();
        const existing = conceptMap.get(key);
        if (existing) {
          existing.pageIds.add(block.pageId);
        } else {
          conceptMap.set(key, { name: term, type: 'key-term', pageIds: new Set([block.pageId]) });
        }
      }
    }

    // [[wiki links]] → entity
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(text)) !== null) {
      const linked = linkMatch[1]!.trim();
      if (linked.length >= 2 && linked.length <= 60) {
        const key = linked.toLowerCase();
        const existing = conceptMap.get(key);
        if (existing) {
          existing.pageIds.add(block.pageId);
        } else {
          conceptMap.set(key, { name: linked, type: 'entity', pageIds: new Set([block.pageId]) });
        }
      }
    }
  }

  return conceptMap;
}

function buildConceptGraph(
  conceptMap: Map<string, { name: string; type: Concept['type']; pageIds: Set<string> }>,
): { nodes: ConceptNode[]; edges: ConceptEdge[] } {
  // Filter to concepts that appear on at least 1 page
  const entries = Array.from(conceptMap.entries())
    .filter(([, v]) => v.pageIds.size >= 1);

  // Cap at 120 nodes for perf — prioritize multi-page, then heading type
  const sorted = entries.sort(([, a], [, b]) => {
    if (b.pageIds.size !== a.pageIds.size) return b.pageIds.size - a.pageIds.size;
    if (a.type === 'heading' && b.type !== 'heading') return -1;
    if (b.type === 'heading' && a.type !== 'heading') return 1;
    return 0;
  });
  const top = sorted.slice(0, 120);

  // Scale radius by page count
  const maxPages = Math.max(1, ...top.map(([, v]) => v.pageIds.size));

  const nodes: ConceptNode[] = top.map(([key, v]) => ({
    id: key,
    label: v.name,
    type: v.type,
    pageCount: v.pageIds.size,
    pageIds: v.pageIds,
    radius: MIN_RADIUS + ((v.pageIds.size - 1) / Math.max(1, maxPages - 1)) * (MAX_RADIUS - MIN_RADIUS),
    isHovered: false,
  }));

  // Build edges: concepts sharing at least 1 page
  const edges: ConceptEdge[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      let shared = 0;
      for (const pid of a.pageIds) {
        if (b.pageIds.has(pid)) shared++;
      }
      if (shared > 0) {
        edges.push({ source: a.id, target: b.id, weight: shared });
      }
    }
  }

  return { nodes, edges };
}

// ── Component ──

export const GraphView = memo(function GraphView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simulationRef = useRef<Simulation<ConceptNode, ConceptEdge> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const animFrameRef = useRef<number>(0);
  const nodesRef = useRef<ConceptNode[]>([]);

  const [hoveredNode, setHoveredNode] = useState<ConceptNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const noteBlocks = usePFCStore((s) => s.noteBlocks);
  const setActivePage = usePFCStore((s) => s.setActivePage);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark' || resolvedTheme === 'oled' || resolvedTheme === 'cosmic' || resolvedTheme === 'sunset';

  // ── Build concept graph data ──

  const graphData = useMemo(() => {
    const conceptMap = extractConceptsFromBlocks(noteBlocks);
    return buildConceptGraph(conceptMap);
  }, [noteBlocks]);

  // ── Hit-test ──

  const hitTest = useCallback(
    (canvasX: number, canvasY: number, nodes: ConceptNode[]): ConceptNode | null => {
      const t = transformRef.current;
      const simX = (canvasX - t.x) / t.k;
      const simY = (canvasY - t.y) / t.k;

      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i]!;
        const dx = simX - (node.x ?? 0);
        const dy = simY - (node.y ?? 0);
        const hitRadius = node.radius + 4;
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          return node;
        }
      }
      return null;
    },
    [],
  );

  // ── Canvas draw ──

  const draw = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      nodes: ConceptNode[],
      edges: ConceptEdge[],
      width: number,
      height: number,
    ) => {
      const t = transformRef.current;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      // ── Draw edges ──
      for (const edge of edges) {
        const src = edge.source as ConceptNode;
        const tgt = edge.target as ConceptNode;
        if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) continue;

        const isHighlighted = hoveredNode && (src.id === hoveredNode.id || tgt.id === hoveredNode.id);

        ctx.strokeStyle = isHighlighted
          ? (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)')
          : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)');
        ctx.lineWidth = isHighlighted ? Math.min(edge.weight * 1.5, 4) : Math.min(edge.weight, 2.5);

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.stroke();
      }

      // ── Draw nodes ──
      for (const node of nodes) {
        if (node.x == null || node.y == null) continue;

        const color = TYPE_COLORS[node.type] ?? TYPE_COLORS['custom']!;
        const dimColor = TYPE_COLORS_DIM[node.type] ?? TYPE_COLORS_DIM['custom']!;
        const isHovered = hoveredNode?.id === node.id;
        const isConnected = hoveredNode && edges.some((e) => {
          const s = (e.source as ConceptNode).id;
          const t = (e.target as ConceptNode).id;
          return (s === hoveredNode.id && t === node.id) || (t === hoveredNode.id && s === node.id);
        });
        const dimmed = hoveredNode && !isHovered && !isConnected;

        ctx.beginPath();
        ctx.arc(node.x, node.y, isHovered ? node.radius * 1.2 : node.radius, 0, Math.PI * 2);
        ctx.fillStyle = dimmed ? dimColor : color;

        if (isHovered) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 16;
        }
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Outer ring for multi-page concepts
        if (node.pageCount > 1 && !dimmed) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 2, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.3;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // ── Draw labels ──
      if (t.k > 0.4) {
        for (const node of nodes) {
          if (node.x == null || node.y == null) continue;

          const isHovered = hoveredNode?.id === node.id;
          const isConnected = hoveredNode && edges.some((e) => {
            const s = (e.source as ConceptNode).id;
            const tt = (e.target as ConceptNode).id;
            return (s === hoveredNode.id && tt === node.id) || (tt === hoveredNode.id && s === node.id);
          });
          const dimmed = hoveredNode && !isHovered && !isConnected;

          // Only show labels for hovered, connected, or when zoom > 0.7
          if (dimmed && t.k < 1.2) continue;
          if (!isHovered && !isConnected && t.k < 0.7 && node.pageCount < 2) continue;

          ctx.font = isHovered ? LABEL_FONT_BOLD : LABEL_FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          const label = node.label.length > 28
            ? node.label.slice(0, 26) + '\u2026'
            : node.label;

          const yOffset = (isHovered ? node.radius * 1.2 : node.radius) + 5;

          // Text shadow for readability
          ctx.fillStyle = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';
          ctx.fillText(label, node.x + 1, node.y + yOffset + 1);

          ctx.fillStyle = dimmed
            ? (isDark ? 'rgba(200,200,200,0.25)' : 'rgba(0,0,0,0.15)')
            : isHovered
              ? (isDark ? '#fff' : '#000')
              : (isDark ? 'rgba(218,212,200,0.75)' : 'rgba(50,45,40,0.75)');
          ctx.fillText(label, node.x, node.y + yOffset);
        }
      }

      ctx.restore();
    },
    [isDark, hoveredNode],
  );

  // ── Main effect ──

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const { nodes, edges } = graphData;
    nodesRef.current = nodes;

    // Nothing to render
    if (nodes.length === 0) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
      }
      return;
    }

    // ── Canvas sizing ──
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── Force simulation ──
    const simulation = forceSimulation<ConceptNode>(nodes)
      .force(
        'link',
        forceLink<ConceptNode, ConceptEdge>(edges)
          .id((d) => d.id)
          .distance((d) => 60 + 40 / Math.max(1, (d as ConceptEdge).weight))
          .strength((d) => 0.3 + 0.3 * Math.min(1, (d as ConceptEdge).weight / 3)),
      )
      .force('charge', forceManyBody().strength(-120))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collision', forceCollide<ConceptNode>().radius((d) => d.radius + 6))
      .alphaDecay(0.02);

    simulationRef.current = simulation;

    const tick = () => {
      draw(ctx, nodes, edges, width, height);
    };

    simulation.on('tick', () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(tick);
    });

    // ── d3 zoom ──
    const canvasSelection = select<HTMLCanvasElement, unknown>(canvas);

    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 6])
      .on('zoom', (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        transformRef.current = event.transform;
        tick();
      });

    canvasSelection.call(zoomBehavior);

    // ── d3 drag ──
    let draggedNode: ConceptNode | null = null;

    const dragBehavior = drag<HTMLCanvasElement, unknown, ConceptNode | undefined>()
      .subject((event: D3DragEvent<HTMLCanvasElement, unknown, ConceptNode | undefined>) => {
        const [cx, cy] = pointer(event, canvas);
        const found = hitTest(cx, cy, nodes);
        if (!found) return undefined;
        found.x = found.x ?? 0;
        found.y = found.y ?? 0;
        return found;
      })
      .on('start', (event: D3DragEvent<HTMLCanvasElement, unknown, ConceptNode | undefined>) => {
        const subject = event.subject;
        if (!subject) return;
        if (!event.active) simulation.alphaTarget(0.3).restart();
        draggedNode = subject;
        draggedNode.fx = draggedNode.x;
        draggedNode.fy = draggedNode.y;
      })
      .on('drag', (event: D3DragEvent<HTMLCanvasElement, unknown, ConceptNode | undefined>) => {
        if (!draggedNode) return;
        const t = transformRef.current;
        draggedNode.fx = (event.sourceEvent.offsetX - t.x) / t.k;
        draggedNode.fy = (event.sourceEvent.offsetY - t.y) / t.k;
      })
      .on('end', (event: D3DragEvent<HTMLCanvasElement, unknown, ConceptNode | undefined>) => {
        if (!event.active) simulation.alphaTarget(0);
        if (draggedNode) {
          draggedNode.fx = null;
          draggedNode.fy = null;
          draggedNode = null;
        }
      });

    canvasSelection.call(dragBehavior);

    // ── Click: navigate to first page containing this concept ──
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const [cx, cy] = [event.offsetX, event.offsetY];
      const found = hitTest(cx, cy, nodes);
      if (found && found.pageIds.size > 0) {
        const firstPage = Array.from(found.pageIds)[0]!;
        setActivePage(firstPage);
      }
    };

    canvas.addEventListener('click', handleClick);

    // ── Hover / tooltip ──
    const handleMouseMove = (event: MouseEvent) => {
      const [cx, cy] = [event.offsetX, event.offsetY];
      const found = hitTest(cx, cy, nodes);
      if (found) {
        canvas.style.cursor = 'pointer';
        setHoveredNode(found);
        setTooltipPos({ x: event.offsetX, y: event.offsetY });
      } else {
        canvas.style.cursor = 'default';
        setHoveredNode(null);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    const handleMouseLeave = () => {
      setHoveredNode(null);
      canvas.style.cursor = 'default';
    };

    canvas.addEventListener('mouseleave', handleMouseLeave);

    // ── Resize observer ──
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w === 0 || h === 0) continue;
        const newDpr = window.devicePixelRatio || 1;
        canvas.width = w * newDpr;
        canvas.height = h * newDpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const newCtx = canvas.getContext('2d');
        if (newCtx) {
          draw(newCtx, nodes, edges, w, h);
        }
        simulation.force('center', forceCenter(w / 2, h / 2));
        simulation.alpha(0.1).restart();
      }
    });

    resizeObserver.observe(container);

    // ── Cleanup ──
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      simulation.stop();
      simulationRef.current = null;
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      resizeObserver.disconnect();
      canvasSelection.on('.zoom', null);
      canvasSelection.on('.drag', null);
    };
  }, [graphData, draw, hitTest, setActivePage]);

  // ── Render ──

  const bgColor = isDark ? 'rgba(20,19,17,0.96)' : 'rgba(218,212,200,0.96)';
  const borderColor = isDark ? 'rgba(79,69,57,0.25)' : 'rgba(208,196,180,0.25)';
  const hasContent = noteBlocks.length > 0;

  // Legend data
  const legendItems = useMemo(() => {
    const types = new Set(graphData.nodes.map((n) => n.type));
    return Array.from(types).map((type) => ({
      type,
      label: type === 'key-term' ? 'Key Term' : type.charAt(0).toUpperCase() + type.slice(1),
      color: TYPE_COLORS[type] ?? TYPE_COLORS['custom']!,
    }));
  }, [graphData.nodes]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 300,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {hasContent && graphData.nodes.length > 0 ? (
        <>
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
            }}
          />

          {/* Legend */}
          {legendItems.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                display: 'flex',
                gap: '8px',
                padding: '4px 8px',
                borderRadius: 6,
                background: isDark ? 'rgba(20,19,17,0.85)' : 'rgba(255,252,248,0.85)',
                border: `1px solid ${borderColor}`,
                fontSize: '10px',
                fontWeight: 600,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                pointerEvents: 'none',
              }}
            >
              {legendItems.map((item) => (
                <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: item.color,
                  }} />
                  <span style={{ color: isDark ? 'rgba(218,212,200,0.6)' : 'rgba(50,45,40,0.6)' }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Node count badge */}
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              padding: '3px 8px',
              borderRadius: 6,
              background: isDark ? 'rgba(20,19,17,0.85)' : 'rgba(255,252,248,0.85)',
              border: `1px solid ${borderColor}`,
              fontSize: '10px',
              fontWeight: 600,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              color: isDark ? 'rgba(218,212,200,0.5)' : 'rgba(50,45,40,0.5)',
              pointerEvents: 'none',
            }}
          >
            {graphData.nodes.length} concepts
          </div>

          {/* Tooltip */}
          {hoveredNode && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(tooltipPos.x + 14, (containerRef.current?.clientWidth ?? 300) - 180),
                top: tooltipPos.y - 50,
                padding: '6px 10px',
                borderRadius: 8,
                background: isDark
                  ? 'rgba(30,28,25,0.95)'
                  : 'rgba(255,252,248,0.95)',
                border: `1px solid ${borderColor}`,
                color: isDark
                  ? 'rgba(218,212,200,0.9)'
                  : 'rgba(50,45,40,0.9)',
                fontSize: 12,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 'var(--z-dropdown)',
                boxShadow: isDark
                  ? '0 2px 12px rgba(0,0,0,0.5)'
                  : '0 2px 12px rgba(0,0,0,0.12)',
                maxWidth: 220,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{hoveredNode.label}</div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10,
                color: isDark ? 'rgba(200,200,200,0.5)' : 'rgba(0,0,0,0.4)',
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}>
                  <span style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: TYPE_COLORS[hoveredNode.type] ?? '#999',
                    display: 'inline-block',
                  }} />
                  {hoveredNode.type === 'key-term' ? 'Key Term' : hoveredNode.type}
                </span>
                <span>{hoveredNode.pageCount} page{hoveredNode.pageCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            minHeight: 300,
            gap: 8,
            color: isDark
              ? 'rgba(218,212,200,0.4)'
              : 'rgba(50,45,40,0.4)',
            fontSize: 13,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            userSelect: 'none',
          }}
        >
          <span>No concepts found</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            Add headings, bold terms, or [[links]] to your notes
          </span>
        </div>
      )}
    </div>
  );
});
