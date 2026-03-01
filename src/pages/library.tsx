import { LibraryIcon } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';

export default function LibraryPage() {
  return (
    <PageShell icon={LibraryIcon} title="Library">
      <p style={{ opacity: 0.5, fontSize: '0.875rem' }}>
        Knowledge library — coming in Phase 6.
      </p>
    </PageShell>
  );
}
