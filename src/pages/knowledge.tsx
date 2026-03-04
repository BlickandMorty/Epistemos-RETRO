import { useState } from 'react';
import { useIsDark } from '@/hooks/use-is-dark';
import { SegmentedToggle, type KnowledgeMode } from '@/components/knowledge/segmented-toggle';

export default function KnowledgePage() {
  const { isDark } = useIsDark();
  const [mode, setMode] = useState<KnowledgeMode>('notes');

  const panelBg = isDark ? '#0a0a0e' : '#f5f5f7';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: panelBg, color: 'var(--foreground)',
    }}>
      {/* ── Top bar with centered toggle ──────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0.5rem 1rem',
        background: isDark ? 'rgba(20,19,24,0.85)' : 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)',
        flexShrink: 0,
      }}>
        <SegmentedToggle mode={mode} onModeChange={setMode} />
      </div>

      {/* ── Notes mode ────────────────────────────────────────── */}
      <div style={{
        display: mode === 'notes' ? 'flex' : 'none',
        flex: 1, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '0.875rem', opacity: 0.4 }}>Notes mode</span>
      </div>

      {/* ── Graph mode ────────────────────────────────────────── */}
      <div style={{
        display: mode === 'graph' ? 'block' : 'none',
        flex: 1, overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%',
        }}>
          <span style={{ fontSize: '0.875rem', opacity: 0.4 }}>Graph mode</span>
        </div>
      </div>
    </div>
  );
}
