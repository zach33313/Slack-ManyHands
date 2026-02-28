'use client';

/**
 * notifications/components/NotificationList.tsx
 *
 * Dropdown panel that appears below the NotificationBell.
 * Shows a paginated list of notifications, with mark-as-read
 * and navigation functionality.
 *
 * Usage:
 *   <NotificationList onMarkAllRead={fn} onMarkOneRead={fn} onClose={fn} />
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AtSign,
  MessageSquare,
  MessageCircleReply,
  SmilePlus,
  Check,
  BellOff,
  Loader2,
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import { formatRelativeTime, truncate } from '@/shared/lib/utils';
import { NotificationType } from '@/shared/types';
import type { NotificationWithDetails } from '@/notifications/types';

interface NotificationListProps {
  onMarkAllRead: () => void;
  onMarkOneRead: () => void;
  onClose: () => void;
}

export function NotificationList({
  onMarkAllRead,
  onMarkOneRead,
  onClose,
}: NotificationListProps) {
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const [notifications, setNotifications] = useState<NotificationWithDetails[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  // Fetch notifications on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchNotifications() {
      try {
        setIsLoading(true);
        const res = await fetch('/api/notifications?limit=20');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.ok) {
          setNotifications(
            data.data.map((n: NotificationWithDetails) => ({
              ...n,
              createdAt: new Date(n.createdAt),
            }))
          );
          setHasMore(data.pagination?.hasMore ?? false);
        }
      } catch {
        // Silently fail — show empty state
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchNotifications();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load more notifications (pagination)
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || notifications.length === 0) return;

    setIsLoadingMore(true);
    try {
      const lastNotification = notifications[notifications.length - 1];
      const res = await fetch(
        `/api/notifications?limit=20&cursor=${lastNotification.id}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        const newNotifications = data.data.map(
          (n: NotificationWithDetails) => ({
            ...n,
            createdAt: new Date(n.createdAt),
          })
        );
        setNotifications((prev) => [...prev, ...newNotifications]);
        setHasMore(data.pagination?.hasMore ?? false);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, notifications]);

  // Mark all as read
  const handleMarkAllRead = useCallback(async () => {
    setIsMarkingAll(true);
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'POST',
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, isRead: true }))
        );
        onMarkAllRead();
      }
    } catch {
      // Silently fail
    } finally {
      setIsMarkingAll(false);
    }
  }, [onMarkAllRead]);

  // Click on a notification: mark as read + navigate
  const handleNotificationClick = useCallback(
    async (notification: NotificationWithDetails) => {
      // Mark as read via API
      if (!notification.isRead) {
        try {
          const res = await fetch(
            `/api/notifications/${notification.id}/read`,
            { method: 'PATCH' }
          );
          if (res.ok) {
            setNotifications((prev) =>
              prev.map((n) =>
                n.id === notification.id ? { ...n, isRead: true } : n
              )
            );
            onMarkOneRead();
          }
        } catch {
          // Continue with navigation even if mark-read fails
        }
      }

      // Navigate to the message in its channel
      if (notification.channelId && workspaceSlug) {
        router.push(`/${workspaceSlug}/channel/${notification.channelId}`);
        onClose();
      }
    },
    [router, onClose, onMarkOneRead]
  );

  // Get icon for notification type
  const getNotificationIcon = useCallback((type: NotificationType) => {
    switch (type) {
      case NotificationType.MENTION:
        return <AtSign className="h-4 w-4 text-blue-500" />;
      case NotificationType.DM:
        return <MessageSquare className="h-4 w-4 text-green-500" />;
      case NotificationType.THREAD_REPLY:
        return <MessageCircleReply className="h-4 w-4 text-purple-500" />;
      case NotificationType.REACTION:
        return <SmilePlus className="h-4 w-4 text-amber-500" />;
      default:
        return <MessageSquare className="h-4 w-4 text-gray-500" />;
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div
      className="fixed left-[60px] top-12 z-50 w-96 max-w-[calc(100vw-80px)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
      role="menu"
      aria-label="Notifications"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Notifications
        </h3>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={isMarkingAll}
            className="flex items-center gap-1 text-xs text-blue-600 transition-colors hover:text-blue-800 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {isMarkingAll ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Mark all as read
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
            <BellOff className="mb-2 h-8 w-8" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <>
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={cn(
                  'flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50',
                  !notification.isRead &&
                    'border-l-2 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                )}
                role="menuitem"
              >
                {/* Type icon */}
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                  {getNotificationIcon(notification.type)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    <span className="font-medium">
                      {notification.senderName}
                    </span>{' '}
                    <span className="text-gray-600 dark:text-gray-400">
                      {getNotificationAction(notification.type)}
                    </span>
                  </p>

                  {notification.preview && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {truncate(notification.preview, 100)}
                    </p>
                  )}

                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                    {notification.channelName && (
                      <>
                        <span>#{notification.channelName}</span>
                        <span>&middot;</span>
                      </>
                    )}
                    <span>
                      {formatRelativeTime(notification.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Unread indicator dot */}
                {!notification.isRead && (
                  <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                )}
              </button>
            ))}

            {/* Load more button */}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="flex w-full items-center justify-center py-3 text-xs text-blue-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-gray-800/50"
              >
                {isLoadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Load more'
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: get action text for notification type
// ---------------------------------------------------------------------------

function getNotificationAction(type: NotificationType): string {
  switch (type) {
    case NotificationType.MENTION:
      return 'mentioned you';
    case NotificationType.DM:
      return 'sent you a message';
    case NotificationType.THREAD_REPLY:
      return 'replied in a thread';
    case NotificationType.REACTION:
      return 'reacted to your message';
    default:
      return 'sent a notification';
  }
}
