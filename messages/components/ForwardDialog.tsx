'use client';

/**
 * messages/components/ForwardDialog.tsx
 *
 * Dialog for forwarding a message to another channel or DM.
 * Features: channel/DM picker with search, optional comment.
 * Creates a new message in the destination with a forwarded embed.
 */

import { useState, useEffect, useCallback } from 'react';
import { Search, Forward } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MessageWithMeta } from '@/shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelOption {
  id: string;
  name: string;
  type: string;
}

interface ForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The message to forward */
  message: MessageWithMeta;
  /** Current workspace slug for API calls */
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Helper: build forwarded message content JSON
// ---------------------------------------------------------------------------

function buildForwardedContent(
  message: MessageWithMeta,
  comment: string,
  sourceChannelName: string
): object {
  const forwardEmbed = {
    type: 'forwardedMessage',
    attrs: {
      originalMessageId: message.id,
      originalAuthorId: message.userId,
      originalAuthorName: message.author.name,
      originalChannelName: sourceChannelName,
      originalCreatedAt: message.createdAt,
      originalContent: message.contentPlain,
    },
  };

  const nodes: object[] = [];

  if (comment.trim()) {
    nodes.push({
      type: 'paragraph',
      content: [{ type: 'text', text: comment.trim() }],
    });
  }

  nodes.push(forwardEmbed);

  return {
    type: 'doc',
    content: nodes,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForwardDialog({
  open,
  onOpenChange,
  message,
  workspaceId,
}: ForwardDialogProps) {
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [filtered, setFiltered] = useState<ChannelOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [isForwarding, setIsForwarding] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Load available channels
  useEffect(() => {
    if (!open || !workspaceId) return;

    setLoadingChannels(true);
    fetch(`/api/workspaces/${workspaceId}/channels`)
      .then((r) => r.json())
      .then((data) => {
        const list: ChannelOption[] = (data.channels ?? data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          type: c.type,
        }));
        setChannels(list);
        setFiltered(list);
      })
      .catch(() => {
        toast.error('Failed to load channels');
      })
      .finally(() => setLoadingChannels(false));
  }, [open, workspaceId]);

  // Filter channels by search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFiltered(channels);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFiltered(channels.filter((c) => c.name.toLowerCase().includes(q)));
  }, [searchQuery, channels]);

  function reset() {
    setSearchQuery('');
    setSelectedChannelId(null);
    setComment('');
  }

  async function handleForward() {
    if (!selectedChannelId) {
      toast.error('Please select a destination channel');
      return;
    }

    const destChannel = channels.find((c) => c.id === selectedChannelId);
    const sourceChannelName = '#' + (message.channelId ?? 'unknown');

    const contentJson = buildForwardedContent(message, comment, sourceChannelName);
    const commentText = comment.trim();
    const contentPlain = commentText
      ? `${commentText}\n\n[Forwarded from ${sourceChannelName}] ${message.contentPlain}`
      : `[Forwarded from ${sourceChannelName}] ${message.contentPlain}`;

    setIsForwarding(true);
    try {
      const res = await fetch(`/api/channels/${selectedChannelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentJson,
          contentPlain,
          forwardedFrom: {
            messageId: message.id,
            channelId: message.channelId,
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to forward message');

      toast.success(`Message forwarded to #${destChannel?.name ?? 'channel'}`);
      reset();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to forward';
      toast.error(msg);
    } finally {
      setIsForwarding(false);
    }
  }

  function getChannelIcon(type: string) {
    if (type === 'DM' || type === 'GROUP_DM') return '👤';
    if (type === 'PRIVATE') return '🔒';
    return '#';
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5" />
            Forward Message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original message preview */}
          <div className="rounded-md border-l-4 border-l-muted-foreground/30 pl-3 py-2 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">
              From <strong>{message.author.name}</strong>
            </p>
            <p className="text-sm line-clamp-3">{message.contentPlain}</p>
          </div>

          {/* Channel search */}
          <div className="space-y-2">
            <Label>Send to</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search channels…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>

            <ScrollArea className="h-40 border rounded-md">
              {loadingChannels ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  No channels found
                </div>
              ) : (
                <div className="p-1">
                  {filtered.map((ch) => (
                    <button
                      key={ch.id}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                        selectedChannelId === ch.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      }`}
                      onClick={() =>
                        setSelectedChannelId(ch.id === selectedChannelId ? null : ch.id)
                      }
                    >
                      <span className="text-xs">{getChannelIcon(ch.type)}</span>
                      <span className="truncate">{ch.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Optional comment */}
          <div className="space-y-1.5">
            <Label htmlFor="forward-comment">
              Add a comment{' '}
              <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="forward-comment"
              placeholder="Write a message…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleForward}
            disabled={!selectedChannelId || isForwarding}
          >
            {isForwarding ? 'Forwarding…' : 'Forward'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
