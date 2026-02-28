'use client'

import { useCallback, useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { cn } from '@/shared/lib/utils'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  CodeSquare,
  Link2,
  List,
  ListOrdered,
  Quote,
  Paperclip,
} from 'lucide-react'
import EmojiPickerButton from './EmojiPickerButton'
import { SendButton } from '@/components/ui/SendButton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { TiptapJSON } from '@/shared/types'

interface EditorToolbarProps {
  editor: Editor | null
  onAttachmentClick?: () => void
  /** Called with (contentJson, contentPlain) when schedule button is clicked */
  onScheduleClick?: (contentJson: TiptapJSON, contentPlain: string) => void
  /** Called when GIF button is clicked */
  onGifClick?: () => void
  /** Called when mic button is clicked (AudioRecorder rendered externally) */
  onMicClick?: () => void
  /** Whether mic is actively recording */
  isRecording?: boolean
  /** Extra toolbar items rendered on the right side */
  extraRightButtons?: React.ReactNode
  /** Called when the send button is clicked (paper-plane animation) */
  onSend?: () => void
}

interface ToolbarButton {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  action: (editor: Editor) => void
  isActive: (editor: Editor) => boolean
}

const FORMAT_BUTTONS: ToolbarButton[] = [
  {
    icon: Bold,
    label: 'Bold',
    shortcut: 'Ctrl+B',
    action: (editor) => {
      editor.chain().focus().toggleBold().run()
    },
    isActive: (editor) => editor.isActive('bold'),
  },
  {
    icon: Italic,
    label: 'Italic',
    shortcut: 'Ctrl+I',
    action: (editor) => {
      editor.chain().focus().toggleItalic().run()
    },
    isActive: (editor) => editor.isActive('italic'),
  },
  {
    icon: Strikethrough,
    label: 'Strikethrough',
    action: (editor) => {
      editor.chain().focus().toggleStrike().run()
    },
    isActive: (editor) => editor.isActive('strike'),
  },
  {
    icon: Code,
    label: 'Inline code',
    action: (editor) => {
      editor.chain().focus().toggleCode().run()
    },
    isActive: (editor) => editor.isActive('code'),
  },
  {
    icon: CodeSquare,
    label: 'Code block',
    action: (editor) => {
      editor.chain().focus().toggleCodeBlock().run()
    },
    isActive: (editor) => editor.isActive('codeBlock'),
  },
  {
    icon: ListOrdered,
    label: 'Ordered list',
    action: (editor) => {
      editor.chain().focus().toggleOrderedList().run()
    },
    isActive: (editor) => editor.isActive('orderedList'),
  },
  {
    icon: List,
    label: 'Bullet list',
    action: (editor) => {
      editor.chain().focus().toggleBulletList().run()
    },
    isActive: (editor) => editor.isActive('bulletList'),
  },
  {
    icon: Quote,
    label: 'Blockquote',
    action: (editor) => {
      editor.chain().focus().toggleBlockquote().run()
    },
    isActive: (editor) => editor.isActive('blockquote'),
  },
]

/**
 * Formatting toolbar rendered below the Tiptap editor.
 * Shows toggle buttons for text formatting, code, lists, and blockquotes.
 * Each button shows active state when the format is applied at the cursor position.
 * Includes emoji picker and attachment buttons on the right side.
 */
export default function EditorToolbar({
  editor,
  onAttachmentClick,
  onScheduleClick,
  onGifClick,
  extraRightButtons,
  onSend,
}: EditorToolbarProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const linkInputRef = useRef<HTMLInputElement>(null)

  const handleButtonClick = useCallback(
    (button: ToolbarButton) => {
      if (!editor) return
      button.action(editor)
    },
    [editor]
  )

  const handleLinkButtonClick = useCallback(() => {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
    } else {
      // Pre-fill with existing href if selection already has a link
      const attrs = editor.getAttributes('link')
      setLinkUrl((attrs.href as string) ?? '')
      setLinkDialogOpen(true)
    }
  }, [editor])

  const handleLinkSubmit = useCallback(() => {
    if (!editor) return
    const trimmed = linkUrl.trim()
    if (trimmed) {
      editor.chain().focus().setLink({ href: trimmed }).run()
    }
    setLinkDialogOpen(false)
    setLinkUrl('')
  }, [editor, linkUrl])

  // Focus the input when the dialog opens
  useEffect(() => {
    if (linkDialogOpen) {
      setTimeout(() => linkInputRef.current?.focus(), 50)
    }
  }, [linkDialogOpen])

  const handleScheduleClick = useCallback(() => {
    if (!editor || !onScheduleClick) return
    const contentJson = editor.getJSON() as TiptapJSON
    const contentPlain = editor.getText()
    onScheduleClick(contentJson, contentPlain)
  }, [editor, onScheduleClick])

  if (!editor) return null

  return (
    <>
    <div className="flex items-center gap-0.5 border-t border-border/50 px-2 py-1">
      {FORMAT_BUTTONS.map((button) => {
        const Icon = button.icon
        const active = editor ? button.isActive(editor) : false

        return (
          <button
            key={button.label}
            type="button"
            onClick={() => handleButtonClick(button)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded transition-colors',
              'hover:bg-accent',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground'
            )}
            title={
              button.shortcut
                ? `${button.label} (${button.shortcut})`
                : button.label
            }
            aria-label={button.label}
            aria-pressed={active}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}

      {/* Link button — handled separately because it opens a dialog */}
      <button
        type="button"
        onClick={handleLinkButtonClick}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded transition-colors',
          'hover:bg-accent',
          editor?.isActive('link')
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground'
        )}
        title="Link"
        aria-label="Link"
        aria-pressed={editor?.isActive('link') ?? false}
      >
        <Link2 className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-border/50" />

      <div className="ml-auto flex items-center gap-0.5">
        {onAttachmentClick && (
          <button
            type="button"
            onClick={onAttachmentClick}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent"
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        )}

        {onGifClick && (
          <button
            type="button"
            onClick={onGifClick}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent"
            title="GIF"
            aria-label="Search GIFs"
          >
            <span className="text-[10px] font-bold leading-none">GIF</span>
          </button>
        )}

        {onScheduleClick && (
          <button
            type="button"
            onClick={handleScheduleClick}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent"
            title="Schedule message"
            aria-label="Schedule message"
            disabled={!editor.getText().trim()}
          >
            {/* Clock icon inline SVG */}
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        )}

        {/* Extra right-side slots (e.g., audio recorder) */}
        {extraRightButtons}

        <EmojiPickerButton editor={editor} />

        {/* Send button with paper-plane animation */}
        {onSend && (
          <SendButton
            onSend={onSend}
            disabled={!editor.getText().trim()}
          />
        )}
      </div>
    </div>

    {/* Link URL dialog */}
    <Dialog open={linkDialogOpen} onOpenChange={(open) => { setLinkDialogOpen(open); if (!open) setLinkUrl(''); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Insert link</DialogTitle>
        </DialogHeader>
        <input
          ref={linkInputRef}
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLinkSubmit(); } }}
          placeholder="https://example.com"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            onClick={() => { setLinkDialogOpen(false); setLinkUrl(''); }}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLinkSubmit}
            disabled={!linkUrl.trim()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            Insert
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
