'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePFCStore, type ConceptWeight } from '@/lib/store/use-pfc-store';
import { cn } from '@/lib/utils';
import {
  NetworkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Mini force-directed canvas for inline display
// ---------------------------------------------------------------------------

function MiniConceptCanvas({
  concepts,
  conceptWeights,
  height = 140,
}: {
  concepts: string[];
  conceptWeights: Record<string, ConceptWeight>;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  // Cached canvas dimensions from ResizeObserver — avoids getBoundingClientRect per frame
  const sizeRef = useRef({ w: 0, h: 0 });
  const nodesRef = useRef<Array<{
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    weight: number;
    color: string;
  }>>([]);

  const COLORS = ['#C15F3C', '#6B5CE7', '#22C55E', '#06B6D4', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6'];

  // Stable dependency keys to avoid re-creating nodes on every render
  const conceptsKey = concepts.join('|');
  const weightsKey = useMemo(() => {
    return concepts
      .map((c) => {
        const cw = conceptWeights[c];
        return cw ? `${c}:${cw.weight.toFixed(1)}` : `${c}:?`;
      })
      .join(',');
  }, [concepts, conceptWeights]);

  // Build nodes from concepts
  useEffect(() => {
    const nodes = concepts.map((c, i) => {
      const cw = conceptWeights[c];
      const w = cw ? cw.weight * cw.autoWeight : 0.65;
      return {
        id: c,
        x: (Math.random() - 0.5) * 80,
        y: (Math.random() - 0.5) * 60,
        vx: 0,
        vy: 0,
        r: 6 + w * 6,
        weight: w,
        color: COLORS[i % COLORS.length]!,
      };
    });
    nodesRef.current = nodes;
    // SAFETY: conceptsKey and weightsKey are stable derived strings that replace
    // the raw concepts array and conceptWeights object to avoid re-creating nodes
    // on every render. COLORS is a local constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptsKey, weightsKey]);

  const pausedRef = useRef(false);
  const intersectingRef = useRef(true);

  const draw = useCallback(() => {
    if (pausedRef.current || !intersectingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = sizeRef.current.w;
    const H = sizeRef.current.h;
    if (W === 0 || H === 0) { animRef.current = requestAnimationFrame(draw); return; }

    // Only resize canvas buffer when cached dimensions differ
    const targetW = Math.round(W * dpr);
    const targetH = Math.round(H * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2;
    const cy = H / 2;

    timeRef.current += 0.016;
    const t = timeRef.current;
    const nodes = nodesRef.current;

    // Simple force sim
    for (let i = 0; i < nodes.length; i++) {
      let fx = 0, fy = 0;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i]!.x - nodes[j]!.x;
        const dy = nodes[i]!.y - nodes[j]!.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 800 / (dist * dist);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
      // Gravity
      fx -= nodes[i]!.x * 0.015;
      fy -= nodes[i]!.y * 0.015;
      // Gentle movement
      fx += Math.sin(t * 1.5 + i) * 0.1;
      fy += Math.cos(t * 1.5 + i * 0.7) * 0.1;

      nodes[i]!.vx = (nodes[i]!.vx + fx) * 0.9;
      nodes[i]!.vy = (nodes[i]!.vy + fy) * 0.9;
      nodes[i]!.x += nodes[i]!.vx;
      nodes[i]!.y += nodes[i]!.vy;
    }

    ctx.clearRect(0, 0, W, H);

    // Edges between adjacent concepts
    for (let i = 0; i < nodes.length; i++) {
      const j = (i + 1) % nodes.length;
      if (nodes.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(cx + nodes[i]!.x, cy + nodes[i]!.y);
      ctx.lineTo(cx + nodes[j]!.x, cy + nodes[j]!.y);
      ctx.strokeStyle = `rgba(107, 92, 231, 0.12)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Nodes
    for (const node of nodes) {
      const nx = cx + node.x;
      const ny = cy + node.y;
      const pulse = Math.sin(t * 2 + node.x * 0.02) * 1.5;
      const r = node.r + pulse;

      // Glow (simple circle instead of per-frame gradient — perf)
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.arc(nx, ny, r * 2, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Circle
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      ctx.fillStyle = node.color + '50';
      ctx.fill();
      ctx.strokeStyle = node.color + '70';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = node.color;
      ctx.font = '500 7px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = node.id.length > 12 ? node.id.slice(0, 11) + '\u2026' : node.id;
      ctx.fillText(label, nx, ny);
    }

    animRef.current = requestAnimationFrame(draw);
  }, []);

  // Visibility gating: pause canvas when tab hidden or element off-screen
  useEffect(() => {
    const canvas = canvasRef.current;

    // Cache canvas dimensions via ResizeObserver — avoids getBoundingClientRect per frame
    const resizeObs = canvas
      ? new ResizeObserver(([entry]) => {
          const { width, height } = entry!.contentRect;
          sizeRef.current = { w: width, h: height };
        })
      : null;
    if (canvas) {
      // Seed initial size
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      resizeObs?.observe(canvas);
    }

    function handleVisibility() {
      pausedRef.current = document.hidden;
      if (!document.hidden && intersectingRef.current) {
        animRef.current = requestAnimationFrame(draw);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    const observer = canvas
      ? new IntersectionObserver(
          ([entry]) => {
            intersectingRef.current = entry!.isIntersecting;
            if (entry!.isIntersecting && !pausedRef.current) {
              animRef.current = requestAnimationFrame(draw);
            }
          },
          { threshold: 0 },
        )
      : null;
    if (canvas) observer?.observe(canvas);

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      observer?.disconnect();
      resizeObs?.disconnect();
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg bg-background/30"
      style={{ height }}
    />
  );
}

// ---------------------------------------------------------------------------
// Weight slider row
// ---------------------------------------------------------------------------

function ConceptWeightRow({
  cw,
  onAdjust,
  onReset,
}: {
  cw: ConceptWeight;
  onAdjust: (concept: string, delta: number) => void;
  onReset: (concept: string) => void;
}) {
  const effective = (cw.weight * cw.autoWeight).toFixed(2);
  const isModified = Math.abs(cw.weight - 1.0) > 0.01;

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[10px] font-mono text-foreground/80 truncate flex-1 min-w-0">
        {cw.concept}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onAdjust(cw.concept, -0.2)}
          aria-label={`Decrease weight for ${cw.concept}`}
          className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-pfc-red hover:bg-pfc-red/10 transition-colors cursor-pointer"
          disabled={cw.weight <= 0.1}
        >
          <MinusIcon className="h-3 w-3" />
        </button>
        <span
          className={cn(
            'text-[10px] font-mono w-8 text-center',
            isModified ? 'text-pfc-ember font-bold' : 'text-muted-foreground/60',
          )}
        >
          {cw.weight.toFixed(1)}
        </span>
        <button
          onClick={() => onAdjust(cw.concept, 0.2)}
          aria-label={`Increase weight for ${cw.concept}`}
          className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-pfc-green hover:bg-pfc-green/10 transition-colors cursor-pointer"
          disabled={cw.weight >= 2.0}
        >
          <PlusIcon className="h-3 w-3" />
        </button>
        {isModified && (
          <button
            onClick={() => onReset(cw.concept)}
            aria-label={`Reset weight for ${cw.concept}`}
            className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/40 hover:text-pfc-violet transition-colors cursor-pointer"
          >
            <RotateCcwIcon className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
      <span className="text-[9px] font-mono text-muted-foreground/40 w-8 text-right shrink-0">
        ×{cw.queryCount}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Concept Mini-Map — tappable panel in chat messages
// ---------------------------------------------------------------------------

export function ConceptMiniMap({
  messageConcepts,
  className,
}: {
  messageConcepts?: string[];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const conceptWeights = usePFCStore((s) => s.conceptWeights);
  const setConceptWeight = usePFCStore((s) => s.setConceptWeight);
  const resetConceptWeight = usePFCStore((s) => s.resetConceptWeight);
  const activeConcepts = usePFCStore((s) => s.activeConcepts);

  // Use per-message concepts if available, otherwise fall back to global
  const displayConcepts = messageConcepts && messageConcepts.length > 0
    ? messageConcepts
    : activeConcepts;

  if (displayConcepts.length === 0) return null;

  // Get concept weight data for displayed concepts
  const relevantWeights = displayConcepts
    .map((c) => conceptWeights[c])
    .filter((x): x is ConceptWeight => Boolean(x))
    .sort((a, b) => (b.weight * b.autoWeight) - (a.weight * a.autoWeight));

  const handleAdjust = (concept: string, delta: number) => {
    const current = conceptWeights[concept]?.weight ?? 1.0;
    setConceptWeight(concept, current + delta);
  };

  return (
    <div className={cn('rounded-xl border border-border/30 bg-card/30 overflow-hidden', className)}>
      {/* Tappable header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <NetworkIcon className="h-3 w-3 text-pfc-violet shrink-0" />
        <span className="text-[10px] font-medium text-pfc-violet uppercase tracking-wider">
          Concepts
        </span>
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {displayConcepts.slice(0, expanded ? 0 : 4).map((c) => {
            const cw = conceptWeights[c];
            const isHigh = cw && cw.weight > 1.2;
            const isLow = cw && cw.weight < 0.8;
            return (
              <Badge
                key={c}
                variant="secondary"
                className={cn(
                  'text-[8px] px-1.5 py-0',
                  isHigh ? 'bg-pfc-ember/15 text-pfc-ember border-pfc-ember/20' :
                  isLow ? 'bg-muted/60 text-muted-foreground/50' :
                  'bg-pfc-violet/10 text-pfc-violet/80 border-pfc-violet/15',
                )}
              >
                {c.length > 14 ? c.slice(0, 13) + '…' : c}
              </Badge>
            );
          })}
          {!expanded && displayConcepts.length > 4 && (
            <Badge variant="outline" className="text-[8px] px-1.5 py-0 text-muted-foreground/50">
              +{displayConcepts.length - 4}
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUpIcon className="h-3 w-3 text-muted-foreground/50 shrink-0" />
        ) : (
          <ChevronDownIcon className="h-3 w-3 text-muted-foreground/50 shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
            style={{ overflow: 'hidden', transform: 'translateZ(0)' }}
          >
            <div className="px-3 pb-3 space-y-2">
              {/* Mini canvas visualization */}
              <MiniConceptCanvas
                concepts={displayConcepts}
                conceptWeights={conceptWeights}
                height={120}
              />

              {/* Weight controls */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 font-medium">
                    Importance Weights
                  </span>
                  <span className="text-[8px] text-muted-foreground/30">
                    adjust to bias AI focus
                  </span>
                </div>
                <div className="space-y-0.5">
                  {relevantWeights.length > 0 ? (
                    relevantWeights.map((cw) => (
                      <ConceptWeightRow
                        key={cw.concept}
                        cw={cw}
                        onAdjust={handleAdjust}
                        onReset={resetConceptWeight}
                      />
                    ))
                  ) : (
                    displayConcepts.map((c) => (
                      <div key={c} className="flex items-center gap-2 py-1">
                        <span className="text-[10px] font-mono text-foreground/60 truncate flex-1">
                          {c}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/40">
                          1.0
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
