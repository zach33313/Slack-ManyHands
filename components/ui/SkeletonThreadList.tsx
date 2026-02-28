'use client';

/**
 * components/ui/SkeletonThreadList.tsx
 *
 * Skeleton for the thread panel.
 * Shows: parent message skeleton + 3 reply skeletons with indentation.
 * Uses shimmer animation.
 *
 * Usage:
 *   import { SkeletonThreadList } from '@/components/ui/SkeletonThreadList';
 *   {threadLoading && <SkeletonThreadList />}
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

/** Full message skeleton (for parent message) */
function SkeletonParentMessage() {
  return (
    <m.div
      variants={staggerItem}
      className="flex items-start gap-2 px-4 pt-3 pb-2"
    >
      <ShimmerBlock className="h-10 w-10 flex-shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <ShimmerBlock className="h-4 w-[110px]" />
          <ShimmerBlock className="h-3 w-[55px]" />
        </div>
        <ShimmerBlock className="h-4 w-full" />
        <ShimmerBlock className="h-4 w-5/6" />
        <ShimmerBlock className="h-4 w-3/4" />
      </div>
    </m.div>
  );
}

/** Indented reply skeleton */
function SkeletonReply({ index }: { index: number }) {
  const contentWidths = ['w-2/3', 'w-5/6', 'w-1/2'];
  const width = contentWidths[index % contentWidths.length];
  return (
    <m.div
      variants={staggerItem}
      className="flex items-start gap-2 px-4 py-1.5"
    >
      <ShimmerBlock className="h-8 w-8 flex-shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <ShimmerBlock className="h-3.5 w-[90px]" />
          <ShimmerBlock className="h-3 w-[45px]" />
        </div>
        <ShimmerBlock className={`h-4 ${width}`} />
      </div>
    </m.div>
  );
}

interface SkeletonThreadListProps {
  replyCount?: number;
}

export function SkeletonThreadList({ replyCount = 3 }: SkeletonThreadListProps) {
  return (
    <m.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Parent message */}
      <SkeletonParentMessage />

      {/* Divider */}
      <m.div variants={staggerItem} className="px-4 py-2">
        <div className="h-px bg-border" />
      </m.div>

      {/* Reply label */}
      <m.div variants={staggerItem} className="flex items-center gap-2 px-4 py-1">
        <ShimmerBlock className="h-3 w-12" />
        <ShimmerBlock className="h-px flex-1" />
      </m.div>

      {/* Replies */}
      {Array.from({ length: replyCount }).map((_, i) => (
        <SkeletonReply key={i} index={i} />
      ))}
    </m.div>
  );
}
