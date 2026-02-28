'use client';

/**
 * canvas/components/CanvasVersionHistory.tsx
 *
 * Right sidebar panel listing version snapshots of the canvas.
 * Shows timestamp, author, content preview, and a Restore button.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { History, RotateCcw, X, AlertTriangle, User } from 'lucide-react';
import { staggerContainer, staggerItem } from '@/shared/lib/animations';
import { getCanvasVersions, restoreCanvasVersion, type CanvasVersionData } from '../actions';
import { cn } from '@/shared/lib/utils';

interface CanvasVersionHistoryProps {
  canvasId: string;
  onClose: () => void;
  onRestore?: () => void;
}

interface RestoreDialogProps {
  version: CanvasVersionData;
  onConfirm: () => void;
  onCancel: () => void;
}

function RestoreDialog({ version, onConfirm, onCancel }: RestoreDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-background border rounded-lg p-6 max-w-sm mx-4 shadow-xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold">Restore Version?</h3>
            <p className="text-sm text-muted-foreground">This will replace the current canvas.</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-5">
          Restoring to the version by{' '}
          <span className="font-medium text-foreground">{version.userName}</span>{' '}
          from{' '}
          <span className="font-medium text-foreground">
            {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
          </span>
          . The current canvas state will be replaced.
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Restore
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function CanvasVersionHistory({ canvasId, onClose, onRestore }: CanvasVersionHistoryProps) {
  const [versions, setVersions] = useState<CanvasVersionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<CanvasVersionData | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    getCanvasVersions(canvasId)
      .then((data) => {
        setVersions(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('[CanvasVersionHistory] Failed to load versions:', err);
        setIsLoading(false);
      });
  }, [canvasId]);

  const handleRestore = async () => {
    if (!restoreTarget || isRestoring) return;
    setIsRestoring(true);
    try {
      await restoreCanvasVersion(canvasId, restoreTarget.id);
      setRestoreTarget(null);
      onRestore?.();
      // Reload versions
      const updated = await getCanvasVersions(canvasId);
      setVersions(updated);
    } catch (err) {
      console.error('[CanvasVersionHistory] Restore failed:', err);
    } finally {
      setIsRestoring(false);
    }
  };

  // Extract a text preview from the stored JSON content
  const getContentPreview = (content: string): string => {
    try {
      const parsed = JSON.parse(content);
      // Try to extract text from Tiptap JSON
      type TiptapNode = { type: string; text?: string; content?: TiptapNode[] };
      const extractText = (node: TiptapNode): string => {
        if (node.text) return node.text;
        if (node.content && Array.isArray(node.content)) {
          return node.content.map(extractText).join(' ');
        }
        return '';
      };
      const text = extractText(parsed);
      if (text.trim()) return text.trim().slice(0, 100) + (text.length > 100 ? '...' : '');
    } catch {
      // Content might be base64 Yjs state
      return 'Yjs document state';
    }
    return 'Empty canvas';
  };

  return (
    <>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-72 border-l bg-background flex flex-col h-full"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Version History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Version list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-4">
              <History className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No versions yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Versions are saved automatically every 5 minutes.
              </p>
            </div>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="p-2 space-y-1"
            >
              {versions.map((version, index) => (
                <motion.div
                  key={version.id}
                  variants={staggerItem}
                  className={cn(
                    'p-3 rounded-lg border hover:border-primary/50 transition-colors group',
                    index === 0 && 'border-primary/30 bg-primary/5'
                  )}
                >
                  {/* Version metadata */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                      {version.userImage ? (
                        <img
                          src={version.userImage}
                          alt={version.userName}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <User className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{version.userName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                      </p>
                      {index === 0 && (
                        <span className="text-[10px] font-medium text-primary">Current</span>
                      )}
                    </div>
                  </div>

                  {/* Content preview */}
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {getContentPreview(version.content)}
                  </p>

                  {/* Restore button */}
                  {index > 0 && (
                    <button
                      onClick={() => setRestoreTarget(version)}
                      className={cn(
                        'flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded',
                        'opacity-0 group-hover:opacity-100 transition-opacity',
                        'text-primary hover:bg-primary/10'
                      )}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Restore confirmation dialog */}
      <AnimatePresence>
        {restoreTarget && (
          <RestoreDialog
            version={restoreTarget}
            onConfirm={handleRestore}
            onCancel={() => setRestoreTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
