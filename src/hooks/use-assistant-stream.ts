'use client';

// ═══════════════════════════════════════════════════════════════════
// useAssistantStream — Thread-aware SSE hook for PFC Assistant widget
// ═══════════════════════════════════════════════════════════════════
//
// Uses a generation counter to prevent race conditions between
// overlapping streams. Each sendQuery increments the generation;
// the finally block only cleans up if it still owns the current gen.
// ═══════════════════════════════════════════════════════════════════

import { useCallback, useRef } from 'react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import type { AssistantContext } from '@/lib/engine/llm/assistant-prompt';
import type { InferenceConfig, InferenceMode, ApiProvider } from '@/lib/engine/llm/config';

const MAX_QUERY_LENGTH = 10_000;

export function useAssistantStream() {
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  /** Track which thread ID the current stream belongs to */
  const activeStreamThreadRef = useRef<string | null>(null);

  // Store accessors — per-thread streaming
  const addMessage = usePFCStore((s) => s.addThreadMessage);
  const setThreadStreamingText = usePFCStore((s) => s.setThreadStreamingText);
  const appendThreadStreamingText = usePFCStore((s) => s.appendThreadStreamingText);
  const setThreadIsStreaming = usePFCStore((s) => s.setThreadIsStreaming);

  const abort = useCallback(() => {
    generationRef.current++;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Clean up streaming state for the thread that was streaming
    const threadId = activeStreamThreadRef.current;
    if (threadId) {
      setThreadIsStreaming(threadId, false);
      setThreadStreamingText(threadId, '');
      activeStreamThreadRef.current = null;
    }
  }, [setThreadIsStreaming, setThreadStreamingText]);

  const sendQuery = useCallback(async (query: string, threadId?: string) => {
    // Clamp query length
    const safeQuery = query.slice(0, MAX_QUERY_LENGTH);

    // Abort any existing stream — increment generation so old finally is a no-op
    generationRef.current++;
    const myGeneration = generationRef.current;

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Clean up previous thread's streaming state
    const prevThreadId = activeStreamThreadRef.current;
    if (prevThreadId) {
      setThreadIsStreaming(prevThreadId, false);
      setThreadStreamingText(prevThreadId, '');
    }

    const store = usePFCStore.getState();
    const targetThreadId = threadId || store.activeThreadId;
    const thread = store.chatThreads.find((t) => t.id === targetThreadId);

    // Verify target thread exists
    if (!thread) return;

    // Track which thread owns this stream
    activeStreamThreadRef.current = targetThreadId;

    // Add user message to the specific thread
    addMessage({
      role: 'user',
      content: safeQuery,
      timestamp: Date.now(),
    }, targetThreadId);

    // Reset streaming state for THIS thread
    setThreadStreamingText(targetThreadId, '');
    setThreadIsStreaming(targetThreadId, true);

    // Build notes summary for context (up to 30 pages, 150-char excerpts)
    const notePages = store.notePages ?? [];
    const noteBlocks = store.noteBlocks ?? [];
    const notesContext = notePages.length > 0 ? {
      totalPages: notePages.length,
      pages: notePages.slice(0, 30).map((p: { id: string; title: string; isJournal: boolean }) => {
        const pageBlocks = noteBlocks
          .filter((b: { pageId: string; content: string }) => b.pageId === p.id)
          .slice(0, 3);
        const rawText = pageBlocks
          .map((b: { content: string }) => b.content.replace(/<[^>]*>/g, '').trim())
          .join(' ')
          .slice(0, 150);
        return {
          id: p.id,
          title: p.title,
          excerpt: rawText || '(empty)',
          isJournal: p.isJournal,
        };
      }),
    } : undefined;

    // Build context from current store state
    const context: AssistantContext = {
      confidence: store.confidence,
      entropy: store.entropy,
      dissonance: store.dissonance,
      healthScore: store.healthScore,
      riskScore: store.riskScore,
      safetyState: store.safetyState,
      focusDepth: store.focusDepth,
      temperatureScale: store.temperatureScale,
      activeConcepts: store.activeConcepts,
      queriesProcessed: store.queriesProcessed,
      tda: store.tda,
      inferenceMode: store.inferenceMode,
      apiProvider: store.apiProvider,
      suiteTier: 'programming',
      notes: notesContext,
    };

    // Build inference config — use thread's provider override if set
    // If thread.useLocal is true, force local inference mode (Ollama)
    const isLocal = thread.useLocal === true;
    const threadProvider = isLocal ? undefined : (thread.provider || store.apiProvider);
    const inferenceConfig: InferenceConfig = {
      mode: isLocal ? ('local' as InferenceMode) : (store.inferenceMode as InferenceMode),
      apiProvider: threadProvider as ApiProvider | undefined,
      apiKey: store.apiKey,
      ollamaBaseUrl: store.ollamaBaseUrl,
      ollamaModel: store.ollamaModel as InferenceConfig['ollamaModel'],
      openaiModel: store.openaiModel,
      anthropicModel: store.anthropicModel,
      googleModel: store.googleModel,
    };

    // Build conversation history from THIS thread's messages (snapshot before our new message)
    const conversationHistory = thread.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: safeQuery,
          context,
          inferenceConfig,
          conversationHistory,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Assistant API error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Check if this stream was superseded
        if (myGeneration !== generationRef.current) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'text') {
              fullText += parsed.text;
              appendThreadStreamingText(targetThreadId, parsed.text);
            } else if (parsed.type === 'error') {
              fullText += `\n\nError: ${parsed.message}`;
              appendThreadStreamingText(targetThreadId, `\n\nError: ${parsed.message}`);
            }
          } catch {
            // Ignore parse errors for partial SSE data
          }
        }
      }

      // Flush any remaining buffer content
      if (buffer.trim().startsWith('data: ')) {
        const data = buffer.trim().slice(6).trim();
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'text') {
              fullText += parsed.text;
            }
          } catch { /* partial data, ignore */ }
        }
      }

      // Only write the final message if this stream is still current
      if (myGeneration !== generationRef.current) return;

      // Save completed response to the specific thread
      if (fullText) {
        addMessage({
          role: 'assistant',
          content: fullText,
          timestamp: Date.now(),
        }, targetThreadId);
      }

      // Auto-generate thread label from first query if still default
      const updatedStore = usePFCStore.getState();
      const updatedThread = updatedStore.chatThreads.find((t) => t.id === targetThreadId);
      if (updatedThread && updatedThread.messages.length <= 2 && updatedThread.label.startsWith('Chat ')) {
        const shortLabel = safeQuery.length > 30 ? safeQuery.slice(0, 27) + '...' : safeQuery;
        updatedStore.renameThread(targetThreadId, shortLabel);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // User aborted — expected
      } else if (myGeneration === generationRef.current) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        addMessage({
          role: 'assistant',
          content: `Error: ${msg}`,
          timestamp: Date.now(),
        }, targetThreadId);
      }
    } finally {
      // Only clean up if this is still the active generation
      if (myGeneration === generationRef.current) {
        setThreadIsStreaming(targetThreadId, false);
        setThreadStreamingText(targetThreadId, '');
        abortRef.current = null;
        activeStreamThreadRef.current = null;
      }
    }
  }, [addMessage, setThreadStreamingText, appendThreadStreamingText, setThreadIsStreaming]);

  return { sendQuery, abort };
}
