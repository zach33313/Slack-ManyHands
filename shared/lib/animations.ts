/**
 * shared/lib/animations.ts
 *
 * Shared Framer Motion animation variants and spring configurations.
 * Import these constants instead of defining ad-hoc animations in components.
 *
 * Usage:
 *   import { springSnappy, messageVariants, staggerContainer } from '@/shared/lib/animations'
 *   <motion.div variants={messageVariants} initial="initial" animate="animate" />
 *
 * react-virtuoso constraint:
 *   AnimatePresence does NOT work as a wrapper around the Virtuoso list.
 *   Use motion.div inside itemContent renderer for per-message animations.
 */

import type { Variants, Transition } from 'framer-motion';

// ---------------------------------------------------------------------------
// Spring Transitions
// ---------------------------------------------------------------------------

type SpringTransition = Transition & { type: 'spring'; stiffness: number; damping: number };

/** Snappy spring for button taps, toggles, small interactions */
export const springSnappy: SpringTransition = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
};

/** Gentle spring for panels, overlays, larger motion */
export const springGentle: SpringTransition = {
  type: 'spring',
  stiffness: 300,
  damping: 25,
};

/** Bouncy spring for celebratory or playful animations (reactions, confetti) */
export const springBouncy: SpringTransition = {
  type: 'spring',
  stiffness: 400,
  damping: 15,
};

// ---------------------------------------------------------------------------
// Message Animations
// Used inside react-virtuoso itemContent renderer — NOT as AnimatePresence wrappers
// ---------------------------------------------------------------------------

/** Fade + slide up for new messages appearing in the channel list */
export const messageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

/** Slightly different entry for messages sent by the current user (right-aligned in DMs) */
export const ownMessageVariants: Variants = {
  initial: { opacity: 0, x: 12 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    x: 12,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

// ---------------------------------------------------------------------------
// Reaction Animations
// ---------------------------------------------------------------------------

/** Emoji reaction bounce-in when first added */
export const reactionVariants: Variants = {
  initial: { scale: 0, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: springBouncy,
  },
  exit: {
    scale: 0,
    opacity: 0,
    transition: { duration: 0.1 },
  },
};

// ---------------------------------------------------------------------------
// Panel / Drawer Animations
// ---------------------------------------------------------------------------

/** Slide in from the right — thread panel, bookmarks, member details */
export const panelSlideRight: Variants = {
  initial: { x: '100%', opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: springGentle,
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

/** Sidebar collapse / expand animation */
export const sidebarVariants: Variants = {
  expanded: {
    width: 260,
    opacity: 1,
    transition: springGentle,
  },
  collapsed: {
    width: 0,
    opacity: 0,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

// ---------------------------------------------------------------------------
// Modal / Dialog Animations
// ---------------------------------------------------------------------------

/** Fade + scale for modals, dialogs, command palettes */
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: -8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springSnappy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -8,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

/** Backdrop fade for modal overlays */
export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

// ---------------------------------------------------------------------------
// Dropdown / Popover Animations
// ---------------------------------------------------------------------------

/** Dropdown menu container */
export const dropdownVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: -4 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.12, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -4,
    transition: { duration: 0.08, ease: 'easeIn' },
  },
};

/** Staggered dropdown items */
export const dropdownItemVariants: Variants = {
  initial: { opacity: 0, x: -4 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.1 },
  },
};

// ---------------------------------------------------------------------------
// Notification / Bell Animations
// ---------------------------------------------------------------------------

/** Bell wiggle for new notification */
export const bellWiggle: Variants = {
  initial: { rotate: 0 },
  animate: {
    rotate: [0, -15, 15, -10, 10, -5, 5, 0],
    transition: { duration: 0.6, ease: 'easeInOut' },
  },
};

/** Badge bounce when count increases */
export const badgeBounce: Variants = {
  initial: { scale: 0.5, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: springBouncy,
  },
  exit: {
    scale: 0.5,
    opacity: 0,
    transition: { duration: 0.1 },
  },
};

// ---------------------------------------------------------------------------
// List Stagger (search results, member lists, channel lists)
// ---------------------------------------------------------------------------

/** Container variant — staggers children with a 50ms delay between each */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.05 },
  },
};

/** Child variant — used with staggerContainer */
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
};

// ---------------------------------------------------------------------------
// Loading / Skeleton Animations
// ---------------------------------------------------------------------------

/**
 * Shimmer animation for skeleton loaders.
 * Apply to a ::before pseudo-element or a child div with a gradient background.
 */
export const shimmerAnimation: Variants = {
  initial: { backgroundPosition: '-200% 0' },
  animate: {
    backgroundPosition: '200% 0',
    transition: {
      repeat: Infinity,
      duration: 1.5,
      ease: 'linear',
    },
  },
};

// ---------------------------------------------------------------------------
// Toast Animations
// ---------------------------------------------------------------------------

/** Toast notification slide-in from bottom-right */
export const toastVariants: Variants = {
  initial: { opacity: 0, y: 20, scale: 0.9 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springSnappy,
  },
  exit: {
    opacity: 0,
    y: 20,
    scale: 0.9,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

// ---------------------------------------------------------------------------
// Micro-interactions (use with whileTap / whileHover)
// ---------------------------------------------------------------------------

/** Button tap effect — use with whileTap prop */
export const tapScale = { scale: 0.95 } as const;

/** Hover lift effect — use with whileHover prop */
export const hoverLift = { y: -2 } as const;

// ---------------------------------------------------------------------------
// Confetti trigger utility
// ---------------------------------------------------------------------------

/**
 * Trigger a confetti burst from the center of the screen.
 * Dynamically imports canvas-confetti to avoid SSR issues.
 * Use for reaction milestones, poll completions, etc.
 *
 * @param origin - Confetti origin as x/y fractions (default: center)
 */
export async function triggerConfetti(
  origin: { x: number; y: number } = { x: 0.5, y: 0.6 }
): Promise<void> {
  const confetti = (await import('canvas-confetti')).default;
  confetti({
    particleCount: 80,
    spread: 60,
    origin,
    colors: ['#8b5cf6', '#6d28d9', '#7c3aed', '#c4b5fd', '#ddd6fe'],
    gravity: 1.2,
    scalar: 0.9,
  });
}

/**
 * Trigger a celebration confetti burst for emoji reactions like 🎉 🎊 🥳 🏆 🚀 ✨.
 * Uses a colorful mix with 100 particles and 70 spread.
 * Dynamically imports canvas-confetti to avoid SSR issues.
 *
 * @param origin - Confetti origin as x/y fractions (default: center)
 */
export async function triggerCelebrationConfetti(
  origin: { x: number; y: number } = { x: 0.5, y: 0.6 }
): Promise<void> {
  const confetti = (await import('canvas-confetti')).default;
  confetti({
    particleCount: 100,
    spread: 70,
    origin,
    colors: [
      '#ff0000', '#ff7700', '#ffff00', '#00ff00',
      '#0000ff', '#8b00ff', '#ff69b4', '#00ffff',
      '#ffd700', '#ff6347',
    ],
    gravity: 1.0,
    scalar: 1.0,
    ticks: 200,
    startVelocity: 30,
  });
}
