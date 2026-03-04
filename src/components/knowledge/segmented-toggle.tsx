import { PenLineIcon, NetworkIcon } from 'lucide-react';
import { useIsDark } from '@/hooks/use-is-dark';

export type KnowledgeMode = 'notes' | 'graph';

const TRANSITION = 'all 0.15s cubic-bezier(0.32,0.72,0,1)';

interface SegmentedToggleProps {
  mode: KnowledgeMode;
  onModeChange: (mode: KnowledgeMode) => void;
}

function Segment({ label, icon, active, isDark, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; isDark: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.375rem',
        padding: '6px 14px', borderRadius: '6px',
        border: 'none', cursor: 'pointer',
        fontSize: '0.8125rem', fontWeight: 500,
        background: active ? 'rgba(var(--pfc-accent-rgb), 0.15)' : 'transparent',
        color: active
          ? 'var(--pfc-accent)'
          : (isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)'),
        transition: TRANSITION,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function SegmentedToggle({ mode, onModeChange }: SegmentedToggleProps) {
  const { isDark } = useIsDark();

  return (
    <div style={{
      display: 'inline-flex', gap: '2px', padding: '2px',
      borderRadius: '8px',
      background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    }}>
      <Segment
        label="Notes"
        icon={<PenLineIcon style={{ width: 14, height: 14 }} />}
        active={mode === 'notes'}
        isDark={isDark}
        onClick={() => onModeChange('notes')}
      />
      <Segment
        label="Graph"
        icon={<NetworkIcon style={{ width: 14, height: 14 }} />}
        active={mode === 'graph'}
        isDark={isDark}
        onClick={() => onModeChange('graph')}
      />
    </div>
  );
}
