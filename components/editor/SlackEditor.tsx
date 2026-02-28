'use client'

import { useMemo, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { codeBlockLowlight } from './extensions/code-block'
import { emojiExtension } from './extensions/emoji'
import { createUserMention, createChannelMention } from './extensions/mention'
import { createSlashCommand } from './extensions/slash-command'
import EditorToolbar from './EditorToolbar'
import type { TiptapJSON } from '@/shared/types'
import { cn } from '@/shared/lib/utils'

// highlight.js theme for code blocks
import 'highlight.js/styles/github-dark.css'

interface SlackEditorProps {
  onSubmit: (content: TiptapJSON, plainText: string) => void
  placeholder?: string
  initialContent?: TiptapJSON
  disabled?: boolean
  workspaceId: string
  onFileUpload?: (files: File[]) => void
  /** Called with (contentJson, contentPlain) for schedule button */
  onScheduleClick?: (contentJson: TiptapJSON, contentPlain: string) => void
  /** Called when GIF button is clicked */
  onGifClick?: () => void
  /** Extra toolbar elements rendered on the right side */
  extraToolbarButtons?: React.ReactNode
}

/**
 * Main Tiptap v3 rich-text editor component styled to resemble Slack's message input.
 *
 * Features:
 * - StarterKit formatting: bold, italic, strike, code, blockquote, lists, headings 1-3
 * - CodeBlockLowlight for syntax-highlighted code blocks
 * - @user mention autocomplete (fetches workspace members)
 * - #channel mention autocomplete (fetches workspace channels)
 * - :emoji: shortcode autocomplete
 * - /slash command menu
 * - Enter to submit, Shift+Enter for newline
 * - Drag-and-drop file support
 * - Formatting toolbar with emoji picker
 *
 * Props:
 * - onSubmit: Called with TiptapJSON and plain text when user submits
 * - placeholder: Placeholder text shown when editor is empty
 * - initialContent: Optional initial TiptapJSON document
 * - disabled: Whether the editor is read-only
 * - workspaceId: Current workspace ID for fetching members and channels
 * - onFileUpload: Callback when files are dropped onto the editor
 */
export default function SlackEditor({
  onSubmit,
  placeholder = 'Type a message...',
  initialContent,
  disabled = false,
  workspaceId,
  onFileUpload,
  onScheduleClick,
  onGifClick,
  extraToolbarButtons,
}: SlackEditorProps) {
  // Use ref so the submit handler always has the latest callback
  // without requiring extension recreation
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit

  const onFileUploadRef = useRef(onFileUpload)
  onFileUploadRef.current = onFileUpload

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false, // Replaced by CodeBlockLowlight
        heading: { levels: [1, 2, 3] },
        link: false, // Added separately below for custom config
        // Keep: bold, italic, strike, code, blockquote, bulletList, orderedList
      }),

      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),

      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),

      codeBlockLowlight,
      emojiExtension,
      createUserMention(workspaceId),
      createChannelMention(workspaceId),
      createSlashCommand(),

      // Submit on Enter — must be LAST so suggestion plugins handle Enter first.
      // When a suggestion popup (mention, channel, slash, emoji) is active,
      // its ProseMirror plugin handles Enter before this one runs.
      // When no popup is active, this plugin catches Enter to submit.
      Extension.create({
        name: 'submitOnEnter',

        addProseMirrorPlugins() {
          const thisEditor = this.editor
          return [
            new Plugin({
              key: new PluginKey('submitOnEnter'),
              props: {
                handleKeyDown(_view, event) {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.altKey &&
                    !event.ctrlKey &&
                    !event.metaKey
                  ) {
                    const text = thisEditor.getText()
                    if (!text.trim()) {
                      // Don't submit empty messages, but consume the event
                      // to prevent creating a new paragraph
                      return true
                    }
                    const json = thisEditor.getJSON() as TiptapJSON
                    onSubmitRef.current(json, text)
                    thisEditor.commands.clearContent()
                    return true
                  }
                  return false
                },
              },
            }),
          ]
        },
      }),
    ],
    [workspaceId, placeholder]
  )

  const editor = useEditor({
    extensions,
    content: initialContent || undefined,
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          'slack-editor-content prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[60px] max-h-[280px] overflow-y-auto px-3 py-2',
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files
        if (files?.length && onFileUploadRef.current) {
          event.preventDefault()
          onFileUploadRef.current(Array.from(files))
          return true
        }
        return false
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files
        if (files?.length && onFileUploadRef.current) {
          onFileUploadRef.current(Array.from(files))
          return true
        }
        return false
      },
    },
    immediatelyRender: false,
  })

  const handleAttachmentClick = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = () => {
      if (input.files?.length && onFileUploadRef.current) {
        onFileUploadRef.current(Array.from(input.files))
      }
    }
    input.click()
  }, [])

  /** Triggered by the SendButton in the toolbar — mimics pressing Enter */
  const handleSendClick = useCallback(() => {
    if (!editor) return
    const text = editor.getText()
    if (!text.trim()) return
    const json = editor.getJSON() as TiptapJSON
    onSubmitRef.current(json, text)
    editor.commands.clearContent()
  }, [editor])

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-background shadow-sm transition-shadow',
        'focus-within:border-primary/50 focus-within:shadow-md',
        'hover:border-border/80',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Editor content area */}
      <EditorContent editor={editor} />

      {/* Formatting toolbar */}
      <EditorToolbar
        editor={editor}
        onAttachmentClick={onFileUpload ? handleAttachmentClick : undefined}
        onScheduleClick={onScheduleClick}
        onGifClick={onGifClick}
        extraRightButtons={extraToolbarButtons}
        onSend={handleSendClick}
      />

      {/* Editor-specific styles */}
      <style jsx global>{`
        /* Placeholder text */
        .slack-editor-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          height: 0;
        }

        /* Mention chips */
        .slack-editor-content .mention {
          background-color: hsl(var(--primary) / 0.1);
          color: hsl(var(--primary));
          border-radius: 4px;
          padding: 1px 4px;
          font-weight: 500;
          white-space: nowrap;
        }

        .slack-editor-content .user-mention {
          background-color: hsl(217 91% 60% / 0.15);
          color: hsl(217 91% 60%);
        }

        .slack-editor-content .channel-mention {
          background-color: hsl(217 91% 60% / 0.15);
          color: hsl(217 91% 60%);
        }

        /* Code block styling */
        .slack-editor-content pre {
          background: hsl(var(--muted));
          border-radius: 6px;
          padding: 12px 16px;
          overflow-x: auto;
          font-size: 13px;
          line-height: 1.5;
        }

        .slack-editor-content pre code {
          background: none;
          padding: 0;
          font-size: inherit;
          color: inherit;
        }

        /* Inline code */
        .slack-editor-content code {
          background: hsl(var(--muted));
          border-radius: 3px;
          padding: 1px 4px;
          font-size: 0.875em;
        }

        /* Blockquote */
        .slack-editor-content blockquote {
          border-left: 3px solid hsl(var(--border));
          padding-left: 12px;
          margin-left: 0;
          color: hsl(var(--muted-foreground));
        }

        /* Lists */
        .slack-editor-content ul,
        .slack-editor-content ol {
          padding-left: 24px;
        }

        /* Paragraphs */
        .slack-editor-content p {
          margin: 0;
        }

        .slack-editor-content p + p {
          margin-top: 4px;
        }

        /* Headings */
        .slack-editor-content h1 {
          font-size: 1.5em;
          font-weight: 700;
          margin: 4px 0;
        }

        .slack-editor-content h2 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 4px 0;
        }

        .slack-editor-content h3 {
          font-size: 1.1em;
          font-weight: 600;
          margin: 4px 0;
        }

        /* ProseMirror focus */
        .slack-editor-content .ProseMirror {
          outline: none;
        }

        /* Remove default prose margins for chat context */
        .slack-editor-content .ProseMirror > * + * {
          margin-top: 4px;
        }
      `}</style>
    </div>
  )
}
