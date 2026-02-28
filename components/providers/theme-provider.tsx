'use client';

/**
 * components/providers/theme-provider.tsx
 *
 * Enhanced ThemeProvider that wraps next-themes and adds custom color scheme support.
 * Provides a ThemeContext with:
 *   - colorTheme: current color scheme (default, ocean, forest, sunset, purple, midnight)
 *   - setColorTheme: change the color scheme with live CSS variable injection
 *   - mode: 'light' | 'dark' (from next-themes)
 *   - setMode: toggle light/dark
 *
 * CSS custom properties are injected onto <html> via applyTheme() from shared/lib/themes.ts.
 * Persisted in localStorage under 'slack-clone-color-theme'.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';
import { applyTheme, resetTheme, themeNames } from '@/shared/lib/themes';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const COLOR_THEME_KEY = 'slack-clone-color-theme';

export interface AppThemeContextValue {
  /** Current color scheme name (e.g. 'ocean', 'forest', 'default') */
  colorTheme: string;
  /** Set a new color scheme and persist it */
  setColorTheme: (themeName: string) => void;
}

const AppThemeContext = createContext<AppThemeContextValue>({
  colorTheme: 'default',
  setColorTheme: () => {},
});

export function useAppTheme(): AppThemeContextValue {
  return useContext(AppThemeContext);
}

// ---------------------------------------------------------------------------
// Inner provider that accesses next-themes context
// ---------------------------------------------------------------------------

function ColorThemeApplier({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [colorTheme, setColorThemeState] = useState<string>('default');

  // Load persisted color theme on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(COLOR_THEME_KEY) ?? 'default';
    setColorThemeState(saved);
  }, []);

  // Apply color theme whenever colorTheme or dark/light mode changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mode = resolvedTheme === 'dark' ? 'dark' : 'light';
    if (colorTheme === 'default') {
      resetTheme();
    } else {
      applyTheme(colorTheme, mode);
    }
  }, [colorTheme, resolvedTheme]);

  const setColorTheme = useCallback((themeName: string) => {
    setColorThemeState(themeName);
    if (typeof window !== 'undefined') {
      localStorage.setItem(COLOR_THEME_KEY, themeName);
    }
  }, []);

  return (
    <AppThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </AppThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// ThemeProvider export
// ---------------------------------------------------------------------------

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <ColorThemeApplier>{children}</ColorThemeApplier>
    </NextThemesProvider>
  );
}
