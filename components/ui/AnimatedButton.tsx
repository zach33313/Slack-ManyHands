'use client';

/**
 * components/ui/AnimatedButton.tsx
 *
 * Framer Motion–enhanced wrapper around shadcn Button.
 * Uses `m.button` (LazyMotion-compatible) with whileHover and whileTap scale effects.
 * Accepts common button props. Does NOT support `asChild` (Slot composition
 * doesn't work with motion elements).
 *
 * Usage:
 *   import { AnimatedButton } from '@/components/ui/AnimatedButton';
 *   <AnimatedButton variant="default" size="sm">Click me</AnimatedButton>
 */

import { forwardRef } from 'react';
import { m } from 'framer-motion';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';
import { buttonVariants } from './button';

// Explicit prop interface avoids the onDrag type conflict between
// React's DragEventHandler and Framer Motion's drag handler.
interface AnimatedButtonProps extends VariantProps<typeof buttonVariants> {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLButtonElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
  'aria-expanded'?: boolean | 'true' | 'false';
  'aria-haspopup'?: boolean | 'true' | 'false' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  title?: string;
  id?: string;
  tabIndex?: number;
  form?: string;
}

export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  function AnimatedButton(
    {
      className,
      variant,
      size,
      children,
      disabled,
      type = 'button',
      onClick,
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onBlur,
      ...rest
    },
    ref
  ) {
    return (
      <m.button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        whileHover={disabled ? undefined : { scale: 1.03 }}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        disabled={disabled}
        type={type}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        {...(rest as Record<string, unknown>)}
      >
        {children}
      </m.button>
    );
  }
);
