import { SettingsIcon } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';

export default function SettingsPage() {
  return (
    <PageShell icon={SettingsIcon} title="Settings">
      <p style={{ opacity: 0.5, fontSize: '0.875rem' }}>
        Settings panel — coming in Phase 3.
      </p>
    </PageShell>
  );
}
