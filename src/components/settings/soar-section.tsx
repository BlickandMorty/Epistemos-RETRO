import { Section } from '@/components/layout/page-shell';
import { Switch } from '@/components/ui/switch';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useCallback } from 'react';
import { writeString, readString } from '@/lib/storage-versioning';
import { BrainCircuitIcon } from 'lucide-react';

const MAX_ITERATIONS_OPTIONS = [1, 2, 3, 4, 5];

export function SOARSection() {
  const { isDark, isOled } = useIsDark();

  const analyticsEngineEnabled = usePFCStore((s) => s.analyticsEngineEnabled);
  const setAnalyticsEngineEnabled = usePFCStore((s) => s.setAnalyticsEngineEnabled);
  const addToast = usePFCStore((s) => s.addToast);

  // SOAR-specific settings stored in localStorage (no backend commands yet)
  const soarEnabled = readString('pfc-soar-enabled') !== 'false';
  const contradictionDetection = readString('pfc-soar-contradiction') !== 'false';
  const verboseLogging = readString('pfc-soar-verbose') === 'true';
  const maxIterations = parseInt(readString('pfc-soar-max-iterations') ?? '3', 10);

  const handleSoarToggle = useCallback((enabled: boolean) => {
    writeString('pfc-soar-enabled', String(enabled));
    setAnalyticsEngineEnabled(enabled);
    addToast({ type: 'info', message: enabled ? 'SOAR enabled' : 'SOAR disabled' });
  }, [setAnalyticsEngineEnabled, addToast]);

  const handleContradictionToggle = useCallback((enabled: boolean) => {
    writeString('pfc-soar-contradiction', String(enabled));
  }, []);

  const handleVerboseToggle = useCallback((enabled: boolean) => {
    writeString('pfc-soar-verbose', String(enabled));
  }, []);

  const handleMaxIterations = useCallback((n: number) => {
    writeString('pfc-soar-max-iterations', String(n));
  }, []);

  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
  };

  return (
    <Section
      title="SOAR Meta-Reasoning"
      badge={
        <BrainCircuitIcon style={{ width: 16, height: 16, color: mutedColor }} />
      }
    >
      {/* Master toggle */}
      <div style={rowStyle}>
        <div>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Enable SOAR</p>
          <p style={{ fontSize: '0.6875rem', color: mutedColor }}>
            Self-Orchestrated Adaptive Reasoning pipeline
          </p>
        </div>
        <Switch
          checked={soarEnabled && analyticsEngineEnabled}
          onCheckedChange={handleSoarToggle}
        />
      </div>

      {soarEnabled && (
        <>
          {/* Contradiction detection */}
          <div style={rowStyle}>
            <div>
              <p style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Contradiction Detection</p>
              <p style={{ fontSize: '0.6875rem', color: mutedColor }}>
                OOLONG — find conflicting claims across sources
              </p>
            </div>
            <Switch
              checked={contradictionDetection}
              onCheckedChange={handleContradictionToggle}
              size="sm"
            />
          </div>

          {/* Verbose logging */}
          <div style={rowStyle}>
            <div>
              <p style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Verbose Logging</p>
              <p style={{ fontSize: '0.6875rem', color: mutedColor }}>
                Show detailed pipeline reasoning steps
              </p>
            </div>
            <Switch
              checked={verboseLogging}
              onCheckedChange={handleVerboseToggle}
              size="sm"
            />
          </div>

          {/* Max iterations */}
          <div style={{ marginTop: '0.25rem' }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Max Iterations
            </p>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {MAX_ITERATIONS_OPTIONS.map((n) => (
                <GlassBubbleButton
                  key={n}
                  active={maxIterations === n}
                  onClick={() => handleMaxIterations(n)}
                  size="sm"
                >
                  {n}
                </GlassBubbleButton>
              ))}
            </div>
            <p style={{ fontSize: '0.6875rem', color: mutedColor, marginTop: '0.375rem' }}>
              Maximum SOAR reasoning loops before finalizing
            </p>
          </div>
        </>
      )}
    </Section>
  );
}
