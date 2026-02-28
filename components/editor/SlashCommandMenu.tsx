'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from 'react'
import { cn } from '@/shared/lib/utils'

export interface SlashCommandItem {
  title: string
  description: string
  icon: string
  command: (props: { editor: any; range: any }) => void
}

interface SlashCommandMenuProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface SlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SlashCommandMenuProps>(
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
          No commands found
        </div>
      )
    }

    return (
      <div className="max-h-72 min-w-[260px] overflow-y-auto rounded-lg border bg-popover shadow-lg">
        <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Commands
        </div>
        {items.map((item, index) => (
          <button
            key={item.title}
            className={cn(
              'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
              index === selectedIndex && 'bg-accent'
            )}
            onClick={() => selectItem(index)}
            onMouseEnter={() => setSelectedIndex(index)}
            type="button"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-sm">
              {item.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">{item.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {item.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    )
  }
)

SlashCommandMenu.displayName = 'SlashCommandMenu'

export default SlashCommandMenu
