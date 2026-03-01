'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useScrollToBottom<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const rafRef = useRef<number>(0);

  // User-initiated scroll-to-bottom — uses smooth behavior
  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom < 50;

    setIsAtBottom(atBottom);

    // If user scrolls up, disable auto-scroll
    // If user scrolls to bottom, re-enable auto-scroll
    setAutoScroll(atBottom);
  }, []);

  // Auto-scroll when new content arrives (if autoScroll is enabled)
  // Uses instant scroll + rAF batching for 120fps-friendly updates
  useEffect(() => {
    if (!autoScroll) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new MutationObserver(() => {
      if (!autoScroll) return;
      // Batch scroll updates with rAF to avoid jank
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [autoScroll]);

  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return {
    containerRef,
    isAtBottom,
    scrollToBottom,
    autoScroll,
    setAutoScroll,
  };
}
