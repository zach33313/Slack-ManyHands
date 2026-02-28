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

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { MessageWithMeta, TiptapJSON, TiptapNode, MemberRole } from '@/shared/types';
import { cn, formatMessageTime, formatRelativeTime, getInitials, isInlineImage, formatFileSize } from '@/shared/lib/utils';
import { UserAvatar } from '@/members/components/UserAvatar';
import { MemberProfileCard } from '@/members/components/MemberProfileCard';
import { format } from 'date-fns';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppStore } from '@/store';
import { openDM } from '@/channels/actions';
import { ReactionBar } from './ReactionBar';
import { MessageActions } from './MessageActions';
import { useMessagesStore } from '@/messages/store';

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
              text = `<code class="rounded bg-gray-100 px-1 py-0.5 text-sm font-mono text-pink-600">${text}</code>`;
              break;
            case 'link':
              text = `<a href="${escapeHtml(String(mark.attrs?.href ?? ''))}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline hover:text-blue-800">${text}</a>`;
              break;
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
      case 'paragraph':
        return `<p class="mb-1 last:mb-0">${children || '<br>'}</p>`;
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
        return `<pre class="rounded bg-gray-900 p-3 mb-1 overflow-x-auto"><code class="text-sm font-mono text-gray-100" data-language="${escapeHtml(lang)}">${children}</code></pre>`;
      }
      case 'blockquote':
        return `<blockquote class="border-l-4 border-gray-300 pl-3 italic text-gray-600 mb-1">${children}</blockquote>`;
      case 'horizontalRule':
        return '<hr class="border-gray-200 my-2" />';
      case 'hardBreak':
        return '<br />';
      case 'mention': {
        const label = (node.attrs?.label as string) ?? (node.attrs?.id as string) ?? '';
        return `<span class="mention-highlight rounded bg-blue-100 px-1 py-0.5 text-blue-800 font-medium">@${escapeHtml(label)}</span>`;
      }
      case 'emoji': {
        const name = (node.attrs?.name as string) ?? '';
        return `<span class="emoji" title=":${escapeHtml(name)}:">${children || `:${escapeHtml(name)}:`}</span>`;
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

/** Inline file attachment row */
function FileAttachment({
  file,
}: {
  file: MessageWithMeta['files'][number];
}) {
  const isImage = isInlineImage(file.mimeType);

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
}: MessageItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const socket = useSocket();
  const router = useRouter();
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const setActiveThread = useMessagesStore((s) => s.setActiveThread);

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

  // Render message content HTML
  const contentHtml = useMemo(() => {
    if (message.isDeleted) return null;
    if (!message.content || !message.content.content) return null;
    return renderTiptapContent(message.content);
  }, [message.content, message.isDeleted]);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
    setEditContent(message.contentPlain);
  }, [message.contentPlain]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditContent('');
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editContent.trim()) return;
    const content: TiptapJSON = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: editContent.trim() }],
        },
      ],
    };
    socket.emit('message:edit', { messageId: message.id, content: content as unknown as Record<string, unknown> });
    setIsEditing(false);
    setEditContent('');
  }, [editContent, message.id, socket]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSaveEdit();
      }
      if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

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
        {/* Compact timestamp on hover */}
        <div className="flex items-start">
          <div className="w-[52px] shrink-0 pt-0.5 text-right">
            <span className="hidden text-[10px] text-muted-foreground group-hover:inline" title={absoluteTime}>
              {format(createdAt, 'h:mm')}
            </span>
          </div>
          <div className="min-w-0 flex-1 pl-2">
            {isEditing ? (
              <EditInput
                value={editContent}
                onChange={setEditContent}
                onKeyDown={handleEditKeyDown}
                onCancel={handleCancelEdit}
                onSave={handleSaveEdit}
              />
            ) : (
              <>
                {contentHtml ? (
                  <div
                    className="prose prose-sm max-w-none text-foreground"
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
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

            {/* Reactions */}
            <ReactionBar
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
        <div className="shrink-0 pt-0.5">
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
            <EditInput
              value={editContent}
              onChange={setEditContent}
              onKeyDown={handleEditKeyDown}
              onCancel={handleCancelEdit}
              onSave={handleSaveEdit}
            />
          ) : (
            <>
              {contentHtml ? (
                <div
                  className="prose prose-sm max-w-none text-foreground"
                  dangerouslySetInnerHTML={{ __html: contentHtml }}
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

          {/* Reactions */}
          <ReactionBar
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
        />
      )}
    </div>
  );
}

/** Inline edit input when editing a message */
function EditInput({
  value,
  onChange,
  onKeyDown,
  onCancel,
  onSave,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-1">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn(
          'w-full rounded-md border border-blue-300 bg-white px-3 py-2 text-sm',
          'resize-none outline-none ring-1 ring-blue-300 focus:ring-2 focus:ring-blue-500'
        )}
        rows={2}
        autoFocus
      />
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          Press <kbd className="rounded bg-gray-100 px-1 font-mono">Enter</kbd> to save,{' '}
          <kbd className="rounded bg-gray-100 px-1 font-mono">Esc</kbd> to cancel
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700"
        >
          Save
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
