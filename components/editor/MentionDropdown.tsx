'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from 'react'
import { cn } from '@/shared/lib/utils'

export interface MentionItem {
  id: string
  label: string
  avatar?: string | null
  role?: string
}

interface MentionDropdownProps {
  items: MentionItem[]
  command: (item: MentionItem) => void
}

export interface MentionDropdownRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const MentionDropdown = forwardRef<MentionDropdownRef, MentionDropdownProps>(
  (props, ref) => {
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
          No users found
        </div>
      )
    }

    return (
      <div className="max-h-60 min-w-[220px] overflow-y-auto rounded-lg border bg-popover shadow-lg">
        {items.map((item, index) => (
          <button
            key={item.id}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
              index === selectedIndex && 'bg-accent'
            )}
            onClick={() => selectItem(index)}
            onMouseEnter={() => setSelectedIndex(index)}
            type="button"
          >
            {item.avatar ? (
              <img
                src={item.avatar}
                alt=""
                className="h-6 w-6 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-medium text-primary">
                {item.label.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="truncate font-medium text-foreground">
              {item.label}
            </span>
            {item.role && (
              <span className="ml-auto text-xs text-muted-foreground capitalize">
                {item.role.toLowerCase()}
              </span>
            )}
          </button>
        ))}
      </div>
    )
  }
)

MentionDropdown.displayName = 'MentionDropdown'

export default MentionDropdown
