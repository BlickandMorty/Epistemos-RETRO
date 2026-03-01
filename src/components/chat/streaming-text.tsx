'use client';

import { usePFCStore } from '@/lib/store/use-pfc-store';
import { MarkdownContent } from '../shared/markdown';

// Stable selectors — extracted outside component to avoid re-creating on every render
const selectStreamingText = (s: { streamingText: string }) => s.streamingText;
const selectIsStreaming = (s: { isStreaming: boolean }) => s.isStreaming;

export function StreamingText() {
  const streamingText = usePFCStore(selectStreamingText);
  const isStreaming = usePFCStore(selectIsStreaming);

  if (!isStreaming && !streamingText) return null;

  return (
    <div style={{ position: 'relative' }} aria-live="polite" aria-atomic="false">
      <MarkdownContent content={streamingText.replace(/\s*\[(DATA|CONFLICT|UNCERTAIN|MODEL)\]\s*/g, ' ')} />
      {isStreaming && (
        <span
          className="animate-blink"
          style={{
            display: 'inline-block',
            width: 2.5,
            height: '1.1em',
            background: 'var(--m3-primary)',
            borderRadius: 1,
            verticalAlign: 'text-bottom',
            marginLeft: 1,
          }}
        />
      )}
    </div>
  );
}
