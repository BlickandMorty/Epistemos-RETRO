import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { readString, writeString } from '@/lib/storage-versioning';

// ═══════════════════════════════════════════════════════════════════
// Custom theme system — replaces next-themes for Vite/Tauri
//
// Same API shape: { theme, resolvedTheme, setTheme, themes }
// Stores preference in localStorage('theme'), applies as class on <html>.
// Supports system auto-detection via prefers-color-scheme.
// Cross-tab sync via storage events.
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'theme';

export const THEME_LIST = ['light', 'dark', 'oled', 'cosmic', 'sunny', 'sunset'] as const;

export interface ThemeContextValue {
  theme: string;
  resolvedTheme: string;
  setTheme: (theme: string) => void;
  themes: readonly string[];
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: string, attribute: string, themes: readonly string[]) {
  const resolved = theme === 'system' ? resolveSystemTheme() : theme;
  const root = document.documentElement;

  if (attribute === 'class') {
    root.className = root.className
      .split(' ')
      .filter((c) => !themes.includes(c))
      .concat(resolved)
      .join(' ')
      .trim();
  } else {
    root.setAttribute(attribute, resolved);
  }

  return resolved;
}

export function useThemeProvider(
  defaultTheme = 'dark',
  themes: readonly string[] = THEME_LIST,
  attribute = 'class',
): ThemeContextValue {
  const [theme, setThemeState] = useState(() => readString(STORAGE_KEY) ?? defaultTheme);
  const themeRef = useRef(theme);
  const themesRef = useRef(themes);
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    const t = readString(STORAGE_KEY) ?? defaultTheme;
    return t === 'system' ? resolveSystemTheme() : t;
  });

  const setTheme = useCallback(
    (newTheme: string) => {
      setThemeState(newTheme);
      writeString(STORAGE_KEY, newTheme);
      window.dispatchEvent(new CustomEvent('theme-change', { detail: newTheme }));
    },
    [],
  );

  // Apply theme on mount and changes — single source of DOM application
  useEffect(() => {
    themeRef.current = theme;
    const resolved = applyTheme(theme, attribute, themesRef.current);
    setResolvedTheme(resolved);
  }, [theme, attribute]);

  // Listen for system theme changes (when user picks "system")
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (themeRef.current === 'system') {
        const resolved = applyTheme('system', attribute, themesRef.current);
        setResolvedTheme(resolved);
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [attribute]);

  // Cross-tab sync via storage events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        setThemeState(e.newValue);
        const resolved = applyTheme(e.newValue, attribute, themesRef.current);
        setResolvedTheme(resolved);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [attribute]);

  return { theme, resolvedTheme, setTheme, themes: themes as readonly string[] };
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
