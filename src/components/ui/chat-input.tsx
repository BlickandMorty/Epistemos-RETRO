'use client';

/**
 * ChatInput — Shared chat input bar with send/stop toggle
 *
 * Consolidates the duplicated input+button pattern from:
 * - mini-chat ChatTabContent
 * - mini-chat DebugTabContent
 * - note-ai-chat
 * - main chat multimodal-input (simplified version)
 *
 * Supports:
 * - Text input with Enter-to-send
 * - Stop button (square icon) when streaming
 * - Send button when idle
 * - Disabled state during streaming
 * - maxLength enforcement
 * - Theme-aware styling
 */

import { useState, useCallback, type CSSProperties } from 'react';
import { Square } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────

export interface ChatInputProps {
  onSubmit: (text: string) => void;
  onAbort?: () => void;
  isStreaming?: boolean;
  isDark?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Border color override */
  borderColor?: string;
  style?: CSSProperties;
}

// ─── Component ───────────────────────────────────────────────────

export function ChatInput({
  onSubmit,
  onAbort,
  isStreaming = false,
  isDark = false,
  placeholder = 'Type a message...',
  maxLength = 10000,
  borderColor,
  style,
}: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const border = borderColor || (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)');
  const inputBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const textColor = isDark ? '#e8e4de' : '#1a1a1a';
  const mutedColor = isDark ? 'rgba(155,150,137,0.7)' : 'rgba(0,0,0,0.4)';
  const hasTrimmedVal = value.trim().length > 0;

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '0.375rem 0.5rem 0.5rem',
        borderTop: `1px solid ${border}`,
        flexShrink: 0,
        ...style,
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={isStreaming}
        style={{
          flex: 1,
          padding: '0.4rem 0.625rem',
          borderRadius: 999,
          border: `1px solid ${border}`,
          background: inputBg,
          color: textColor,
          fontSize: 12,
          fontFamily: 'var(--font-sans)',
          outline: 'none',
        }}
      />
      {isStreaming && onAbort ? (
        <button
          onClick={onAbort}
          style={{
            padding: '0.4rem 0.625rem',
            borderRadius: 999,
            border: 'none',
            background: 'rgba(var(--pfc-accent-rgb), 0.15)',
            color: 'var(--pfc-accent)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Square style={{ width: 12, height: 12 }} />
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!hasTrimmedVal}
          style={{
            padding: '0.4rem 0.625rem',
            borderRadius: 999,
            border: 'none',
            background: hasTrimmedVal
              ? 'var(--pfc-accent)'
              : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            color: hasTrimmedVal ? '#fff' : mutedColor,
            fontSize: 12,
            fontWeight: 600,
            cursor: hasTrimmedVal ? 'pointer' : 'default',
            transition: 'all 0.15s',
          }}
        >
          Ask
        </button>
      )}
    </div>
  );
}
