'use client';

/**
 * channels/components/ChannelCreator.tsx
 *
 * Modal dialog for creating a new channel.
 *
 * Features:
 *   - Name input (auto-slugified, validated for slug format)
 *   - Description textarea
 *   - Public/private toggle
 *   - Submit calls createChannel server action
 *   - Displays validation errors inline
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, Lock, X, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { channelSlug } from '@/shared/lib/utils';
import { ChannelType } from '@/shared/types';
import { createChannel } from '@/channels/actions';

interface ChannelCreatorProps {
  workspaceId: string;
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ChannelCreator({
  workspaceId,
  workspaceSlug,
  isOpen,
  onClose,
}: ChannelCreatorProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ChannelType.PUBLIC | ChannelType.PRIVATE>(
    ChannelType.PUBLIC
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slugifiedName = channelSlug(name);
  const isValidName = slugifiedName.length > 0 && slugifiedName.length <= 80;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isValidName || isSubmitting) return;

      setIsSubmitting(true);
      setError(null);

      try {
        const channel = await createChannel(workspaceId, {
          name: slugifiedName,
          description: description.trim() || undefined,
          type,
        });

        // Reset form
        setName('');
        setDescription('');
        setType(ChannelType.PUBLIC);
        onClose();

        // Navigate to the new channel
        router.push(`/${workspaceSlug}/channel/${channel.id}`);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to create channel'
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isValidName,
      isSubmitting,
      workspaceId,
      slugifiedName,
      description,
      type,
      onClose,
      router,
      workspaceSlug,
    ]
  );

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setName('');
    setDescription('');
    setType(ChannelType.PUBLIC);
    setError(null);
    onClose();
  }, [isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Create a channel</h2>
          <button
            onClick={handleClose}
            className="rounded p-1 hover:bg-accent"
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4">
          <p className="mb-4 text-sm text-muted-foreground">
            Channels are where your team communicates. They&apos;re best when
            organized around a topic — #marketing, #engineering, etc.
          </p>

          {/* Channel name */}
          <div className="mb-4">
            <label
              htmlFor="channel-name"
              className="mb-1.5 block text-sm font-medium"
            >
              Name
            </label>
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
              <span className="text-muted-foreground">
                {type === ChannelType.PRIVATE ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Hash className="h-4 w-4" />
                )}
              </span>
              <input
                id="channel-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. plan-budget"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                maxLength={80}
                autoComplete="off"
                autoFocus
              />
            </div>
            {name && (
              <p className="mt-1 text-xs text-muted-foreground">
                Channel will be created as:{' '}
                <span className="font-mono font-medium">
                  #{slugifiedName || '...'}
                </span>
              </p>
            )}
          </div>

          {/* Description */}
          <div className="mb-4">
            <label
              htmlFor="channel-description"
              className="mb-1.5 block text-sm font-medium"
            >
              Description{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <textarea
              id="channel-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              rows={3}
              maxLength={250}
            />
          </div>

          {/* Visibility toggle */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium">
              Visibility
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType(ChannelType.PUBLIC)}
                className={cn(
                  'flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  type === ChannelType.PUBLIC
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                )}
              >
                <Hash className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">Public</div>
                  <div className="text-xs opacity-70">
                    Anyone in the workspace can find and join
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType(ChannelType.PRIVATE)}
                className={cn(
                  'flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  type === ChannelType.PRIVATE
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                )}
              >
                <Lock className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">Private</div>
                  <div className="text-xs opacity-70">
                    Only invited members can access
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValidName || isSubmitting}
              className={cn(
                'flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground',
                'hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
