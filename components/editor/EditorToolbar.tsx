'use client'

import { useCallback } from 'react'
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

interface EditorToolbarProps {
  editor: Editor | null
  onAttachmentClick?: () => void
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
    icon: Link2,
    label: 'Link',
    action: (editor) => {
      if (editor.isActive('link')) {
        editor.chain().focus().unsetLink().run()
      } else {
        const url = window.prompt('Enter URL:')
        if (url) {
          editor.chain().focus().setLink({ href: url }).run()
        }
      }
    },
    isActive: (editor) => editor.isActive('link'),
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
}: EditorToolbarProps) {
  const handleButtonClick = useCallback(
    (button: ToolbarButton) => {
      if (!editor) return
      button.action(editor)
    },
    [editor]
  )

  if (!editor) return null

  return (
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

        <EmojiPickerButton editor={editor} />
      </div>
    </div>
  )
}
