'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePFCStore, type ConceptWeight } from '@/lib/store/use-pfc-store';
import { cn } from '@/lib/utils';
import {
  NetworkIcon,
  XIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  HashIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

// ---------------------------------------------------------------------------
// Concept row with full controls
// ---------------------------------------------------------------------------

function ConceptRow({
  cw,
  rank,
  onAdjust,
  onReset,
}: {
  cw: ConceptWeight;
  rank: number;
  onAdjust: (concept: string, delta: number) => void;
  onReset: (concept: string) => void;
}) {
  const effective = cw.weight * cw.autoWeight;
  const isModified = Math.abs(cw.weight - 1.0) > 0.01;
  const isBoosted = cw.weight > 1.1;
  const isDimmed = cw.weight < 0.9;

  // Weight bar visual
  const barWidth = Math.min(100, (effective / 2.0) * 100);

  return (
    <div className={cn(
      'group px-3 py-2.5 rounded-lg transition-colors',
      isBoosted ? 'bg-pfc-ember/5' :
      isDimmed ? 'bg-muted/30' :
      'hover:bg-muted/20',
    )}>
      <div className="flex items-center gap-2">
        {/* Rank */}
        <span className="text-[9px] font-mono text-muted-foreground/30 w-4 text-right shrink-0">
          {rank}
        </span>

        {/* Concept name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'text-xs font-medium truncate',
              isBoosted ? 'text-pfc-ember' :
              isDimmed ? 'text-muted-foreground/50' :
              'text-foreground/80',
            )}>
              {cw.concept}
            </span>
            {isModified && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[7px] px-1 py-0 h-3.5',
                  isBoosted ? 'border-pfc-ember/30 text-pfc-ember' : 'border-pfc-violet/30 text-pfc-violet',
                )}
              >
                {isBoosted ? 'boosted' : 'dimmed'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Effective weight bar */}
            <div className="h-1 flex-1 rounded-full bg-muted/60 overflow-hidden">
              <motion.div
                className={cn(
                  'h-full rounded-full',
                  isBoosted ? 'bg-pfc-ember/60' :
                  isDimmed ? 'bg-muted-foreground/20' :
                  'bg-pfc-violet/40',
                )}
                initial={{ width: 0 }}
                animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-[8px] font-mono text-muted-foreground/40 w-8 text-right shrink-0">
              ×{cw.queryCount}
            </span>
          </div>
        </div>

        {/* Weight controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onAdjust(cw.concept, -0.2)}
            aria-label={`Decrease weight for ${cw.concept}`}
            className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-pfc-red hover:bg-pfc-red/10 transition-colors cursor-pointer"
            disabled={cw.weight <= 0.1}
          >
            <MinusIcon className="h-3 w-3" />
          </button>
          <span
            className={cn(
              'text-[11px] font-mono w-8 text-center font-bold',
              isBoosted ? 'text-pfc-ember' :
              isDimmed ? 'text-muted-foreground/40' :
              'text-foreground/60',
            )}
          >
            {cw.weight.toFixed(1)}
          </span>
          <button
            onClick={() => onAdjust(cw.concept, 0.2)}
            aria-label={`Increase weight for ${cw.concept}`}
            className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-pfc-green hover:bg-pfc-green/10 transition-colors cursor-pointer"
            disabled={cw.weight >= 2.0}
          >
            <PlusIcon className="h-3 w-3" />
          </button>
          {isModified && (
            <button
              onClick={() => onReset(cw.concept)}
              aria-label={`Reset weight for ${cw.concept}`}
              className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/30 hover:text-pfc-violet hover:bg-pfc-violet/10 transition-colors cursor-pointer"
            >
              <RotateCcwIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function ConceptHierarchyPanel() {
  const conceptWeights = usePFCStore((s) => s.conceptWeights);
  const conceptHierarchyOpen = usePFCStore((s) => s.conceptHierarchyOpen);
  const toggleConceptHierarchy = usePFCStore((s) => s.toggleConceptHierarchy);
  const setConceptWeight = usePFCStore((s) => s.setConceptWeight);
  const resetConceptWeight = usePFCStore((s) => s.resetConceptWeight);
  const resetAllConceptWeights = usePFCStore((s) => s.resetAllConceptWeights);
  const queryConceptHistory = usePFCStore((s) => s.queryConceptHistory);

  const sortedConcepts = useMemo(() => {
    return Object.values(conceptWeights)
      .sort((a, b) => (b.weight * b.autoWeight) - (a.weight * a.autoWeight));
  }, [conceptWeights]);

  const hasModified = sortedConcepts.some((cw) => Math.abs(cw.weight - 1.0) > 0.01);
  const boostedCount = sortedConcepts.filter((cw) => cw.weight > 1.1).length;
  const dimmedCount = sortedConcepts.filter((cw) => cw.weight < 0.9).length;

  const handleAdjust = (concept: string, delta: number) => {
    const current = conceptWeights[concept]?.weight ?? 1.0;
    setConceptWeight(concept, current + delta);
  };

  return (
    <AnimatePresence>
      {conceptHierarchyOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
          className="fixed right-4 top-16 bottom-4 w-80 z-40 rounded-2xl border flex flex-col overflow-hidden"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
            boxShadow: 'var(--shadow-l)',
            contain: 'layout paint',
            transform: 'translateZ(0)',
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <NetworkIcon className="h-4 w-4 text-pfc-violet" />
              <h3 className="text-sm font-semibold">Concept Hierarchy</h3>
            </div>
            <div className="flex items-center gap-1">
              {hasModified && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] text-muted-foreground hover:text-pfc-violet"
                  onClick={resetAllConceptWeights}
                >
                  <RotateCcwIcon className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={toggleConceptHierarchy}
                aria-label="Close concept hierarchy"
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="px-4 py-2 border-b bg-muted/20 flex items-center gap-3 text-[10px] font-mono shrink-0">
            <span className="text-muted-foreground/50">
              <HashIcon className="h-3 w-3 inline mr-0.5" />
              {sortedConcepts.length} concepts
            </span>
            {boostedCount > 0 && (
              <span className="text-pfc-ember flex items-center gap-0.5">
                <TrendingUpIcon className="h-3 w-3" />
                {boostedCount} boosted
              </span>
            )}
            {dimmedCount > 0 && (
              <span className="text-muted-foreground/40 flex items-center gap-0.5">
                <TrendingDownIcon className="h-3 w-3" />
                {dimmedCount} dimmed
              </span>
            )}
            <span className="text-muted-foreground/40 ml-auto">
              {queryConceptHistory.length} queries
            </span>
          </div>

          {/* Explanation */}
          <div className="px-4 py-2 border-b shrink-0">
            <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
              Adjust concept importance to steer AI reasoning. Boosted concepts get higher priority in analysis. Dimmed concepts receive less focus.
            </p>
          </div>

          {/* Concept list */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-0.5">
              {sortedConcepts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <NetworkIcon className="h-8 w-8 text-muted-foreground/15 mb-3" />
                  <p className="text-xs text-muted-foreground/40">No concepts extracted yet</p>
                  <p className="text-[10px] text-muted-foreground/25 mt-1">Ask a research question to see concepts appear</p>
                </div>
              ) : (
                sortedConcepts.map((cw, i) => (
                  <ConceptRow
                    key={cw.concept}
                    cw={cw}
                    rank={i + 1}
                    onAdjust={handleAdjust}
                    onReset={resetConceptWeight}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Footer legend */}
          <div className="px-4 py-2 border-t bg-muted/10 shrink-0">
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground/40">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-pfc-ember" />
                Boosted
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-pfc-violet/40" />
                Normal
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
                Dimmed
              </span>
              <span className="ml-auto">×N = query count</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
