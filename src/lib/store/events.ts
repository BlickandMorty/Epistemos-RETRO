/**
 * Store event bus — lightweight pub/sub for cross-slice coordination.
 *
 * Instead of slices reaching into each other's state via set(),
 * they emit events and let the owning slice handle its own mutations.
 *
 * Usage:
 *   // In message.ts (producer):
 *   emit('query:submitted', { query, mode });
 *
 *   // In pipeline.ts (consumer — registered in use-pfc-store.ts):
 *   onStoreEvent('query:submitted', ({ query, mode }) => {
 *     set({ pipelineStages: initStages(), isProcessing: true });
 *   });
 */

import { logger } from '@/lib/debug-logger';

// ── Event type definitions ──

export interface StoreEventMap {
  'query:submitted': { query: string; mode: string };
  'query:completed': {
    confidence: number;
    grade: string;
    mode: string;
    truthAssessment: unknown | null;
  };
  'chat:cleared': Record<string, never>;
  'learning:page-created': { pageId: string; title: string };
  'learning:block-created': { blockId: string; pageId: string; content: string };
}

export type StoreEventType = keyof StoreEventMap;

type Handler<T extends StoreEventType> = (payload: StoreEventMap[T]) => void;

// ── Internal registry ──

const listeners = new Map<StoreEventType, Set<Handler<any>>>();

// ── Public API ──

export function emit<T extends StoreEventType>(type: T, payload: StoreEventMap[T]): void {
  const handlers = listeners.get(type);
  if (!handlers) return;
  for (const handler of handlers) {
    try {
      handler(payload);
    } catch (err) {
      logger.error('store-event', `Error in handler for "${type}":`, err);
    }
  }
}

export function onStoreEvent<T extends StoreEventType>(
  type: T,
  handler: Handler<T>,
): () => void {
  let handlers = listeners.get(type);
  if (!handlers) {
    handlers = new Set();
    listeners.set(type, handlers);
  }
  handlers.add(handler);

  // Return unsubscribe function
  return () => {
    handlers!.delete(handler);
    if (handlers!.size === 0) {
      listeners.delete(type);
    }
  };
}

/** Remove all listeners — useful for testing. */
export function clearAllStoreEvents(): void {
  listeners.clear();
}
