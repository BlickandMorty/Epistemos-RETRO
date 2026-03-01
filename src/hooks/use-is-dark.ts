'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';

/**
 * Centralized dark mode hook.
 *
 * Replaces the duplicated pattern found in 15+ components:
 *   const [mounted, setMounted] = useState(false);
 *   useEffect(() => { setMounted(true); }, []);
 *   const isDark = mounted ? (resolvedTheme === 'dark' || resolvedTheme === 'oled') : true;
 *
 * Returns { isDark, isOled, isCosmic, mounted } so components can gate
 * hydration-sensitive rendering.
 *
 * Uses useState(false) + useEffect to guarantee `mounted` is `false` during SSR
 * and the first client render, preventing hydration mismatches.
 */
export function useIsDark() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Before mount, default to dark to avoid flash — matches most users' preference
  const effectiveTheme = mounted ? (resolvedTheme ?? 'dark') : 'dark';
  const isDark = effectiveTheme === 'dark' || effectiveTheme === 'oled' || effectiveTheme === 'cosmic' || effectiveTheme === 'sunset';
  const isOled = effectiveTheme === 'oled';
  const isCosmic = effectiveTheme === 'cosmic';
  const isSunny = effectiveTheme === 'sunny';
  const isSunset = effectiveTheme === 'sunset';
  const isThematic = isCosmic || isSunny; // themes with animated wallpapers (sunset uses plain CSS bg)

  return { isDark, isOled, isCosmic, isSunny, isSunset, isThematic, mounted };
}
