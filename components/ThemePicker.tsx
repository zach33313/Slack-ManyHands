'use client';

/**
 * components/ThemePicker.tsx
 *
 * Theme picker component for User Settings.
 * Displays a grid of color scheme swatches with live preview.
 * Integrates with ThemeProvider via useAppTheme().
 *
 * Usage in settings:
 *   import { ThemePicker } from '@/components/ThemePicker'
 *   <ThemePicker />
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/shared/lib/utils';
import { useAppTheme } from './providers/theme-provider';
import { themes, themeNames } from '@/shared/lib/themes';
import { staggerContainer, staggerItem } from '@/shared/lib/animations';

// ---------------------------------------------------------------------------
// Theme swatch colors for preview
// ---------------------------------------------------------------------------

const THEME_PREVIEW_COLORS: Record<string, { bg: string; accent: string; text: string }> = {
  default: { bg: '#1e1b2e', accent: '#8b5cf6', text: '#e2e8f0' },
  ocean: { bg: '#0a1628', accent: '#0ea5e9', text: '#e2e8f0' },
  forest: { bg: '#0a130c', accent: '#22c55e', text: '#e2e8f0' },
  sunset: { bg: '#1a0e08', accent: '#f97316', text: '#e2e8f0' },
  purple: { bg: '#0f0816', accent: '#a855f7', text: '#e2e8f0' },
  midnight: { bg: '#080e1a', accent: '#3b82f6', text: '#f0f8ff' },
};

// Light mode preview colors
const THEME_PREVIEW_COLORS_LIGHT: Record<string, { bg: string; accent: string; text: string }> = {
  default: { bg: '#ffffff', accent: '#8b5cf6', text: '#0f172a' },
  ocean: { bg: '#f0f9ff', accent: '#0ea5e9', text: '#0f172a' },
  forest: { bg: '#f0fdf4', accent: '#16a34a', text: '#0f172a' },
  sunset: { bg: '#fff7ed', accent: '#ea580c', text: '#0f172a' },
  purple: { bg: '#faf5ff', accent: '#9333ea', text: '#0f172a' },
  midnight: { bg: '#eff6ff', accent: '#2563eb', text: '#0f172a' },
};

// ---------------------------------------------------------------------------
// ThemePicker component
// ---------------------------------------------------------------------------

interface ThemePickerProps {
  className?: string;
}

export function ThemePicker({ className }: ThemePickerProps) {
  const { colorTheme, setColorTheme } = useAppTheme();
  const { theme, resolvedTheme, setTheme } = useTheme();

  // next-themes returns undefined for `theme` during SSR / before hydration.
  // We must not read `theme` until the component is mounted on the client,
  // otherwise the Auto button never shows as selected (hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const isDark = resolvedTheme === 'dark';
  const previewColors = isDark ? THEME_PREVIEW_COLORS : THEME_PREVIEW_COLORS_LIGHT;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Light / Dark / Auto toggle */}
      <div>
        <h4 className="text-sm font-medium mb-2">Appearance</h4>
        {/* Skeleton while hydrating — prevents flash of wrong active state */}
        {!mounted ? (
          <div className="flex gap-2">
            {(['Light', 'Dark', 'Auto'] as const).map((label) => (
              <div
                key={label}
                className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm border-border text-muted-foreground opacity-50 select-none"
              >
                {label === 'Light' && <Sun className="h-4 w-4" />}
                {label === 'Dark' && <Moon className="h-4 w-4" />}
                {label}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setTheme('light')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
                theme === 'light'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted text-muted-foreground'
              )}
            >
              <Sun className="h-4 w-4" />
              Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
                theme === 'dark'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted text-muted-foreground'
              )}
            >
              <Moon className="h-4 w-4" />
              Dark
            </button>
            <button
              onClick={() => setTheme('system')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
                theme === 'system'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted text-muted-foreground'
              )}
            >
              Auto
            </button>
          </div>
        )}
      </div>

      {/* Color scheme grid */}
      <div>
        <h4 className="text-sm font-medium mb-2">Color scheme</h4>
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-3 gap-3"
        >
          {themeNames.map((name) => {
            const theme = themes[name];
            const preview = previewColors[name] ?? previewColors.default;
            const isSelected = colorTheme === name;

            return (
              <motion.button
                key={name}
                variants={staggerItem}
                onClick={() => setColorTheme(name)}
                className={cn(
                  'relative rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02]',
                  isSelected
                    ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'border-border hover:border-primary/50'
                )}
                style={{ transition: 'border-color 300ms, box-shadow 300ms' }}
                title={theme.label}
              >
                {/* Swatch preview */}
                <div
                  className="h-14 w-full flex flex-col justify-between p-2"
                  style={{ backgroundColor: preview.bg }}
                >
                  {/* Fake header bar */}
                  <div className="flex gap-1">
                    <div
                      className="h-1.5 w-6 rounded-full"
                      style={{ backgroundColor: preview.accent }}
                    />
                    <div
                      className="h-1.5 w-3 rounded-full opacity-40"
                      style={{ backgroundColor: preview.text }}
                    />
                  </div>

                  {/* Fake message lines */}
                  <div className="space-y-1">
                    <div
                      className="h-1 w-full rounded-full opacity-30"
                      style={{ backgroundColor: preview.text }}
                    />
                    <div
                      className="h-1 w-3/4 rounded-full opacity-20"
                      style={{ backgroundColor: preview.text }}
                    />
                  </div>

                  {/* Accent dot */}
                  <div
                    className="h-3 w-3 rounded-full self-end"
                    style={{ backgroundColor: preview.accent }}
                  />
                </div>

                {/* Label */}
                <div
                  className="px-2 py-1 text-[11px] font-medium text-left"
                  style={{
                    backgroundColor: isDark ? '#1a1a2e' : '#f8fafc',
                    color: isDark ? '#e2e8f0' : '#0f172a',
                  }}
                >
                  {theme.label}
                </div>

                {/* Selected checkmark */}
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <p className="text-xs text-muted-foreground">
        Theme changes apply instantly and persist across sessions.
      </p>
    </div>
  );
}
