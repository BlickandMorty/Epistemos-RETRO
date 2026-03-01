'use client';

import { useMemo, useRef, useCallback, useState, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import { min, max, bisector } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { line, area, curveMonotoneX } from 'd3-shape';
import { select } from 'd3-selection';
import { brushX } from 'd3-brush';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import {
  RadarIcon,
  TrendingUpIcon,
  BrainIcon,
  RotateCcwIcon,
  GridIcon,
  ThermometerIcon,
} from 'lucide-react';
import {
  smoothEMA,
  computeConfidenceBand,
  computeCorrelationMatrix,
} from '@/lib/viz/d3-processing';

import { usePFCStore } from '@/lib/store/use-pfc-store';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { GlassSection } from '@/components/layout/page-shell';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { useIsDark } from '@/hooks/use-is-dark';

// ---------------------------------------------------------------------------
// Constants & Brand Colors
// ---------------------------------------------------------------------------

const EMBER = '#C15F3C';
const VIOLET = '#6B5CE7';
const GREEN = '#22C55E';
const YELLOW = '#EAB308';
const RED = '#EF4444';
const CYAN = '#06B6D4';
const PINK = '#EC4899';
const TEAL = '#14B8A6';

import { ease } from '@/lib/motion/motion-config';

const CUP = ease.cupertino;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function valToRadius(v: number, max: number) {
  return 20 + Math.max(0, Math.min(1, v)) * (max - 20);
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ---------------------------------------------------------------------------
// AIM-inspired: useResizeObserver hook (from AIM's hooks)
// ---------------------------------------------------------------------------

function useResizeObserver(
  ref: React.RefObject<HTMLDivElement | null>,
  callback: (entry: ResizeObserverEntry) => void,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      if (entries[0]) callback(entries[0]);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, callback]);
}

// ---------------------------------------------------------------------------
// AIM-inspired: D3 Interactive Line Chart (Metrics Explorer pattern)
// Supports: hover crosshair, brush zoom, multi-line, smooth curves
// ---------------------------------------------------------------------------

interface LineChartSeries {
  key: string;
  label: string;
  color: string;
  data: [number, number][]; // [x, y]
}

interface ProcessedLineSeries extends LineChartSeries {
  rawData?: [number, number][];
}

const D3LineChart = memo(function D3LineChart({
  series,
  xLabel = 'Step',
  yLabel = 'Value',
  height = 280,
  showSmoothing = false,
  showConfidenceBands = false,
}: {
  series: LineChartSeries[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
  showSmoothing?: boolean;
  showConfidenceBands?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height });
  const [zoomDomain, setZoomDomain] = useState<{ x: [number, number]; y: [number, number] } | null>(null);
  const [smoothFactor, setSmoothFactor] = useState(0.3);
  const [smoothEnabled, setSmoothEnabled] = useState(false);
  const [bandEnabled, setBandEnabled] = useState(false);
  const [focusedPoint, setFocusedPoint] = useState<{ x: number; seriesIdx: number } | null>(null);
  const brushingRef = useRef(false);

  const margin = { top: 20, right: 20, bottom: 40, left: 56 };

  const resizeCb = useCallback((entry: ResizeObserverEntry) => {
    const w = entry.contentRect.width;
    if (w > 0) setDimensions({ width: w, height });
  }, [height]);

  useResizeObserver(containerRef, resizeCb);

  // Apply smoothing
  const processedSeries = useMemo<ProcessedLineSeries[]>(() => {
    if (!smoothEnabled) return series;
    return series.map((s) => ({
      ...s,
      data: smoothEMA(s.data, smoothFactor),
      rawData: s.data,
    }));
  }, [series, smoothEnabled, smoothFactor]);

  // Compute confidence bands
  const confidenceBands = useMemo(() => {
    if (!bandEnabled) return null;
    return processedSeries.map((s) => ({
      key: s.key,
      color: s.color,
      ...computeConfidenceBand(s.data, 7, 1),
    }));
  }, [processedSeries, bandEnabled]);

  // Compute scales
  const { xScale, yScale, plotW, plotH } = useMemo(() => {
    const pw = dimensions.width - margin.left - margin.right;
    const ph = dimensions.height - margin.top - margin.bottom;

    const allX = processedSeries.flatMap((s) => s.data.map((d) => d[0]));
    let allY = processedSeries.flatMap((s) => s.data.map((d) => d[1]));
    // Include band extremes in scale
    if (confidenceBands) {
      allY = allY.concat(
        confidenceBands.flatMap((b) => [...b.upper.map((d) => d[1]), ...b.lower.map((d) => d[1])]),
      );
    }

    const xDomain = zoomDomain?.x ?? [min(allX) ?? 0, max(allX) ?? 1];
    const yDomain = zoomDomain?.y ?? [
      Math.max(0, (min(allY) ?? 0) - 0.05),
      Math.min(1.5, (max(allY) ?? 1) + 0.05),
    ];

    return {
      xScale: scaleLinear().domain(xDomain).range([0, pw]),
      yScale: scaleLinear().domain(yDomain).range([ph, 0]),
      plotW: pw,
      plotH: ph,
    };
  }, [processedSeries, confidenceBands, dimensions, margin.left, margin.right, margin.top, margin.bottom, zoomDomain]);

  // Generate line paths
  const linePaths = useMemo(() => {
    const lineGen = line<[number, number]>()
      .x((d) => xScale(d[0]))
      .y((d) => yScale(d[1]))
      .curve(curveMonotoneX);

    return processedSeries.map((s) => ({
      ...s,
      path: lineGen(s.data) ?? '',
      rawPath: s.rawData ? (lineGen(s.rawData) ?? '') : undefined,
    }));
  }, [processedSeries, xScale, yScale]);

  // Confidence band paths
  const bandPaths = useMemo(() => {
    if (!confidenceBands) return null;
    const bandAreaGen = area<[number, number]>()
      .x((d) => xScale(d[0]))
      .curve(curveMonotoneX);

    return confidenceBands.map((b, i) => {
      const merged = b.upper.map((u, j) => ({
        x: u[0],
        y0: b.lower[j]?.[1] ?? 0,
        y1: u[1],
      }));
      const bandArea = area<typeof merged[0]>()
        .x((d) => xScale(d.x))
        .y0((d) => yScale(d.y0))
        .y1((d) => yScale(d.y1))
        .curve(curveMonotoneX);
      return { key: b.key, color: b.color, path: bandArea(merged) ?? '' };
    });
  }, [confidenceBands, xScale, yScale]);

  // Area fills (AIM-style gradient areas under lines)
  const areaGen = useMemo(() => {
    return area<[number, number]>()
      .x((d) => xScale(d[0]))
      .y0(plotH)
      .y1((d) => yScale(d[1]))
      .curve(curveMonotoneX);
  }, [xScale, yScale, plotH]);

  // D3 brush (AIM's zoom pattern)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const plotGroup = select(svg).select<SVGGElement>('.brush-group');
    plotGroup.selectAll('.brush').remove();

    const brush = brushX()
      .extent([[0, 0], [plotW, plotH]])
      .on('start', () => { brushingRef.current = true; })
      .on('end', (event) => {
        brushingRef.current = false;
        if (!event.selection) return;
        const [x0, x1] = event.selection as [number, number];
        if (Math.abs(x1 - x0) < 5) return; // AIM: ignore tiny selections
        const newXDomain: [number, number] = [xScale.invert(x0), xScale.invert(x1)];

        const visibleY = processedSeries.flatMap((s) =>
          s.data.filter((d) => d[0] >= newXDomain[0] && d[0] <= newXDomain[1]).map((d) => d[1])
        );
        const yMin = Math.max(0, (min(visibleY) ?? 0) - 0.03);
        const yMax = Math.min(1.5, (max(visibleY) ?? 1) + 0.03);

        setZoomDomain({ x: newXDomain, y: [yMin, yMax] });
        plotGroup.select<SVGGElement>('.brush').call(brush.move, null);
      });

    plotGroup.append('g').attr('class', 'brush').call(brush);

    return () => { plotGroup.selectAll('.brush').remove(); };
  }, [plotW, plotH, xScale, processedSeries]);

  // Hover crosshair handler with RAF throttle (AIM pattern)
  const [hover, setHover] = useState<{ x: number; values: { label: string; color: string; value: number }[] } | null>(null);
  const rafHover = useRef<number>(0);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (brushingRef.current) return;
    cancelAnimationFrame(rafHover.current);
    rafHover.current = requestAnimationFrame(() => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - margin.left;
      const xVal = xScale.invert(mouseX);

      const values = processedSeries.map((s) => {
        const bisect = bisector((d: [number, number]) => d[0]).left;
        const idx = bisect(s.data, xVal);
        const d0 = s.data[idx - 1];
        const d1 = s.data[idx];
        const nearest = !d0 ? d1 : !d1 ? d0 : (xVal - d0[0] > d1[0] - xVal ? d1 : d0);
        return { label: s.label, color: s.color, value: nearest?.[1] ?? 0 };
      });

      setHover({ x: mouseX, values });
    });
  }, [processedSeries, xScale, margin.left]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (brushingRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - margin.left;
    // Toggle focus pin (AIM pattern)
    if (focusedPoint && Math.abs(focusedPoint.x - mouseX) < 10) {
      setFocusedPoint(null);
    } else {
      setFocusedPoint({ x: mouseX, seriesIdx: 0 });
    }
  }, [margin.left, focusedPoint]);

  const xTicks = xScale.ticks(6);
  const yTicks = yScale.ticks(5);

  return (
    <div ref={containerRef} className="w-full relative" style={{ contain: 'layout style', transform: 'translateZ(0)' }}>
      {/* AIM-style controls toolbar */}
      {(showSmoothing || showConfidenceBands) && (
        <div className="flex items-center gap-3 mb-3 px-1 flex-wrap">
          {showSmoothing && (
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={smoothEnabled} onChange={(e) => setSmoothEnabled(e.target.checked)} className="accent-[#C15F3C] h-3 w-3" />
              EMA Smoothing
              {smoothEnabled && (
                <input type="range" min="0.05" max="0.9" step="0.05" value={smoothFactor}
                  onChange={(e) => setSmoothFactor(parseFloat(e.target.value))}
                  className="h-1 w-16 accent-[#C15F3C]" />
              )}
              {smoothEnabled && <span className="font-mono">{smoothFactor.toFixed(2)}</span>}
            </label>
          )}
          {showConfidenceBands && (
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={bandEnabled} onChange={(e) => setBandEnabled(e.target.checked)} className="accent-[#6B5CE7] h-3 w-3" />
              Confidence Bands ({'\u00b1'}1{'\u03c3'})
            </label>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
      >
        <defs>
          {processedSeries.map((s) => (
            <linearGradient key={`grad-${s.key}`} id={`area-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
          <clipPath id="plot-clip">
            <rect x={0} y={0} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Y axis grid */}
          {yTicks.map((t) => (
            <line key={`yg-${t}`} x1={0} y1={yScale(t)} x2={plotW} y2={yScale(t)} stroke="currentColor" strokeOpacity={0.06} />
          ))}
          {/* X axis grid */}
          {xTicks.map((t) => (
            <line key={`xg-${t}`} x1={xScale(t)} y1={0} x2={xScale(t)} y2={plotH} stroke="currentColor" strokeOpacity={0.04} />
          ))}

          {/* Confidence bands (AIM: drawArea) */}
          {bandPaths?.map((b) => (
            <path key={`band-${b.key}`} d={b.path} fill={b.color} fillOpacity={0.12} clipPath="url(#plot-clip)" />
          ))}

          {/* Area fills */}
          {!bandEnabled && processedSeries.map((s) => (
            <path key={`area-${s.key}`} d={areaGen(s.data) ?? ''} fill={`url(#area-grad-${s.key})`} clipPath="url(#plot-clip)" />
          ))}

          {/* Raw lines (dim, when smoothing active) */}
          {smoothEnabled && linePaths.map((lp) => lp.rawPath && (
            <path key={`raw-${lp.key}`} d={lp.rawPath} fill="none" stroke={lp.color} strokeWidth={1} strokeOpacity={0.2} strokeDasharray="3 3" strokeLinecap="round" clipPath="url(#plot-clip)" />
          ))}

          {/* Lines */}
          {linePaths.map((lp) => (
            <path key={`line-${lp.key}`} d={lp.path} fill="none" stroke={lp.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" clipPath="url(#plot-clip)" />
          ))}

          {/* Focus pin (AIM: click to pin) */}
          {focusedPoint && (
            <>
              <line x1={focusedPoint.x} y1={0} x2={focusedPoint.x} y2={plotH} stroke="#C15F3C" strokeOpacity={0.5} strokeWidth={1.5} />
              {processedSeries.map((s, i) => {
                const bisect = bisector((d: [number, number]) => d[0]).left;
                const xVal = xScale.invert(focusedPoint.x);
                const idx = bisect(s.data, xVal);
                const d0 = s.data[idx - 1]; const d1 = s.data[idx];
                const nearest = !d0 ? d1 : !d1 ? d0 : (xVal - d0[0] > d1[0] - xVal ? d1 : d0);
                if (!nearest) return null;
                const cy = yScale(nearest[1]);
                return (
                  <g key={`pin-${i}`}>
                    <circle cx={focusedPoint.x} cy={cy} r={7} fill={s.color} fillOpacity={0.15} stroke={s.color} strokeWidth={2} />
                    <circle cx={focusedPoint.x} cy={cy} r={3} fill={s.color} />
                  </g>
                );
              })}
            </>
          )}

          {/* Hover crosshair */}
          {hover && hover.x >= 0 && hover.x <= plotW && (
            <>
              <line x1={hover.x} y1={0} x2={hover.x} y2={plotH} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="4 2" />
              {hover.values.map((v, i) => {
                const cy = yScale(v.value);
                return (
                  <g key={i}>
                    <circle cx={hover.x} cy={cy} r={5} fill={v.color} fillOpacity={0.2} />
                    <circle cx={hover.x} cy={cy} r={3} fill={v.color} />
                  </g>
                );
              })}
            </>
          )}

          {/* Axes */}
          {yTicks.map((t) => (
            <text key={`yt-${t}`} x={-8} y={yScale(t) + 3} textAnchor="end" fontSize={9} className="fill-muted-foreground" fillOpacity={0.6}>{t.toFixed(2)}</text>
          ))}
          {xTicks.map((t) => (
            <text key={`xt-${t}`} x={xScale(t)} y={plotH + 18} textAnchor="middle" fontSize={9} className="fill-muted-foreground" fillOpacity={0.6}>{t}</text>
          ))}

          <text x={plotW / 2} y={plotH + 34} textAnchor="middle" fontSize={10} className="fill-muted-foreground" fontWeight={500}>{xLabel}</text>
          <text x={-plotH / 2} y={-42} textAnchor="middle" fontSize={10} className="fill-muted-foreground" fontWeight={500} transform="rotate(-90)">{yLabel}</text>

          {/* Brush group */}
          <g className="brush-group" />
        </g>
      </svg>

      {/* Hover tooltip */}
      {hover && hover.x >= 0 && hover.x <= plotW && (
        <div
          className="absolute pointer-events-none bg-card/90 backdrop-blur-sm border border-border/40 rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(hover.x + margin.left + 12, dimensions.width - 140), top: margin.top + 8, transform: 'translateZ(0)' }}
        >
          <div className="font-mono text-muted-foreground/60 mb-1">Step {xScale.invert(hover.x).toFixed(0)}</div>
          {hover.values.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
              <span className="text-muted-foreground">{v.label}</span>
              <span className="font-mono font-medium ml-auto" style={{ color: v.color }}>{v.value.toFixed(4)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Zoom reset */}
      {zoomDomain && (
        <button
          onClick={() => setZoomDomain(null)}
          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-card/80 border border-border/30 text-[10px] text-muted-foreground hover:text-pfc-violet hover:border-pfc-violet/30 transition-colors cursor-pointer"
        >
          <RotateCcwIcon className="h-3 w-3" /> Reset Zoom
        </button>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 px-2 flex-wrap">
        {processedSeries.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-[10px]">
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
          </div>
        ))}
        <span className="text-[9px] text-muted-foreground/40 ml-auto">Drag to zoom {'\u00b7'} Click to pin</span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// AIM-inspired: D3 Force-Directed Concept Graph
// ---------------------------------------------------------------------------

interface ForceGraphNode extends SimulationNodeDatum {
  id: string;
  color: string;
  x: number;
  y: number;
}

interface ForceGraphLink extends SimulationLinkDatum<ForceGraphNode> {
  source: string | ForceGraphNode;
  target: string | ForceGraphNode;
}

const D3ForceGraph = memo(function D3ForceGraph({
  concepts,
  height = 320,
}: {
  concepts: string[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height });
  const [nodes, setNodes] = useState<Array<{ id: string; x: number; y: number; color: string }>>([]);
  const [links, setLinks] = useState<ForceGraphLink[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const COLORS = [EMBER, VIOLET, GREEN, CYAN, YELLOW, PINK, TEAL, RED];

  const resizeCb = useCallback((entry: ResizeObserverEntry) => {
    const w = entry.contentRect.width;
    if (w > 0) setDimensions({ width: w, height });
  }, [height]);

  useResizeObserver(containerRef, resizeCb);

  useEffect(() => {
    if (concepts.length === 0) return;

    const simNodes: ForceGraphNode[] = concepts.map((c, i) => ({
      id: c,
      x: dimensions.width / 2 + (Math.random() - 0.5) * 100,
      y: dimensions.height / 2 + (Math.random() - 0.5) * 100,
      color: COLORS[i % COLORS.length]!,
    }));

    const simLinks: ForceGraphLink[] = [];
    for (let i = 0; i < concepts.length; i++) {
      const next = (i + 1) % concepts.length;
      simLinks.push({ source: concepts[i]!, target: concepts[next]! });
      if (concepts.length > 3) {
        const skip = (i + 2) % concepts.length;
        simLinks.push({ source: concepts[i]!, target: concepts[skip]! });
      }
    }

    const sim = forceSimulation(simNodes)
      .force(
        'link',
        forceLink<ForceGraphNode, ForceGraphLink>(simLinks)
          .id((d) => d.id)
          .distance(80)
          .strength(0.3),
      )
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collision', forceCollide().radius(30))
      .on('tick', () => {
        setNodes(simNodes.map((n) => ({ id: n.id, x: n.x, y: n.y, color: n.color })));
        setLinks([...simLinks]);
      });

    const timer = setTimeout(() => sim.alphaTarget(0).restart(), 3000);

    return () => {
      clearTimeout(timer);
      sim.stop();
    };
    // SAFETY: concepts.join('|') is an inline derived key that ESLint cannot parse;
    // COLORS is a local constant. The simulation must only restart when the concept
    // set or container size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts.join('|'), dimensions.width, dimensions.height]);

  if (concepts.length === 0) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No active concepts</div>;
  }

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const getLinkNodeId = (value: string | ForceGraphNode) => (typeof value === 'string' ? value : value.id);

  return (
    <div ref={containerRef} className="w-full" style={{ contain: 'layout style', transform: 'translateZ(0)' }}>
      <svg width={dimensions.width} height={dimensions.height} className="select-none">
        {links.map((l, i) => {
          const s = nodeMap[getLinkNodeId(l.source)];
          const t = nodeMap[getLinkNodeId(l.target)];
          if (!s || !t) return null;
          const isHighlighted = hoveredNode === s.id || hoveredNode === t.id;
          return <line key={`link-${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={isHighlighted ? VIOLET : 'currentColor'} strokeOpacity={isHighlighted ? 0.4 : 0.08} strokeWidth={isHighlighted ? 2 : 1} />;
        })}

        {nodes.map((n) => {
          const isHovered = hoveredNode === n.id;
          return (
            <g key={n.id} onMouseEnter={() => setHoveredNode(n.id)} onMouseLeave={() => setHoveredNode(null)} className="cursor-pointer">
              {isHovered && <circle cx={n.x} cy={n.y} r={28} fill={n.color} fillOpacity={0.1} />}
              <circle cx={n.x} cy={n.y} r={isHovered ? 18 : 14} fill={n.color} fillOpacity={isHovered ? 0.25 : 0.15} stroke={n.color} strokeWidth={isHovered ? 2 : 1.5} />
              <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="central" fontSize={isHovered ? 9 : 8} fill={n.color} fontWeight={isHovered ? 600 : 500}>
                {n.id.length > 12 ? n.id.slice(0, 11) + '\u2026' : n.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Interactive Signal Radar
// ---------------------------------------------------------------------------

const SIGNAL_KEYS = ['confidence', 'entropy', 'dissonance'] as const;
type SignalKey = typeof SIGNAL_KEYS[number];

function InteractiveSignalRadar({
  confidence, entropy, dissonance, healthScore, overrides, onSignalChange,
}: {
  confidence: number; entropy: number; dissonance: number; healthScore: number;
  overrides: { confidence: number | null; entropy: number | null; dissonance: number | null };
  onSignalChange: (signal: SignalKey, value: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const cx = 150, cy = 150, maxR = 120;
  const axes = [
    { label: 'Confidence', key: 'confidence' as SignalKey, value: overrides.confidence ?? confidence, autoValue: confidence, angle: 0, isOverridden: overrides.confidence !== null, editable: true },
    { label: 'Entropy', key: 'entropy' as SignalKey, value: Math.min(1, overrides.entropy ?? entropy), autoValue: Math.min(1, entropy), angle: 90, isOverridden: overrides.entropy !== null, editable: true },
    { label: 'Dissonance', key: 'dissonance' as SignalKey, value: Math.min(1, overrides.dissonance ?? dissonance), autoValue: Math.min(1, dissonance), angle: 180, isOverridden: overrides.dissonance !== null, editable: true },
    { label: 'Health', key: 'healthScore' as SignalKey | 'healthScore', value: healthScore, autoValue: healthScore, angle: 270, isOverridden: false, editable: false },
  ];

  const autoPoints = axes.map((a) => polar(cx, cy, valToRadius(a.autoValue, maxR), a.angle));
  const autoPolygon = autoPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const points = axes.map((a) => polar(cx, cy, valToRadius(a.value, maxR), a.angle));
  const polygon = points.map((p) => `${p.x},${p.y}`).join(' ');
  const rings = [0.25, 0.5, 0.75, 1];
  const hasAnyOverride = axes.some((a) => a.isOverridden);

  const getSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: -50 + ((clientX - rect.left) / rect.width) * 400, y: -30 + ((clientY - rect.top) / rect.height) * 360 };
  }, []);

  const handlePointerDown = useCallback((index: number, e: React.PointerEvent) => {
    if (!axes[index]?.editable) return; // Health axis is read-only
    e.preventDefault();
    (e.target as SVGElement).setPointerCapture(e.pointerId);
    setDragging(index);
  // SAFETY: axes is read as a guard (editable check) but adding it would re-create
  // the handler on every render, breaking pointer capture and drag stability.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging === null) return;
    const pt = getSvgPoint(e.clientX, e.clientY);
    if (!pt) return;
    const dx = pt.x - cx, dy = pt.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const value = Math.max(0, Math.min(1, (dist - 20) / (maxR - 20)));
    const axis = axes[dragging]!;
    if (axis.editable) onSignalChange(axis.key as SignalKey, Math.round(value * 100) / 100);
  };

  return (
    <svg ref={svgRef} viewBox="-50 -30 400 360" overflow="visible"
      className={cn('w-full max-w-md mx-auto', dragging !== null ? 'cursor-grabbing' : '')}
      onPointerMove={handlePointerMove} onPointerUp={() => setDragging(null)} onPointerLeave={() => setDragging(null)}
      style={{ touchAction: 'none' }}>
      {rings.map((r) => <circle key={r} cx={cx} cy={cy} r={20 + r * (maxR - 20)} fill="none" stroke="currentColor" strokeOpacity={0.1} />)}
      {rings.map((r) => <text key={`r${r}`} x={cx + 4} y={cy - (20 + r * (maxR - 20)) + 3} fontSize={7} className="fill-muted-foreground" fillOpacity={0.4}>{r.toFixed(2)}</text>)}
      {axes.map((a) => { const end = polar(cx, cy, maxR + 4, a.angle); return <line key={a.label} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="currentColor" strokeOpacity={0.15} />; })}
      {hasAnyOverride && <polygon points={autoPolygon} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1.5} strokeDasharray="4 3" />}
      <polygon points={polygon} fill={EMBER} fillOpacity={0.2} stroke={EMBER} strokeWidth={2} />
      {hasAnyOverride && autoPoints.map((p, i) => axes[i]!.isOverridden ? <circle key={`g${i}`} cx={p.x} cy={p.y} r={3} fill="currentColor" fillOpacity={0.2} /> : null)}
      {points.map((p, i) => {
        const isHovered = hoveredPoint === i, isDragging = dragging === i, isOverridden = axes[i]!.isOverridden;
        const canEdit = axes[i]!.editable;
        return (
          <g key={i}>
            {canEdit && (
              <circle cx={p.x} cy={p.y} r={20} fill="transparent" className="cursor-grab"
                onPointerDown={(e) => handlePointerDown(i, e)} onPointerEnter={() => setHoveredPoint(i)} onPointerLeave={() => setHoveredPoint(null)}
                style={{ touchAction: 'none' }} />
            )}
            {!canEdit && (
              <circle cx={p.x} cy={p.y} r={20} fill="transparent"
                onPointerEnter={() => setHoveredPoint(i)} onPointerLeave={() => setHoveredPoint(null)} />
            )}
            {(isHovered || isDragging) && canEdit && <circle cx={p.x} cy={p.y} r={isDragging ? 10 : 8} fill={EMBER} fillOpacity={0.15} stroke={EMBER} strokeOpacity={0.3} />}
            {isOverridden && <circle cx={p.x} cy={p.y} r={7} fill="none" stroke={VIOLET} strokeWidth={1.5} strokeDasharray="2 2" />}
            <circle cx={p.x} cy={p.y} r={isDragging ? 6 : isHovered ? 5.5 : 4} fill={!canEdit ? 'currentColor' : isOverridden ? VIOLET : EMBER} fillOpacity={canEdit ? 1 : 0.5} className={canEdit ? 'cursor-grab' : ''} />
          </g>
        );
      })}
      {axes.map((a) => { const pos = polar(cx, cy, maxR + 30, a.angle); return <text key={a.label} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground" fontSize={11} fontWeight={500} fillOpacity={a.editable ? 1 : 0.5}>{a.label}{a.isOverridden && ' \u270E'}{!a.editable && ' (auto)'}</text>; })}
      {axes.map((a, i) => <text key={`v${i}`} x={points[i]!.x} y={points[i]!.y - 12} textAnchor="middle" fontSize={9} fill={a.isOverridden ? VIOLET : EMBER} fontWeight={600}>{a.value.toFixed(2)}{a.isOverridden && <tspan fontSize={7} fillOpacity={0.6}>{` (auto: ${a.autoValue.toFixed(2)})`}</tspan>}</text>)}
      <text x={cx} y={cy + maxR + 55} textAnchor="middle" fontSize={9} className="fill-muted-foreground" fillOpacity={0.5}>Drag points to manually set signals</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Card wrapper (AIM-inspired chart panel)
// ---------------------------------------------------------------------------

function DashCard({ title, icon: Icon, iconColor, children, className, span = 1 }: {
  title: string; icon: React.ComponentType<{ className?: string }>; iconColor?: string;
  children: React.ReactNode; className?: string; span?: 1 | 2;
}) {
  const { isDark, isOled } = useIsDark();
  return (
    <div
      className={cn('rounded-2xl overflow-hidden', span === 2 && 'md:col-span-2', className)}
      style={{
        contain: 'layout style',
        transform: 'translateZ(0)',
        background: isOled
          ? 'rgba(22,22,22,0.85)'
          : isDark
            ? 'rgba(255,255,255,0.035)'
            : 'rgba(0,0,0,0.025)',
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          borderBottom: `1px solid ${isOled ? 'rgba(255,255,255,0.06)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
        }}
      >
        <span style={{ color: iconColor }}><Icon className="h-3.5 w-3.5 shrink-0" /></span>
        <span className="text-xs font-semibold tracking-wide">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AIM-inspired: D3 Correlation Heat Map
// ---------------------------------------------------------------------------

const D3HeatMap = memo(function D3HeatMap({
  labels,
  matrix,
  height = 300,
}: {
  labels: string[];
  matrix: number[][];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height });
  const [hoveredCell, setHoveredCell] = useState<{ r: number; c: number } | null>(null);

  const margin = { top: 60, right: 20, bottom: 20, left: 80 };

  const resizeCb = useCallback((entry: ResizeObserverEntry) => {
    const w = entry.contentRect.width;
    if (w > 0) setSize({ width: Math.min(w, 500), height: Math.min(w, 500) });
  }, []);

  useResizeObserver(containerRef, resizeCb);

  const n = labels.length;
  const plotW = size.width - margin.left - margin.right;
  const plotH = size.height - margin.top - margin.bottom;
  const cellW = plotW / n;
  const cellH = plotH / n;

  function heatColor(v: number): string {
    // Blue (negative) -> White (zero) -> Ember (positive)
    if (v >= 0) {
      const t = Math.min(1, v);
      const r = Math.round(255 - (255 - 193) * t);
      const g = Math.round(255 - (255 - 95) * t);
      const b = Math.round(255 - (255 - 60) * t);
      return `rgb(${r},${g},${b})`;
    } else {
      const t = Math.min(1, -v);
      const r = Math.round(255 - (255 - 59) * t);
      const g = Math.round(255 - (255 - 130) * t);
      const b = Math.round(255 - (255 - 246) * t);
      return `rgb(${r},${g},${b})`;
    }
  }

  return (
    <div ref={containerRef} className="w-full flex justify-center" style={{ contain: 'layout style', transform: 'translateZ(0)' }}>
      <svg width={size.width} height={size.height} className="select-none">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {matrix.map((row, r) => row.map((val, c) => {
            const isHovered = hoveredCell?.r === r && hoveredCell?.c === c;
            return (
              <g key={`${r}-${c}`}
                onMouseEnter={() => setHoveredCell({ r, c })}
                onMouseLeave={() => setHoveredCell(null)}>
                <rect
                  x={c * cellW} y={r * cellH} width={cellW - 1} height={cellH - 1}
                  rx={3}
                  fill={heatColor(val)}
                  stroke={isHovered ? '#C15F3C' : 'none'}
                  strokeWidth={isHovered ? 2 : 0}
                  className="cursor-pointer"
                />
                <text x={c * cellW + cellW / 2} y={r * cellH + cellH / 2 + 1}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={Math.min(11, cellW / 3.5)}
                  fontWeight={isHovered ? 700 : 500}
                  fill={Math.abs(val) > 0.5 ? 'white' : 'currentColor'}
                  fillOpacity={isHovered ? 1 : 0.7}>
                  {val.toFixed(2)}
                </text>
              </g>
            );
          }))}

          {/* Row labels */}
          {labels.map((l, i) => (
            <text key={`row-${i}`} x={-8} y={i * cellH + cellH / 2 + 1} textAnchor="end" dominantBaseline="central" fontSize={10} className="fill-muted-foreground" fontWeight={500}>{l}</text>
          ))}
          {/* Column labels */}
          {labels.map((l, i) => (
            <text key={`col-${i}`} x={i * cellW + cellW / 2} y={-8} textAnchor="middle" fontSize={10} className="fill-muted-foreground" fontWeight={500} transform={`rotate(-35, ${i * cellW + cellW / 2}, -8)`}>{l}</text>
          ))}
        </g>
      </svg>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TAB_DEFS = [
  { value: 'dashboard', label: 'Dashboard', icon: GridIcon },
  { value: 'metrics', label: 'Metrics Explorer', icon: TrendingUpIcon },
  { value: 'heatmap', label: 'Heat Map', icon: ThermometerIcon },
  { value: 'radar', label: 'Signal Radar', icon: RadarIcon },
  { value: 'concepts', label: 'Force Graph', icon: BrainIcon },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VisualizerView() {
  const confidence = usePFCStore((s) => s.confidence);
  const entropy = usePFCStore((s) => s.entropy);
  const dissonance = usePFCStore((s) => s.dissonance);
  const healthScore = usePFCStore((s) => s.healthScore);
  const activeConcepts = usePFCStore((s) => s.activeConcepts);
  const riskScore = usePFCStore((s) => s.riskScore);
  const userSignalOverrides = usePFCStore((s) => s.userSignalOverrides);
  const setSignalOverride = usePFCStore((s) => s.setSignalOverride);
  const resetAllSignalOverrides = usePFCStore((s) => s.resetAllSignalOverrides);

  const hasOverrides = userSignalOverrides.confidence !== null ||
    userSignalOverrides.entropy !== null ||
    userSignalOverrides.dissonance !== null;

  const handleSignalChange = useCallback((signal: SignalKey, value: number) => {
    setSignalOverride(signal, value);
  }, [setSignalOverride]);

  // Generate simulated time-series data (AIM Metrics Explorer style)
  const signalHistory = useMemo(() => {
    const steps = 50;
    const confData: [number, number][] = [];
    const entData: [number, number][] = [];
    const dissData: [number, number][] = [];
    const healthData: [number, number][] = [];

    let c = Math.max(0.1, confidence - 0.2 + Math.random() * 0.1);
    let e = Math.max(0.05, entropy * 0.5 + Math.random() * 0.2);
    let di = Math.max(0.05, dissonance * 0.3 + Math.random() * 0.15);
    let h = Math.max(0.2, healthScore - 0.15 + Math.random() * 0.1);

    for (let i = 0; i < steps; i++) {
      confData.push([i, c]);
      entData.push([i, Math.min(1, e)]);
      dissData.push([i, Math.min(1, di)]);
      healthData.push([i, h]);

      c += (confidence - c) * 0.06 + (Math.random() - 0.5) * 0.04;
      c = Math.max(0, Math.min(1, c));
      e += (entropy - e) * 0.06 + (Math.random() - 0.5) * 0.05;
      e = Math.max(0, Math.min(1.5, e));
      di += (dissonance - di) * 0.06 + (Math.random() - 0.5) * 0.03;
      di = Math.max(0, Math.min(1, di));
      h += (healthScore - h) * 0.06 + (Math.random() - 0.5) * 0.04;
      h = Math.max(0, Math.min(1, h));
    }

    return [
      { key: 'confidence', label: 'Confidence', color: EMBER, data: confData },
      { key: 'entropy', label: 'Entropy', color: CYAN, data: entData },
      { key: 'dissonance', label: 'Dissonance', color: RED, data: dissData },
      { key: 'health', label: 'Health', color: GREEN, data: healthData },
    ];
  }, [confidence, entropy, dissonance, healthScore]);

  // Heat map correlation matrix
  const heatMapData = useMemo(() => {
    return computeCorrelationMatrix(signalHistory);
  }, [signalHistory]);

  return (
    <>
      {/* Live signal badges */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Badge variant="outline" className="text-xs font-mono">Confidence {confidence.toFixed(2)}</Badge>
        <Badge variant="outline" className="text-xs font-mono">Health {healthScore.toFixed(2)}</Badge>
        <Badge variant="outline" className="text-xs font-mono">Entropy {entropy.toFixed(3)}</Badge>
        <Badge variant="outline" className="text-xs font-mono">Risk {riskScore.toFixed(2)}</Badge>
        {hasOverrides && (
          <GlassBubbleButton color="violet" size="sm" onClick={resetAllSignalOverrides}>
            <RotateCcwIcon className="h-3 w-3" /> Reset Overrides
          </GlassBubbleButton>
        )}
      </div>

      <GlassSection title="Visualizations" className="">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="mb-6 flex w-full overflow-x-auto gap-1 px-1">
            {TAB_DEFS.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.value} value={t.value} className="flex items-center gap-1.5 shrink-0">
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* DASHBOARD -- AIM-style grid overview */}
          <TabsContent value="dashboard">
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: CUP }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ contain: 'layout', transform: 'translateZ(0)' }}>
                <DashCard title="Signal History" icon={TrendingUpIcon} iconColor={EMBER} span={2}>
                  <D3LineChart series={signalHistory} xLabel="Step" yLabel="Value" height={240} />
                </DashCard>
                <DashCard title="Signal Radar" icon={RadarIcon} iconColor={EMBER}>
                  <InteractiveSignalRadar confidence={confidence} entropy={entropy} dissonance={dissonance} healthScore={healthScore} overrides={userSignalOverrides} onSignalChange={handleSignalChange} />
                </DashCard>
                <DashCard title="Concept Network" icon={BrainIcon} iconColor={VIOLET}>
                  <D3ForceGraph concepts={activeConcepts} height={240} />
                </DashCard>
              </div>
            </motion.div>
          </TabsContent>

          {/* METRICS EXPLORER -- AIM-style D3 line chart with smoothing + bands */}
          <TabsContent value="metrics">
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: CUP }}>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUpIcon className="h-4 w-4 text-pfc-ember" />
                  <h3 className="text-base font-semibold">Metrics Explorer</h3>
                  <Badge variant="outline" className="text-[10px]">D3-powered</Badge>
                  <Badge variant="outline" className="text-[10px] border-pfc-violet/30 text-pfc-violet">AIM-enhanced</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Interactive signal time-series with EMA smoothing, confidence bands, hover crosshairs, brush-to-zoom, and click-to-pin focus.
                </p>
                <D3LineChart series={signalHistory} xLabel="Analysis Step" yLabel="Signal Value" height={360} showSmoothing showConfidenceBands />
              </div>
            </motion.div>
          </TabsContent>

          {/* HEAT MAP -- AIM-inspired correlation matrix */}
          <TabsContent value="heatmap">
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: CUP }}>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <ThermometerIcon className="h-4 w-4 text-pfc-ember" />
                  <h3 className="text-base font-semibold">Signal Correlation Heat Map</h3>
                  <Badge variant="outline" className="text-[10px]">D3-powered</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Pearson correlation matrix between signal dimensions. Blue = negative, white = zero, amber = positive.
                </p>
                <D3HeatMap labels={heatMapData.labels.map((l) => l.charAt(0).toUpperCase() + l.slice(1))} matrix={heatMapData.matrix} height={380} />
              </div>
            </motion.div>
          </TabsContent>

          {/* Signal Radar */}
          <TabsContent value="radar">
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: CUP }}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RadarIcon className="h-4 w-4 text-pfc-ember" />
                    <h3 className="text-base font-semibold">Signal Radar</h3>
                    {hasOverrides && <Badge variant="outline" className="ml-2 text-[10px] border-pfc-violet/40 text-pfc-violet">Manual Override Active</Badge>}
                  </div>
                  {hasOverrides && (
                    <GlassBubbleButton color="violet" size="sm" onClick={resetAllSignalOverrides}>
                      <RotateCcwIcon className="h-3 w-3" /> Reset to Auto
                    </GlassBubbleButton>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">Drag the data points to manually override signal values.</p>
                {hasOverrides && (
                  <div className="flex flex-wrap gap-2">
                    {SIGNAL_KEYS.map((key) => {
                      const override = userSignalOverrides[key];
                      if (override === null) return null;
                      const autoVal = key === 'entropy' ? Math.min(1, entropy) : key === 'dissonance' ? Math.min(1, dissonance) : confidence;
                      return (
                        <button key={key} onClick={() => setSignalOverride(key, null)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border border-pfc-violet/30 bg-pfc-violet/5 text-pfc-violet hover:bg-pfc-violet/15 transition-colors cursor-pointer">
                          <span className="font-medium capitalize">{key}</span>
                          <span className="font-mono">{override.toFixed(2)}</span>
                          <span className="text-[9px] opacity-60">(auto: {autoVal.toFixed(2)})</span>
                          <span className="ml-0.5 text-pfc-violet/60">{'\u2715'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <InteractiveSignalRadar confidence={confidence} entropy={entropy} dissonance={dissonance} healthScore={healthScore} overrides={userSignalOverrides} onSignalChange={handleSignalChange} />
              </div>
            </motion.div>
          </TabsContent>

          {/* Force Graph */}
          <TabsContent value="concepts">
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: CUP }}>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <BrainIcon className="h-4 w-4 text-pfc-violet" />
                  <h3 className="text-base font-semibold">Concept Force Graph</h3>
                  <Badge variant="outline" className="text-[10px]">D3-powered</Badge>
                </div>
                <p className="text-sm text-muted-foreground">D3 force-directed concept network. Hover to highlight connections.</p>
                <D3ForceGraph concepts={activeConcepts} height={400} />
              </div>
            </motion.div>
          </TabsContent>

          {/* Harmony -- included in Dashboard view */}
        </Tabs>
      </GlassSection>
    </>
  );
}
