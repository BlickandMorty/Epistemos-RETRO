import { useCallback, useRef } from 'react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';

/**
 * Thin UI hook — sends assistant query to Rust backend via Tauri invoke.
 * ALL assistant logic lives in Rust, ported from the Mac version.
 */
export function useAssistantStream() {
  const isStreamingRef = useRef(false);

  const sendQuery = useCallback(async (query: string, threadId?: string) => {
    if (isStreamingRef.current) return;

    const store = usePFCStore.getState();
    const targetThreadId = threadId || store.activeThreadId;
    if (!targetThreadId) return;

    store.setThreadIsStreaming(targetThreadId, true);
    isStreamingRef.current = true;

    store.addThreadMessage(
      { role: 'user', content: query, timestamp: Date.now() },
      targetThreadId,
    );

    try {
      // Calls Rust backend — all logic handled there
      await commands.submitQuery(targetThreadId, query);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      store.addThreadMessage(
        { role: 'assistant', content: `Error: ${msg}`, timestamp: Date.now() },
        targetThreadId,
      );
    } finally {
      store.setThreadIsStreaming(targetThreadId, false);
      store.setThreadStreamingText(targetThreadId, '');
      isStreamingRef.current = false;
    }
  }, []);

  const abort = useCallback(async () => {
    isStreamingRef.current = false;
    try {
      await commands.cancelQuery();
    } catch {
      // Best effort
    }
  }, []);

  return { sendQuery, abort };
}
