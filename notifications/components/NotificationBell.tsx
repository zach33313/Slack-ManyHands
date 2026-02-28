'use client';

/**
 * notifications/components/NotificationBell.tsx
 *
 * Header bell icon with unread notification badge.
 * Subscribes to Socket.IO `notification:new` events and shows browser
 * push notifications when the tab is not focused.
 *
 * Usage:
 *   <NotificationBell />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useSocket } from '@/shared/hooks/useSocket';
import type { Notification } from '@/shared/types';
import { NotificationList } from './NotificationList';

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const socket = useSocket();
  const bellRef = useRef<HTMLDivElement>(null);
  const browserPermissionRef = useRef<NotificationPermission>('default');

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    browserPermissionRef.current = window.Notification.permission;

    if (window.Notification.permission === 'default') {
      window.Notification.requestPermission().then((permission) => {
        browserPermissionRef.current = permission;
      });
    }
  }, []);

  // Fetch initial unread count
  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch('/api/notifications?unreadOnly=true&limit=1');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.ok) {
          // Use pagination.total if available, otherwise count the data
          const total = data.pagination?.total ?? data.data?.length ?? 0;
          setUnreadCount(total);
        }
      } catch {
        // Silently fail — badge will show 0 until socket updates
      }
    }

    fetchCount();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for real-time notifications via Socket.IO
  useEffect(() => {
    function handleNewNotification(notification: Notification) {
      setUnreadCount((prev) => prev + 1);

      // Show browser push notification if tab is not focused
      if (
        typeof document !== 'undefined' &&
        document.hidden &&
        browserPermissionRef.current === 'granted'
      ) {
        showBrowserNotification(notification);
      }
    }

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    // Use a timeout to avoid immediately closing on the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleDropdown = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const handleMarkOneRead = useCallback(() => {
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  return (
    <div ref={bellRef} className="relative">
      {/* Bell button */}
      <button
        onClick={toggleDropdown}
        className={cn(
          'relative rounded-md p-2 transition-colors',
          'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
          'dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200',
          isOpen && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
        )}
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : 'Notifications'
        }
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <NotificationList
          onMarkAllRead={handleMarkAllRead}
          onMarkOneRead={handleMarkOneRead}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browser push notification
// ---------------------------------------------------------------------------

function showBrowserNotification(notification: Notification): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;

  // Extract readable information from the payload
  const payload = notification.payload;
  let title = 'New notification';
  let body = '';

  if ('preview' in payload && payload.preview) {
    body = payload.preview;
  }
  if ('emoji' in payload && payload.emoji) {
    body = `Reacted with ${payload.emoji}`;
  }

  // Set title based on notification type
  switch (notification.type) {
    case 'MENTION':
      title = 'You were mentioned';
      break;
    case 'DM':
      title = 'New direct message';
      break;
    case 'THREAD_REPLY':
      title = 'New thread reply';
      break;
    case 'REACTION':
      title = 'New reaction';
      break;
  }

  try {
    const browserNotif = new window.Notification(title, {
      body: body || 'You have a new notification',
      icon: '/favicon.ico',
      tag: `notification-${notification.id}`,
    });

    // Focus the window when the browser notification is clicked
    browserNotif.onclick = () => {
      window.focus();
      browserNotif.close();
    };

    // Auto-close after 5 seconds
    setTimeout(() => browserNotif.close(), 5000);
  } catch {
    // Browser notification API may not be available in all contexts
  }
}
