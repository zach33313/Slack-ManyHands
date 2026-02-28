'use client';

import { useAppStore } from '@/store';
import { cn } from '@/shared/lib/utils';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { ChannelSidebar } from './ChannelSidebar';

/**
 * Outer sidebar container: flex row containing WorkspaceSidebar + ChannelSidebar.
 * Collapsible on mobile — slides in from the left with backdrop overlay.
 * On desktop (lg+), always visible in its static position.
 */
export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  return (
    <>
      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          'flex h-full shrink-0',
          // Mobile: fixed overlay with slide animation
          'fixed inset-y-0 left-0 z-40 lg:static lg:z-auto',
          // Show/hide on mobile; always visible on desktop
          sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full lg:translate-x-0',
          'transition-transform duration-200 ease-in-out'
        )}
      >
        <WorkspaceSidebar />
        <ChannelSidebar />
      </aside>
    </>
  );
}
