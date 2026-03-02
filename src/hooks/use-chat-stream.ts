import { useCallback, useRef } from 'react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';

/**
 * Thin UI hook — sends query to Rust backend via Tauri invoke.
 * ALL pipeline logic (query analysis, steering, signals, SOAR, etc.)
 * lives in Rust crates, ported from the Mac version.
 */
export function useChatStream() {
  const isStreamingRef = useRef(false);

  const sendQuery = useCallback(async (query: string, chatId?: string) => {
    if (isStreamingRef.current) return;

    const store = usePFCStore.getState();
    let targetChatId = chatId || store.currentChatId;

    // If no active chat, create one on the backend first
    if (!targetChatId) {
      try {
        const res = await commands.createChat(null);
        if (res.status === 'ok') {
          targetChatId = res.data.id;
          store.setCurrentChat(targetChatId);
        }
      } catch {
        store.addToast({ message: 'Failed to create chat session', type: 'error' });
        return;
      }
    }

    store.submitQuery(query);
    store.startStreaming();
    isStreamingRef.current = true;

    try {
      // Calls Rust backend — all logic handled there
      if (!targetChatId) throw new Error('No chat ID provided');
      await commands.submitQuery(targetChatId, query);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      store.addToast({ message: msg, type: 'error' });
    } finally {
      store.stopStreaming();
      isStreamingRef.current = false;
    }
  }, []);

  const abort = useCallback(async () => {
    isStreamingRef.current = false;
    usePFCStore.getState().stopStreaming();
    try {
      await commands.cancelQuery();
    } catch {
      // Best effort — if cancel fails, streaming already stopped on frontend
    }
  }, []);

  const pause = useCallback(() => {
    usePFCStore.getState().setThinkingPaused(true);
  }, []);

  const resume = useCallback(() => {
    usePFCStore.getState().setThinkingPaused(false);
  }, []);

  return { sendQuery, abort, pause, resume };
}
