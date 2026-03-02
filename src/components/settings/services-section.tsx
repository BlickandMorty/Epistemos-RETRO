import { useState, useEffect, useCallback } from 'react';
import { Section } from '@/components/layout/page-shell';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';
import type { LocalServiceStatus } from '@/lib/bindings';
import {
  RefreshCwIcon,
  PlayIcon,
  SquareIcon,
  LoaderIcon,
  SearchIcon,
  NetworkIcon,
} from 'lucide-react';

export function ServicesSection() {
  const { isDark, isOled } = useIsDark();
  const addToast = usePFCStore((s) => s.addToast);

  const [services, setServices] = useState<LocalServiceStatus[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [vaultWatching, setVaultWatching] = useState(false);
  const [vaultToggling, setVaultToggling] = useState(false);
  const [physicsRunning, setPhysicsRunning] = useState(false);
  const [physicsToggling, setPhysicsToggling] = useState(false);
  const [rebuildingSearch, setRebuildingSearch] = useState(false);
  const [rebuildingGraph, setRebuildingGraph] = useState(false);

  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const subBorder = `1px solid ${isOled ? 'rgba(255,255,255,0.06)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}`;

  const refreshAll = useCallback(async () => {
    setServicesLoading(true);
    const [svcRes, vaultRes, physRes] = await Promise.all([
      commands.checkLocalServices(),
      commands.isVaultWatching(),
      commands.isPhysicsRunning(),
    ]);
    if (svcRes.status === 'ok') setServices(svcRes.data);
    if (vaultRes.status === 'ok') setVaultWatching(vaultRes.data);
    if (physRes.status === 'ok') setPhysicsRunning(physRes.data);
    setServicesLoading(false);
  }, []);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const handleVaultToggle = useCallback(async () => {
    setVaultToggling(true);
    if (vaultWatching) {
      const res = await commands.stopVaultWatcher();
      if (res.status === 'ok') {
        setVaultWatching(false);
        addToast({ type: 'info', message: 'Vault watcher stopped' });
      } else {
        addToast({ type: 'error', message: 'Failed to stop vault watcher' });
      }
    } else {
      const res = await commands.startVaultWatcher();
      if (res.status === 'ok') {
        setVaultWatching(true);
        addToast({ type: 'success', message: 'Vault watcher started' });
      } else {
        addToast({ type: 'error', message: 'Failed to start vault watcher' });
      }
    }
    setVaultToggling(false);
  }, [vaultWatching, addToast]);

  const handlePhysicsToggle = useCallback(async () => {
    setPhysicsToggling(true);
    if (physicsRunning) {
      const res = await commands.stopPhysics();
      if (res.status === 'ok') {
        setPhysicsRunning(false);
        addToast({ type: 'info', message: 'Physics engine stopped' });
      } else {
        addToast({ type: 'error', message: 'Failed to stop physics engine' });
      }
    } else {
      const res = await commands.startPhysics();
      if (res.status === 'ok') {
        setPhysicsRunning(true);
        addToast({ type: 'success', message: 'Physics engine started' });
      } else {
        addToast({ type: 'error', message: 'Failed to start physics engine' });
      }
    }
    setPhysicsToggling(false);
  }, [physicsRunning, addToast]);

  const handleRebuildSearch = useCallback(async () => {
    setRebuildingSearch(true);
    const res = await commands.rebuildSearchIndex();
    setRebuildingSearch(false);
    if (res.status === 'ok') {
      addToast({ type: 'success', message: `Search index rebuilt (${res.data} pages indexed)` });
    } else {
      addToast({ type: 'error', message: 'Search index rebuild failed' });
    }
  }, [addToast]);

  const handleRebuildGraph = useCallback(async () => {
    setRebuildingGraph(true);
    const res = await commands.rebuildGraph();
    setRebuildingGraph(false);
    if (res.status === 'ok') {
      const { nodes, edges } = res.data;
      addToast({ type: 'success', message: `Graph rebuilt (${nodes.length} nodes, ${edges.length} edges)` });
    } else {
      addToast({ type: 'error', message: 'Graph rebuild failed' });
    }
  }, [addToast]);

  const statusDot = (available: boolean): React.CSSProperties => ({
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: available ? '#30D158' : '#FF453A',
    flexShrink: 0,
  });

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0',
  };

  return (
    <Section title="Services">
      {/* AI Services */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600 }}>AI Services</p>
          <GlassBubbleButton onClick={refreshAll} disabled={servicesLoading} size="sm">
            {servicesLoading
              ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              : <RefreshCwIcon style={{ width: 12, height: 12 }} />}
            Refresh
          </GlassBubbleButton>
        </div>
        {servicesLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
            <LoaderIcon style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.8125rem', color: mutedColor }}>Checking services...</span>
          </div>
        ) : services.length === 0 ? (
          <p style={{ fontSize: '0.8125rem', color: mutedColor }}>
            No local AI services detected. Configure providers in Inference above.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
            {services.map((svc) => (
              <div key={svc.name} style={rowStyle}>
                <span style={statusDot(svc.available)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{svc.name}</span>
                  <span style={{ fontSize: '0.75rem', color: mutedColor, marginLeft: '0.5rem' }}>
                    {svc.endpoint}
                  </span>
                </div>
                {svc.available && svc.latency_ms != null && (
                  <span style={{ fontSize: '0.6875rem', color: mutedColor, fontVariantNumeric: 'tabular-nums' }}>
                    {svc.latency_ms}ms
                  </span>
                )}
                {!svc.available && svc.error && (
                  <span style={{ fontSize: '0.6875rem', color: '#FF453A' }}>{svc.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Background Processes */}
      <div style={{ borderTop: subBorder, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Background Processes
        </p>

        {/* Vault Watcher */}
        <div style={rowStyle}>
          <span style={statusDot(vaultWatching)} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Vault Watcher</span>
            <p style={{ fontSize: '0.75rem', color: mutedColor, marginTop: '0.125rem' }}>
              {vaultWatching ? 'Watching vault for changes' : 'Not watching'}
            </p>
          </div>
          <GlassBubbleButton onClick={handleVaultToggle} disabled={vaultToggling} size="sm">
            {vaultToggling
              ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              : vaultWatching
                ? <SquareIcon style={{ width: 12, height: 12 }} />
                : <PlayIcon style={{ width: 12, height: 12 }} />}
            {vaultWatching ? 'Stop' : 'Start'}
          </GlassBubbleButton>
        </div>

        {/* Physics Engine */}
        <div style={{ ...rowStyle, borderTop: subBorder }}>
          <span style={statusDot(physicsRunning)} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Physics Engine</span>
            <p style={{ fontSize: '0.75rem', color: mutedColor, marginTop: '0.125rem' }}>
              {physicsRunning ? 'Rapier3D simulation active' : 'Physics paused'}
            </p>
          </div>
          <GlassBubbleButton onClick={handlePhysicsToggle} disabled={physicsToggling} size="sm">
            {physicsToggling
              ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              : physicsRunning
                ? <SquareIcon style={{ width: 12, height: 12 }} />
                : <PlayIcon style={{ width: 12, height: 12 }} />}
            {physicsRunning ? 'Stop' : 'Start'}
          </GlassBubbleButton>
        </div>
      </div>

      {/* Maintenance */}
      <div style={{ borderTop: subBorder, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Maintenance
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <GlassBubbleButton onClick={handleRebuildSearch} disabled={rebuildingSearch} size="sm">
            {rebuildingSearch
              ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              : <SearchIcon style={{ width: 12, height: 12 }} />}
            Rebuild Search Index
          </GlassBubbleButton>
          <GlassBubbleButton onClick={handleRebuildGraph} disabled={rebuildingGraph} size="sm">
            {rebuildingGraph
              ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              : <NetworkIcon style={{ width: 12, height: 12 }} />}
            Rebuild Graph
          </GlassBubbleButton>
        </div>
      </div>
    </Section>
  );
}
