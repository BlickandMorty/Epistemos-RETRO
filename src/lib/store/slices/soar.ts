import type { SOARConfig, SOARSession } from '@/lib/engine/soar/types';
import { DEFAULT_SOAR_CONFIG } from '@/lib/engine/soar/types';
import { readVersioned, writeVersioned } from '@/lib/storage-versioning';
import type { PFCSet, PFCGet } from '../use-pfc-store';

const STORAGE_KEY = 'pfc-soar-config';
const VERSION = 1;

function loadConfig(): SOARConfig {
  const stored = readVersioned<SOARConfig>(STORAGE_KEY, VERSION);
  if (!stored) return DEFAULT_SOAR_CONFIG;
  return { ...DEFAULT_SOAR_CONFIG, ...stored };
}

function saveConfig(config: SOARConfig) {
  writeVersioned(STORAGE_KEY, VERSION, config);
}

export interface SOARSliceState {
  soarConfig: SOARConfig;
  soarSession: SOARSession | null;
}

export interface SOARSliceActions {
  setSOARConfig: (patch: Partial<SOARConfig>) => void;
  setSOAREnabled: (enabled: boolean) => void;
  setSOARSession: (session: SOARSession | null) => void;
  hydrateSOAR: () => void;
}

export const createSOARSlice = (set: PFCSet, _get: PFCGet) => ({
  soarConfig: DEFAULT_SOAR_CONFIG,
  soarSession: null as SOARSession | null,

  setSOARConfig: (patch: Partial<SOARConfig>) => {
    set((s) => {
      const updated = { ...s.soarConfig, ...patch };
      saveConfig(updated);
      return { soarConfig: updated };
    });
  },

  setSOAREnabled: (enabled: boolean) => {
    set((s) => {
      const updated = { ...s.soarConfig, enabled };
      saveConfig(updated);
      return { soarConfig: updated };
    });
  },

  setSOARSession: (session: SOARSession | null) => {
    set({ soarSession: session });
  },

  hydrateSOAR: () => {
    set({ soarConfig: loadConfig() });
  },
});
