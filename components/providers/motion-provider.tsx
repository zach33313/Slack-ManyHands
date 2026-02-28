'use client';

import { LazyMotion, domAnimation } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * MotionProvider wraps the app in LazyMotion with domAnimation features.
 * This enables tree-shaking — only the animation features used by `m.*` components
 * are included in the bundle. Place this at the root layout level.
 *
 * Usage: Import `m` (not `motion`) from 'framer-motion' in components.
 * Example: <m.div animate={{ opacity: 1 }} /> (NOT <motion.div>)
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
