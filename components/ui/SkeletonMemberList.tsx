'use client';

/**
 * components/ui/SkeletonMemberList.tsx
 *
 * Skeleton for the member list panel.
 * Each item shows: avatar circle + name bar + status bar.
 * Repeated 6 times with shimmer animation.
 * Matches MemberList item dimensions.
 *
 * Usage:
 *   import { SkeletonMemberList } from '@/components/ui/SkeletonMemberList';
 *   {isLoading && <SkeletonMemberList />}
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

const nameWidths = ['w-20', 'w-28', 'w-24', 'w-16', 'w-32', 'w-20'];
const statusWidths = ['w-16', 'w-12', 'w-20', 'w-14', 'w-10', 'w-16'];

function SkeletonMemberItem({ index }: { index: number }) {
  const nameWidth = nameWidths[index % nameWidths.length];
  const statusWidth = statusWidths[index % statusWidths.length];

  return (
    <m.div
      variants={staggerItem}
      className="flex items-center gap-2.5 px-3 py-2"
    >
      {/* Avatar circle */}
      <ShimmerBlock className="h-8 w-8 flex-shrink-0 rounded-full" />

      {/* Name + status column */}
      <div className="flex flex-col gap-1">
        <ShimmerBlock className={`h-3.5 ${nameWidth}`} />
        <ShimmerBlock className={`h-3 ${statusWidth}`} />
      </div>
    </m.div>
  );
}

interface SkeletonMemberListProps {
  count?: number;
}

export function SkeletonMemberList({ count = 6 }: SkeletonMemberListProps) {
  return (
    <m.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="py-2"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMemberItem key={i} index={i} />
      ))}
    </m.div>
  );
}
