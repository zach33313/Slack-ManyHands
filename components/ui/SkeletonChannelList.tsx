'use client';

/**
 * components/ui/SkeletonChannelList.tsx
 *
 * Skeleton for the channel sidebar list.
 * Each item shows: hash icon circle + channel name bar.
 * Repeated 8 times with shimmer animation.
 * Matches ChannelList item dimensions.
 *
 * Usage:
 *   import { SkeletonChannelList } from '@/components/ui/SkeletonChannelList';
 *   {isLoading && <SkeletonChannelList />}
 */

import { m } from 'framer-motion';
import { staggerContainer, staggerItem } from '@/shared/lib/animations';

const shimmerStyle = {
  background:
    'linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / 0.08) 50%, hsl(var(--muted)) 75%)',
  backgroundSize: '200% 100%',
};

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

/** Varying widths for name bars to look realistic */
const nameWidths = [
  'w-24', 'w-32', 'w-20', 'w-28', 'w-36',
  'w-24', 'w-16', 'w-32',
];

function SkeletonChannelItem({ index }: { index: number }) {
  const nameWidth = nameWidths[index % nameWidths.length];
  return (
    <m.div
      variants={staggerItem}
      className="flex items-center gap-2 px-3 py-1.5"
    >
      {/* Hash icon circle placeholder */}
      <ShimmerBlock className="h-4 w-4 flex-shrink-0 rounded-sm" />
      {/* Channel name bar */}
      <ShimmerBlock className={`h-3.5 ${nameWidth}`} />
    </m.div>
  );
}

interface SkeletonChannelListProps {
  count?: number;
  showHeader?: boolean;
}

export function SkeletonChannelList({ count = 8, showHeader = true }: SkeletonChannelListProps) {
  return (
    <div className="px-2 py-1">
      {showHeader && (
        <div className="mb-1 flex items-center gap-2 px-3 py-1">
          <ShimmerBlock className="h-3 w-16" />
        </div>
      )}
      <m.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonChannelItem key={i} index={i} />
        ))}
      </m.div>
    </div>
  );
}
