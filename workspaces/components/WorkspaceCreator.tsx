'use client';

/**
 * workspaces/components/WorkspaceCreator.tsx
 *
 * Modal dialog for creating a new workspace.
 * Features name input with auto-generated slug, optional icon URL, and description textarea.
 * Calls the createWorkspace server action and shows a toast on success or error.
 *
 * Usage:
 *   <WorkspaceCreator open={open} onOpenChange={setOpen} />
 */

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { slugify } from '@/shared/lib/utils';
import { createWorkspace } from '@/workspaces/actions';

interface WorkspaceCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceCreator({ open, onOpenChange }: WorkspaceCreatorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [iconUrl, setIconUrl] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  // Auto-generate slug from name unless manually edited
  useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(slugify(name));
    }
  }, [name, slugManuallyEdited]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName('');
      setSlug('');
      setSlugManuallyEdited(false);
      setIconUrl('');
      setDescription('');
      setError('');
    }
  }, [open]);

  function handleSlugChange(value: string) {
    setSlugManuallyEdited(true);
    setSlug(slugify(value));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Workspace name is required');
      return;
    }

    if (!slug) {
      setError('Workspace URL slug is required');
      return;
    }

    startTransition(async () => {
      try {
        const workspace = await createWorkspace(name.trim(), slug);
        toast.success(`Workspace "${workspace.name}" created!`);
        onOpenChange(false);
        router.push(`/${workspace.slug}`);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create workspace';
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>
            Workspaces are shared environments where teams communicate. Create one for your team or project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ws-name">Workspace name</Label>
            <Input
              id="ws-name"
              placeholder="e.g. Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ws-slug">URL slug</Label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">/</span>
              <Input
                id="ws-slug"
                placeholder="acme-corp"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                disabled={isPending}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This will be used in the workspace URL
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ws-icon">Icon URL (optional)</Label>
            <Input
              id="ws-icon"
              placeholder="https://example.com/icon.png"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ws-desc">Description (optional)</Label>
            <Textarea
              id="ws-desc"
              placeholder="What is this workspace for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? 'Creating...' : 'Create Workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
