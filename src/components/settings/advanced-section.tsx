import { useState } from 'react';
import { Section } from '@/components/layout/page-shell';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import {
  ChevronDownIcon,
  ShieldIcon,
  ZapIcon,
} from 'lucide-react';
import { STAGE_LABELS } from '@/lib/constants';
import type { StageResult } from '@/lib/types';

function SignalGauge({ label, value, max, color, format }: {
  label: string;
  value: number;
  max: number;
  color: string;
  format?: (v: number) => string;
}) {
  const { isDark, isOled } = useIsDark();
  const pct = Math.min((value / max) * 100, 100);
  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';

  return (
    <div style={{ flex: '1 1 8rem', minWidth: '8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.75rem', color: mutedColor }}>{label}</span>
        <span style={{ fontSize: '0.8125rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <div style={{
        height: 4,
        borderRadius: 2,
        background: isOled ? 'rgba(255,255,255,0.06)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 2,
          background: color,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

const SAFETY_COLORS: Record<string, string> = {
  green: '#30D158',
  yellow: '#FFD60A',
  orange: '#FF9F0A',
  red: '#FF453A',
};

export function AdvancedSection() {
  const { isDark, isOled } = useIsDark();
  const [expanded, setExpanded] = useState(false);

  const confidence = usePFCStore((s) => s.confidence);
  const entropy = usePFCStore((s) => s.entropy);
  const dissonance = usePFCStore((s) => s.dissonance);
  const healthScore = usePFCStore((s) => s.healthScore);
  const safetyState = usePFCStore((s) => s.safetyState);
  const riskScore = usePFCStore((s) => s.riskScore);
  const pipelineStages = usePFCStore((s) => s.pipelineStages);
  const tda = usePFCStore((s) => s.tda);
  const queriesProcessed = usePFCStore((s) => s.queriesProcessed);
  const totalTraces = usePFCStore((s) => s.totalTraces);
  const skillGapsDetected = usePFCStore((s) => s.skillGapsDetected);
  const focusDepth = usePFCStore((s) => s.focusDepth);
  const temperatureScale = usePFCStore((s) => s.temperatureScale);

  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const safetyColor = SAFETY_COLORS[safetyState] ?? SAFETY_COLORS.green;
  const subBorder = `1px solid ${isOled ? 'rgba(255,255,255,0.06)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}`;

  return (
    <Section
      title="Advanced"
      badge={
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: mutedColor,
            fontSize: '0.75rem',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.375rem',
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
          <ChevronDownIcon style={{
            width: 14,
            height: 14,
            transition: 'transform 0.2s ease',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }} />
        </button>
      }
    >
      {/* Compact summary — always visible */}
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        <SignalGauge label="Confidence" value={confidence} max={1} color="#5E9EFF" format={(v) => `${(v * 100).toFixed(0)}%`} />
        <SignalGauge label="Health" value={healthScore} max={1} color="#30D158" format={(v) => `${(v * 100).toFixed(0)}%`} />
        <SignalGauge label="Entropy" value={entropy} max={5} color="#FFD60A" />
        <SignalGauge label="Dissonance" value={dissonance} max={1} color="#FF9F0A" />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Safety + Risk */}
          <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem 0', borderTop: subBorder }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldIcon style={{ width: 14, height: 14, color: safetyColor }} />
              <span style={{ fontSize: '0.8125rem' }}>Safety</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: safetyColor, textTransform: 'capitalize' }}>
                {safetyState}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ZapIcon style={{ width: 14, height: 14, color: riskScore > 0.5 ? '#FF453A' : mutedColor }} />
              <span style={{ fontSize: '0.8125rem' }}>Risk</span>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                color: riskScore > 0.7 ? '#FF453A' : riskScore > 0.3 ? '#FF9F0A' : '#30D158',
              }}>
                {(riskScore * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Pipeline Stages */}
          <div style={{ borderTop: subBorder, paddingTop: '0.75rem' }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>Pipeline</p>
            {pipelineStages.map((stage: StageResult) => {
              const statusColors: Record<string, string> = {
                idle: mutedColor,
                active: '#5E9EFF',
                done: '#30D158',
                error: '#FF453A',
              };
              return (
                <div key={stage.stage} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                  <span style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                    backgroundColor: statusColors[stage.status] ?? mutedColor, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, fontSize: '0.8125rem' }}>{STAGE_LABELS[stage.stage]}</span>
                  <span style={{ fontSize: '0.6875rem', color: statusColors[stage.status] ?? mutedColor, textTransform: 'capitalize' }}>
                    {stage.status}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Knowledge Stats */}
          <div style={{ borderTop: subBorder, paddingTop: '0.75rem' }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Knowledge Stats</p>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {[
                { label: 'Queries', value: queriesProcessed },
                { label: 'Traces', value: totalTraces },
                { label: 'Skill Gaps', value: skillGapsDetected },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {value.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: mutedColor }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* TDA + Focus */}
          <div style={{ borderTop: subBorder, paddingTop: '0.75rem' }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Topology & Focus</p>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {[
                { label: 'β₀', value: tda.betti0 },
                { label: 'β₁', value: tda.betti1 },
                { label: 'Persistence Entropy', value: tda.persistenceEntropy.toFixed(3) },
                { label: 'Focus Depth', value: focusDepth },
                { label: 'Temperature', value: temperatureScale.toFixed(2) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                  <div style={{ fontSize: '0.6875rem', color: mutedColor }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
