import { BotIcon } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';

export default function DaemonPage() {
  return (
    <PageShell icon={BotIcon} title="Daemon">
      <p style={{ opacity: 0.5, fontSize: '0.875rem' }}>
        Background research daemon — coming in Phase 7.
      </p>
    </PageShell>
  );
}
