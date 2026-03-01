import { usePFCStore } from './use-pfc-store';
import { readString, writeString } from '@/lib/storage-versioning';

/**
 * Hydrate all Zustand slices that read from localStorage.
 * Call once from app-shell.tsx useEffect (client-only) to avoid
 * SSR/hydration mismatches.
 */
export function hydrateStore() {
  // Migration: 'simulation' mode was removed — upgrade to 'api'
  try {
    const persisted = readString('pfc-inference-mode');
    if (persisted === 'simulation') {
      writeString('pfc-inference-mode', 'api');
    }
  } catch { /* ignore storage errors */ }

  const store = usePFCStore.getState();
  store.hydrateSOAR();
  store.hydrateLearning();
}
