'use client';

import { useCallback, useRef } from 'react';
import { logger } from '@/lib/debug-logger';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useSteeringStore } from '@/lib/store/use-steering-store';
import type { PipelineEvent } from '@/lib/engine/types';
import type { QueryFeatureVector } from '@/lib/engine/steering/types';
import type { SignalSnapshot, QueryAnalysisSnapshot } from '@/lib/engine/steering/encoder';
import type { TruthAssessmentInput } from '@/lib/engine/steering/feedback';
import { StreamingHandler, detectArtifacts } from '@/libs/agent-runtime/StreamingHandler';
import { detectNoteIntent } from '@/lib/engine/note-intent';

// ── Buffer limits to prevent memory exhaustion when paused ──
const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB

function isExpectedStreamInterruption(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const asObject = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const message = [
    error instanceof Error ? error.message : '',
    error instanceof Error ? error.stack ?? '' : '',
    typeof asObject?.message === 'string' ? asObject.message : '',
    typeof asObject?.cause === 'string' ? asObject.cause : '',
    typeof (asObject?.cause as Record<string, unknown> | undefined)?.message === 'string'
      ? ((asObject?.cause as Record<string, unknown>).message as string)
      : '',
    String(error),
  ]
    .join(' ')
    .toLowerCase();
  const name = error instanceof Error ? error.name : typeof asObject?.name === 'string' ? asObject.name : '';
  return (
    name === 'AbortError' ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('the user aborted a request') ||
    message.includes('load failed')
  );
}

export function useChatStream() {
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  // Mutex: serializes concurrent sendQuery calls
  const lockRef = useRef<Promise<void>>(Promise.resolve());

  // Pause/resume refs — buffer text events while paused
  const pausedRef = useRef(false);
  const textBufferRef = useRef('');
  const reasoningBufferRef = useRef('');

  // Error tracking for malformed JSON chunks
  const parseErrorCountRef = useRef(0);

  const sendQuery = useCallback(async (query: string, chatId?: string) => {
    // Serialize concurrent calls: wait for any previous sendQuery to finish
    const previousLock = lockRef.current;
    let releaseLock!: () => void;
    lockRef.current = new Promise<void>((resolve) => { releaseLock = resolve; });
    await previousLock;

    // Abort any still-running stream from a previous (timed-out) call
    if (isStreamingRef.current && abortRef.current) {
      abortRef.current.abort();
      isStreamingRef.current = false;
      abortRef.current = null;
    }

    const store = usePFCStore.getState();
    const steeringStore = useSteeringStore.getState();

    const controller = new AbortController();
    abortRef.current = controller;
    isStreamingRef.current = true;

    // Reset pause state for new query
    pausedRef.current = false;
    textBufferRef.current = '';
    reasoningBufferRef.current = '';
    parseErrorCountRef.current = 0;

    // ── Detect note-related intent before sending ──
    const noteIntent = detectNoteIntent(query);

    // Optimistic: add user message immediately
    store.submitQuery(query);
    store.startStreaming();

    // Create StreamingHandler for reasoning/text separation
    const streamHandler = new StreamingHandler({
      onContentUpdate: (_content, _reasoning) => {
        // Content updates are handled via appendStreamingText in the event loop
      },
      onReasoningUpdate: (_reasoning) => {
        // Reasoning updates are handled via appendReasoningText in the event loop
      },
      onReasoningStart: () => {
        store.startReasoning();
      },
      onReasoningComplete: (durationMs) => {
        store.stopReasoning();
        usePFCStore.setState({ reasoningDuration: durationMs });
      },
      onComplete: () => {
        store.stopStreaming();
      },
      onError: (error) => {
        if (!isExpectedStreamInterruption(error)) {
          logger.error('chat-stream', 'StreamingHandler error:', error);
        }
        store.stopStreaming();
      },
    });

    // Gather pipeline controls from store
    const { controls, conceptWeights } = store;

    // Compute effective concept weights (user × auto)
    const effectiveWeights: Record<string, number> = {};
    let hasConceptWeights = false;
    for (const [key, cw] of Object.entries(conceptWeights)) {
      const ew = cw.weight * cw.autoWeight;
      if (Math.abs(ew - 0.65) > 0.01) hasConceptWeights = true;
      effectiveWeights[key] = ew;
    }

    const hasOverrides =
      controls.focusDepthOverride !== null ||
      controls.temperatureOverride !== null ||
      controls.complexityBias !== 0 ||
      controls.adversarialIntensity !== 1.0 ||
      controls.bayesianPriorStrength !== 1.0 ||
      hasConceptWeights;

    // Merge concept weights into controls for the API
    const mergedControls = hasOverrides
      ? { ...controls, ...(hasConceptWeights && { conceptWeights: effectiveWeights }) }
      : undefined;

    // ── Compute steering bias ──────────────────────────────────
    const queryFeatures = extractQueryFeatures(query);
    const steeringBias = steeringStore.computeBias(queryFeatures);
    const hasSteering = steeringBias.steeringStrength > 0.01;

    // ── Inference config ─────────────────────────────────────
    const inferenceConfig = store.getInferenceConfig();

    // ── Pre-flight validation: catch obvious config issues early ──
    if (inferenceConfig.mode === 'api' && !inferenceConfig.apiKey) {
      store.addToast({
        message: 'API key is required — set it in Settings before using API mode.',
        type: 'error',
      });
      store.stopStreaming();
      isStreamingRef.current = false;
      abortRef.current = null;
      return;
    }
    if (inferenceConfig.mode === 'local' && !store.ollamaAvailable) {
      store.addToast({
        message: 'Ollama is not reachable — make sure it\'s running at ' + (inferenceConfig.ollamaBaseUrl || 'http://localhost:11434'),
        type: 'error',
      });
      store.stopStreaming();
      isStreamingRef.current = false;
      abortRef.current = null;
      return;
    }

    // ── SOAR config ────────────────────────────────────────
    const soarConfig = store.soarConfig;
    const analyticsEngineEnabled = store.analyticsEngineEnabled;

    // ── Detect file paths in query text ────────────────────
    const filePathRegex = /(?:\/[\w./-]+\.\w{2,5}|~\/[\w./-]+\.\w{2,5})/g;
    const supportedExts = ['png','jpg','jpeg','webp','pdf','txt','md','csv','json','docx','doc'];
    const filePaths = (query.match(filePathRegex) || []).filter((p) => {
      const ext = p.split('.').pop()?.toLowerCase() || '';
      return supportedExts.includes(ext);
    });

    // ── Gather pending attachments from store ──────────────
    const attachments = store.pendingAttachments.length > 0
      ? store.pendingAttachments.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          uri: a.uri,
          size: a.size,
          mimeType: a.mimeType,
        }))
      : undefined;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chatId || store.currentChatId,
          query,
          userId: 'local-user',
          ...(mergedControls && { controls: mergedControls }),
          ...(hasSteering && { steeringBias }),
          inferenceConfig,
          ...(soarConfig?.enabled && { soarConfig }),
          analyticsEngineEnabled,
          chatMode: 'research' as const,
          ...(attachments && { attachments }),
          ...(filePaths.length > 0 && { filePaths }),
        }),
        signal: controller.signal,
      });

      // Clear attachments after sending (regardless of response status)
      if (store.pendingAttachments.length > 0) {
        store.clearAttachments();
      }

      if (!response.ok) {
        // Try to extract a meaningful error from the response body
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          if (errorBody?.error) errorMsg = errorBody.error;
        } catch { /* ignore parse failure */ }
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // ── Check abort signal between reads ──
        if (controller.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          if (data === '[DONE]') {
            store.stopStreaming();
            continue;
          }

          try {
            const event = JSON.parse(data) as PipelineEvent | { type: 'chat-id'; chatId: string };

            switch (event.type) {
              case 'chat-id':
                if ('chatId' in event) {
                  store.setCurrentChat(event.chatId);
                }
                break;

              case 'stage':
                store.advanceStage(event.stage, {
                  status: event.status,
                  detail: event.detail,
                  value: event.value,
                });
                break;

              case 'signals':
                store.applySignalUpdate(event.data);
                break;

              case 'reasoning':
                if (pausedRef.current) {
                  // ── Fix 1A: Cap buffer size, auto-flush if exceeded ──
                  if (reasoningBufferRef.current.length + event.text.length > MAX_BUFFER_SIZE) {
                    store.appendReasoningText(reasoningBufferRef.current);
                    reasoningBufferRef.current = '';
                  }
                  reasoningBufferRef.current += event.text;
                } else {
                  streamHandler.handleChunk({ type: 'reasoning', text: event.text });
                  store.appendReasoningText(event.text);
                }
                break;

              case 'text-delta':
                if (pausedRef.current) {
                  // ── Fix 1A: Cap buffer size, auto-flush if exceeded ──
                  if (textBufferRef.current.length + event.text.length > MAX_BUFFER_SIZE) {
                    store.appendStreamingText(textBufferRef.current);
                    textBufferRef.current = '';
                  }
                  textBufferRef.current += event.text;
                } else {
                  streamHandler.handleChunk({ type: 'text', text: event.text });
                  store.appendStreamingText(event.text);
                }
                break;

              case 'soar':
                // SOAR events are informational — logged for debugging
                if (store.soarConfig?.verbose) {
                  logger.info('SOAR', event.event, event.data);
                }
                break;

              case 'complete': {
                store.completeProcessing(
                  event.dualMessage,
                  event.confidence,
                  event.grade,
                  event.mode,
                  event.truthAssessment,
                );
                // Apply final signals
                store.applySignalUpdate(event.signals);

                // ── Record in steering memory ──────────────────
                const signalSnap: SignalSnapshot = {
                  confidence: event.confidence,
                  entropy: event.signals?.entropy ?? store.entropy,
                  dissonance: event.signals?.dissonance ?? store.dissonance,
                  healthScore: event.signals?.healthScore ?? store.healthScore,
                  riskScore: event.signals?.riskScore ?? store.riskScore,
                  safetyState: event.signals?.safetyState ?? store.safetyState,
                  tda: event.signals?.tda ?? store.tda,
                  focusDepth: event.signals?.focusDepth ?? store.focusDepth,
                  temperatureScale: event.signals?.temperatureScale ?? store.temperatureScale,
                  activeConcepts: event.signals?.activeConcepts ?? store.activeConcepts,
                  harmonyKeyDistance: event.signals?.harmonyKeyDistance ?? store.harmonyKeyDistance,
                };

                const querySnap: QueryAnalysisSnapshot = {
                  complexity: queryFeatures.complexity,
                  domain: getDomainName(queryFeatures.domain),
                  questionType: getQuestionTypeName(queryFeatures.questionType),
                  isEmpirical: queryFeatures.isEmpirical === 1,
                  isPhilosophical: queryFeatures.isPhilosophical === 1,
                  isMetaAnalytical: queryFeatures.isMetaAnalytical === 1,
                  hasSafetyKeywords: queryFeatures.hasSafetyKeywords === 1,
                  hasNormativeClaims: queryFeatures.hasNormativeClaims === 1,
                  wordCount: query.split(/\s+/).length,
                  entityCount: queryFeatures.entityCount * 8,
                };

                const truthInput: TruthAssessmentInput | null = event.truthAssessment
                  ? {
                      overallTruthLikelihood: event.truthAssessment.overallTruthLikelihood ?? 0.5,
                      consensus: true,
                      disagreements: event.truthAssessment.weaknesses ?? [],
                    }
                  : null;

                const resolvedChat = chatId || store.currentChatId || 'unknown';
                steeringStore.recordPipelineRun(signalSnap, querySnap, resolvedChat, truthInput);

                // ── Artifact detection → push to portal ──────────
                const rawText = event.dualMessage?.rawAnalysis || '';
                const detectedArtifacts = detectArtifacts(rawText);
                if (detectedArtifacts.length > 0) {
                  const latestMsg = store.messages[store.messages.length - 1];
                  const msgId = latestMsg?.id || 'unknown';
                  const art = detectedArtifacts[0]!;
                  store.openArtifact({
                    messageId: msgId,
                    identifier: art.identifier,
                    title: art.title,
                    type: art.type,
                    language: art.language,
                    content: art.content,
                  });
                }

                // ── Note intent: auto-write AI output to notes ──────────
                if (noteIntent.action && noteIntent.confidence > 0.5) {
                  const noteStore = usePFCStore.getState();
                  const summaryText = event.dualMessage?.laymanSummary?.whatIsLikelyTrue
                    || event.dualMessage?.rawAnalysis
                    || '';

                  if (summaryText) {
                    if (noteIntent.action === 'create_note_page') {
                      // Create a new page with the topic as title
                      const pageTitle = noteIntent.topic || 'AI Research Note';
                      const pageId = noteStore.createPage(pageTitle);
                      // Get the first block of the new page and write content
                      const newBlocks = noteStore.noteBlocks.filter((b: { pageId: string }) => b.pageId === pageId);
                      if (newBlocks.length > 0) {
                        noteStore.updateBlockContent(newBlocks[0]!.id, summaryText);
                      }
                      noteStore.addToast({ message: `Created note page: "${pageTitle}"`, type: 'success' });
                    } else if (noteIntent.action === 'write_to_notes' || noteIntent.action === 'summarize_notes' || noteIntent.action === 'expand_note') {
                      // Write to the active page or create a new one
                      const activePage = noteStore.activePageId;
                      if (activePage) {
                        // Add a new block to the active page
                        const pageBlocks = noteStore.noteBlocks
                          .filter((b: { pageId: string }) => b.pageId === activePage)
                          .sort((a: { order: string }, b: { order: string }) => a.order.localeCompare(b.order));
                        const lastBlock = pageBlocks[pageBlocks.length - 1];
                        noteStore.createBlock(activePage, null, lastBlock?.id ?? null, summaryText);
                        noteStore.addToast({ message: 'Added to your notes', type: 'success' });
                      } else {
                        // No active page — create one
                        const title = noteIntent.topic || 'AI Summary';
                        const pageId = noteStore.createPage(title);
                        const newBlocks = noteStore.noteBlocks.filter((b: { pageId: string }) => b.pageId === pageId);
                        if (newBlocks.length > 0) {
                          noteStore.updateBlockContent(newBlocks[0]!.id, summaryText);
                        }
                        noteStore.addToast({ message: `Created note: "${title}"`, type: 'success' });
                      }
                    }
                  }
                }
                break;
              }

              case 'error':
                logger.error('chat-stream', 'Pipeline error:', event.message);
                // Surface the error to the user — previously only logged to console
                store.addToast({
                  message: event.message || 'Pipeline error — check Settings',
                  type: 'error',
                });
                store.stopStreaming();
                break;
            }
          } catch {
            // ── Fix 2F: Track parse errors instead of silently swallowing ──
            parseErrorCountRef.current++;
            logger.debug('stream', 'Malformed JSON chunk skipped:', data.slice(0, 120));
          }
        }
      }
    } catch (error) {
      if (!isExpectedStreamInterruption(error)) {
        logger.error('chat-stream', 'Stream error:', error);
        usePFCStore.getState().addToast({ message: 'Stream connection failed', type: 'error' });
      }
      store.stopStreaming();
    } finally {
      abortRef.current = null;
      isStreamingRef.current = false;
      releaseLock();
    }
  }, []);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      isStreamingRef.current = false;
      pausedRef.current = false;
      textBufferRef.current = '';
      reasoningBufferRef.current = '';
      const store = usePFCStore.getState();
      store.stopStreaming();
      store.setThinkingPaused(false);
    }
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
    usePFCStore.getState().setThinkingPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    const store = usePFCStore.getState();
    store.setThinkingPaused(false);

    // ── Fix 1A: Flush buffered text atomically (capture-then-clear to avoid race with stream loop) ──
    const textSnap = textBufferRef.current;
    textBufferRef.current = '';
    if (textSnap) store.appendStreamingText(textSnap);

    const reasonSnap = reasoningBufferRef.current;
    reasoningBufferRef.current = '';
    if (reasonSnap) store.appendReasoningText(reasonSnap);
  }, []);

  return { sendQuery, abort, pause, resume };
}

// ═══════════════════════════════════════════════════════════════════
// Lightweight client-side query feature extraction
// (mirrors key heuristics from simulate.ts analyzeQuery)
// ═══════════════════════════════════════════════════════════════════

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  philosophical: ['free will', 'consciousness', 'moral', 'ethics', 'determinism', 'existential', 'metaphysics', 'ontology'],
  medical: ['treatment', 'diagnosis', 'clinical', 'patient', 'disease', 'therapy', 'drug', 'symptom', 'medical'],
  science: ['quantum', 'physics', 'biology', 'chemistry', 'experiment', 'hypothesis', 'empirical'],
  technology: ['algorithm', 'software', 'machine learning', 'neural network', 'computing', 'AI', 'data'],
  social_science: ['society', 'culture', 'population', 'demographic', 'social', 'political'],
  economics: ['market', 'inflation', 'GDP', 'economic', 'trade', 'fiscal', 'monetary'],
  psychology: ['cognitive', 'behavior', 'mental', 'perception', 'emotion', 'personality'],
  ethics: ['should', 'ought', 'right', 'wrong', 'justice', 'fairness', 'moral'],
};

const QUESTION_TYPE_PATTERNS: Record<string, RegExp> = {
  causal: /^(why|what causes|how does .* affect|what leads to)/i,
  comparative: /^(compare|versus|vs|difference|better|worse)/i,
  definitional: /^(what is|define|what does .* mean)/i,
  evaluative: /^(is it true|evaluate|assess|how good)/i,
  speculative: /^(what if|could|would|imagine)/i,
  meta_analytical: /^(what does the evidence|meta-analy|systematic review|across studies)/i,
  empirical: /^(evidence|research|studies|data|literature)/i,
};

function extractQueryFeatures(query: string): QueryFeatureVector {
  const lower = query.toLowerCase();
  const words = query.split(/\s+/);

  // Domain detection
  let domain = 8; // default: general
  for (const [name, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      const domainNames = Object.keys(DOMAIN_KEYWORDS);
      domain = domainNames.indexOf(name);
      break;
    }
  }

  // Question type detection
  let questionType = 7; // default: conceptual
  for (const [name, pattern] of Object.entries(QUESTION_TYPE_PATTERNS)) {
    if (pattern.test(lower)) {
      const typeNames = Object.keys(QUESTION_TYPE_PATTERNS);
      questionType = typeNames.indexOf(name);
      break;
    }
  }

  // Complexity: based on word count, sentences, entities
  const entities = words.filter(w => w.length > 5 && /^[A-Z]/.test(w)).length;
  const complexity = Math.min(1, 0.3 + (words.length / 40) * 0.5 + (entities / 8) * 0.3);

  // Flags
  const safetyKeywords = ['weapon', 'bomb', 'hack', 'exploit', 'drug', 'illegal', 'poison'];
  const normativeKeywords = ['should', 'ought', 'must', 'moral', 'ethical', 'right', 'wrong'];

  return {
    domain,
    questionType,
    complexity: Math.min(1, complexity),
    isEmpirical: /evidence|research|studies|data|empirical/i.test(lower) ? 1 : 0,
    isPhilosophical: /philosophy|consciousness|free will|moral|ethics|metaphysic/i.test(lower) ? 1 : 0,
    isMetaAnalytical: /meta-analy|systematic review|across studies/i.test(lower) ? 1 : 0,
    hasSafetyKeywords: safetyKeywords.some(kw => lower.includes(kw)) ? 1 : 0,
    hasNormativeClaims: normativeKeywords.some(kw => lower.includes(kw)) ? 1 : 0,
    wordCount: Math.min(1, words.length / 100),
    entityCount: Math.min(1, entities / 8),
  };
}

// Helper: index to domain name
const DOMAIN_NAMES = [
  'philosophical', 'medical', 'science', 'technology',
  'social_science', 'economics', 'psychology', 'ethics', 'general',
];
function getDomainName(idx: number): string { return DOMAIN_NAMES[idx] ?? 'general'; }

const QTYPE_NAMES = [
  'causal', 'comparative', 'definitional', 'evaluative',
  'speculative', 'meta_analytical', 'empirical', 'conceptual',
];
function getQuestionTypeName(idx: number): string { return QTYPE_NAMES[idx] ?? 'conceptual'; }
