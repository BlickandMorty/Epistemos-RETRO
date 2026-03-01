import { PenLineIcon } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { NotesSidebar } from '@/components/notes/notes-sidebar';
import { BlockEditor } from '@/components/notes/block-editor/editor';
import { usePFCStore } from '@/lib/store/use-pfc-store';

export default function NotesPage() {
  const activePageId = usePFCStore((s) => s.activePageId);

  return (
    <PageShell icon={PenLineIcon} title="Notes">
      <div style={{ display: 'flex', gap: '1.5rem', minHeight: 0, flex: 1 }}>
        <NotesSidebar />
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          {activePageId ? (
            <BlockEditor pageId={activePageId} />
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              opacity: 0.4,
              fontSize: '0.875rem',
            }}>
              Select or create a note
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
