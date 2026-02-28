'use client';

/**
 * custom-emojis/components/CustomEmojiCreator.tsx
 *
 * Form component for uploading a new custom emoji.
 * Accepts an image file (image/*, max 256 KB) and a shortcode name.
 * POSTs to POST /api/custom-emojis with multipart/form-data.
 *
 * Fields submitted:
 *   name        — shortcode (alphanumeric + underscores, 2-32 chars)
 *   workspaceId — target workspace
 *   image       — the image File
 */

import { useState, useRef, useCallback } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreatedEmoji {
  id: string;
  name: string;
  imageUrl: string;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface CustomEmojiCreatorProps {
  /** Workspace the emoji should belong to */
  workspaceId: string;
  /** Called with the created emoji after a successful upload */
  onCreated?: (emoji: CreatedEmoji) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SIZE_BYTES = 256 * 1024; // 256 KB
const NAME_REGEX = /^[a-zA-Z0-9_]+$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateName(value: string): string {
  if (value.length < 2) return 'Name must be at least 2 characters';
  if (value.length > 32) return 'Name must be at most 32 characters';
  if (!NAME_REGEX.test(value)) return 'Only letters, numbers, and underscores allowed';
  return '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomEmojiCreator({ workspaceId, onCreated }: CustomEmojiCreatorProps) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [nameError, setNameError] = useState('');
  const [fileError, setFileError] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    setNameError(val ? validateName(val) : '');
  };

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;

      if (!f.type.startsWith('image/')) {
        setFileError('Only image files are allowed');
        return;
      }
      if (f.size > MAX_SIZE_BYTES) {
        setFileError(`Image must be smaller than 256 KB (got ${Math.round(f.size / 1024)} KB)`);
        return;
      }

      setFileError('');
      setFile(f);

      // Revoke the old object URL before creating a new one
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(f));

      // Auto-suggest a shortcode from the filename
      const suggested = f.name
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 32);
      if (!name) {
        setName(suggested);
        setNameError(validateName(suggested));
      }
    },
    [previewUrl, name]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nameErr = validateName(name);
    if (nameErr) {
      setNameError(nameErr);
      return;
    }
    if (!file) {
      setFileError('Please select an image');
      return;
    }

    setStatus('uploading');
    setFileError('');

    const formData = new FormData();
    formData.append('name', name);
    formData.append('workspaceId', workspaceId);
    formData.append('image', file);

    try {
      const res = await fetch('/api/custom-emojis', {
        method: 'POST',
        body: formData,
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error ?? 'Upload failed');
      }

      setStatus('success');
      onCreated?.(body.data);

      // Reset the form after 2 s
      setTimeout(() => {
        setStatus('idle');
        setName('');
        setFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        if (fileRef.current) fileRef.current.value = '';
      }, 2000);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Upload failed');
      setStatus('idle');
    }
  };

  // -------------------------------------------------------------------------
  // Success state
  // -------------------------------------------------------------------------

  if (status === 'success') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-50 p-4 dark:bg-green-900/10">
        <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-500" />
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          :{name}: created successfully!
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Idle / uploading state
  // -------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Image upload zone */}
      <div>
        <div
          role="button"
          tabIndex={0}
          aria-label="Click to select emoji image"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
            'hover:border-primary/50 hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary',
            previewUrl ? 'border-primary/40 bg-muted/20' : 'border-border'
          )}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Emoji preview"
              className="h-16 w-16 object-contain"
            />
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">
                Click to select an image
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                PNG, GIF, JPEG · Max 256 KB
              </p>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
        />

        {fileError && (
          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {fileError}
          </div>
        )}
      </div>

      {/* Shortcode name field */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          Emoji name{' '}
          <span className="font-normal text-muted-foreground">(used as :name:)</span>
        </label>
        <div className="flex items-stretch">
          <span className="flex items-center rounded-l-md border border-r-0 bg-muted px-2.5 text-sm text-muted-foreground">
            :
          </span>
          <input
            type="text"
            value={name}
            onChange={handleNameChange}
            placeholder="my_emoji"
            maxLength={32}
            className={cn(
              'min-w-0 flex-1 rounded-none border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1',
              nameError
                ? 'border-destructive focus:ring-destructive'
                : 'focus:ring-primary'
            )}
          />
          <span className="flex items-center rounded-r-md border border-l-0 bg-muted px-2.5 text-sm text-muted-foreground">
            :
          </span>
        </div>
        {nameError && <p className="text-xs text-destructive">{nameError}</p>}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={status === 'uploading' || !!nameError || !name || !file}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium',
          'bg-primary text-primary-foreground transition-colors hover:bg-primary/90',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {status === 'uploading' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </>
        ) : (
          'Create Emoji'
        )}
      </button>
    </form>
  );
}
