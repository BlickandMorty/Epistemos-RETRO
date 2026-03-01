import * as React from 'react';
import { ThemeContext, useThemeProvider } from '@/hooks/use-theme';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: string;
  themes?: readonly string[];
  attribute?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  themes = ['light', 'dark', 'oled', 'cosmic', 'sunny', 'sunset'],
  attribute = 'class',
}: ThemeProviderProps) {
  const value = useThemeProvider(defaultTheme, themes, attribute);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
