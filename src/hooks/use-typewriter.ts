'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTypewriterOptions {
  /** Milliseconds per character (default: 40) */
  speed?: number;
  /** Delay before typing starts in ms (default: 0) */
  startDelay?: number;
  /** Cursor blink interval in ms (default: 530) */
  cursorBlinkRate?: number;
  /** Ms to keep cursor visible after typing completes (default: 800, 0 = forever) */
  cursorLingerMs?: number;
}

interface UseTypewriterReturn {
  /** The currently visible portion of the text */
  displayText: string;
  /** Whether the cursor should be visible right now */
  cursorVisible: boolean;
  /** Whether typing has finished */
  isComplete: boolean;
  /** Restart typing from scratch */
  reset: () => void;
}

/**
 * Reusable typewriter hook — types out text character by character.
 *
 * @param text    The full string to type out
 * @param active  Whether to start/continue typing (set false to reset)
 * @param options Speed, delay, and cursor configuration
 */
export function useTypewriter(
  text: string,
  active: boolean,
  options: UseTypewriterOptions = {},
): UseTypewriterReturn {
  const {
    speed = 40,
    startDelay = 0,
    cursorBlinkRate = 530,
    cursorLingerMs = 800,
  } = options;

  const [charIndex, setCharIndex] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);
  const [showCursor, setShowCursor] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const blinkRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const lingerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isComplete = charIndex >= text.length;
  const displayText = text.slice(0, charIndex);

  // Reset when deactivated or text changes
  const reset = useCallback(() => {
    setCharIndex(0);
    setShowCursor(false);
    setCursorOn(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (lingerRef.current) clearTimeout(lingerRef.current);
  }, []);

  useEffect(() => {
    if (!active) {
      reset();
      return;
    }

    // Start typing after optional delay
    setShowCursor(true);
    setCursorOn(true);
    setCharIndex(0);

    let idx = 0;

    function typeNext() {
      if (idx < text.length) {
        idx++;
        setCharIndex(idx);
        timerRef.current = setTimeout(typeNext, speed);
      } else {
        // Typing complete — linger cursor then hide
        if (cursorLingerMs > 0) {
          lingerRef.current = setTimeout(() => setShowCursor(false), cursorLingerMs);
        }
        // cursorLingerMs === 0 means keep cursor forever
      }
    }

    timerRef.current = setTimeout(typeNext, startDelay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (lingerRef.current) clearTimeout(lingerRef.current);
    };
    // SAFETY: speed, startDelay, cursorLingerMs are config read once at effect start;
    // reset is a stable ref-clearing callback. Re-running on config change mid-animation
    // would restart the typewriter unexpectedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, text]);

  // Cursor blink — only while cursor is visible
  useEffect(() => {
    if (!showCursor) {
      setCursorOn(false);
      return;
    }
    setCursorOn(true);
    blinkRef.current = setInterval(() => setCursorOn((v) => !v), cursorBlinkRate);
    return () => {
      if (blinkRef.current) clearInterval(blinkRef.current);
    };
  }, [showCursor, cursorBlinkRate]);

  return {
    displayText,
    cursorVisible: showCursor && cursorOn,
    isComplete,
    reset,
  };
}
