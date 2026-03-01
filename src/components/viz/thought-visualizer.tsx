'use client';

import { memo, useEffect, useRef, useCallback } from 'react';
import { usePFCStore, type PFCState } from '@/lib/store/use-pfc-store';

// ═══════════════════════════════════════════════════════════════════
// Thought Visualizer — Canvas-Based Neural Tree
//
// Renders the LLM's thinking as a growing tree with light pulses.
// Reasoning tokens stream in real-time from <think> blocks and get
// parsed into thought segments, each becoming a node in the tree.
// When no live reasoning is available, builds from pipeline stages.
// ═══════════════════════════════════════════════════════════════════

interface ThoughtVisualizerProps {
  isDark: boolean;
}

// ── Thought segment types & classification ────────────────────

type ThoughtType = 'query' | 'reasoning' | 'evidence' | 'conclusion' | 'uncertainty' | 'question';

const TYPE_COLORS: Record<ThoughtType, string> = {
  query: '#E07850',
  reasoning: 'var(--pfc-accent)',
  evidence: '#34D399',
  conclusion: '#22D3EE',
  uncertainty: '#FBBF24',
  question: '#F87171',
};

const TYPE_LABELS: Record<ThoughtType, string> = {
  query: 'QUERY',
  reasoning: 'REASON',
  evidence: 'EVIDENCE',
  conclusion: 'CONCLUDE',
  uncertainty: 'UNCERTAIN',
  question: 'QUESTION',
};

function classifySegment(text: string): ThoughtType {
  const lower = text.toLowerCase();
  if (/\?/.test(text) && (
    /what if|could|whether|how|why|should|is it|does/i.test(lower)
  )) return 'question';
  if (/therefore|so\b|thus|conclude|in summary|means that|this shows|result/i.test(lower)) return 'conclusion';
  if (/stud(y|ies)|evidence|data|research|found|observed|measured|experiment|\d+%/i.test(lower)) return 'evidence';
  if (/but|however|unclear|uncertain|unknown|might|possibly|debatable|not sure|hard to/i.test(lower)) return 'uncertainty';
  return 'reasoning';
}

// ── Tree node & pulse types ───────────────────────────────────

interface TreeNode {
  id: number;
  text: string;
  type: ThoughtType;
  parentId: number | null;
  childIds: number[];
  // Layout (computed)
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  // Animation
  scale: number;
  opacity: number;
  birth: number; // timestamp when created
}

interface LightPulse {
  fromId: number;
  toId: number;
  progress: number; // 0→1
  color: string;
  speed: number;
}

// ── Layout constants ──────────────────────────────────────────

const NODE_RADIUS = 5;
const ROOT_RADIUS = 7;
const LEVEL_GAP = 70;
const MIN_SIBLING_GAP = 55;
const TOP_MARGIN = 50;
const PULSE_SPEED = 0.025;
const NODE_APPEAR_DURATION = 400; // ms

// ── Segment parser ────────────────────────────────────────────

function parseSegments(text: string): string[] {
  // Split reasoning text into meaningful thought segments.
  // Use sentence boundaries, newlines, semicolons.
  const raw = text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12); // Skip tiny fragments
  return raw;
}

// ── Determine branching from text ─────────────────────────────

function shouldBranch(text: string, prevType: ThoughtType): boolean {
  const lower = text.toLowerCase();
  // Questions branch off
  if (/\?/.test(text)) return true;
  // "However" / "But" / "On the other hand" indicate alternative paths
  if (/^(however|but|on the other hand|alternatively|conversely|yet|although)/i.test(lower)) return true;
  // Conclusions branch back
  if (prevType !== 'conclusion' && /^(therefore|thus|so\b|in conclusion|to summarize)/i.test(lower)) return true;
  return false;
}

// ── Canvas renderer ───────────────────────────────────────────

export const ThoughtVisualizer = memo(function ThoughtVisualizer({ isDark }: ThoughtVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<TreeNode[]>([]);
  const pulsesRef = useRef<LightPulse[]>([]);
  const processedLenRef = useRef(0);
  const nextIdRef = useRef(1);
  const rafRef = useRef(0);
  const frameSkipRef = useRef(false);
  const scrollYRef = useRef(0);
  const isDarkRef = useRef(isDark);

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  // ── Build tree from reasoning text ────────────────────────

  const buildFromReasoning = useCallback((reasoningText: string, queryText: string) => {
    const nodes = nodesRef.current;

    // Create root node from query if empty
    if (nodes.length === 0 && queryText) {
      const rootNode: TreeNode = {
        id: 0,
        text: queryText.slice(0, 60) + (queryText.length > 60 ? '...' : ''),
        type: 'query',
        parentId: null,
        childIds: [],
        x: 0, y: 0, targetX: 0, targetY: TOP_MARGIN,
        scale: 0, opacity: 0,
        birth: Date.now(),
      };
      nodes.push(rootNode);
      nextIdRef.current = 1;
    }

    // Parse new segments since last processed
    const fullText = reasoningText;
    if (fullText.length <= processedLenRef.current) return;

    const newText = fullText.slice(processedLenRef.current);
    const segments = parseSegments(newText);
    if (segments.length === 0) return;

    // Track how far we've processed
    let consumed = 0;
    for (const seg of segments) {
      const segEnd = newText.indexOf(seg, consumed) + seg.length;
      consumed = segEnd;
    }
    processedLenRef.current += consumed;

    // Add nodes for new segments
    for (const seg of segments) {
      const type = classifySegment(seg);
      const id = nextIdRef.current++;

      // Determine parent
      let parentId = 0; // default: root
      if (nodes.length > 1) {
        const lastNode = nodes[nodes.length - 1]!;
        if (shouldBranch(seg, lastNode.type)) {
          // Branch from grandparent or root
          parentId = lastNode.parentId ?? 0;
        } else {
          parentId = lastNode.id;
        }
      }

      const node: TreeNode = {
        id,
        text: seg.slice(0, 50) + (seg.length > 50 ? '...' : ''),
        type,
        parentId,
        childIds: [],
        x: 0, y: 0, targetX: 0, targetY: 0,
        scale: 0, opacity: 0,
        birth: Date.now(),
      };

      // Register as child of parent
      const parent = nodes.find((n) => n.id === parentId);
      if (parent) parent.childIds.push(id);

      nodes.push(node);

      // Create light pulse from parent to new node
      pulsesRef.current.push({
        fromId: parentId,
        toId: id,
        progress: 0,
        color: TYPE_COLORS[type],
        speed: PULSE_SPEED,
      });
    }

    // Recompute layout
    layoutTree(nodes);
  }, []);

  // ── Build from pipeline stages (fallback) ─────────────────

  const buildFromPipeline = useCallback((
    messages: PFCState['messages'],
    stages: PFCState['pipelineStages'],
  ) => {
    const nodes = nodesRef.current;
    if (nodes.length > 0) return; // Already have nodes

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    const completed = stages.filter((s) => s.status === 'complete');
    if (completed.length === 0) return;

    // Root
    const root: TreeNode = {
      id: 0,
      text: lastUserMsg.text.slice(0, 50) + (lastUserMsg.text.length > 50 ? '...' : ''),
      type: 'query',
      parentId: null,
      childIds: [],
      x: 0, y: 0, targetX: 0, targetY: TOP_MARGIN,
      scale: 0, opacity: 0,
      birth: Date.now(),
    };
    nodes.push(root);

    // Stage nodes
    completed.forEach((stage, i) => {
      const id = i + 1;
      const node: TreeNode = {
        id,
        text: stage.summary.slice(0, 40),
        type: 'reasoning',
        parentId: i === 0 ? 0 : i, // chain stages
        childIds: [],
        x: 0, y: 0, targetX: 0, targetY: 0,
        scale: 0, opacity: 0,
        birth: Date.now() + i * 150,
      };
      nodes.push(node);
      const parent = nodes.find((n) => n.id === node.parentId);
      if (parent) parent.childIds.push(id);

      pulsesRef.current.push({
        fromId: node.parentId!,
        toId: id,
        progress: 0,
        color: TYPE_COLORS.reasoning,
        speed: PULSE_SPEED * 0.7,
      });
    });

    nextIdRef.current = completed.length + 1;
    layoutTree(nodes);
  }, []);

  // ── Store subscription ────────────────────────────────────

  useEffect(() => {
    let prevReasoningLen = 0;
    let prevStageCount = 0;

    const unsub = usePFCStore.subscribe((state) => {
      const { reasoningText, messages, pipelineStages, isReasoning } = state;

      // Live reasoning mode
      if (reasoningText.length > prevReasoningLen) {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        buildFromReasoning(reasoningText, lastUser?.text ?? '');
        prevReasoningLen = reasoningText.length;
      }

      // Pipeline fallback — only when not reasoning and stages complete
      if (!isReasoning && reasoningText.length === 0) {
        const completed = pipelineStages.filter((s) => s.status === 'complete').length;
        if (completed > prevStageCount) {
          buildFromPipeline(messages, pipelineStages);
          prevStageCount = completed;
        }
      }
    });

    return unsub;
  }, [buildFromReasoning, buildFromPipeline]);

  // ── Reset on new query ────────────────────────────────────

  useEffect(() => {
    const unsub = usePFCStore.subscribe((state: PFCState, prevState: PFCState) => {
      if (state.isProcessing && !prevState.isProcessing) {
        nodesRef.current = [];
        pulsesRef.current = [];
        processedLenRef.current = 0;
        nextIdRef.current = 1;
        scrollYRef.current = 0;
      }
    });
    return unsub;
  }, []);

  // ── Canvas animation loop ─────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let cachedW = 0;
    let cachedH = 0;

    function resize() {
      if (!canvas) return;
      const rect = canvas.parentElement?.getBoundingClientRect();
      const w = rect?.width ?? window.innerWidth;
      const h = rect?.height ?? 400;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cachedW = w;
      cachedH = h;
    }

    resize();
    window.addEventListener('resize', resize);

    // Resolve CSS variable for canvas use (canvas 2D API can't resolve CSS custom properties)
    const accentColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--pfc-accent').trim() || '#C15F3C';

    // Tab visibility
    let tabHidden = document.hidden;
    const onVis = () => { tabHidden = document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    // Reduced motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    const onMotion = (e: MediaQueryListEvent) => { reducedMotion = e.matches; };
    motionQuery.addEventListener('change', onMotion);

    function draw(timestamp: number) {
      if (!canvas || !ctx) return;
      if (tabHidden) { rafRef.current = requestAnimationFrame(draw); return; }

      // 30fps throttle
      frameSkipRef.current = !frameSkipRef.current;
      if (frameSkipRef.current) { rafRef.current = requestAnimationFrame(draw); return; }

      const dark = isDarkRef.current;
      const w = cachedW;
      const h = cachedH;
      const now = Date.now();
      const nodes = nodesRef.current;
      const pulses = pulsesRef.current;

      ctx.clearRect(0, 0, w, h);

      if (nodes.length === 0) {
        // Empty state
        ctx.font = '13px ui-monospace, "SF Mono", monospace';
        ctx.fillStyle = dark ? 'rgba(156,143,128,0.3)' : 'rgba(0,0,0,0.15)';
        ctx.textAlign = 'center';
        ctx.fillText('Send a query to visualize thinking', w / 2, h / 2);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Center the tree horizontally
      const centerX = w / 2;

      // Auto-scroll: keep latest nodes visible
      const maxY = Math.max(...nodes.map((n) => n.targetY));
      if (maxY > h - 80) {
        const targetScroll = maxY - h + 120;
        scrollYRef.current += (targetScroll - scrollYRef.current) * 0.08;
      }
      const scrollY = scrollYRef.current;

      // ── Update node positions (spring toward target) ──
      for (const node of nodes) {
        // targetX is stored as offset from center; compute absolute target
        const absTargetX = centerX + node.targetX;
        const age = now - node.birth;
        const t = reducedMotion ? 1 : Math.min(age / NODE_APPEAR_DURATION, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        node.scale = ease;
        node.opacity = ease;

        // Smooth position interpolation
        node.x += (absTargetX - node.x) * 0.12;
        node.y += (node.targetY - node.y) * 0.12;
      }

      // ── Draw edges ──
      for (const node of nodes) {
        if (node.parentId === null) continue;
        const parent = nodes.find((n) => n.id === node.parentId);
        if (!parent) continue;

        const px = parent.x;
        const py = parent.y - scrollY;
        const nx = node.x;
        const ny = node.y - scrollY;

        // Skip if both off-screen
        if (py > h + 20 && ny > h + 20) continue;
        if (py < -20 && ny < -20) continue;

        const alpha = Math.min(parent.opacity, node.opacity);
        ctx.beginPath();
        // Curved edge (quadratic bezier through midpoint)
        const midY = (py + ny) / 2;
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px, midY, nx, ny);
        ctx.strokeStyle = dark
          ? `rgba(156,143,128,${0.15 * alpha})`
          : `rgba(0,0,0,${0.06 * alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // ── Draw light pulses ──
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i]!;
        pulse.progress += pulse.speed;

        if (pulse.progress >= 1) {
          pulses.splice(i, 1);
          continue;
        }

        const fromNode = nodes.find((n) => n.id === pulse.fromId);
        const toNode = nodes.find((n) => n.id === pulse.toId);
        if (!fromNode || !toNode) { pulses.splice(i, 1); continue; }

        const t = pulse.progress;
        // Position along the quadratic bezier
        const px = fromNode.x;
        const py = fromNode.y - scrollY;
        const nx = toNode.x;
        const ny = toNode.y - scrollY;
        const midY = (py + ny) / 2;

        // Quadratic bezier interpolation: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
        const omt = 1 - t;
        const lx = omt * omt * px + 2 * omt * t * px + t * t * nx;
        const ly = omt * omt * py + 2 * omt * t * midY + t * t * ny;

        // Glow
        const glowAlpha = Math.sin(t * Math.PI) * 0.6;
        const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, 12);
        grad.addColorStop(0, pulse.color + hexAlpha(glowAlpha));
        grad.addColorStop(1, pulse.color + '00');
        ctx.beginPath();
        ctx.arc(lx, ly, 12, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = pulse.color;
        ctx.globalAlpha = glowAlpha + 0.3;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // ── Draw nodes ──
      const font9 = '9px ui-monospace, "SF Mono", monospace';
      const font7 = '600 6.5px ui-monospace, "SF Mono", monospace';

      for (const node of nodes) {
        const nx = node.x;
        const ny = node.y - scrollY;
        if (ny > h + 30 || ny < -30) continue;

        const r = node.type === 'query' ? ROOT_RADIUS : NODE_RADIUS;
        const s = node.scale;
        const a = node.opacity;
        const color = TYPE_COLORS[node.type];

        // Outer glow (subtle)
        if (a > 0.5) {
          const glow = ctx.createRadialGradient(nx, ny, r * s, nx, ny, (r + 10) * s);
          glow.addColorStop(0, color + hexAlpha(0.08 * a));
          glow.addColorStop(1, color + '00');
          ctx.beginPath();
          ctx.arc(nx, ny, (r + 10) * s, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(nx, ny, r * s, 0, Math.PI * 2);
        ctx.fillStyle = dark ? `rgba(28,27,25,${0.9 * a})` : `rgba(255,255,255,${0.9 * a})`;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 * s;
        ctx.globalAlpha = a;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Type label (above node)
        if (s > 0.5) {
          ctx.font = font7;
          ctx.textAlign = 'center';
          ctx.fillStyle = color;
          ctx.globalAlpha = a * 0.8;
          ctx.fillText(TYPE_LABELS[node.type], nx, ny - r * s - 4);
          ctx.globalAlpha = 1;
        }

        // Text label (below node)
        if (s > 0.7) {
          ctx.font = font9;
          ctx.textAlign = 'center';
          ctx.fillStyle = dark ? `rgba(237,224,212,${0.6 * a})` : `rgba(0,0,0,${0.4 * a})`;
          const label = node.text.length > 30 ? node.text.slice(0, 30) + '...' : node.text;
          ctx.fillText(label, nx, ny + r * s + 13);
        }
      }

      // ── "Thinking..." indicator when actively reasoning ──
      const isReasoning = usePFCStore.getState().isReasoning;
      if (isReasoning && nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1]!;
        const lx = lastNode.x;
        const ly = lastNode.y - scrollY;

        // Pulsing dot near last node
        const pulse = 0.4 + 0.6 * Math.abs(Math.sin(now * 0.003));
        ctx.beginPath();
        ctx.arc(lx + 15, ly, 3, 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = pulse;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      motionQuery.removeEventListener('change', onMotion);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Legend overlay ────────────────────────────────────────

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '24rem' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          transform: 'translateZ(0)',
        }}
      />
      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.5rem',
          left: '0.5rem',
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          pointerEvents: 'none',
        }}
      >
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div
            key={type}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem',
              fontSize: '0.5625rem',
              color: isDark ? 'rgba(156,143,128,0.45)' : 'rgba(0,0,0,0.25)',
            }}
          >
            <div
              style={{
                width: '0.4rem',
                height: '0.4rem',
                borderRadius: '50%',
                background: color,
              }}
            />
            {TYPE_LABELS[type as ThoughtType]}
          </div>
        ))}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════
// Layout helpers
// ═══════════════════════════════════════════════════════════════════

/** Compute tidy tree layout. Stores targetX as offset from center. */
function layoutTree(nodes: TreeNode[]) {
  if (nodes.length === 0) return;

  // Group by depth
  const depths: Map<number, TreeNode[]> = new Map();
  const nodeDepths: Map<number, number> = new Map();

  // BFS to assign depths
  const root = nodes[0]!;
  nodeDepths.set(root.id, 0);
  depths.set(0, [root]);

  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const d = nodeDepths.get(current.id)!;
    for (const childId of current.childIds) {
      const child = nodes.find((n) => n.id === childId);
      if (child && !nodeDepths.has(child.id)) {
        nodeDepths.set(child.id, d + 1);
        if (!depths.has(d + 1)) depths.set(d + 1, []);
        depths.get(d + 1)!.push(child);
        queue.push(child);
      }
    }
  }

  // Assign positions — each depth level is a row, nodes spread horizontally
  for (const [depth, nodesAtDepth] of depths.entries()) {
    const y = TOP_MARGIN + depth * LEVEL_GAP;
    const totalWidth = (nodesAtDepth.length - 1) * MIN_SIBLING_GAP;
    const startX = -totalWidth / 2;

    nodesAtDepth.forEach((node, i) => {
      node.targetX = startX + i * MIN_SIBLING_GAP;
      // Store targetX as offset from center (the draw loop adds centerX)
      // We need to undo the centerX addition that happens in draw
      // Actually, let's store absolute and handle in draw
      node.targetY = y;
    });
  }

  // Second pass: center children under their parent
  for (let depth = 1; depths.has(depth); depth++) {
    const nodesAtDepth = depths.get(depth)!;

    // Group by parent
    const byParent = new Map<number, TreeNode[]>();
    for (const node of nodesAtDepth) {
      if (node.parentId === null) continue;
      if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
      byParent.get(node.parentId)!.push(node);
    }

    for (const [parentId, children] of byParent.entries()) {
      const parent = nodes.find((n) => n.id === parentId);
      if (!parent) continue;

      // Center children under parent
      const childCenter = children.reduce((s, c) => s + c.targetX, 0) / children.length;
      const offset = parent.targetX - childCenter;
      for (const child of children) {
        child.targetX += offset;
      }
    }

    // Resolve overlaps at this depth
    nodesAtDepth.sort((a, b) => a.targetX - b.targetX);
    for (let i = 1; i < nodesAtDepth.length; i++) {
      const gap = nodesAtDepth[i]!.targetX - nodesAtDepth[i - 1]!.targetX;
      if (gap < MIN_SIBLING_GAP) {
        nodesAtDepth[i]!.targetX = nodesAtDepth[i - 1]!.targetX + MIN_SIBLING_GAP;
      }
    }
  }

  // Normalize: store targetX as offset from 0 (draw loop adds centerX)
  // Actually the draw loop does: node.targetX = centerX + node.targetX
  // So targetX should be the offset from center. Already correct.
}

/** Convert 0-1 alpha to 2-char hex */
function hexAlpha(a: number): string {
  const clamped = Math.max(0, Math.min(1, a));
  const hex = Math.round(clamped * 255).toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}
