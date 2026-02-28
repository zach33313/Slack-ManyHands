/**
 * shared/lib/themes.ts
 *
 * Multi-theme color definitions as semantic token mappings.
 * Applied to <html> as CSS custom property overrides via next-themes.
 *
 * Components NEVER reference theme names — they use semantic tokens
 * (bg-primary, text-muted-foreground, etc.) which resolve via CSS variables
 * defined in app/globals.css.
 *
 * To add a new theme:
 *   1. Add an entry to the `themes` record below
 *   2. Define light/dark variants for tokens that differ from 'default'
 *   3. Call applyTheme(name, mode) when the user selects it in settings
 */

// ---------------------------------------------------------------------------
// ThemeColors interface
// ---------------------------------------------------------------------------

/**
 * Semantic color token names that map to CSS custom properties.
 * Values are HSL channel strings (e.g. "262 83% 58%") — no hsl() wrapper.
 * The Tailwind config resolves them as: hsl(var(--token-name))
 */
export interface ThemeColors {
  /** Main page / sidebar background */
  bgPrimary?: string;
  /** Card and panel background */
  bgSecondary?: string;
  /** Elevated surface (message hover, dropdowns) */
  bgSurface?: string;
  /** Hover state background for interactive rows */
  bgHover?: string;
  /** Primary body text */
  textPrimary?: string;
  /** Secondary / subdued text */
  textSecondary?: string;
  /** Muted text (timestamps, placeholders) */
  textMuted?: string;
  /** Primary accent (buttons, links, active states) */
  accent?: string;
  /** Accent hover state */
  accentHover?: string;
  /** Default border color */
  border?: string;
  /** Lighter / subtle border color */
  borderLight?: string;
}

/**
 * Mapping from ThemeColors property names to CSS custom property names.
 * This drives the CSS variable injection in applyTheme().
 */
const TOKEN_TO_CSS_VAR: Record<keyof ThemeColors, string> = {
  bgPrimary: '--background',
  bgSecondary: '--card',
  bgSurface: '--popover',
  bgHover: '--muted',
  textPrimary: '--foreground',
  textSecondary: '--secondary-foreground',
  textMuted: '--muted-foreground',
  accent: '--primary',
  accentHover: '--ring',
  border: '--border',
  borderLight: '--input',
};

// ---------------------------------------------------------------------------
// Theme definition shape
// ---------------------------------------------------------------------------

export interface ThemeDefinition {
  /** Human-readable display name shown in settings UI */
  label: string;
  /** Light mode overrides (omit = inherit from globals.css) */
  light?: ThemeColors;
  /** Dark mode overrides (omit = inherit from globals.css) */
  dark?: ThemeColors;
}

// ---------------------------------------------------------------------------
// All available themes
// ---------------------------------------------------------------------------

/**
 * The 'default' theme inherits all values from app/globals.css.
 * Rich purple primary accent (262° hue).
 */
export const themes: Record<string, ThemeDefinition> = {
  /** Default purple theme matching globals.css — no overrides needed */
  default: {
    label: 'Purple (Default)',
  },

  /** Calm ocean blues */
  ocean: {
    label: 'Ocean',
    light: {
      accent: '199 89% 48%',
      accentHover: '199 89% 40%',
      border: '199 30% 85%',
    },
    dark: {
      bgPrimary: '220 30% 8%',
      bgSecondary: '220 28% 12%',
      bgSurface: '220 26% 16%',
      bgHover: '220 24% 18%',
      accent: '199 89% 55%',
      accentHover: '199 89% 50%',
      border: '220 25% 20%',
      borderLight: '220 22% 22%',
    },
  },

  /** Natural forest greens */
  forest: {
    label: 'Forest',
    light: {
      accent: '142 72% 42%',
      accentHover: '142 72% 35%',
      border: '142 20% 85%',
    },
    dark: {
      bgPrimary: '150 20% 7%',
      bgSecondary: '150 18% 10%',
      bgSurface: '150 16% 13%',
      bgHover: '150 14% 15%',
      accent: '142 72% 50%',
      accentHover: '142 72% 44%',
      border: '150 18% 18%',
      borderLight: '150 16% 20%',
    },
  },

  /** Warm sunset oranges */
  sunset: {
    label: 'Sunset',
    light: {
      accent: '25 95% 53%',
      accentHover: '25 95% 46%',
      border: '25 30% 85%',
    },
    dark: {
      bgPrimary: '20 25% 8%',
      bgSecondary: '20 22% 11%',
      bgSurface: '20 20% 14%',
      bgHover: '20 18% 16%',
      accent: '25 95% 60%',
      accentHover: '25 95% 54%',
      border: '20 20% 20%',
      borderLight: '20 18% 22%',
    },
  },

  /** Vibrant purple (darker than default) */
  purple: {
    label: 'Deep Purple',
    light: {
      accent: '270 80% 55%',
      accentHover: '270 80% 48%',
      border: '270 20% 85%',
    },
    dark: {
      bgPrimary: '265 30% 7%',
      bgSecondary: '265 28% 10%',
      bgSurface: '265 26% 13%',
      bgHover: '265 24% 15%',
      accent: '270 80% 62%',
      accentHover: '270 80% 56%',
      border: '265 25% 18%',
      borderLight: '265 22% 20%',
    },
  },

  /** Deep dark midnight blue */
  midnight: {
    label: 'Midnight',
    light: {
      accent: '210 100% 50%',
      accentHover: '210 100% 43%',
    },
    dark: {
      bgPrimary: '230 25% 8%',
      bgSecondary: '230 23% 11%',
      bgSurface: '230 21% 14%',
      bgHover: '230 19% 16%',
      textPrimary: '210 40% 98%',
      textSecondary: '215 25% 80%',
      textMuted: '215 20% 60%',
      accent: '210 100% 60%',
      accentHover: '210 100% 54%',
      border: '230 22% 20%',
      borderLight: '230 20% 23%',
    },
  },
} as const;

/** All theme keys — use to populate a theme selector */
export const themeNames = Object.keys(themes) as Array<keyof typeof themes>;

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

/**
 * Apply a theme by injecting CSS custom properties onto the <html> element.
 * Omitted tokens retain their globals.css defaults.
 *
 * @param themeName - Key from the `themes` record (e.g. 'ocean')
 * @param mode - Current color scheme: 'light' or 'dark'
 */
export function applyTheme(themeName: string, mode: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;

  const theme = themes[themeName];
  if (!theme) return;

  const colors = theme[mode];
  if (!colors) return;

  const root = document.documentElement;

  for (const [token, value] of Object.entries(colors) as Array<[keyof ThemeColors, string]>) {
    const cssVar = TOKEN_TO_CSS_VAR[token];
    if (cssVar) {
      root.style.setProperty(cssVar, value);
    }
  }
}

/**
 * Remove all theme overrides injected by applyTheme(), reverting to globals.css defaults.
 */
export function resetTheme(): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  for (const cssVar of Object.values(TOKEN_TO_CSS_VAR)) {
    root.style.removeProperty(cssVar);
  }
}
