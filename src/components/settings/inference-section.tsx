import { useState, useEffect, useCallback } from 'react';
import { Section } from '@/components/layout/page-shell';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { Input } from '@/components/ui/input';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';
import type { LocalServiceStatus } from '@/lib/bindings';
import {
  API_PROVIDERS,
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
} from '@/lib/types';
import type { ApiProvider, InferenceMode } from '@/lib/types';
import { writeString, readString } from '@/lib/storage-versioning';
import {
  WifiIcon,
  HardDriveIcon,
  CheckCircle2Icon,
  XCircleIcon,
  LoaderIcon,
  ZapIcon,
} from 'lucide-react';

const MODEL_MAP = {
  openai: OPENAI_MODELS,
  anthropic: ANTHROPIC_MODELS,
  google: GOOGLE_MODELS,
} as const;

type TestState = 'idle' | 'testing' | 'success' | 'error';

export function InferenceSection() {
  const { isDark, isOled } = useIsDark();

  // Zustand state
  const inferenceMode = usePFCStore((s) => s.inferenceMode);
  const apiProvider = usePFCStore((s) => s.apiProvider);
  const apiKey = usePFCStore((s) => s.apiKey);
  const setInferenceMode = usePFCStore((s) => s.setInferenceMode);
  const setApiProvider = usePFCStore((s) => s.setApiProvider);
  const setApiKey = usePFCStore((s) => s.setApiKey);
  const setOllamaStatus = usePFCStore((s) => s.setOllamaStatus);
  const setOllamaBaseUrl = usePFCStore((s) => s.setOllamaBaseUrl);
  const setOllamaModel = usePFCStore((s) => s.setOllamaModel);
  const ollamaBaseUrl = usePFCStore((s) => s.ollamaBaseUrl);
  const ollamaModel = usePFCStore((s) => s.ollamaModel);
  const ollamaModels = usePFCStore((s) => s.ollamaModels);
  const addToast = usePFCStore((s) => s.addToast);

  // Per-provider model selection
  const openaiModel = usePFCStore((s) => s.openaiModel);
  const anthropicModel = usePFCStore((s) => s.anthropicModel);
  const googleModel = usePFCStore((s) => s.googleModel);
  const setOpenAIModel = usePFCStore((s) => s.setOpenAIModel);
  const setAnthropicModel = usePFCStore((s) => s.setAnthropicModel);
  const setGoogleModel = usePFCStore((s) => s.setGoogleModel);

  // Local state
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [localServices, setLocalServices] = useState<LocalServiceStatus[]>([]);
  const [probing, setProbing] = useState(false);

  // Current model for the selected provider
  const currentModel =
    apiProvider === 'openai' ? openaiModel
    : apiProvider === 'anthropic' ? anthropicModel
    : googleModel;

  const modelList = MODEL_MAP[apiProvider] ?? [];

  // Load backend config on mount
  useEffect(() => {
    (async () => {
      const [infRes, localRes] = await Promise.all([
        commands.getInferenceConfig(),
        commands.getLocalModelConfig(),
      ]);
      if (infRes.status === 'ok') {
        const cfg = infRes.data;
        // Sync backend → store (provider + model)
        if (['openai', 'anthropic', 'google'].includes(cfg.api_provider)) {
          setApiProvider(cfg.api_provider as ApiProvider);
        }
        // Restore API key from localStorage (not stored in backend for security)
        const storedKey = readString('pfc-api-key');
        if (storedKey) setApiKey(storedKey);
      }
      if (localRes.status === 'ok') {
        const lc = localRes.data;
        if (lc.ollama_base_url) setOllamaBaseUrl(lc.ollama_base_url);
        if (lc.ollama_model) setOllamaModel(lc.ollama_model);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist inference mode to localStorage
  const handleModeChange = useCallback((mode: InferenceMode) => {
    setInferenceMode(mode);
    writeString('pfc-inference-mode', mode);
  }, [setInferenceMode]);

  // Persist provider + model to backend
  const syncBackend = useCallback(async (provider: string, model: string) => {
    const res = await commands.setInferenceConfig({
      api_provider: provider,
      model,
      ollama_base_url: ollamaBaseUrl || null,
    });
    if (res.status === 'error') {
      addToast({ type: 'error', message: 'Failed to save inference config' });
    }
  }, [ollamaBaseUrl, addToast]);

  const handleProviderChange = useCallback((provider: ApiProvider) => {
    setApiProvider(provider);
    writeString('pfc-api-provider', provider);
    const model =
      provider === 'openai' ? openaiModel
      : provider === 'anthropic' ? anthropicModel
      : googleModel;
    syncBackend(provider, model);
  }, [setApiProvider, openaiModel, anthropicModel, googleModel, syncBackend]);

  const handleModelChange = useCallback((modelId: string) => {
    if (apiProvider === 'openai') setOpenAIModel(modelId as never);
    else if (apiProvider === 'anthropic') setAnthropicModel(modelId as never);
    else setGoogleModel(modelId as never);
    syncBackend(apiProvider, modelId);
  }, [apiProvider, setOpenAIModel, setAnthropicModel, setGoogleModel, syncBackend]);

  const handleApiKeyChange = useCallback((key: string) => {
    setApiKey(key);
    writeString('pfc-api-key', key);
  }, [setApiKey]);

  // Test connection
  const handleTestConnection = useCallback(async () => {
    if (!apiKey.trim()) {
      addToast({ type: 'error', message: 'Enter an API key first' });
      return;
    }
    setTestState('testing');
    setTestMessage('');
    const res = await commands.testConnection(apiProvider, apiKey, currentModel);
    if (res.status === 'ok') {
      const { success, message, latency_ms } = res.data;
      if (success) {
        setTestState('success');
        setTestMessage(latency_ms ? `Connected (${latency_ms}ms)` : 'Connected');
        addToast({ type: 'success', message: `${apiProvider} connection verified` });
      } else {
        setTestState('error');
        setTestMessage(message);
      }
    } else {
      setTestState('error');
      setTestMessage('Connection test failed');
    }
    setTimeout(() => setTestState('idle'), 4000);
  }, [apiProvider, apiKey, currentModel, addToast]);

  // Probe local services
  const probeLocalServices = useCallback(async () => {
    setProbing(true);
    const res = await commands.checkLocalServices();
    if (res.status === 'ok') {
      setLocalServices(res.data);
      // Update Ollama status in store
      const ollama = res.data.find((s) => s.name === 'Ollama');
      if (ollama) {
        setOllamaStatus(ollama.available, ollama.models);
      }
    }
    setProbing(false);
  }, [setOllamaStatus]);

  // Probe on mount when in local mode
  useEffect(() => {
    if (inferenceMode === 'local') probeLocalServices();
  }, [inferenceMode, probeLocalServices]);

  // Save local model config to backend
  const handleOllamaUrlChange = useCallback(async (url: string) => {
    setOllamaBaseUrl(url);
    writeString('pfc-ollama-base-url', url);
    await commands.setLocalModelConfig({
      foundry_model: 'phi-3.5-mini',
      foundry_base_url: 'http://localhost:5272/v1/chat/completions',
      ollama_model: ollamaModel,
      ollama_base_url: url,
    });
  }, [setOllamaBaseUrl, ollamaModel]);

  const handleOllamaModelChange = useCallback(async (model: string) => {
    setOllamaModel(model);
    writeString('pfc-ollama-model', model);
    await commands.setLocalModelConfig({
      foundry_model: 'phi-3.5-mini',
      foundry_base_url: 'http://localhost:5272/v1/chat/completions',
      ollama_model: model,
      ollama_base_url: ollamaBaseUrl,
    });
  }, [setOllamaModel, ollamaBaseUrl]);

  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const labelStyle: React.CSSProperties = { fontSize: '0.8125rem', color: mutedColor, marginBottom: '0.5rem' };
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' };

  return (
    <Section title="LLM Inference">
      {/* Mode toggle */}
      <div style={{ ...rowStyle, marginBottom: '1.25rem' }}>
        <GlassBubbleButton
          active={inferenceMode === 'api'}
          onClick={() => handleModeChange('api')}
          size="md"
        >
          <WifiIcon style={{ width: 14, height: 14 }} />
          Cloud API
        </GlassBubbleButton>
        <GlassBubbleButton
          active={inferenceMode === 'local'}
          onClick={() => handleModeChange('local')}
          size="md"
        >
          <HardDriveIcon style={{ width: 14, height: 14 }} />
          Local
        </GlassBubbleButton>
      </div>

      {inferenceMode === 'api' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Provider selector */}
          <div>
            <p style={labelStyle}>Provider</p>
            <div style={rowStyle}>
              {API_PROVIDERS.map((p) => (
                <GlassBubbleButton
                  key={p.id}
                  active={apiProvider === p.id}
                  onClick={() => handleProviderChange(p.id)}
                  size="sm"
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  {p.label}
                </GlassBubbleButton>
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div>
            <p style={labelStyle}>Model</p>
            <div style={rowStyle}>
              {modelList.map((m) => (
                <GlassBubbleButton
                  key={m.id}
                  active={currentModel === m.id}
                  onClick={() => handleModelChange(m.id)}
                  size="sm"
                >
                  {m.label}
                </GlassBubbleButton>
              ))}
            </div>
          </div>

          {/* API key input */}
          <div>
            <p style={labelStyle}>API Key</p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder={`Enter ${apiProvider} API key`}
                style={{
                  flex: 1,
                  background: isOled ? 'rgba(25,25,25,0.8)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  borderRadius: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8125rem',
                }}
              />
              <GlassBubbleButton
                onClick={handleTestConnection}
                disabled={testState === 'testing'}
                size="sm"
              >
                {testState === 'testing' && <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
                {testState === 'success' && <CheckCircle2Icon style={{ width: 12, height: 12, color: '#30D158' }} />}
                {testState === 'error' && <XCircleIcon style={{ width: 12, height: 12, color: '#FF453A' }} />}
                {testState === 'idle' && <ZapIcon style={{ width: 12, height: 12 }} />}
                Test
              </GlassBubbleButton>
            </div>
            {testMessage && (
              <p style={{
                fontSize: '0.75rem',
                marginTop: '0.375rem',
                color: testState === 'success' ? '#30D158' : '#FF453A',
              }}>
                {testMessage}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Local mode */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Service status cards */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <p style={labelStyle}>Local Services</p>
              <GlassBubbleButton onClick={probeLocalServices} disabled={probing} size="sm">
                {probing ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : <ZapIcon style={{ width: 12, height: 12 }} />}
                {probing ? 'Probing...' : 'Probe'}
              </GlassBubbleButton>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {localServices.length === 0 && !probing && (
                <p style={{ fontSize: '0.75rem', color: mutedColor }}>
                  No services probed yet. Click Probe to check.
                </p>
              )}
              {localServices.map((svc) => (
                <div
                  key={svc.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.625rem 0.875rem',
                    borderRadius: '0.75rem',
                    background: isOled ? 'rgba(25,25,25,0.6)' : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  }}
                >
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: svc.available ? '#30D158' : '#FF453A',
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{svc.name}</p>
                    <p style={{ fontSize: '0.6875rem', color: mutedColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {svc.available
                        ? `${svc.models.length} model${svc.models.length !== 1 ? 's' : ''}${svc.latency_ms ? ` · ${svc.latency_ms}ms` : ''}`
                        : svc.error || 'Unavailable'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ollama config */}
          <div>
            <p style={labelStyle}>Ollama URL</p>
            <Input
              value={ollamaBaseUrl}
              onChange={(e) => handleOllamaUrlChange(e.target.value)}
              placeholder="http://localhost:11434"
              style={{
                background: isOled ? 'rgba(25,25,25,0.8)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderRadius: '0.75rem',
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
              }}
            />
          </div>

          {/* Model selector from probed list */}
          {ollamaModels.length > 0 && (
            <div>
              <p style={labelStyle}>Ollama Model</p>
              <div style={rowStyle}>
                {ollamaModels.map((m) => (
                  <GlassBubbleButton
                    key={m}
                    active={ollamaModel === m}
                    onClick={() => handleOllamaModelChange(m)}
                    size="sm"
                  >
                    {m}
                  </GlassBubbleButton>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
