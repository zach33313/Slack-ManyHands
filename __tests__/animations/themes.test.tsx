/**
 * @jest-environment jsdom
 *
 * __tests__/animations/themes.test.tsx
 *
 * Tests for the theme system in shared/lib/themes.ts.
 * Verifies theme definitions, CSS variable injection via applyTheme(),
 * and cleanup via resetTheme().
 */

import {
  themes,
  themeNames,
  applyTheme,
  resetTheme,
  type ThemeDefinition,
} from '@/shared/lib/themes';

// ---------------------------------------------------------------------------
// Theme catalog
// ---------------------------------------------------------------------------

describe('themes catalog', () => {
  it('exports exactly 6 themes', () => {
    expect(Object.keys(themes)).toHaveLength(6);
  });

  it('includes all expected theme keys', () => {
    expect(themes).toHaveProperty('default');
    expect(themes).toHaveProperty('ocean');
    expect(themes).toHaveProperty('forest');
    expect(themes).toHaveProperty('sunset');
    expect(themes).toHaveProperty('purple');
    expect(themes).toHaveProperty('midnight');
  });

  it('every theme has a non-empty label', () => {
    for (const [key, theme] of Object.entries(themes)) {
      expect(typeof theme.label).toBe('string');
      expect(theme.label.length).toBeGreaterThan(0);
    }
  });

  it('default theme has no light or dark overrides', () => {
    const defaultTheme = themes.default as ThemeDefinition;
    expect(defaultTheme.light).toBeUndefined();
    expect(defaultTheme.dark).toBeUndefined();
  });

  it('ocean theme has dark mode colors including bgPrimary', () => {
    const ocean = themes.ocean as ThemeDefinition;
    expect(ocean.dark).toBeDefined();
    expect(ocean.dark?.bgPrimary).toBeTruthy();
  });

  it('forest theme has light mode with accent color', () => {
    const forest = themes.forest as ThemeDefinition;
    expect(forest.light).toBeDefined();
    expect(forest.light?.accent).toBeTruthy();
  });

  it('midnight theme dark mode has textPrimary defined', () => {
    const midnight = themes.midnight as ThemeDefinition;
    expect(midnight.dark?.textPrimary).toBeTruthy();
  });

  it('all non-default themes have at least one color variant', () => {
    const nonDefault = Object.entries(themes).filter(([key]) => key !== 'default');
    for (const [key, theme] of nonDefault) {
      const hasLight = theme.light !== undefined;
      const hasDark = theme.dark !== undefined;
      expect(hasLight || hasDark).toBe(true);
    }
  });
});

describe('themeNames', () => {
  it('is an array of 6 theme keys', () => {
    expect(Array.isArray(themeNames)).toBe(true);
    expect(themeNames).toHaveLength(6);
  });

  it('contains all theme keys', () => {
    expect(themeNames).toContain('default');
    expect(themeNames).toContain('ocean');
    expect(themeNames).toContain('forest');
    expect(themeNames).toContain('sunset');
    expect(themeNames).toContain('purple');
    expect(themeNames).toContain('midnight');
  });
});

// ---------------------------------------------------------------------------
// applyTheme
// ---------------------------------------------------------------------------

describe('applyTheme', () => {
  afterEach(() => {
    // Clean up injected CSS vars between tests
    resetTheme();
  });

  it('injects --primary CSS var when applying ocean dark theme', () => {
    applyTheme('ocean', 'dark');
    const value = document.documentElement.style.getPropertyValue('--primary');
    // ocean dark accent is '199 89% 55%'
    expect(value.trim()).toBe('199 89% 55%');
  });

  it('injects --background CSS var when applying ocean dark theme', () => {
    applyTheme('ocean', 'dark');
    const value = document.documentElement.style.getPropertyValue('--background');
    expect(value.trim()).toBe('220 30% 8%');
  });

  it('injects --border CSS var when applying forest dark theme', () => {
    applyTheme('forest', 'dark');
    const value = document.documentElement.style.getPropertyValue('--border');
    expect(value.trim()).toBe('150 18% 18%');
  });

  it('injects --primary CSS var when applying sunset light theme', () => {
    applyTheme('sunset', 'light');
    const value = document.documentElement.style.getPropertyValue('--primary');
    expect(value.trim()).toBe('25 95% 53%');
  });

  it('does nothing for the default theme (no overrides defined)', () => {
    applyTheme('default', 'dark');
    // default theme has no dark colors — nothing injected
    const background = document.documentElement.style.getPropertyValue('--background');
    expect(background).toBe('');
  });

  it('does nothing for an unknown theme name', () => {
    applyTheme('nonexistent-theme', 'dark');
    const background = document.documentElement.style.getPropertyValue('--background');
    expect(background).toBe('');
  });

  it('does nothing when a theme has no colors for the requested mode', () => {
    // midnight has no light mode colors
    applyTheme('midnight', 'light');
    const background = document.documentElement.style.getPropertyValue('--background');
    // midnight light only defines accent and accentHover, not background
    // Even if something is injected, background should be empty
    expect(background).toBe('');
  });

  it('applies multiple CSS vars in a single call', () => {
    applyTheme('purple', 'dark');
    const background = document.documentElement.style.getPropertyValue('--background');
    const primary = document.documentElement.style.getPropertyValue('--primary');
    const border = document.documentElement.style.getPropertyValue('--border');
    expect(background).toBeTruthy();
    expect(primary).toBeTruthy();
    expect(border).toBeTruthy();
  });

  it('overrides previous theme values when called again', () => {
    applyTheme('ocean', 'dark');
    const oceanPrimary = document.documentElement.style.getPropertyValue('--primary');

    applyTheme('forest', 'dark');
    const forestPrimary = document.documentElement.style.getPropertyValue('--primary');

    expect(oceanPrimary).not.toBe(forestPrimary);
    // forest dark accent is '142 72% 50%'
    expect(forestPrimary.trim()).toBe('142 72% 50%');
  });
});

// ---------------------------------------------------------------------------
// resetTheme
// ---------------------------------------------------------------------------

describe('resetTheme', () => {
  it('removes CSS vars injected by applyTheme', () => {
    applyTheme('ocean', 'dark');
    // Verify something was injected
    expect(document.documentElement.style.getPropertyValue('--background')).not.toBe('');

    resetTheme();

    expect(document.documentElement.style.getPropertyValue('--background')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--border')).toBe('');
  });

  it('removes all known CSS custom properties', () => {
    applyTheme('midnight', 'dark');
    resetTheme();

    const cssVars = [
      '--background', '--card', '--popover', '--muted',
      '--foreground', '--secondary-foreground', '--muted-foreground',
      '--primary', '--ring', '--border', '--input',
    ];
    for (const cssVar of cssVars) {
      expect(document.documentElement.style.getPropertyValue(cssVar)).toBe('');
    }
  });

  it('is safe to call when no theme has been applied', () => {
    // Should not throw
    expect(() => resetTheme()).not.toThrow();
  });

  it('is idempotent — calling twice does not throw', () => {
    applyTheme('ocean', 'dark');
    resetTheme();
    expect(() => resetTheme()).not.toThrow();
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('');
  });
});
