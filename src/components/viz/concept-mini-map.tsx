import { useMemo } from 'react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useIsDark } from '@/hooks/use-is-dark';
import { TagIcon, SparklesIcon } from 'lucide-react';

interface ConceptMiniMapProps {
  messageConcepts: string[];
}

export function ConceptMiniMap({ messageConcepts }: ConceptMiniMapProps) {
  const { isDark } = useIsDark();
  const conceptWeights = usePFCStore((s) => s.conceptWeights);

  const mutedColor = isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';

  const concepts = useMemo(() => {
    return messageConcepts
      .map((concept) => {
        const cw = conceptWeights[concept];
        const effectiveWeight = cw ? cw.weight * cw.autoWeight : 1.0;
        return {
          concept,
          weight: effectiveWeight,
          isNew: !cw,
        };
      })
      .sort((a, b) => b.weight - a.weight);
  }, [messageConcepts, conceptWeights]);

  if (concepts.length === 0) return null;

  const getWeightStyles = (weight: number, isNew: boolean) => {
    if (isNew) {
      return {
        bg: isDark ? 'rgba(255,214,10,0.15)' : 'rgba(255,214,10,0.2)',
        border: 'rgba(255,214,10,0.4)',
        color: '#FFD60A',
      };
    }
    if (weight >= 1.5) {
      return {
        bg: isDark ? 'rgba(48,209,88,0.15)' : 'rgba(48,209,88,0.2)',
        border: 'rgba(48,209,88,0.4)',
        color: '#30D158',
      };
    }
    if (weight <= 0.5) {
      return {
        bg: isDark ? 'rgba(255,100,130,0.15)' : 'rgba(255,100,130,0.2)',
        border: 'rgba(255,100,130,0.4)',
        color: '#FF6482',
      };
    }
    return {
      bg: isDark ? 'rgba(94,158,255,0.12)' : 'rgba(94,158,255,0.15)',
      border: 'rgba(94,158,255,0.3)',
      color: '#5E9EFF',
    };
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.375rem',
        marginTop: '0.75rem',
        paddingTop: '0.75rem',
        borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.625rem',
          color: mutedColor,
          marginRight: '0.25rem',
        }}
      >
        <TagIcon style={{ width: 10, height: 10 }} />
        <span>Concepts:</span>
      </div>

      {concepts.slice(0, 8).map(({ concept, weight, isNew }) => {
        const styles = getWeightStyles(weight, isNew);
        return (
          <span
            key={concept}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.125rem 0.5rem',
              borderRadius: '9999px',
              fontSize: '0.6875rem',
              background: styles.bg,
              border: `1px solid ${styles.border}`,
              color: styles.color,
              fontWeight: isNew ? 500 : 400,
            }}
          >
            {isNew && (
              <SparklesIcon style={{ width: 8, height: 8 }} />
            )}
            {concept}
          </span>
        );
      })}

      {concepts.length > 8 && (
        <span
          style={{
            padding: '0.125rem 0.5rem',
            borderRadius: '9999px',
            fontSize: '0.6875rem',
            background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            color: mutedColor,
          }}
        >
          +{concepts.length - 8} more
        </span>
      )}
    </div>
  );
}
