'use client';

import { useState, memo } from 'react';
import type { TruthAssessment } from '@/lib/engine/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ShieldCheckIcon, ChevronDownIcon } from 'lucide-react';
import { useIsDark } from '@/hooks/use-is-dark';

interface TruthBotCardProps {
  assessment: TruthAssessment;
}

function TruthBotCardBase({ assessment }: TruthBotCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isDark, isOled } = useIsDark();
  const truthPct = Math.round(assessment.overallTruthLikelihood * 100);

  // M3-flat tonal surface — slightly darker than parent deep-analysis container
  const surfaceBg = isOled
    ? 'rgba(20,20,20,0.7)'
    : isDark
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(0,0,0,0.04)';

  const labelColor = isOled
    ? 'rgba(180,180,180,0.7)'
    : isDark
      ? 'rgba(156,143,128,0.8)'
      : 'rgba(0,0,0,0.45)';

  const sectionLabelColor = isOled
    ? 'rgba(140,140,140,0.6)'
    : isDark
      ? 'rgba(156,143,128,0.5)'
      : 'rgba(0,0,0,0.3)';

  const bodyColor = isOled
    ? 'rgba(200,200,200,0.85)'
    : isDark
      ? 'rgba(237,224,212,0.8)'
      : 'rgba(0,0,0,0.6)';

  const truthColor = truthPct > 60
    ? 'var(--color-pfc-green, #4ade80)'
    : truthPct > 35
      ? 'var(--color-pfc-yellow, #facc15)'
      : 'var(--color-pfc-red, #f87171)';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger style={{ width: '100%', display: 'block' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.625rem 0.875rem',
            borderRadius: isOpen ? '0.75rem 0.75rem 0 0' : '0.75rem',
            background: surfaceBg,
            cursor: 'pointer',
            transition: 'background 0.15s ease, border-radius 0.15s ease',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheckIcon style={{ height: '0.875rem', width: '0.875rem', color: 'var(--color-pfc-cyan, #22d3ee)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: labelColor }}>
              Truth Assessment
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: truthColor,
              }}
            >
              {truthPct}%
            </span>
            <ChevronDownIcon
              style={{
                height: '0.75rem',
                width: '0.75rem',
                color: labelColor,
                transition: 'transform 0.2s ease',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div
          style={{
            padding: '0.75rem 0.875rem',
            borderRadius: '0 0 0.75rem 0.75rem',
            background: surfaceBg,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.875rem',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {/* Signal Interpretation */}
          <TruthSection title="Signal Interpretation" labelColor={sectionLabelColor}>
            <p style={{ fontSize: '0.75rem', color: bodyColor, lineHeight: 1.7, wordBreak: 'break-word' }}>
              {assessment.signalInterpretation}
            </p>
          </TruthSection>

          {/* Weaknesses */}
          <TruthSection title="Weaknesses" labelColor={sectionLabelColor}>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', margin: 0, padding: 0, listStyle: 'none' }}>
              {assessment.weaknesses.map((w, i) => (
                <li key={i} style={{ fontSize: '0.75rem', color: bodyColor, display: 'flex', gap: '0.375rem' }}>
                  <span style={{ color: 'var(--color-pfc-red, #f87171)', flexShrink: 0 }}>•</span>
                  {w}
                </li>
              ))}
            </ul>
          </TruthSection>

          {/* Blind Spots */}
          <TruthSection title="Blind Spots" labelColor={sectionLabelColor}>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', margin: 0, padding: 0, listStyle: 'none' }}>
              {assessment.blindSpots.map((b, i) => (
                <li key={i} style={{ fontSize: '0.75rem', color: bodyColor, display: 'flex', gap: '0.375rem' }}>
                  <span style={{ color: 'var(--color-pfc-yellow, #facc15)', flexShrink: 0 }}>•</span>
                  {b}
                </li>
              ))}
            </ul>
          </TruthSection>

          {/* Recommended Actions */}
          <TruthSection title="Recommended Actions" labelColor={sectionLabelColor}>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', margin: 0, padding: 0, listStyle: 'none' }}>
              {assessment.recommendedActions.map((a, i) => (
                <li key={i} style={{ fontSize: '0.75rem', color: bodyColor, display: 'flex', gap: '0.375rem' }}>
                  <span style={{ color: 'var(--color-pfc-green, #4ade80)', flexShrink: 0 }}>→</span>
                  {a}
                </li>
              ))}
            </ul>
          </TruthSection>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TruthSection({ title, labelColor, children }: { title: string; labelColor: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{
        fontSize: '0.625rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: labelColor,
        marginBottom: '0.25rem',
        fontFamily: 'var(--font-sans)',
      }}>
        {title}
      </p>
      {children}
    </div>
  );
}

export const TruthBotCard = memo(TruthBotCardBase);
