import { BarChart3Icon } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';

export default function AnalyticsPage() {
  return (
    <PageShell icon={BarChart3Icon} title="Analytics">
      <p style={{ opacity: 0.5, fontSize: '0.875rem' }}>
        Epistemic analytics — coming in Phase 8.
      </p>
    </PageShell>
  );
}
