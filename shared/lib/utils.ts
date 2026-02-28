/**
 * shared/lib/utils.ts
 *
 * General-purpose utility functions used across domains.
 * Keep this file small — domain-specific helpers belong in their own domain.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';

// ---------------------------------------------------------------------------
// Tailwind / className helpers
// ---------------------------------------------------------------------------

/**
 * Merge Tailwind classes with proper conflict resolution.
 * Wraps clsx + tailwind-merge for use throughout the app.
 *
 * @example
 *   cn('px-4 py-2', isActive && 'bg-blue-500', 'hover:bg-blue-600')
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Date / time formatting
// ---------------------------------------------------------------------------

/**
 * Format a date for display in the message list.
 * Returns "Today", "Yesterday", or a formatted date string.
 *
 * @param date - The date to format
 * @returns Human-readable date label for use as a day separator
 */
export function formatDaySeparator(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMMM d');
}

/**
 * Format a message timestamp for display next to a message.
 * Returns e.g. "2:34 PM" or "Yesterday at 2:34 PM" for older messages.
 *
 * @param date - The message creation date
 */
export function formatMessageTime(date: Date): string {
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return `Yesterday at ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d, h:mm a');
}

/**
 * Format a relative timestamp like "2 minutes ago", "3 hours ago".
 * Used in notification lists and presence "last seen" displays.
 *
 * @param date - The date to format relative to now
 */
export function formatRelativeTime(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

/**
 * Convert a human-readable name to a URL-safe slug.
 * e.g. "Acme Corp!" → "acme-corp"
 *
 * @param name - Input string
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Truncate a string to `maxLength` characters, appending "..." if truncated.
 *
 * @param text - Input string
 * @param maxLength - Maximum character count
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Get the initials from a display name (up to 2 characters).
 * Used as avatar fallback when no image is set.
 *
 * @example
 *   getInitials("Alice Smith") // "AS"
 *   getInitials("alice")       // "A"
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Format a file size in bytes to a human-readable string.
 *
 * @example
 *   formatFileSize(1024)         // "1 KB"
 *   formatFileSize(1_500_000)    // "1.4 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Channel / workspace helpers
// ---------------------------------------------------------------------------

/**
 * Generate a channel slug from a name.
 * Channels use lowercase, hyphen-separated names (no spaces).
 *
 * @example
 *   channelSlug("General Discussion") // "general-discussion"
 */
export function channelSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Determine if a MIME type represents an image that can be displayed inline.
 *
 * @param mimeType - MIME type string e.g. "image/png"
 */
export function isInlineImage(mimeType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType);
}
