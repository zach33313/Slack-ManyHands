'use client';

/**
 * workspaces/components/EmojiUploader.tsx
 *
 * Drag-drop zone for uploading custom emoji.
 * Accepts PNG/GIF/JPEG, max 128x128px, max 256KB.
 * Shortcode: alphanumeric + underscores.
 */

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Image, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';

interface EmojiUploaderProps {
  workspaceId: string;
  onSuccess: (emoji: { id: string; name: string; imageUrl: string }) => void;
  usedCount: number;
  maxCount?: number;
}

type UploadState = 'idle' | 'dragging' | 'preview' | 'uploading' | 'success' | 'error';

const ALLOWED_TYPES = ['image/png', 'image/gif', 'image/jpeg', 'image/jpg'];
const MAX_SIZE_BYTES = 256 * 1024; // 256KB
const MAX_DIMENSION = 128; // px
const SHORTCODE_REGEX = /^[a-z0-9_]+$/;

async function uploadCustomEmoji(
  workspaceId: string,
  name: string,
  file: File
): Promise<{ id: string; name: string; imageUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('workspaceId', workspaceId);
  formData.append('name', name);

  const response = await fetch('/api/custom-emojis', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(data.error ?? 'Upload failed');
  }

  return response.json();
}

export function EmojiUploader({ workspaceId, onSuccess, usedCount, maxCount = 100 }: EmojiUploaderProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shortcode, setShortcode] = useState('');
  const [shortcodeError, setShortcodeError] = useState('');
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const atLimit = usedCount >= maxCount;

  const validateFile = useCallback(
    (file: File): Promise<string | null> => {
      return new Promise((resolve) => {
        if (!ALLOWED_TYPES.includes(file.type)) {
          resolve('Only PNG, GIF, and JPEG files are allowed.');
          return;
        }
        if (file.size > MAX_SIZE_BYTES) {
          resolve(`File must be smaller than 256KB (got ${Math.round(file.size / 1024)}KB).`);
          return;
        }
        // Check image dimensions
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
            resolve(
              `Image must be at most 128×128px (got ${img.width}×${img.height}px).`
            );
          } else {
            resolve(null);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve('Could not load image.');
        };
        img.src = url;
      });
    },
    []
  );

  const handleFile = useCallback(
    async (file: File) => {
      setFileError('');
      const error = await validateFile(file);
      if (error) {
        setFileError(error);
        setState('idle');
        return;
      }
      const url = URL.createObjectURL(file);
      setSelectedFile(file);
      setPreviewUrl(url);
      // Suggest shortcode from filename
      const name = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
      setShortcode(name.slice(0, 32));
      setState('preview');
    },
    [validateFile]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setState('idle');
      const file = e.dataTransfer.files[0];
      if (file) await handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState('dragging');
  }, []);

  const handleDragLeave = useCallback(() => {
    setState((s) => (s === 'dragging' ? 'idle' : s));
  }, []);

  const handleInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) await handleFile(file);
    },
    [handleFile]
  );

  const validateShortcode = (code: string): string => {
    if (!code) return 'Shortcode is required.';
    if (code.length < 2) return 'Shortcode must be at least 2 characters.';
    if (code.length > 32) return 'Shortcode must be 32 characters or less.';
    if (!SHORTCODE_REGEX.test(code))
      return 'Only lowercase letters, numbers, and underscores are allowed.';
    return '';
  };

  const handleShortcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase();
    setShortcode(val);
    setShortcodeError(validateShortcode(val));
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    const scError = validateShortcode(shortcode);
    if (scError) {
      setShortcodeError(scError);
      return;
    }
    setState('uploading');
    try {
      const emoji = await uploadCustomEmoji(workspaceId, shortcode, selectedFile);
      setState('success');
      toast.success(`Custom emoji :${shortcode}: uploaded!`);
      onSuccess(emoji);
      // Reset after 1.5s
      setTimeout(() => {
        setState('idle');
        setSelectedFile(null);
        setPreviewUrl(null);
        setShortcode('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setFileError(msg);
      setState('preview');
      toast.error(msg);
    }
  };

  const handleCancel = () => {
    setState('idle');
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setShortcode('');
    setShortcodeError('');
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {usedCount}/{maxCount} emoji used
        </span>
        {atLimit && (
          <span className="text-destructive font-medium">Limit reached</span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {state === 'idle' || state === 'dragging' ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !atLimit && fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                state === 'dragging'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50',
                atLimit && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">
                {atLimit ? 'Emoji limit reached' : 'Drop emoji image here'}
              </p>
              {!atLimit && (
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, GIF, JPEG • Max 128×128px • Max 256KB
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ALLOWED_TYPES.join(',')}
                onChange={handleInputChange}
                disabled={atLimit}
              />
            </div>
            {fileError && (
              <div className="flex items-center gap-2 mt-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {fileError}
              </div>
            )}
          </motion.div>
        ) : state === 'preview' ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border rounded-lg p-4 space-y-4"
          >
            {/* Preview */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 border rounded-lg flex items-center justify-center bg-muted overflow-hidden flex-shrink-0">
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="w-14 h-14 object-contain" />
                ) : (
                  <Image className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{selectedFile?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedFile ? `${Math.round(selectedFile.size / 1024)}KB` : ''}
                </p>
              </div>
            </div>

            {/* Shortcode input */}
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Shortcode
                <span className="text-muted-foreground font-normal ml-1">(used as :shortcode:)</span>
              </label>
              <div className="flex items-center">
                <span className="text-muted-foreground px-2 py-1.5 border border-r-0 rounded-l-md bg-muted text-sm">:</span>
                <input
                  type="text"
                  value={shortcode}
                  onChange={handleShortcodeChange}
                  placeholder="my_emoji"
                  className={cn(
                    'flex-1 px-3 py-1.5 text-sm border rounded-r-md bg-background focus:outline-none focus:ring-1',
                    shortcodeError ? 'border-destructive focus:ring-destructive' : 'focus:ring-primary'
                  )}
                  maxLength={32}
                />
                <span className="text-muted-foreground px-2 py-1.5 border border-l-0 rounded-r-md bg-muted text-sm">:</span>
              </div>
              {shortcodeError && (
                <p className="text-xs text-destructive">{shortcodeError}</p>
              )}
              {fileError && (
                <p className="text-xs text-destructive">{fileError}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="flex-1 px-3 py-2 text-sm font-medium border rounded-md hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!!shortcodeError || !shortcode}
                className="flex-1 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Upload Emoji
              </button>
            </div>
          </motion.div>
        ) : state === 'uploading' ? (
          <motion.div
            key="uploading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border rounded-lg p-8 flex flex-col items-center gap-3"
          >
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Uploading :{shortcode}:…</p>
          </motion.div>
        ) : state === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="border border-green-500/30 bg-green-50 dark:bg-green-900/10 rounded-lg p-8 flex flex-col items-center gap-3"
          >
            <CheckCircle className="w-8 h-8 text-green-500" />
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              :{shortcode}: uploaded successfully!
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
