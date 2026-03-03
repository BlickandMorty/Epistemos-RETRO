import { useMemo } from 'react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useIsDark } from '@/hooks/use-is-dark';
import { NetworkIcon, XIcon, RotateCcwIcon, SlidersIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConceptNode {
  concept: string;
  weight: number;
  autoWeight: number;
  effectiveWeight: number;
  queryCount: number;
  isActive: boolean;
}

export function ConceptHierarchyPanel() {
  const { isDark } = useIsDark();
  const conceptWeights = usePFCStore((s) => s.conceptWeights);
  const activeConcepts = usePFCStore((s) => s.activeConcepts);
  const conceptHierarchyOpen = usePFCStore((s) => s.conceptHierarchyOpen);
  const toggleConceptHierarchy = usePFCStore((s) => s.toggleConceptHierarchy);
  const setConceptWeight = usePFCStore((s) => s.setConceptWeight);
  const resetAllConceptWeights = usePFCStore((s) => s.resetAllConceptWeights);

  const mutedColor = isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const panelBg = isDark ? 'rgba(20,19,24,0.95)' : 'rgba(255,255,255,0.95)';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const concepts: ConceptNode[] = useMemo(() => {
    const activeSet = new Set(activeConcepts || []);
    return Object.values(conceptWeights)
      .map((cw) => ({
        concept: cw.concept,
        weight: cw.weight,
        autoWeight: cw.autoWeight,
        effectiveWeight: cw.weight * cw.autoWeight,
        queryCount: cw.queryCount,
        isActive: activeSet.has(cw.concept),
      }))
      .sort((a, b) => b.effectiveWeight - a.effectiveWeight);
  }, [conceptWeights, activeConcepts]);

  if (!conceptHierarchyOpen) {
    return (
      <button
        onClick={toggleConceptHierarchy}
        style={{
          position: 'fixed',
          right: '1rem',
          top: '5rem',
          zIndex: 50,
          padding: '0.5rem',
          borderRadius: '0.5rem',
          border: `1px solid ${borderColor}`,
          background: panelBg,
          backdropFilter: 'blur(12px)',
          cursor: 'pointer',
          color: mutedColor,
        }}
        title="Show Concept Hierarchy"
      >
        <NetworkIcon style={{ width: 18, height: 18 }} />
        {concepts.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#5E9EFF',
              color: '#fff',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {concepts.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed',
          right: '1rem',
          top: '5rem',
          width: '18rem',
          maxHeight: 'calc(100vh - 7rem)',
          zIndex: 50,
          background: panelBg,
          backdropFilter: 'blur(20px) saturate(1.5)',
          border: `1px solid ${borderColor}`,
          borderRadius: '0.75rem',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '0.75rem 1rem',
            borderBottom: `1px solid ${borderColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <NetworkIcon style={{ width: 14, height: 14, color: '#5E9EFF' }} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Concept Hierarchy</span>
          </div>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              onClick={resetAllConceptWeights}
              title="Reset all weights"
              style={{
                padding: '0.25rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: mutedColor,
              }}
            >
              <RotateCcwIcon style={{ width: 12, height: 12 }} />
            </button>
            <button
              onClick={toggleConceptHierarchy}
              style={{
                padding: '0.25rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: mutedColor,
              }}
            >
              <XIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* Concept List */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem' }}>
          {concepts.length === 0 ? (
            <div
              style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                color: mutedColor,
                fontSize: '0.75rem',
              }}
            >
              <NetworkIcon style={{ width: 24, height: 24, opacity: 0.3, marginBottom: '0.5rem' }} />
              <p>No concepts extracted yet</p>
              <p style={{ marginTop: '0.25rem', opacity: 0.7 }}>
                Concepts appear as you chat
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {concepts.map((concept) => (
                <ConceptItem
                  key={concept.concept}
                  concept={concept}
                  isDark={isDark}
                  mutedColor={mutedColor}
                  onWeightChange={(w) => setConceptWeight(concept.concept, w)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer stats */}
        {concepts.length > 0 && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderTop: `1px solid ${borderColor}`,
              fontSize: '0.625rem',
              color: mutedColor,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{concepts.length} concepts</span>
            <span>{concepts.filter((c) => c.isActive).length} active</span>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

interface ConceptItemProps {
  concept: ConceptNode;
  isDark: boolean;
  mutedColor: string;
  onWeightChange: (weight: number) => void;
}

function ConceptItem({ concept, isDark, mutedColor, onWeightChange }: ConceptItemProps) {
  const getWeightColor = (w: number) => {
    if (w >= 1.5) return '#30D158'; // High - green
    if (w >= 0.8) return '#5E9EFF'; // Normal - blue
    return '#FF6482'; // Low - red
  };

  return (
    <div
      style={{
        padding: '0.5rem 0.625rem',
        borderRadius: '0.5rem',
        background: concept.isActive
          ? isDark
            ? 'rgba(94,158,255,0.12)'
            : 'rgba(94,158,255,0.08)'
          : isDark
          ? 'rgba(255,255,255,0.03)'
          : 'rgba(0,0,0,0.02)',
        border: `1px solid ${
          concept.isActive
            ? 'rgba(94,158,255,0.3)'
            : isDark
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(0,0,0,0.04)'
        }`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.25rem',
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: concept.isActive ? 500 : 400,
            color: concept.isActive ? '#5E9EFF' : isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
          }}
        >
          {concept.concept}
        </span>
        <span
          style={{
            fontSize: '0.625rem',
            color: getWeightColor(concept.effectiveWeight),
            fontWeight: 500,
          }}
        >
          {concept.effectiveWeight.toFixed(1)}x
        </span>
      </div>

      {/* Weight slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <SlidersIcon style={{ width: 10, height: 10, color: mutedColor }} />
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={concept.weight}
          onChange={(e) => onWeightChange(parseFloat(e.target.value))}
          style={{
            flex: 1,
            height: 3,
            borderRadius: '2px',
            WebkitAppearance: 'none',
            appearance: 'none',
            background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: '0.625rem', color: mutedColor, minWidth: '1.5rem' }}>
          {concept.queryCount}x
        </span>
      </div>

      {/* Weight bar visualization */}
      <div
        style={{
          marginTop: '0.375rem',
          height: 2,
          borderRadius: '1px',
          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, (concept.effectiveWeight / 3) * 100)}%`,
            height: '100%',
            background: getWeightColor(concept.effectiveWeight),
            borderRadius: '1px',
            transition: 'width 0.2s ease',
          }}
        />
      </div>
    </div>
  );
}
