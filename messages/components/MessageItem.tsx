/**
 * messages/components/MessageItem.tsx
 *
 * Single message row in the message list.
 *
 * Supports two display modes:
 * - Full mode: avatar + display name + timestamp + content
 * - Compact mode: only content (same author as previous message, within 5 minutes)
 *
 * Features:
 * - Renders Tiptap JSON content via generateHTML with dangerouslySetInnerHTML,
 *   falling back to contentPlain for plain text messages
 * - Shows "(edited)" indicator if isEdited
 * - Shows "[This message was deleted]" in italic if isDeleted
 * - File attachments rendered below content
 * - ReactionBar below content
 * - Hover: shows MessageActions toolbar
 * - Thread summary: if replyCount > 0, shows reply count link + last reply time
 * - Mentions highlighted with distinct background
 */

'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import SlackEditor from '@/components/editor/SlackEditor';
import DOMPurify from 'dompurify';
import { useRouter } from 'next/navigation';
import type { MessageWithMeta, TiptapJSON, TiptapNode, MemberRole } from '@/shared/types';
import { cn, formatMessageTime, formatRelativeTime, getInitials, isInlineImage, formatFileSize } from '@/shared/lib/utils';
import { UserAvatar } from '@/members/components/UserAvatar';
import { MemberProfileCard } from '@/members/components/MemberProfileCard';
import { format } from 'date-fns';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppStore } from '@/store';
import { openDM } from '@/channels/actions';
import { AnimatedReactionBar } from './AnimatedReactionBar';
import { MessageActions } from './MessageActions';
import { useMessagesStore } from '@/messages/store';
import { AudioPlayer } from './AudioPlayer';
import { PollDisplay } from '@/polls/components/PollDisplay';
import { LinkPreviewCard } from '@/link-previews/components/LinkPreviewCard';
import type { LinkPreviewData } from '@/link-previews/types';
import type { Poll } from '@/polls/types';

interface MessageItemProps {
  message: MessageWithMeta;
  /** Previous message in the list — used for compact mode detection */
  previousMessage?: MessageWithMeta | null;
  /** Current authenticated user's ID */
  currentUserId: string;
  /** Channel name for thread panel context */
  channelName?: string;
  /** Whether this message is rendered inside a thread panel (hides thread summary) */
  isThreadView?: boolean;
  /** When true, the hover actions toolbar renders below the message to avoid viewport clipping */
  isFirstMessage?: boolean;
}

/** Threshold in ms for compact mode: 5 minutes */
const COMPACT_THRESHOLD_MS = 5 * 60 * 1000;

/** Check if this message should display in compact mode */
function shouldCompact(
  message: MessageWithMeta,
  previousMessage?: MessageWithMeta | null
): boolean {
  if (!previousMessage) return false;
  if (previousMessage.userId !== message.userId) return false;
  if (previousMessage.isDeleted) return false;

  const msgDate = new Date(message.createdAt);
  const prevDate = new Date(previousMessage.createdAt);
  return msgDate.getTime() - prevDate.getTime() < COMPACT_THRESHOLD_MS;
}

/** DOMPurify allowlist — only the tags/attrs produced by renderTiptapContent.
 *  Typed as a plain object so this compiles before @types/dompurify is installed.
 */
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 's', 'u', 'code', 'pre',
    'a', 'ul', 'ol', 'li', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'span', 'hr', 'img',
  ] as string[],
  ALLOWED_ATTR: [
    'href', 'target', 'rel',  // links
    'class',                   // Tailwind utilities
    'title',                   // tooltips
    'data-language',           // code block language tag
    'src', 'alt', 'loading',   // images / GIFs
  ] as string[],
  KEEP_CONTENT: true,
  RETURN_DOM: false as const,
  RETURN_DOM_FRAGMENT: false as const,
};

/**
 * Sanitize an HTML string with DOMPurify.
 * On the server (SSR, no DOM), return an empty string so no unsanitized HTML
 * is included in the server-rendered payload. The prose div is rendered with
 * suppressHydrationWarning so React ignores the SSR→client content difference,
 * and DOMPurify sanitizes the content on first client render.
 */
function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    // SSR: DOMPurify cannot run without a DOM. Return empty string so the
    // server-rendered HTML payload contains no unsanitized user content.
    return '';
  }
  // DOMPurify.sanitize with RETURN_DOM:false returns string|TrustedHTML;
  // we cast via unknown since we know RETURN_DOM is false.
  return DOMPurify.sanitize(html, DOMPURIFY_CONFIG) as unknown as string;
}

/** Render Tiptap JSON to simple HTML string */
function renderTiptapContent(content: TiptapJSON): string {
  if (!content || !content.content) return '';

  function renderNode(node: TiptapNode): string {
    // Text node
    if (node.type === 'text') {
      let text = escapeHtml(node.text ?? '');
      // Apply marks
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case 'bold':
            case 'strong':
              text = `<strong>${text}</strong>`;
              break;
            case 'italic':
            case 'em':
              text = `<em>${text}</em>`;
              break;
            case 'strike':
              text = `<s>${text}</s>`;
              break;
            case 'code':
              text = `<code class="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-sm font-mono text-pink-600 dark:text-pink-400">${text}</code>`;
              break;
            case 'link': {
              const rawHref = String(mark.attrs?.href ?? '');
              // Validate href via URL parsing — blocks javascript:, data:, and any
              // encoding tricks (java\nscript:, j&#97;vascript:, etc.) by normalising
              // through the URL constructor before inspecting the protocol.
              let safeHref = '#';
              try {
                const parsed = new URL(rawHref);
                if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
                  safeHref = rawHref;
                }
              } catch {
                // new URL() throws on relative paths — allow root-relative only
                if (rawHref.startsWith('/') && !rawHref.startsWith('//')) {
                  safeHref = rawHref;
                }
              }
              text = `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline hover:text-blue-800">${text}</a>`;
              break;
            }
            case 'underline':
              text = `<u>${text}</u>`;
              break;
          }
        }
      }
      return text;
    }

    // Recursively render children
    const children = node.content?.map(renderNode).join('') ?? '';

    switch (node.type) {
      case 'doc':
        return children;
      case 'paragraph': {
        const audiometa = node.attrs?.audioMetadata as { fileName?: string; mimeType?: string; size?: number; duration?: number } | undefined;
        if (audiometa && typeof audiometa.duration === 'number' && typeof audiometa.size === 'number') {
          const durationStr = formatDuration(audiometa.duration);
          const sizeStr = formatFileSize(audiometa.size);
          const ext = (audiometa.mimeType ?? '').split('/')[1]?.split(';')[0]?.toUpperCase() ?? 'AUDIO';
          return `<p class="mb-1 last:mb-0 flex items-center gap-1.5 flex-wrap"><span>🎙️ Voice message</span><span class="text-muted-foreground">·</span><span class="text-muted-foreground">${escapeHtml(durationStr)}</span><span class="text-muted-foreground">·</span><span class="text-muted-foreground">${escapeHtml(sizeStr)}</span><span class="inline-flex items-center rounded bg-gray-100 dark:bg-gray-700 px-1 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">${escapeHtml(ext)}</span></p>`;
        }
        return `<p class="mb-1 last:mb-0">${children || '<br>'}</p>`;
      }
      case 'heading': {
        const level = (node.attrs?.level as number) ?? 2;
        return `<h${level} class="font-bold mb-1">${children}</h${level}>`;
      }
      case 'bulletList':
        return `<ul class="list-disc pl-5 mb-1">${children}</ul>`;
      case 'orderedList':
        return `<ol class="list-decimal pl-5 mb-1">${children}</ol>`;
      case 'listItem':
        return `<li class="mb-0.5">${children}</li>`;
      case 'codeBlock': {
        const lang = (node.attrs?.language as string) ?? '';
        return `<pre class="rounded bg-gray-900 dark:bg-gray-950 p-3 mb-1 overflow-x-auto"><code class="text-sm font-mono text-gray-100 dark:text-gray-200" data-language="${escapeHtml(lang)}">${children}</code></pre>`;
      }
      case 'blockquote':
        return `<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-3 italic text-gray-600 dark:text-gray-400 mb-1">${children}</blockquote>`;
      case 'horizontalRule':
        return '<hr class="border-gray-200 dark:border-gray-700 my-2" />';
      case 'hardBreak':
        return '<br />';
      case 'mention': {
        const label = (node.attrs?.label as string) ?? (node.attrs?.id as string) ?? '';
        return `<span class="mention-highlight rounded bg-blue-100 dark:bg-blue-900 px-1 py-0.5 text-blue-800 dark:text-blue-200 font-medium">@${escapeHtml(label)}</span>`;
      }
      case 'emoji': {
        const name = (node.attrs?.name as string) ?? '';
        return `<span class="emoji" title=":${escapeHtml(name)}:">${children || `:${escapeHtml(name)}:`}</span>`;
      }
      case 'image': {
        const src = escapeHtml(String(node.attrs?.src ?? ''));
        const alt = escapeHtml(String(node.attrs?.alt ?? ''));
        const title = escapeHtml(String(node.attrs?.title ?? ''));
        if (!src) return '';
        return `<img src="${src}" alt="${alt}" title="${title}" class="max-w-full rounded" loading="lazy" />`;
      }
      default:
        return children;
    }
  }

  return content.content.map(renderNode).join('');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Format seconds as M:SS (e.g. 75 → "1:15", 15 → "0:15") */
function formatDuration(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(seconds));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** URL_REGEX — matches the first http/https URL in a string */
const URL_REGEX = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?]/;

/** Extracts the first URL from a plain-text string, or returns null */
function extractFirstUrl(text: string): string | null {
  const match = URL_REGEX.exec(text);
  return match ? match[0] : null;
}

/** Hook: fetches a link preview for the first URL found in contentPlain */
function useLinkPreview(contentPlain: string, hasFiles: boolean): LinkPreviewData | null {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);

  useEffect(() => {
    if (hasFiles) return; // Don't show previews alongside files
    const url = extractFirstUrl(contentPlain);
    if (!url) return;

    let cancelled = false;
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: LinkPreviewData | null) => {
        if (!cancelled && data) setPreview(data);
      })
      .catch(() => { /* swallow */ });

    return () => { cancelled = true; };
  }, [contentPlain, hasFiles]);

  return preview;
}

/** Inline file attachment row */
function FileAttachment({
  file,
}: {
  file: MessageWithMeta['files'][number];
}) {
  const isImage = isInlineImage(file.mimeType);
  const isAudio = file.mimeType.startsWith('audio/');

  if (isAudio) {
    return <AudioPlayer src={file.url} label={file.name} />;
  }

  if (isImage) {
    return (
      <div className="mt-1">
        <a href={file.url} target="_blank" rel="noopener noreferrer">
          <img
            src={file.url}
            alt={file.name}
            className="max-h-[300px] max-w-[400px] rounded-lg border border-gray-200 object-contain"
            loading="lazy"
          />
        </a>
        <div className="mt-0.5 text-xs text-muted-foreground">{file.name}</div>
      </div>
    );
  }

  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'mt-1 flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2',
        'transition-colors hover:bg-muted/50'
      )}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-100 text-xs font-medium text-muted-foreground">
        {file.name.split('.').pop()?.toUpperCase() ?? 'FILE'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-blue-600">{file.name}</div>
        <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
      </div>
    </a>
  );
}

export function MessageItem({
  message,
  previousMessage,
  currentUserId,
  channelName,
  isThreadView = false,
  isFirstMessage = false,
}: MessageItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const socket = useSocket();
  const router = useRouter();
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const setActiveThread = useMessagesStore((s) => s.setActiveThread);
  const linkPreview = useLinkPreview(message.contentPlain, message.files.length > 0);

  // Build a MemberWithUser for the profile card from the message author
  const authorAsMember = useMemo(() => ({
    id: '',
    workspaceId: currentWorkspace?.id ?? '',
    userId: message.userId,
    role: 'MEMBER' as MemberRole,
    joinedAt: new Date(),
    user: {
      id: message.author.id,
      name: message.author.name,
      email: '',
      image: message.author.image,
      title: null,
      statusText: null,
      statusEmoji: null,
      timezone: null,
    },
  }), [message.author, message.userId, currentWorkspace?.id]);

  const handleProfileDM = useCallback(async (targetUserId: string) => {
    if (!currentWorkspace) return;
    try {
      await openDM(currentWorkspace.id, targetUserId);
      router.push(`/${currentWorkspace.slug}/dm/${targetUserId}`);
      router.refresh();
    } catch (err) {
      console.error('Failed to open DM:', err);
    }
  }, [currentWorkspace, router]);

  const isCompact = shouldCompact(message, previousMessage);
  const isOwnMessage = message.userId === currentUserId;
  const createdAt = new Date(message.createdAt);
  const absoluteTime = format(createdAt, 'EEEE, MMMM d, yyyy h:mm a');

  // Render message content HTML — URL-sanitized then DOMPurify-sanitized
  const contentHtml = useMemo(() => {
    if (message.isDeleted) return null;
    if (!message.content || !message.content.content) return null;
    const rawHtml = renderTiptapContent(message.content);
    return sanitizeHtml(rawHtml);
  }, [message.content, message.isDeleted]);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSaveEdit = useCallback((content: TiptapJSON, plainText: string) => {
    if (!plainText.trim()) {
      // Empty message — just close the editor without saving
      setIsEditing(false);
      return;
    }
    socket.emit('message:edit', { messageId: message.id, content: content as unknown as Record<string, unknown> });
    setIsEditing(false);
  }, [message.id, socket]);

  const handleOpenThread = useCallback(() => {
    setActiveThread(message.id);
  }, [message.id, setActiveThread]);

  // Deleted message
  if (message.isDeleted) {
    return (
      <div className="px-5 py-1">
        <p className="text-sm italic text-muted-foreground">
          [This message was deleted]
        </p>
      </div>
    );
  }

  // Compact mode — only content, no avatar/name/timestamp
  if (isCompact) {
    return (
      <div
        className={cn(
          'group relative px-5 py-0.5',
          'transition-colors hover:bg-muted/50',
          isHovered && 'bg-muted/50'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Compact: same layout as full mode (avatar-width spacer + gap-2) so text aligns */}
        <div className="flex items-start gap-2">
          <div className="w-11 shrink-0 pt-0.5 text-center">
            <span className="hidden text-[10px] text-muted-foreground group-hover:inline" title={absoluteTime}>
              {format(createdAt, 'h:mm a')}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <TiptapEditInput
                initialContent={message.content ?? ({ type: 'doc', content: [] } as TiptapJSON)}
                workspaceId={currentWorkspace?.id ?? ''}
                onSave={handleSaveEdit}
                onCancel={handleCancelEdit}
              />
            ) : (
              <>
                {contentHtml !== null ? (
                  <div
                    className="prose prose-sm max-w-none text-foreground"
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
                    suppressHydrationWarning
                  />
                ) : (
                  <p className="text-sm text-foreground">{message.contentPlain}</p>
                )}
                {message.isEdited && (
                  <span className="ml-1 text-xs text-muted-foreground">(edited)</span>
                )}
              </>
            )}

            {/* File attachments */}
            {message.files.length > 0 && (
              <div className="mt-1 space-y-1">
                {message.files.map((file) => (
                  <FileAttachment key={file.id} file={file} />
                ))}
              </div>
            )}

            {/* Poll */}
            {message.poll && (
              <PollDisplay
                poll={message.poll as unknown as Poll}
                currentUserId={currentUserId}
              />
            )}

            {/* Link preview */}
            {!message.poll && linkPreview && (
              <LinkPreviewCard preview={linkPreview} />
            )}

            {/* Reactions */}
            <AnimatedReactionBar
              messageId={message.id}
              reactions={message.reactions}
              currentUserId={currentUserId}
            />

            {/* Thread summary */}
            {!isThreadView && message.replyCount > 0 && (
              <ThreadSummaryLink
                replyCount={message.replyCount}
                onClick={handleOpenThread}
              />
            )}
          </div>
        </div>

        {/* Hover actions */}
        {isHovered && !isEditing && (
          <MessageActions
            messageId={message.id}
            channelId={message.channelId}
            isOwnMessage={isOwnMessage}
            isPinned={false}
            onEdit={isOwnMessage ? handleStartEdit : undefined}
            onReply={handleOpenThread}
            message={message}
            workspaceId={currentWorkspace?.id}
            isFirstMessage={isFirstMessage}
          />
        )}
      </div>
    );
  }

  // Full mode — avatar + name + timestamp + content
  return (
    <div
      className={cn(
        'group relative px-5 pt-2 pb-0.5',
        'transition-colors hover:bg-muted/50',
        isHovered && 'bg-muted/50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-2">
        {/* Avatar */}
        <div className="w-11 shrink-0 pt-0.5 flex justify-center">
          <UserAvatar user={message.author} size="md" showPresence />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Author name + timestamp */}
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="text-[15px] font-bold text-foreground hover:underline cursor-pointer"
            >
              {message.author.name}
            </button>
            <span
              className="text-xs text-muted-foreground hover:underline"
              title={absoluteTime}
            >
              {formatMessageTime(createdAt)}
            </span>
          </div>

          {/* Profile card dialog */}
          <MemberProfileCard
            member={authorAsMember}
            open={profileOpen}
            onOpenChange={setProfileOpen}
            onMessageClick={handleProfileDM}
          />

          {/* Message content */}
          {isEditing ? (
            <TiptapEditInput
              initialContent={message.content ?? ({ type: 'doc', content: [] } as TiptapJSON)}
              workspaceId={currentWorkspace?.id ?? ''}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : (
            <>
              {contentHtml !== null ? (
                <div
                  className="prose prose-sm max-w-none text-foreground"
                  dangerouslySetInnerHTML={{ __html: contentHtml }}
                  suppressHydrationWarning
                />
              ) : (
                <p className="text-sm text-foreground">{message.contentPlain}</p>
              )}
              {message.isEdited && (
                <span className="ml-1 text-xs text-muted-foreground">(edited)</span>
              )}
            </>
          )}

          {/* File attachments */}
          {message.files.length > 0 && (
            <div className="mt-1 space-y-1">
              {message.files.map((file) => (
                <FileAttachment key={file.id} file={file} />
              ))}
            </div>
          )}

          {/* Poll */}
          {message.poll && (
            <PollDisplay
              poll={message.poll as unknown as Poll}
              currentUserId={currentUserId}
            />
          )}

          {/* Link preview */}
          {!message.poll && linkPreview && (
            <LinkPreviewCard preview={linkPreview} />
          )}

          {/* Reactions */}
          <AnimatedReactionBar
            messageId={message.id}
            reactions={message.reactions}
            currentUserId={currentUserId}
          />

          {/* Thread summary */}
          {!isThreadView && message.replyCount > 0 && (
            <ThreadSummaryLink
              replyCount={message.replyCount}
              onClick={handleOpenThread}
            />
          )}
        </div>
      </div>

      {/* Hover actions */}
      {isHovered && !isEditing && (
        <MessageActions
          messageId={message.id}
          channelId={message.channelId}
          isOwnMessage={isOwnMessage}
          isPinned={false}
          onEdit={isOwnMessage ? handleStartEdit : undefined}
          onReply={handleOpenThread}
          message={message}
          workspaceId={currentWorkspace?.id}
          isFirstMessage={isFirstMessage}
        />
      )}
    </div>
  );
}

/** Inline rich-text edit input — uses the full Tiptap editor pre-populated with existing content */
function TiptapEditInput({
  initialContent,
  workspaceId,
  onSave,
  onCancel,
}: {
  initialContent: TiptapJSON;
  workspaceId: string;
  onSave: (content: TiptapJSON, plainText: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="mt-1"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <SlackEditor
        onSubmit={onSave}
        initialContent={initialContent}
        workspaceId={workspaceId}
        placeholder="Edit message..."
      />
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          Press <kbd className="rounded bg-gray-100 dark:bg-gray-700 px-1 font-mono">Enter</kbd> to save,{' '}
          <kbd className="rounded bg-gray-100 dark:bg-gray-700 px-1 font-mono">Esc</kbd> to cancel
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Thread summary link shown below a parent message */
function ThreadSummaryLink({
  replyCount,
  onClick,
}: {
  replyCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mt-1 flex items-center gap-1.5 rounded-md py-1 text-xs',
        'text-blue-600 hover:bg-blue-50 hover:text-blue-700'
      )}
    >
      <span className="font-medium">
        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
      </span>
    </button>
  );
}
