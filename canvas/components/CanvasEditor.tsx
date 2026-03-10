'use client';

/**
 * canvas/components/CanvasEditor.tsx
 *
 * Full-page Tiptap editor bound to Yjs via y-prosemirror.
 * Supports real-time collaboration with colored cursors.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import Link from '@tiptap/extension-link';
import { ySyncPlugin } from 'y-prosemirror';
import { createLowlight, common } from 'lowlight';

const lowlight = createLowlight(common);
import { motion } from 'framer-motion';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Minus, Link as LinkIcon, Heading1, Heading2, Heading3, Undo, Redo
} from 'lucide-react';
import { useYjsSync } from '../hooks/useYjsSync';
import { getCanvas } from '../actions';
import { cn } from '@/shared/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface CanvasEditorProps {
  channelId: string;
  currentUserId: string;
  currentUserName: string;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-1.5 rounded transition-colors text-sm',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Creates a Tiptap extension that injects the Yjs ySyncPlugin.
 * Must be called after the Y.XmlFragment is ready.
 */
function createYjsExtension(fragment: Y.XmlFragment): Extension {
  return Extension.create({
    name: 'yjs-sync',
    addProseMirrorPlugins() {
      return [ySyncPlugin(fragment)];
    },
  });
}

export function CanvasEditor({ channelId, currentUserId, currentUserName }: CanvasEditorProps) {
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { yDoc, awareness } = useYjsSync(canvasId, channelId, currentUserId, currentUserName);
  const [yjsFragment, setYjsFragment] = useState<Y.XmlFragment | null>(null);

  // Link dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  // Keep a ref to the editor so the dialog submit handler can access it
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);

  // Load canvas on mount
  useEffect(() => {
    getCanvas(channelId)
      .then((canvas) => {
        setCanvasId(canvas.id);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('[CanvasEditor] Failed to load canvas:', err);
        setIsLoading(false);
      });
  }, [channelId]);

  // Get the XML fragment from the Y.Doc for Tiptap binding
  useEffect(() => {
    setYjsFragment(yDoc.getXmlFragment('prosemirror'));
  }, [yDoc]);

  /** Open the link dialog pre-filled with the current href (if any). */
  const setLink = useCallback((editor: ReturnType<typeof useEditor>) => {
    if (!editor) return;
    editorRef.current = editor;
    const previousUrl = editor.getAttributes('link').href ?? '';
    setLinkUrl(previousUrl);
    setLinkDialogOpen(true);
  }, []);

  /** Apply or remove the link when the dialog is confirmed. */
  const handleLinkSubmit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setLinkDialogOpen(false);
    if (linkUrl.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run();
    }
  }, [linkUrl]);

  /** Cancel the link dialog without making any changes. */
  const handleLinkCancel = useCallback(() => {
    setLinkDialogOpen(false);
    setLinkUrl('');
    editorRef.current = null;
  }, []);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          codeBlock: false, // Use CodeBlockLowlight
          heading: { levels: [1, 2, 3] as [1, 2, 3] },
          horizontalRule: {},
        }),
        Placeholder.configure({
          placeholder: 'Start writing… Collaborate with your team in real-time.',
        }),
        CodeBlockLowlight.configure({ lowlight }),
        Link.configure({
          openOnClick: true,
          HTMLAttributes: { class: 'text-primary underline cursor-pointer' },
        }),
        // Inject Yjs sync when fragment is ready
        ...(yjsFragment ? [createYjsExtension(yjsFragment)] : []),
      ],
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[400px] px-6 py-4',
        },
      },
    },
    [yjsFragment]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
    {/* Link URL dialog — replaces window.prompt */}
    <Dialog open={linkDialogOpen} onOpenChange={(open) => { if (!open) handleLinkCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Insert Link</DialogTitle>
          <DialogDescription>
            Enter a URL to link to. Leave blank to remove the existing link.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          type="url"
          placeholder="https://example.com"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleLinkSubmit();
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={handleLinkCancel}>
            Cancel
          </Button>
          <Button onClick={handleLinkSubmit}>
            {linkUrl.trim() === '' ? 'Remove Link' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full bg-background"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-4 py-2 border-b flex-wrap">
        {/* History */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
          title="Redo"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor?.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor?.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor?.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Inline marks */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold')}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic')}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          active={editor?.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleCode().run()}
          active={editor?.isActive('code')}
          title="Inline Code"
        >
          <Code className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor && setLink(editor)}
          active={editor?.isActive('link')}
          title="Link"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive('bulletList')}
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive('orderedList')}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>

        {/* Divider */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          <Minus className="w-4 h-4" />
        </ToolbarButton>

        {/* Collaboration status */}
        <div className="ml-auto flex items-center gap-1">
          {awareness.size > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <div className="flex -space-x-1">
                {Array.from(awareness.values())
                  .filter((s) => s.user)
                  .slice(0, 5)
                  .map((s, i) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium text-white border border-background"
                      style={{ backgroundColor: s.user?.color ?? '#6366f1' }}
                      title={s.user?.name}
                    >
                      {s.user?.name?.charAt(0).toUpperCase()}
                    </div>
                  ))}
              </div>
              <span>{awareness.size} editing</span>
            </div>
          )}
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t text-xs text-muted-foreground">
        <span>Canvas</span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Auto-saving
        </span>
      </div>
    </motion.div>
    </>
  );
}
