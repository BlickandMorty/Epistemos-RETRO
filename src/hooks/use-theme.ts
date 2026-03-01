import { useState, useEffect, useCallback, createContext, useContext } from 'react';

// ═══════════════════════════════════════════════════════════════════
// Custom theme system — replaces next-themes for Vite/Tauri
//
// Same API shape: { theme, resolvedTheme, setTheme, themes }
// Stores preference in localStorage('theme'), applies as class on <html>.
// Supports system auto-detection via prefers-color-scheme.
// Cross-tab sync via storage events.
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'theme';

export interface ThemeContextValue {
  theme: string;
  resolvedTheme: string;
  setTheme: (theme: string) => void;
  themes: string[];
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(defaultTheme: string): string {
  if (typeof window === 'undefined') return defaultTheme;
  try {
    return localStorage.getItem(STORAGE_KEY) || defaultTheme;
  } catch {
    return defaultTheme;
  }
}

function applyTheme(theme: string, attribute: string) {
  const resolved = theme === 'system' ? resolveSystemTheme() : theme;
  const root = document.documentElement;

  if (attribute === 'class') {
    // Remove all theme classes, add the current one
    root.className = root.className
      .split(' ')
      .filter((c) => !['light', 'dark', 'oled', 'cosmic', 'sunny', 'sunset'].includes(c))
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
  themes = ['light', 'dark', 'oled', 'cosmic', 'sunny', 'sunset'],
  attribute = 'class',
): ThemeContextValue {
  const [theme, setThemeState] = useState(() => getStoredTheme(defaultTheme));
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    const t = getStoredTheme(defaultTheme);
    return t === 'system' ? resolveSystemTheme() : t;
  });

  const setTheme = useCallback(
    (newTheme: string) => {
      setThemeState(newTheme);
      try {
        localStorage.setItem(STORAGE_KEY, newTheme);
      } catch {
        // Quota exceeded or private browsing
      }
      const resolved = applyTheme(newTheme, attribute);
      setResolvedTheme(resolved);

      // Dispatch storage event for cross-tab sync
      // (storage events only fire in *other* tabs, so we also dispatch a custom event for same-tab listeners)
      window.dispatchEvent(new CustomEvent('theme-change', { detail: newTheme }));
    },
    [attribute],
  );

  // Apply theme on mount
  useEffect(() => {
    const resolved = applyTheme(theme, attribute);
    setResolvedTheme(resolved);
  }, [theme, attribute]);

  // Listen for system theme changes (when user picks "system")
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        const resolved = applyTheme('system', attribute);
        setResolvedTheme(resolved);
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [theme, attribute]);

  // Cross-tab sync via storage events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        setThemeState(e.newValue);
        const resolved = applyTheme(e.newValue, attribute);
        setResolvedTheme(resolved);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [attribute]);

  return { theme, resolvedTheme, setTheme, themes };
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
