/**
 * __tests__/animations/animations.test.ts
 *
 * Tests for shared animation constants and utilities in shared/lib/animations.ts.
 * Verifies all exported variants have the correct shape, keys, and values.
 * No DOM required — pure TypeScript module.
 */

// Mock canvas-confetti so dynamic import in triggerConfetti/triggerCelebrationConfetti resolves
jest.mock('canvas-confetti', () => jest.fn());

import {
  springSnappy,
  springGentle,
  springBouncy,
  messageVariants,
  ownMessageVariants,
  reactionVariants,
  panelSlideRight,
  sidebarVariants,
  modalVariants,
  backdropVariants,
  dropdownVariants,
  dropdownItemVariants,
  bellWiggle,
  badgeBounce,
  staggerContainer,
  staggerItem,
  shimmerAnimation,
  toastVariants,
  tapScale,
  hoverLift,
  triggerConfetti,
  triggerCelebrationConfetti,
} from '@/shared/lib/animations';

// ---------------------------------------------------------------------------
// Spring transitions
// ---------------------------------------------------------------------------

describe('springSnappy', () => {
  it('has type spring', () => {
    expect(springSnappy.type).toBe('spring');
  });

  it('has stiffness 500', () => {
    expect(springSnappy.stiffness).toBe(500);
  });

  it('has damping 30', () => {
    expect(springSnappy.damping).toBe(30);
  });
});

describe('springGentle', () => {
  it('has type spring', () => {
    expect(springGentle.type).toBe('spring');
  });

  it('has stiffness 300', () => {
    expect(springGentle.stiffness).toBe(300);
  });

  it('has damping 25', () => {
    expect(springGentle.damping).toBe(25);
  });
});

describe('springBouncy', () => {
  it('has type spring', () => {
    expect(springBouncy.type).toBe('spring');
  });

  it('has stiffness 400', () => {
    expect(springBouncy.stiffness).toBe(400);
  });

  it('has damping 15 (bouncy)', () => {
    expect(springBouncy.damping).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Message variants
// ---------------------------------------------------------------------------

describe('messageVariants (other users — slide up from below)', () => {
  it('initial has opacity 0 and y 10', () => {
    expect(messageVariants.initial).toMatchObject({ opacity: 0, y: 10 });
  });

  it('animate has opacity 1 and y 0', () => {
    expect(messageVariants.animate).toMatchObject({ opacity: 1, y: 0 });
  });

  it('exit has opacity 0 and negative y', () => {
    const exit = messageVariants.exit as { opacity: number; y: number };
    expect(exit.opacity).toBe(0);
    expect(exit.y).toBeLessThan(0);
  });

  it('has all three variant keys', () => {
    expect(messageVariants).toHaveProperty('initial');
    expect(messageVariants).toHaveProperty('animate');
    expect(messageVariants).toHaveProperty('exit');
  });
});

describe('ownMessageVariants (own messages — slide in from right)', () => {
  it('initial has opacity 0 and x 12', () => {
    expect(ownMessageVariants.initial).toMatchObject({ opacity: 0, x: 12 });
  });

  it('animate has opacity 1 and x 0', () => {
    expect(ownMessageVariants.animate).toMatchObject({ opacity: 1, x: 0 });
  });

  it('exit slides back to the right (positive x)', () => {
    const exit = ownMessageVariants.exit as { opacity: number; x: number };
    expect(exit.opacity).toBe(0);
    expect(exit.x).toBeGreaterThan(0);
  });

  it('initial x differs from messageVariants (no y offset)', () => {
    const ownInitial = ownMessageVariants.initial as { x?: number; y?: number };
    const msgInitial = messageVariants.initial as { x?: number; y?: number };
    expect(ownInitial.x).toBeDefined();
    expect(msgInitial.y).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Reaction variants
// ---------------------------------------------------------------------------

describe('reactionVariants', () => {
  it('initial has scale 0 and opacity 0 (bounce-in)', () => {
    expect(reactionVariants.initial).toMatchObject({ scale: 0, opacity: 0 });
  });

  it('animate has scale 1 and opacity 1', () => {
    expect(reactionVariants.animate).toMatchObject({ scale: 1, opacity: 1 });
  });

  it('exit has scale 0 and opacity 0', () => {
    expect(reactionVariants.exit).toMatchObject({ scale: 0, opacity: 0 });
  });
});

// ---------------------------------------------------------------------------
// Panel / drawer variants
// ---------------------------------------------------------------------------

describe('panelSlideRight', () => {
  it('initial starts at x 100% (off-screen right)', () => {
    expect(panelSlideRight.initial).toMatchObject({ x: '100%', opacity: 0 });
  });

  it('animate ends at x 0 and full opacity', () => {
    expect(panelSlideRight.animate).toMatchObject({ x: 0, opacity: 1 });
  });

  it('exit returns to x 100%', () => {
    const exit = panelSlideRight.exit as { x: string; opacity: number };
    expect(exit.x).toBe('100%');
    expect(exit.opacity).toBe(0);
  });
});

describe('sidebarVariants', () => {
  it('expanded state has width 260 (sidebar width in pixels)', () => {
    const expanded = sidebarVariants.expanded as { width: number; opacity: number };
    expect(expanded.width).toBe(260);
  });

  it('expanded state has opacity 1', () => {
    const expanded = sidebarVariants.expanded as { width: number; opacity: number };
    expect(expanded.opacity).toBe(1);
  });

  it('collapsed state has width 0', () => {
    const collapsed = sidebarVariants.collapsed as { width: number; opacity: number };
    expect(collapsed.width).toBe(0);
  });

  it('collapsed state has opacity 0', () => {
    const collapsed = sidebarVariants.collapsed as { width: number; opacity: number };
    expect(collapsed.opacity).toBe(0);
  });

  it('has expanded and collapsed keys (no initial/animate/exit)', () => {
    expect(sidebarVariants).toHaveProperty('expanded');
    expect(sidebarVariants).toHaveProperty('collapsed');
    expect(sidebarVariants).not.toHaveProperty('initial');
    expect(sidebarVariants).not.toHaveProperty('animate');
  });
});

// ---------------------------------------------------------------------------
// Modal / dialog variants
// ---------------------------------------------------------------------------

describe('modalVariants', () => {
  it('initial has opacity 0, scale 0.95, and negative y', () => {
    const initial = modalVariants.initial as { opacity: number; scale: number; y: number };
    expect(initial.opacity).toBe(0);
    expect(initial.scale).toBe(0.95);
    expect(initial.y).toBeLessThan(0);
  });

  it('animate has opacity 1, scale 1, and y 0', () => {
    expect(modalVariants.animate).toMatchObject({ opacity: 1, scale: 1, y: 0 });
  });

  it('exit returns to opacity 0 and scale 0.95', () => {
    const exit = modalVariants.exit as { opacity: number; scale: number };
    expect(exit.opacity).toBe(0);
    expect(exit.scale).toBe(0.95);
  });
});

describe('backdropVariants', () => {
  it('initial has opacity 0', () => {
    expect(backdropVariants.initial).toMatchObject({ opacity: 0 });
  });

  it('animate has opacity 1', () => {
    expect(backdropVariants.animate).toMatchObject({ opacity: 1 });
  });

  it('exit has opacity 0', () => {
    expect(backdropVariants.exit).toMatchObject({ opacity: 0 });
  });
});

// ---------------------------------------------------------------------------
// Dropdown variants
// ---------------------------------------------------------------------------

describe('dropdownVariants', () => {
  it('initial has opacity 0 and scale 0.95', () => {
    const initial = dropdownVariants.initial as { opacity: number; scale: number; y: number };
    expect(initial.opacity).toBe(0);
    expect(initial.scale).toBe(0.95);
  });

  it('initial has negative y (drops down from above)', () => {
    const initial = dropdownVariants.initial as { y: number };
    expect(initial.y).toBeLessThan(0);
  });

  it('animate has opacity 1, scale 1, and y 0', () => {
    expect(dropdownVariants.animate).toMatchObject({ opacity: 1, scale: 1, y: 0 });
  });
});

describe('dropdownItemVariants', () => {
  it('initial has opacity 0 and negative x (slides in from left)', () => {
    const initial = dropdownItemVariants.initial as { opacity: number; x: number };
    expect(initial.opacity).toBe(0);
    expect(initial.x).toBeLessThan(0);
  });

  it('animate has opacity 1 and x 0', () => {
    expect(dropdownItemVariants.animate).toMatchObject({ opacity: 1, x: 0 });
  });
});

// ---------------------------------------------------------------------------
// Notification variants
// ---------------------------------------------------------------------------

describe('bellWiggle', () => {
  it('initial has rotate 0', () => {
    expect(bellWiggle.initial).toMatchObject({ rotate: 0 });
  });

  it('animate has a rotate array with multiple keyframes', () => {
    const animate = bellWiggle.animate as { rotate: number[] };
    expect(Array.isArray(animate.rotate)).toBe(true);
    expect(animate.rotate.length).toBeGreaterThan(2);
  });

  it('rotate array starts and ends at 0', () => {
    const animate = bellWiggle.animate as { rotate: number[] };
    expect(animate.rotate[0]).toBe(0);
    expect(animate.rotate[animate.rotate.length - 1]).toBe(0);
  });
});

describe('badgeBounce', () => {
  it('initial has scale 0.5 and opacity 0', () => {
    expect(badgeBounce.initial).toMatchObject({ scale: 0.5, opacity: 0 });
  });

  it('animate has scale 1 and opacity 1', () => {
    expect(badgeBounce.animate).toMatchObject({ scale: 1, opacity: 1 });
  });

  it('exit has scale 0.5 and opacity 0', () => {
    expect(badgeBounce.exit).toMatchObject({ scale: 0.5, opacity: 0 });
  });
});

// ---------------------------------------------------------------------------
// Stagger variants
// ---------------------------------------------------------------------------

describe('staggerContainer', () => {
  it('animate.transition has staggerChildren 0.05', () => {
    const animate = staggerContainer.animate as {
      transition: { staggerChildren: number };
    };
    expect(animate.transition?.staggerChildren).toBe(0.05);
  });

  it('has initial and animate keys', () => {
    expect(staggerContainer).toHaveProperty('initial');
    expect(staggerContainer).toHaveProperty('animate');
  });
});

describe('staggerItem', () => {
  it('initial has opacity 0 and y 8', () => {
    expect(staggerItem.initial).toMatchObject({ opacity: 0, y: 8 });
  });

  it('animate has opacity 1 and y 0', () => {
    expect(staggerItem.animate).toMatchObject({ opacity: 1, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// Loading / shimmer animation
// ---------------------------------------------------------------------------

describe('shimmerAnimation', () => {
  it('initial has a backgroundPosition string', () => {
    const initial = shimmerAnimation.initial as { backgroundPosition: string };
    expect(typeof initial.backgroundPosition).toBe('string');
  });

  it('animate has a backgroundPosition string', () => {
    const animate = shimmerAnimation.animate as { backgroundPosition: string };
    expect(typeof animate.backgroundPosition).toBe('string');
  });

  it('animate.transition repeats Infinity', () => {
    const animate = shimmerAnimation.animate as {
      transition: { repeat: number; duration: number; ease: string };
    };
    expect(animate.transition?.repeat).toBe(Infinity);
  });

  it('animate.transition has linear ease', () => {
    const animate = shimmerAnimation.animate as {
      transition: { ease: string };
    };
    expect(animate.transition?.ease).toBe('linear');
  });
});

// ---------------------------------------------------------------------------
// Toast variants
// ---------------------------------------------------------------------------

describe('toastVariants', () => {
  it('initial has opacity 0, y 20, and scale 0.9', () => {
    expect(toastVariants.initial).toMatchObject({ opacity: 0, y: 20, scale: 0.9 });
  });

  it('animate has opacity 1, y 0, and scale 1', () => {
    expect(toastVariants.animate).toMatchObject({ opacity: 1, y: 0, scale: 1 });
  });

  it('exit has opacity 0, positive y, and scale 0.9', () => {
    const exit = toastVariants.exit as { opacity: number; y: number; scale: number };
    expect(exit.opacity).toBe(0);
    expect(exit.y).toBeGreaterThan(0);
    expect(exit.scale).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// Micro-interaction constants
// ---------------------------------------------------------------------------

describe('tapScale', () => {
  it('is { scale: 0.95 }', () => {
    expect(tapScale).toEqual({ scale: 0.95 });
  });
});

describe('hoverLift', () => {
  it('is { y: -2 }', () => {
    expect(hoverLift).toEqual({ y: -2 });
  });
});

// ---------------------------------------------------------------------------
// Confetti utilities
// ---------------------------------------------------------------------------

describe('triggerConfetti', () => {
  it('is an async function', () => {
    expect(triggerConfetti.constructor.name).toBe('AsyncFunction');
  });

  it('returns a Promise when called', async () => {
    const result = triggerConfetti();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('accepts a custom origin parameter', async () => {
    await expect(triggerConfetti({ x: 0.3, y: 0.4 })).resolves.toBeUndefined();
  });
});

describe('triggerCelebrationConfetti', () => {
  it('is an async function', () => {
    expect(triggerCelebrationConfetti.constructor.name).toBe('AsyncFunction');
  });

  it('returns a Promise when called', async () => {
    const result = triggerCelebrationConfetti();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('accepts a custom origin parameter', async () => {
    await expect(triggerCelebrationConfetti({ x: 0.7, y: 0.5 })).resolves.toBeUndefined();
  });
});
