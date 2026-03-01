'use client';

import type {
  InferenceConfig,
  InferenceMode,
  ApiProvider,
  OpenAIModel,
  AnthropicModel,
  GoogleModel,
} from '@/lib/engine/llm/config';
import type { OllamaHardwareStatus } from '@/lib/engine/llm/ollama';
import type { PFCSet, PFCGet } from '../use-pfc-store';

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface InferenceSliceState {
  inferenceMode: InferenceMode;
  apiProvider: ApiProvider;
  apiKey: string;
  openaiModel: OpenAIModel;
  anthropicModel: AnthropicModel;
  googleModel: GoogleModel;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaAvailable: boolean;
  ollamaModels: string[];
  ollamaHardware: OllamaHardwareStatus | null;
}

// ---------------------------------------------------------------------------
// Actions interface
// ---------------------------------------------------------------------------

export interface InferenceSliceActions {
  setInferenceMode: (mode: InferenceMode) => void;
  setApiProvider: (provider: ApiProvider) => void;
  setApiKey: (key: string) => void;
  setOpenAIModel: (model: OpenAIModel) => void;
  setAnthropicModel: (model: AnthropicModel) => void;
  setGoogleModel: (model: GoogleModel) => void;
  setOllamaBaseUrl: (url: string) => void;
  setOllamaModel: (model: string) => void;
  setOllamaStatus: (available: boolean, models: string[]) => void;
  setOllamaHardware: (hardware: OllamaHardwareStatus | null) => void;
  getInferenceConfig: () => InferenceConfig;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

export const createInferenceSlice = (set: PFCSet, get: PFCGet) => ({
  // --- initial state ---
  inferenceMode: 'api' as InferenceMode,
  apiProvider: 'openai' as ApiProvider,
  apiKey: '',
  openaiModel: 'gpt-4o' as OpenAIModel,
  anthropicModel: 'claude-sonnet-4-20250514' as AnthropicModel,
  googleModel: 'gemini-2.5-flash' as GoogleModel,
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1',
  ollamaAvailable: false,
  ollamaModels: [] as string[],
  ollamaHardware: null as OllamaHardwareStatus | null,

  // --- actions ---

  setInferenceMode: (mode: InferenceMode) => set({ inferenceMode: mode }),

  setApiProvider: (provider: ApiProvider) => set({ apiProvider: provider }),

  setApiKey: (key: string) => set({ apiKey: key }),

  setOpenAIModel: (model: OpenAIModel) => set({ openaiModel: model }),

  setAnthropicModel: (model: AnthropicModel) =>
    set({ anthropicModel: model }),

  setGoogleModel: (model: GoogleModel) => set({ googleModel: model }),

  setOllamaBaseUrl: (url: string) => set({ ollamaBaseUrl: url }),

  setOllamaModel: (model: string) => set({ ollamaModel: model }),

  setOllamaStatus: (available: boolean, models: string[]) =>
    set({ ollamaAvailable: available, ollamaModels: models }),

  setOllamaHardware: (hardware: OllamaHardwareStatus | null) =>
    set({ ollamaHardware: hardware }),

  getInferenceConfig: (): InferenceConfig => {
    const s = get();
    return {
      mode: s.inferenceMode,
      apiProvider: s.apiProvider,
      apiKey: s.apiKey,
      openaiModel: s.openaiModel,
      anthropicModel: s.anthropicModel,
      googleModel: s.googleModel,
      ollamaBaseUrl: s.ollamaBaseUrl,
      ollamaModel: s.ollamaModel,
    };
  },
});
