import { useState, useEffect, useCallback } from 'react';
import { Section } from '@/components/layout/page-shell';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';
import {
  FolderOpenIcon,
  DownloadIcon,
  UploadIcon,
  Trash2Icon,
  InfoIcon,
  LoaderIcon,
} from 'lucide-react';

export function DataSection() {
  const { isDark, isOled } = useIsDark();
  const addToast = usePFCStore((s) => s.addToast);

  // Vault state
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // App info
  const [appVersion, setAppVersion] = useState('');

  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const subSectionStyle: React.CSSProperties = {
    padding: '0.75rem 0',
    borderTop: `1px solid ${isOled ? 'rgba(255,255,255,0.06)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}`,
  };

  // Load data on mount
  useEffect(() => {
    (async () => {
      const [vaultRes, appRes] = await Promise.all([
        commands.getVaultPath(),
        commands.getAppInfo(),
      ]);
      if (vaultRes.status === 'ok') setVaultPath(vaultRes.data);
      if (appRes.status === 'ok') {
        const info = appRes.data as Record<string, unknown>;
        setAppVersion(`v${info.version ?? '?'} · ${info.platform ?? ''}`);
      }
    })();
  }, []);

  // Vault path input
  const [vaultInput, setVaultInput] = useState('');

  // Vault actions
  const handleSetVaultPath = useCallback(async () => {
    const path = vaultInput.trim();
    if (!path) {
      addToast({ type: 'error', message: 'Enter a vault path' });
      return;
    }
    const res = await commands.setVaultPath(path);
    if (res.status === 'ok') {
      setVaultPath(path);
      setVaultInput('');
      addToast({ type: 'success', message: 'Vault path updated' });
    } else {
      addToast({ type: 'error', message: 'Failed to set vault path' });
    }
  }, [vaultInput, addToast]);

  const handleImport = useCallback(async () => {
    if (!vaultPath) {
      addToast({ type: 'error', message: 'Set a vault path first' });
      return;
    }
    setImporting(true);
    const res = await commands.importVault();
    setImporting(false);
    if (res.status === 'ok') {
      const { imported, updated, skipped, errors } = res.data;
      addToast({
        type: errors > 0 ? 'error' : 'success',
        message: `Import: ${imported} new, ${updated} updated, ${skipped} skipped${errors > 0 ? `, ${errors} errors` : ''}`,
      });
    } else {
      addToast({ type: 'error', message: 'Vault import failed' });
    }
  }, [vaultPath, addToast]);

  const handleExport = useCallback(async () => {
    if (!vaultPath) {
      addToast({ type: 'error', message: 'Set a vault path first' });
      return;
    }
    setExporting(true);
    const res = await commands.exportAll();
    setExporting(false);
    if (res.status === 'ok') {
      addToast({ type: 'success', message: `Exported ${res.data} pages to vault` });
    } else {
      addToast({ type: 'error', message: 'Vault export failed' });
    }
  }, [vaultPath, addToast]);

  // Reset all
  const handleResetAll = useCallback(() => {
    localStorage.clear();
    usePFCStore.getState().reset();
    addToast({ type: 'info', message: 'All settings reset. Reload recommended.' });
  }, [addToast]);

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' };

  return (
    <Section title="Data & Storage">
      {/* ── Vault ── */}
      <div>
        <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
          Vault Directory
        </p>
        <p style={{
          fontSize: '0.75rem',
          color: mutedColor,
          marginBottom: '0.625rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {vaultPath || 'No vault configured'}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <Input
            value={vaultInput}
            onChange={(e) => setVaultInput(e.target.value)}
            placeholder={vaultPath ? 'Enter new vault path' : 'Enter vault directory path'}
            style={{
              flex: 1,
              background: isOled ? 'rgba(25,25,25,0.8)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              borderRadius: '0.75rem',
              padding: '0.5rem 0.75rem',
              fontSize: '0.8125rem',
            }}
          />
          <GlassBubbleButton onClick={handleSetVaultPath} size="sm">
            <FolderOpenIcon style={{ width: 12, height: 12 }} />
            Set
          </GlassBubbleButton>
        </div>
        <div style={rowStyle}>
          <GlassBubbleButton onClick={handleImport} disabled={!vaultPath || importing} size="sm">
            {importing
              ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              : <DownloadIcon style={{ width: 12, height: 12 }} />}
            Import
          </GlassBubbleButton>
          <GlassBubbleButton onClick={handleExport} disabled={!vaultPath || exporting} size="sm">
            {exporting
              ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              : <UploadIcon style={{ width: 12, height: 12 }} />}
            Export All
          </GlassBubbleButton>
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div style={subSectionStyle}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#FF453A' }}>
          Danger Zone
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <div>
              <GlassBubbleButton size="sm">
                <Trash2Icon style={{ width: 12, height: 12 }} />
                Reset All Settings
              </GlassBubbleButton>
            </div>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all settings?</AlertDialogTitle>
              <AlertDialogDescription>
                This clears all preferences, API keys, and UI state. Your notes and vault data are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetAll}>
                Reset Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {appVersion && (
          <p style={{ fontSize: '0.6875rem', color: mutedColor, marginTop: '0.75rem' }}>
            <InfoIcon style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Epistemos Retro {appVersion}
          </p>
        )}
      </div>
    </Section>
  );
}
