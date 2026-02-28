'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from 'react'
import { cn } from '@/shared/lib/utils'
import { Hash } from 'lucide-react'

export interface ChannelItem {
  id: string
  label: string
  description?: string | null
}

interface ChannelMentionDropdownProps {
  items: ChannelItem[]
  command: (item: ChannelItem) => void
}

export interface ChannelMentionDropdownRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const ChannelMentionDropdown = forwardRef<
  ChannelMentionDropdownRef,
  ChannelMentionDropdownProps
>((props, ref) => {
  const { items, command } = props
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index]
      if (item) {
        command(item)
      }
    },
    [items, command]
  )

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (items.length === 0) return false

      if (event.key === 'ArrowUp') {
        setSelectedIndex(
          (prev) => (prev + items.length - 1) % items.length
        )
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex)
        return true
      }
      return false
    },
  }))

  useEffect(() => {
    setSelectedIndex(0)
  }, [items])

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-popover p-3 text-sm text-muted-foreground shadow-lg">
        No channels found
      </div>
    )
  }

  return (
    <div className="max-h-60 min-w-[220px] overflow-y-auto rounded-lg border bg-popover shadow-lg">
      {items.map((item, index) => (
        <button
          key={item.id}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
            index === selectedIndex && 'bg-accent'
          )}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
          type="button"
        >
          <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium text-foreground">
            {item.label}
          </span>
          {item.description && (
            <span className="ml-auto max-w-[120px] truncate text-xs text-muted-foreground">
              {item.description}
            </span>
          )}
        </button>
      ))}
    </div>
  )
})

ChannelMentionDropdown.displayName = 'ChannelMentionDropdown'

export default ChannelMentionDropdown
