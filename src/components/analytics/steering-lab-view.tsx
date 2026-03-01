'use client';

import { useEffect, useMemo } from 'react';
import { useSteeringStore } from '@/lib/store/use-steering-store';
import { projectPCA } from '@/lib/engine/steering/engine';
import { DIMENSION_LABELS } from '@/lib/engine/steering/encoder';
import { cn } from '@/lib/utils';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { GlassSection } from '@/components/layout/page-shell';
import { useIsDark } from '@/hooks/use-is-dark';
import {
  DownloadIcon,
  UploadIcon,
  TrashIcon,
  PowerIcon,
  BrainCircuitIcon,
  TrendingUpIcon,
  BarChart3Icon,
  ScatterChartIcon,
  GaugeIcon,
} from 'lucide-react';

// -- StatCard sub-component --

function StatCard({ label, value, icon, color, sub }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  const { isDark, isOled } = useIsDark();
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: isOled
          ? 'rgba(22,22,22,0.85)'
          : isDark
            ? 'rgba(255,255,255,0.035)'
            : 'rgba(0,0,0,0.025)',
      }}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  );
}

export function SteeringLabView() {
  const memory = useSteeringStore((s) => s.memory);
  const config = useSteeringStore((s) => s.config);
  const currentBias = useSteeringStore((s) => s.currentBias);
  const stats = useSteeringStore((s) => s.stats);
  const loadFromStorage = useSteeringStore((s) => s.loadFromStorage);
  const isLoaded = useSteeringStore((s) => s.isLoaded);
  const toggleSteering = useSteeringStore((s) => s.toggleSteering);
  const setMasterStrength = useSteeringStore((s) => s.setMasterStrength);
  const resetMemory = useSteeringStore((s) => s.resetMemory);
  const exportJSON = useSteeringStore((s) => s.exportJSON);
  const importJSON = useSteeringStore((s) => s.importJSON);

  useEffect(() => {
    if (!isLoaded) loadFromStorage();
  }, [isLoaded, loadFromStorage]);

  // PCA projection
  const pca = useMemo(() => projectPCA(memory), [memory]);

  // Bayesian prior data for chart
  const priorData = useMemo(() => {
    const labels = DIMENSION_LABELS.slice(0, 14); // Only continuous dims
    return labels.map(label => {
      const prior = memory.priors.dimensions[label];
      return {
        label,
        mean: prior?.mean ?? 0.5,
        variance: prior?.variance ?? 0.05,
        sampleCount: prior?.sampleCount ?? 0,
        confidence: prior ? Math.max(0, 1 - prior.variance * 20) : 0,
      };
    });
  }, [memory.priors]);

  // Current bias values for bar chart
  const biasEntries = useMemo(() => [
    { label: 'Confidence', value: currentBias.confidence, color: 'text-pfc-green' },
    { label: 'Entropy', value: currentBias.entropy, color: 'text-pfc-yellow' },
    { label: 'Dissonance', value: currentBias.dissonance, color: 'text-pfc-red' },
    { label: 'Health', value: currentBias.healthScore, color: 'text-pfc-cyan' },
    { label: 'Risk', value: currentBias.riskScore, color: 'text-pfc-ember' },
    { label: 'Focus Depth', value: currentBias.focusDepth, color: 'text-pfc-violet' },
    { label: 'Temperature', value: currentBias.temperatureScale, color: 'text-muted-foreground' },
  ], [currentBias]);

  const handleExport = () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pfc-steering-memory-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const success = importJSON(text);
      if (!success) alert('Invalid steering memory file');
    };
    input.click();
  };

  const strengthPct = Math.round(currentBias.steeringStrength * 100);

  // Show loading state until steering store is ready
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[60vh] opacity-40">
        <div style={{
          width: '2rem', height: '2rem', borderRadius: '50%',
          border: '2px solid currentColor', borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      {stats.totalExemplars === 0 ? (
        /* Empty state */
        <GlassSection>
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <div className="h-16 w-16 rounded-2xl bg-pfc-violet/10 flex items-center justify-center mb-4">
              <BrainCircuitIcon className="h-8 w-8 text-pfc-violet/50" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight mb-1">No Steering Data Yet</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Submit queries in the chat to start building your steering memory.
              The engine learns from each analysis -- rate results with thumbs up/down for faster adaptation.
            </p>
            <p className="text-xs text-muted-foreground/50 mt-3">
              Steering activates after 3+ exemplars | Full strength at 20+
            </p>
          </div>
        </GlassSection>
      ) : (
        <div className="space-y-6">
          {/* Hero Stats */}
          <GlassSection title="Overview" className="">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Steering Strength"
                value={`${strengthPct}%`}
                icon={<GaugeIcon className="h-3.5 w-3.5" />}
                color={strengthPct > 50 ? 'text-pfc-green' : strengthPct > 10 ? 'text-pfc-yellow' : 'text-muted-foreground'}
              />
              <StatCard
                label="Exemplars"
                value={stats.totalExemplars.toString()}
                icon={<ScatterChartIcon className="h-3.5 w-3.5" />}
                color="text-pfc-violet"
                sub={`${stats.positiveCount}\u2191 ${stats.negativeCount}\u2193 ${stats.neutralCount}~`}
              />
              <StatCard
                label="User Rated"
                value={stats.userRatedCount.toString()}
                icon={<TrendingUpIcon className="h-3.5 w-3.5" />}
                color="text-pfc-cyan"
                sub={`of ${stats.totalExemplars}`}
              />
              <StatCard
                label="Domains"
                value={stats.uniqueDomains.length.toString()}
                icon={<BarChart3Icon className="h-3.5 w-3.5" />}
                color="text-pfc-ember"
                sub={stats.uniqueDomains.slice(0, 3).join(', ')}
              />
            </div>
          </GlassSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PCA Scatter Plot */}
            <GlassSection title="Synthesis Key Space (PCA)">
              {pca ? (
                <div className="relative">
                  <svg viewBox="-3 -3 6 6" className="w-full h-[280px]" preserveAspectRatio="xMidYMid meet">
                    {/* Grid */}
                    <line x1="-3" y1="0" x2="3" y2="0" stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.02" />
                    <line x1="0" y1="-3" x2="0" y2="3" stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.02" />

                    {/* Steering direction arrow */}
                    {pca.steeringArrow && (
                      <line
                        x1="0" y1="0"
                        x2={pca.steeringArrow.dx * 2}
                        y2={pca.steeringArrow.dy * 2}
                        stroke="var(--color-pfc-violet)"
                        strokeWidth="0.04"
                        markerEnd="url(#arrow)"
                        opacity="0.7"
                      />
                    )}
                    <defs>
                      <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-pfc-violet)" opacity="0.7" />
                      </marker>
                    </defs>

                    {/* Points */}
                    {pca.points.map((pt) => (
                      <circle
                        key={pt.id}
                        cx={pt.x}
                        cy={pt.y}
                        r={0.08}
                        fill={pt.score > 0.3 ? 'var(--color-pfc-green)' : pt.score < -0.3 ? 'var(--color-pfc-red)' : 'var(--color-pfc-yellow)'}
                        opacity={0.7}
                      />
                    ))}
                  </svg>
                  <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-1">
                    <span>PC1 ({(pca.varianceExplained[0] * 100).toFixed(0)}%)</span>
                    <span>PC2 ({(pca.varianceExplained[1] * 100).toFixed(0)}%)</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pfc-green" /> Positive</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pfc-yellow" /> Neutral</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pfc-red" /> Negative</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 bg-pfc-violet" style={{ width: 12, height: 2 }} /> Steering</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">Need 3+ exemplars for PCA projection</p>
              )}
            </GlassSection>

            {/* Bayesian Priors */}
            <GlassSection title="Bayesian Prior Distributions">
              <div className="space-y-2">
                {priorData.map(({ label, mean, confidence, sampleCount }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-[100px] truncate font-mono">{label}</span>
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden relative">
                      {/* Mean indicator */}
                      <div
                        className="absolute top-0 h-full w-0.5 bg-pfc-violet"
                        style={{ left: `${mean * 100}%` }}
                      />
                      {/* Confidence fill (centered around 0.5, grows toward mean) */}
                      {sampleCount > 0 && (
                        <div
                          className={cn(
                            'absolute top-0 h-full rounded-full',
                            mean > 0.5 ? 'bg-pfc-green/30' : 'bg-pfc-red/30',
                          )}
                          style={{
                            left: mean > 0.5 ? '50%' : `${mean * 100}%`,
                            width: `${Math.abs(mean - 0.5) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                    <span className="text-[9px] tabular-nums text-muted-foreground/60 w-8 text-right">
                      {sampleCount > 0 ? `${(confidence * 100).toFixed(0)}%` : '\u2014'}
                    </span>
                  </div>
                ))}
              </div>
            </GlassSection>

            {/* Active Steering Bias */}
            <GlassSection title="Active Steering Bias">
              {currentBias.steeringStrength > 0.01 ? (
                <div className="space-y-2">
                  {biasEntries.map(({ label, value, color }) => {
                    const absPct = Math.min(100, Math.abs(value) * 100 / 0.15);
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-[80px] truncate">{label}</span>
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden relative">
                          <div className="absolute top-0 left-1/2 h-full w-px bg-border" />
                          <div
                            className={cn('absolute top-0 h-full rounded-full', color, 'opacity-40')}
                            style={{
                              left: value >= 0 ? '50%' : `${50 - absPct / 2}%`,
                              width: `${absPct / 2}%`,
                            }}
                          />
                        </div>
                        <span className={cn('text-[9px] tabular-nums w-12 text-right font-mono', color)}>
                          {value >= 0 ? '+' : ''}{value.toFixed(3)}
                        </span>
                      </div>
                    );
                  })}
                  <p className="text-[9px] text-muted-foreground/50 mt-2">
                    Source: {currentBias.steeringSource}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">No active bias -- need more exemplars</p>
              )}
            </GlassSection>

            {/* Controls */}
            <GlassSection title="Controls">
              <div className="space-y-4">
                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <GlassBubbleButton onClick={handleExport} color="violet" size="sm">
                    <DownloadIcon className="h-3 w-3" /> Export
                  </GlassBubbleButton>
                  <GlassBubbleButton onClick={handleImport} color="violet" size="sm">
                    <UploadIcon className="h-3 w-3" /> Import
                  </GlassBubbleButton>
                  <GlassBubbleButton onClick={toggleSteering} active={config.enabled} color="green" size="sm">
                    <PowerIcon className="h-3 w-3" />
                    {config.enabled ? 'Active' : 'Off'}
                  </GlassBubbleButton>
                </div>

                {/* Master strength slider */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-muted-foreground">Master Strength</span>
                    <span className="text-xs font-mono tabular-nums text-pfc-violet">{Math.round(config.masterStrength * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(config.masterStrength * 100)}
                    onChange={(e) => setMasterStrength(Number(e.target.value) / 100)}
                    className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-pfc-violet"
                  />
                </div>

                {/* Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Steering Engine</span>
                  <GlassBubbleButton onClick={toggleSteering} active={config.enabled} color="green" size="sm">
                    <PowerIcon className="h-3 w-3" />
                    {config.enabled ? 'Active' : 'Disabled'}
                  </GlassBubbleButton>
                </div>

                {/* Reset */}
                <div className="pt-3 border-t border-border/30">
                  <GlassBubbleButton
                    onClick={() => {
                      if (confirm('Reset all steering memory? This cannot be undone.')) {
                        resetMemory();
                      }
                    }}
                    color="red"
                    size="sm"
                  >
                    <TrashIcon className="h-3 w-3" />
                    Reset Steering Memory
                  </GlassBubbleButton>
                </div>
              </div>
            </GlassSection>
          </div>

          {/* Learning Timeline */}
          {memory.exemplars.length > 2 && (
            <GlassSection title="Learning Timeline">
              <div className="h-[100px]">
                <svg viewBox={`0 0 ${memory.exemplars.length} 2`} className="w-full h-full" preserveAspectRatio="none">
                  {/* Zero line */}
                  <line x1="0" y1="1" x2={memory.exemplars.length} y2="1" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.02" />
                  {/* Score line */}
                  <polyline
                    fill="none"
                    stroke="var(--color-pfc-violet)"
                    strokeWidth="0.04"
                    points={memory.exemplars
                      .map((ex, i) => `${i},${1 - ex.outcome.compositeScore}`)
                      .join(' ')}
                  />
                  {/* Dots */}
                  {memory.exemplars.map((ex, i) => (
                    <circle
                      key={i}
                      cx={i}
                      cy={1 - ex.outcome.compositeScore}
                      r={0.06}
                      fill={ex.outcome.compositeScore > 0.3 ? 'var(--color-pfc-green)' : ex.outcome.compositeScore < -0.3 ? 'var(--color-pfc-red)' : 'var(--color-pfc-yellow)'}
                    />
                  ))}
                </svg>
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-1">
                <span>First exemplar</span>
                <span>Latest</span>
              </div>
            </GlassSection>
          )}
        </div>
      )}
    </>
  );
}
