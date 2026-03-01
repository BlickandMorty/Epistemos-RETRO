'use client';

import { motion } from 'framer-motion';
import {
  HeartPulseIcon,
  ShieldCheckIcon,
  BrainIcon,
  ThermometerIcon,
  ZapIcon,
  ActivityIcon,
  TargetIcon,
  AlertTriangleIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
} from 'lucide-react';

import { usePFCStore } from '@/lib/store/use-pfc-store';
import type { SafetyState } from '@/lib/constants';
import { cn } from '@/lib/utils';

import { GlassSection } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useIsDark } from '@/hooks/use-is-dark';
import { EducationalTooltipButton } from '@/components/shared/educational-tooltip';
import { SIGNAL_TOOLTIPS } from '@/lib/research/educational-data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(value: number): number {
  return Math.round(value * 100);
}

function confidenceColor(v: number): string {
  if (v > 0.6) return 'text-pfc-green';
  if (v > 0.3) return 'text-pfc-yellow';
  return 'text-pfc-red';
}

function confidenceBarClass(v: number): string {
  if (v > 0.6) return '[&>div]:bg-pfc-green';
  if (v > 0.3) return '[&>div]:bg-pfc-yellow';
  return '[&>div]:bg-pfc-red';
}

function entropyColor(v: number): string {
  if (v < 0.4) return 'text-pfc-green';
  if (v < 0.7) return 'text-pfc-yellow';
  return 'text-pfc-red';
}

function entropyBarClass(v: number): string {
  if (v < 0.4) return '[&>div]:bg-pfc-green';
  if (v < 0.7) return '[&>div]:bg-pfc-yellow';
  return '[&>div]:bg-pfc-red';
}

function dissonanceColor(v: number): string {
  if (v < 0.3) return 'text-pfc-green';
  if (v < 0.6) return 'text-pfc-yellow';
  return 'text-pfc-red';
}

function dissonanceBarClass(v: number): string {
  if (v < 0.3) return '[&>div]:bg-pfc-green';
  if (v < 0.6) return '[&>div]:bg-pfc-yellow';
  return '[&>div]:bg-pfc-red';
}

function safetyBadgeClass(state: SafetyState): string {
  switch (state) {
    case 'green':
      return 'bg-pfc-green/20 text-pfc-green border-pfc-green/40';
    case 'yellow':
      return 'bg-pfc-yellow/20 text-pfc-yellow border-pfc-yellow/40';
    case 'orange':
      return 'bg-pfc-ember/20 text-pfc-ember border-pfc-ember/40';
    case 'red':
      return 'bg-pfc-red/20 text-pfc-red border-pfc-red/40';
  }
}

function riskBarClass(v: number): string {
  if (v < 0.3) return '[&>div]:bg-pfc-green';
  if (v < 0.6) return '[&>div]:bg-pfc-yellow';
  return '[&>div]:bg-pfc-red';
}

// ---------------------------------------------------------------------------
// Trend indicator
// ---------------------------------------------------------------------------

function TrendArrow({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const recent = data.slice(-3);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const prev = data.slice(-6, -3);
  if (prev.length === 0) return null;
  const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
  const diff = avg - prevAvg;

  if (Math.abs(diff) < 0.02) {
    return <MinusIcon className="h-3 w-3 text-muted-foreground/40" />;
  }
  if (diff > 0) {
    return <TrendingUpIcon className="h-3 w-3 text-pfc-green" />;
  }
  return <TrendingDownIcon className="h-3 w-3 text-pfc-red" />;
}

// ---------------------------------------------------------------------------
// Anomaly alert logic
// ---------------------------------------------------------------------------

interface Anomaly {
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
}

function getAnomalies(state: {
  entropy: number;
  dissonance: number;
  healthScore: number;
  riskScore: number;
  confidence: number;
}): Anomaly[] {
  const alerts: Anomaly[] = [];
  if (state.entropy > 0.7) {
    alerts.push({
      severity: 'warning',
      title: 'Divergent reasoning detected',
      description: `Entropy at ${pct(state.entropy)}% indicates high uncertainty across reasoning paths.`,
      recommendation: 'Increase focus depth or narrow the query scope.',
    });
  }
  if (state.dissonance > 0.5) {
    alerts.push({
      severity: 'critical',
      title: 'Evidence conflicts found',
      description: `Dissonance at ${pct(state.dissonance)}% suggests contradictory evidence streams.`,
      recommendation: 'Run adversarial stress test to isolate conflicting sources.',
    });
  }
  if (state.healthScore < 0.4) {
    alerts.push({
      severity: 'critical',
      title: 'Pipeline integrity compromised',
      description: `Health score dropped to ${pct(state.healthScore)}%.`,
      recommendation: 'Reset controls and re-run with default parameters.',
    });
  }
  if (state.riskScore > 0.5) {
    alerts.push({
      severity: 'warning',
      title: 'Elevated risk assessment',
      description: `Risk score at ${pct(state.riskScore)}% exceeds safe threshold.`,
      recommendation: 'Review safety state and consider lowering adversarial intensity.',
    });
  }
  if (state.confidence < 0.3) {
    alerts.push({
      severity: 'warning',
      title: 'Low confidence output',
      description: `Confidence at ${pct(state.confidence)}% — results may be unreliable.`,
      recommendation: 'Increase Bayesian prior strength or simplify the query.',
    });
  }
  return alerts;
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

import { ease } from '@/lib/motion/motion-config';

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: ease.cupertino },
  }),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiagnosticsView() {
  const confidence = usePFCStore((s) => s.confidence);
  const entropy = usePFCStore((s) => s.entropy);
  const dissonance = usePFCStore((s) => s.dissonance);
  const healthScore = usePFCStore((s) => s.healthScore);
  const safetyState = usePFCStore((s) => s.safetyState);
  const riskScore = usePFCStore((s) => s.riskScore);
  const focusDepth = usePFCStore((s) => s.focusDepth);
  const temperatureScale = usePFCStore((s) => s.temperatureScale);
  const tda = usePFCStore((s) => s.tda);
  const activeConcepts = usePFCStore((s) => s.activeConcepts);
  const activeChordProduct = usePFCStore((s) => s.activeChordProduct);
  const harmonyKeyDistance = usePFCStore((s) => s.harmonyKeyDistance);
  const queriesProcessed = usePFCStore((s) => s.queriesProcessed);
  const totalTraces = usePFCStore((s) => s.totalTraces);
  const skillGapsDetected = usePFCStore((s) => s.skillGapsDetected);
  const signalHistory = usePFCStore((s) => s.signalHistory);
  const { isDark } = useIsDark();

  const anomalies = getAnomalies({ entropy, dissonance, healthScore, riskScore, confidence });

  return (
    <>
      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <GlassSection
          title="Active Alerts"
          badge={
            <Badge variant="outline" className="text-[10px] font-mono text-pfc-red border-pfc-red/30">
              {anomalies.length} alert{anomalies.length !== 1 ? 's' : ''}
            </Badge>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {anomalies.map((a, i) => (
              <motion.div
                key={a.title}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                custom={i}
                className={cn(
                  'rounded-lg border-l-[3px] p-4 bg-muted/30',
                  a.severity === 'critical' ? 'border-l-pfc-red' : 'border-l-pfc-yellow',
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangleIcon className={cn(
                    'h-3.5 w-3.5',
                    a.severity === 'critical' ? 'text-pfc-red' : 'text-pfc-yellow',
                  )} />
                  <p className="text-xs font-semibold">{a.title}</p>
                </div>
                <p className="text-[11px] text-muted-foreground">{a.description}</p>
                <p className="text-[10px] text-pfc-ember font-medium mt-1.5">{a.recommendation}</p>
              </motion.div>
            ))}
          </div>
        </GlassSection>
      )}

      {/* Core Signals */}
      <GlassSection title="Core Signals">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={0} className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TargetIcon className="h-3.5 w-3.5" />
                Confidence
                {SIGNAL_TOOLTIPS.confidence && <EducationalTooltipButton tooltip={SIGNAL_TOOLTIPS.confidence} isDark={isDark} />}
              </span>
              <TrendArrow data={signalHistory.map((h) => h.confidence)} />
            </div>
            <p className={cn('text-4xl font-bold tabular-nums', confidenceColor(confidence))}>
              {pct(confidence)}%
            </p>
            <Progress value={pct(confidence)} className={cn('mt-3 h-1.5', confidenceBarClass(confidence))} />
          </motion.div>

          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={1} className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ZapIcon className="h-3.5 w-3.5" />
                Entropy
                {SIGNAL_TOOLTIPS.entropy && <EducationalTooltipButton tooltip={SIGNAL_TOOLTIPS.entropy} isDark={isDark} />}
              </span>
              <TrendArrow data={signalHistory.map((h) => h.entropy)} />
            </div>
            <p className={cn('text-4xl font-bold tabular-nums', entropyColor(entropy))}>
              {pct(entropy)}%
            </p>
            <Progress value={pct(entropy)} className={cn('mt-3 h-1.5', entropyBarClass(entropy))} />
          </motion.div>

          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={2} className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BrainIcon className="h-3.5 w-3.5" />
                Dissonance
                {SIGNAL_TOOLTIPS.dissonance && <EducationalTooltipButton tooltip={SIGNAL_TOOLTIPS.dissonance} isDark={isDark} />}
              </span>
              <TrendArrow data={signalHistory.map((h) => h.dissonance)} />
            </div>
            <p className={cn('text-4xl font-bold tabular-nums', dissonanceColor(dissonance))}>
              {pct(dissonance)}%
            </p>
            <Progress value={pct(dissonance)} className={cn('mt-3 h-1.5', dissonanceBarClass(dissonance))} />
          </motion.div>

          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={3} className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <HeartPulseIcon className="h-3.5 w-3.5" />
                System Health
              </span>
              <TrendArrow data={signalHistory.map((h) => h.healthScore)} />
            </div>
            <p className={cn('text-4xl font-bold tabular-nums', confidenceColor(healthScore))}>
              {pct(healthScore)}%
            </p>
            <Progress value={pct(healthScore)} className={cn('mt-3 h-1.5', confidenceBarClass(healthScore))} />
          </motion.div>
        </div>
      </GlassSection>

      {/* Safety Status */}
      <GlassSection title="Safety Status">
        <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={4} className="rounded-lg bg-muted/30 p-4">
          <div className="flex items-center gap-4">
            <ShieldCheckIcon className="h-5 w-5 text-muted-foreground" />
            <div className="space-y-2">
              <Badge
                className={cn(
                  'px-5 py-2.5 text-xl font-bold uppercase tracking-wider',
                  safetyBadgeClass(safetyState),
                )}
              >
                {safetyState}
              </Badge>
              <p className="text-sm text-muted-foreground">
                {safetyState === 'green' && 'All systems nominal'}
                {safetyState === 'yellow' && 'Minor concerns detected'}
                {safetyState === 'orange' && 'Elevated risk level'}
                {safetyState === 'red' && 'Critical alert active'}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Risk Score</p>
              <p className={cn(
                'text-2xl font-bold tabular-nums',
                riskScore < 0.3 ? 'text-pfc-green' : riskScore < 0.6 ? 'text-pfc-yellow' : 'text-pfc-red',
              )}>
                {pct(riskScore)}%
              </p>
              <Progress value={pct(riskScore)} className={cn('mt-2 h-1.5 w-32', riskBarClass(riskScore))} />
            </div>
          </div>
        </motion.div>
      </GlassSection>

      {/* Structural Complexity */}
      <GlassSection title="Structural Complexity">
        <p className="text-xs text-muted-foreground/50 mb-3">Heuristic structural metrics derived from query properties. Higher values indicate more complex analytical structure.</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([
            { label: 'B0 (Fragmentation)', value: tda.betti0 },
            { label: 'B1 (Cyclical)', value: tda.betti1 },
            { label: 'Persistence Entropy', value: tda.persistenceEntropy },
            { label: 'Max Persistence', value: tda.maxPersistence },
          ] as const).map((item, i) => (
            <motion.div
              key={item.label}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              custom={5 + i}
              className="rounded-lg bg-muted/30 p-4"
            >
              <p className="text-xs text-muted-foreground mb-2">{item.label}</p>
              <p className="text-2xl font-bold tabular-nums text-pfc-violet">
                {item.value.toFixed(3)}
              </p>
            </motion.div>
          ))}
        </div>
      </GlassSection>

      {/* Focus & Temperature */}
      <GlassSection title="Focus & Temperature">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={9} className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <TargetIcon className="h-3.5 w-3.5" />
              Focus Depth
            </div>
            <p className="text-3xl font-bold tabular-nums text-pfc-cyan">
              {Math.round(focusDepth)}
            </p>
            <span className="text-xs text-muted-foreground">Current analytical depth level</span>
          </motion.div>

          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={10} className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <ThermometerIcon className="h-3.5 w-3.5" />
              Temperature Scale
            </div>
            <p className="text-3xl font-bold tabular-nums text-pfc-ember">
              {temperatureScale.toFixed(2)}
            </p>
            <span className="text-xs text-muted-foreground">Sampling temperature multiplier</span>
          </motion.div>
        </div>
      </GlassSection>

      {/* Concept Chords */}
      <GlassSection title="Concept Chords">
        <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={11} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {activeConcepts.length > 0 ? (
              activeConcepts.map((concept) => (
                <Badge
                  key={concept}
                  variant="secondary"
                  className="bg-pfc-violet/10 text-pfc-violet border-pfc-violet/20"
                >
                  {concept}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No active concepts</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className="text-xs text-muted-foreground">Chord Product <span className="text-muted-foreground/40">(decorative)</span></p>
              <p className="text-xl font-bold tabular-nums text-pfc-cyan">
                {activeChordProduct.toFixed(3)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dissonance Alias</p>
              <p className="text-xl font-bold tabular-nums text-pfc-cyan">
                {harmonyKeyDistance.toFixed(3)}
              </p>
            </div>
          </div>
        </motion.div>
      </GlassSection>

      {/* Meta Statistics */}
      <GlassSection title="Meta Statistics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {([
            { label: 'Queries Processed', value: queriesProcessed, icon: ZapIcon, color: 'text-pfc-green' },
            { label: 'Total Traces', value: totalTraces, icon: ActivityIcon, color: 'text-pfc-violet' },
            { label: 'Skill Gaps Detected', value: skillGapsDetected, icon: TargetIcon, color: 'text-pfc-ember' },
          ] as const).map((stat, i) => (
            <motion.div
              key={stat.label}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              custom={12 + i}
              className="rounded-lg bg-muted/30 p-4"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                <stat.icon className="h-3.5 w-3.5" />
                {stat.label}
              </div>
              <p className={cn('text-3xl font-bold tabular-nums', stat.color)}>
                {stat.value}
              </p>
            </motion.div>
          ))}
        </div>
      </GlassSection>
    </>
  );
}
