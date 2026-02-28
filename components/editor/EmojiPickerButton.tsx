'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Smile } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { Editor } from '@tiptap/react'
import { CustomEmojiPicker } from '@/custom-emojis/components/CustomEmojiPicker'

interface EmojiPickerButtonProps {
  editor: Editor | null
  /** When provided, workspace custom emoji are shown above the standard picker */
  workspaceId?: string
}

/**
 * Emoji picker button for the editor toolbar.
 * Opens an emoji-mart Picker popover above the button.
 * On emoji selection, inserts the native emoji character at the cursor.
 * When workspaceId is provided, a custom emoji section is shown above
 * the standard emoji-mart picker.
 */
export default function EmojiPickerButton({ editor, workspaceId }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false)
  const [PickerComponent, setPickerComponent] = useState<any>(null)
  const [emojiData, setEmojiData] = useState<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Lazy-load emoji-mart components on first open
  useEffect(() => {
    if (!open || PickerComponent) return

    let cancelled = false

    Promise.all([
      import('@emoji-mart/react'),
      import('@emoji-mart/data'),
    ]).then(([pickerModule, dataModule]) => {
      if (cancelled) return
      setPickerComponent(() => pickerModule.default)
      setEmojiData(dataModule.default)
    })

    return () => {
      cancelled = true
    }
  }, [open, PickerComponent])

  // Close on outside click
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }

    // Delay to avoid the click that opened the picker from immediately closing it
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeout)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const handleSelect = useCallback(
    (emoji: any) => {
      if (!editor) return
      const native = emoji.native || emoji.shortcodes || emoji.id
      if (native) {
        editor.chain().focus().insertContent(native).run()
      }
      setOpen(false)
    },
    [editor]
  )

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded hover:bg-accent transition-colors',
          open && 'bg-accent'
        )}
        title="Insert emoji"
        aria-label="Insert emoji"
      >
        <Smile className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 z-50 rounded-lg border bg-popover shadow-lg overflow-hidden"
          style={{ width: '352px' }}
        >
          {workspaceId && (
            <CustomEmojiPicker
              workspaceId={workspaceId}
              onSelect={(code) => {
                if (editor) {
                  editor.chain().focus().insertContent(code).run()
                }
                setOpen(false)
              }}
            />
          )}
          {PickerComponent && emojiData ? (
            <PickerComponent
              data={emojiData}
              onEmojiSelect={handleSelect}
              theme="auto"
              previewPosition="none"
              skinTonePosition="none"
              maxFrequentRows={2}
              perLine={9}
            />
          ) : (
            <div className="flex h-[350px] w-full items-center justify-center">
              <div className="text-sm text-muted-foreground">Loading...</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
