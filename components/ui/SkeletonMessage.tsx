'use client';

/**
 * components/ui/SkeletonMessage.tsx
 *
 * Animated skeleton placeholder matching MessageItem layout dimensions.
 * - Avatar circle (40×40)
 * - Name bar (120px wide)
 * - Content bars (2-3 lines of varying width)
 * Uses shimmer animation via Framer Motion background-position animation.
 * Wrapped in m.div with staggerItem variants.
 *
 * Usage:
 *   import { SkeletonMessage } from '@/components/ui/SkeletonMessage';
 *   {isLoading && <SkeletonMessage />}
 */

import { m } from 'framer-motion';
import { staggerItem } from '@/shared/lib/animations';

/** Shimmer gradient applied via inline style + motion backgroundPosition */
const shimmerStyle = {
  background:
    'linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / 0.08) 50%, hsl(var(--muted)) 75%)',
  backgroundSize: '200% 100%',
};

/** Animated shimmer block */
function ShimmerBlock({ className }: { className: string }) {
  return (
    <m.div
      className={`rounded ${className}`}
      style={shimmerStyle}
      animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
    />
  );
}

interface SkeletonMessageProps {
  compact?: boolean;
}

export function SkeletonMessage({ compact = false }: SkeletonMessageProps) {
  if (compact) {
    return (
      <m.div
        variants={staggerItem}
        className="flex items-start gap-2 px-5 py-0.5"
      >
        <div className="w-[52px] shrink-0" />
        <div className="flex-1 space-y-1.5">
          <ShimmerBlock className="h-4 w-3/4" />
          <ShimmerBlock className="h-4 w-1/2" />
        </div>
      </m.div>
    );
  }

  return (
    <m.div
      variants={staggerItem}
      className="flex items-start gap-2 px-5 pt-2 pb-0.5"
    >
      {/* Avatar circle 40×40 */}
      <ShimmerBlock className="h-10 w-10 shrink-0 rounded-full" />

      {/* Content column */}
      <div className="flex-1 space-y-2">
        {/* Name + timestamp row */}
        <div className="flex items-center gap-2">
          <ShimmerBlock className="h-4 w-[120px]" />
          <ShimmerBlock className="h-3 w-[60px]" />
        </div>

        {/* Content lines */}
        <ShimmerBlock className="h-4 w-full" />
        <ShimmerBlock className="h-4 w-5/6" />
        <ShimmerBlock className="h-4 w-2/3" />
      </div>
    </m.div>
  );
}

/** Renders a list of skeleton messages for initial loading state */
export function SkeletonMessageList({ count = 5 }: { count?: number }) {
  return (
    <m.div
      initial="initial"
      animate="animate"
      className="flex flex-col"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMessage key={i} compact={i > 0 && i % 3 !== 0} />
      ))}
    </m.div>
  );
}
