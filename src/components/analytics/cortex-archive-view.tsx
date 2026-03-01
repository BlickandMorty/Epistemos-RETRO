'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArchiveIcon,
  DownloadIcon,
  Trash2Icon,
  RotateCcwIcon,
  BrainCircuitIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { usePFCStore, type CortexSnapshot } from '@/lib/store/use-pfc-store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { GlassSection } from '@/components/layout/page-shell';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(v: number) {
  return Math.round(v * 100);
}

function safetyColor(state: string) {
  switch (state) {
    case 'green': return 'bg-pfc-green/12 text-pfc-green';
    case 'yellow': return 'bg-pfc-yellow/12 text-pfc-yellow';
    case 'orange': return 'bg-pfc-ember/12 text-pfc-ember';
    case 'red': return 'bg-pfc-red/12 text-pfc-red';
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// Snapshot Card
// ---------------------------------------------------------------------------

function SnapshotCard({
  snapshot,
  onRestore,
  onDelete,
}: {
  snapshot: CortexSnapshot;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(snapshot.timestamp), { addSuffix: true }); }
    catch { return 'unknown'; }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      layout
    >
      <div className="overflow-hidden rounded-2xl bg-muted/30">
        <div className="pb-2 cursor-pointer px-4 pt-4" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuitIcon className="h-4 w-4 text-pfc-ember" />
              <h3 className="text-sm font-semibold">{snapshot.label}</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn('text-[9px] uppercase border-0', safetyColor(snapshot.signals.safetyState))}>
                {snapshot.signals.safetyState}
              </Badge>
              {expanded ? <ChevronUpIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-1">
            <CalendarIcon className="h-3 w-3" />
            {timeAgo}
            <span className="mx-1">{'\u00b7'}</span>
            {snapshot.meta.queriesProcessed} queries
            <span className="mx-1">{'\u00b7'}</span>
            {snapshot.concepts.activeConcepts.length} concepts
          </p>
        </div>

        {/* Quick stats always visible */}
        <div className="pb-2 px-4">
          <div className="flex flex-wrap gap-3 text-[10px] font-mono">
            <span className={cn(snapshot.signals.confidence > 0.6 ? 'text-pfc-green' : snapshot.signals.confidence > 0.3 ? 'text-pfc-yellow' : 'text-pfc-red')}>
              Conf {pct(snapshot.signals.confidence)}%
            </span>
            <span className="text-muted-foreground/60">
              Ent {pct(snapshot.signals.entropy)}%
            </span>
            <span className="text-muted-foreground/60">
              Diss {pct(snapshot.signals.dissonance)}%
            </span>
            <span className="text-muted-foreground/60">
              Health {pct(snapshot.signals.healthScore)}%
            </span>
          </div>
        </div>

        {/* Expanded detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
              style={{ overflow: 'hidden', transform: 'translateZ(0)' }}
            >
              <div className="pt-0 space-y-3 px-4 pb-4">
                <div className="border-t border-border/20 my-2" />

                {/* Concepts */}
                {snapshot.concepts.activeConcepts.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5">Concepts</p>
                    <div className="flex flex-wrap gap-1.5">
                      {snapshot.concepts.activeConcepts.map((c) => (
                        <Badge key={c} variant="secondary" className="text-[9px] bg-pfc-violet/10 text-pfc-violet border-0">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Controls */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5">Controls</p>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <span className="text-muted-foreground">Focus: {snapshot.controls.focusDepthOverride ?? 'Auto'}</span>
                    <span className="text-muted-foreground">Temp: {snapshot.controls.temperatureOverride?.toFixed(1) ?? 'Auto'}</span>
                    <span className="text-muted-foreground">Adversarial: {snapshot.controls.adversarialIntensity.toFixed(1)}x</span>
                    <span className="text-muted-foreground">Bayesian: {snapshot.controls.bayesianPriorStrength.toFixed(1)}x</span>
                    <span className="text-muted-foreground">Mode: {snapshot.inferenceMode}</span>
                  </div>
                </div>

                {/* Structural Complexity */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5">Structural Complexity</p>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-pfc-violet">
                    <span>B0: {snapshot.tda.betti0}</span>
                    <span>B1: {snapshot.tda.betti1}</span>
                    <span>Pers. Ent: {snapshot.tda.persistenceEntropy.toFixed(3)}</span>
                    <span>Max Pers: {snapshot.tda.maxPersistence.toFixed(3)}</span>
                  </div>
                </div>

                <div className="border-t border-border/20 my-2" />

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <GlassBubbleButton
                    color="ember"
                    size="sm"
                    onClick={() => onRestore(snapshot.id)}
                  >
                    <RotateCcwIcon className="h-3 w-3" />
                    Restore
                  </GlassBubbleButton>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs text-pfc-red border-0 hover:bg-pfc-red/5">
                        <Trash2Icon className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete snapshot?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete &quot;{snapshot.label}&quot;. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(snapshot.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CortexArchiveView() {
  const cortexArchive = usePFCStore((s) => s.cortexArchive);
  const saveCortexSnapshot = usePFCStore((s) => s.saveCortexSnapshot);
  const deleteCortexSnapshot = usePFCStore((s) => s.deleteCortexSnapshot);
  const restoreCortexSnapshot = usePFCStore((s) => s.restoreCortexSnapshot);
  const loadCortexFromStorage = usePFCStore((s) => s.loadCortexFromStorage);
  const [newLabel, setNewLabel] = useState('');

  // Load archive from localStorage on mount
  useEffect(() => {
    loadCortexFromStorage();
  }, [loadCortexFromStorage]);

  const handleSave = () => {
    const label = newLabel.trim() || `Snapshot ${new Date().toLocaleString()}`;
    saveCortexSnapshot(label);
    setNewLabel('');
  };

  return (
    <div className="space-y-6">
      {/* Save current state */}
      <GlassSection title="Save Current Brain State" className="">
        <p className="text-xs text-muted-foreground mb-3">
          Capture a snapshot of all signals, concepts, controls, and pipeline settings before resetting.
        </p>
        <div className="flex items-center gap-2 rounded-xl p-2" style={{ background: 'var(--m3-surface-container-lowest)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Snapshot label (optional)..."
            className="text-sm bg-transparent"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <GlassBubbleButton color="ember" onClick={handleSave}>
            <DownloadIcon className="h-3.5 w-3.5" />
            Save
          </GlassBubbleButton>
        </div>
      </GlassSection>

      {/* Archive list */}
      <GlassSection
        title="Saved States"
        badge={
          cortexArchive.length > 0 ? (
            <Badge variant="outline" className="text-[10px] font-mono border-0">
              {cortexArchive.length} snapshot{cortexArchive.length !== 1 ? 's' : ''}
            </Badge>
          ) : undefined
        }
      >
        {cortexArchive.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ArchiveIcon className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground/50">No saved brain states yet</p>
            <p className="text-xs text-muted-foreground/30 mt-1">Save a snapshot above before resetting to preserve your insights</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {cortexArchive.map((snap) => (
                <SnapshotCard
                  key={snap.id}
                  snapshot={snap}
                  onRestore={restoreCortexSnapshot}
                  onDelete={deleteCortexSnapshot}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </GlassSection>
    </div>
  );
}
