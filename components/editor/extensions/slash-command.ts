import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import {
  computePosition,
  autoUpdate,
  offset,
  flip,
  shift,
} from '@floating-ui/dom'
import SlashCommandMenu from '../SlashCommandMenu'
import type { SlashCommandMenuRef, SlashCommandItem } from '../SlashCommandMenu'

const slashCommandKey = new PluginKey('slash-command')

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: '/status',
    description: 'Usage: /status :emoji: your message',
    icon: '💬',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent('/status ').run()
    },
  },
  {
    title: '/away',
    description: 'Toggle away status on/off',
    icon: '🌙',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent('/away').run()
    },
  },
  {
    title: '/mute',
    description: 'Mute the current channel',
    icon: '🔇',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent('/mute').run()
    },
  },
  {
    title: '/invite',
    description: 'Usage: /invite user@example.com',
    icon: '👤',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent('/invite @')
        .run()
    },
  },
  {
    title: '/topic',
    description: 'Usage: /topic New topic here',
    icon: '📋',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent('/topic ').run()
    },
  },
  {
    title: '/remind',
    description: 'Set a reminder (coming soon)',
    icon: '⏰',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent('/remind ').run()
    },
  },
  {
    title: '/code',
    description: 'Insert a code block',
    icon: '💻',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: '/bold',
    description: 'Make selected text bold',
    icon: '𝐁',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBold().run()
    },
  },
  {
    title: '/italic',
    description: 'Make selected text italic',
    icon: '𝐼',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleItalic().run()
    },
  },
  {
    title: '/list',
    description: 'Create a bullet list',
    icon: '•',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: '/ordered',
    description: 'Create a numbered list',
    icon: '1.',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: '/quote',
    description: 'Insert a blockquote',
    icon: '❝',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
]

/**
 * Custom slash command extension built on @tiptap/suggestion.
 * Triggered by '/' at the start of a line or after whitespace.
 * Shows a command menu with available slash commands.
 */
export function createSlashCommand() {
  return Extension.create({
    name: 'slashCommand',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          pluginKey: slashCommandKey,
          startOfLine: false,
          allowSpaces: false,

          items: ({ query }: { query: string }): SlashCommandItem[] => {
            if (!query) return SLASH_COMMANDS.slice(0, 8)
            const q = query.toLowerCase()
            return SLASH_COMMANDS.filter(
              (cmd) =>
                cmd.title.toLowerCase().includes(q) ||
                cmd.description.toLowerCase().includes(q)
            ).slice(0, 8)
          },

          command: ({
            editor,
            range,
            props,
          }: {
            editor: any
            range: any
            props: SlashCommandItem
          }) => {
            props.command({ editor, range })
          },

          render: () => {
            let component: ReactRenderer | null = null
            let popup: HTMLElement | null = null
            let cleanupAutoUpdate: (() => void) | null = null

            return {
              onStart(props: any) {
                component = new ReactRenderer(SlashCommandMenu, {
                  props,
                  editor: props.editor,
                })

                popup = document.createElement('div')
                popup.style.position = 'absolute'
                popup.style.zIndex = '50'
                popup.appendChild(component.element)
                document.body.appendChild(popup)

                if (props.clientRect) {
                  const virtualEl = {
                    getBoundingClientRect: () => props.clientRect!(),
                  }
                  cleanupAutoUpdate = autoUpdate(
                    virtualEl as any,
                    popup,
                    () => {
                      if (!popup || !props.clientRect) return
                      computePosition(virtualEl as any, popup, {
                        placement: 'bottom-start',
                        middleware: [
                          offset(8),
                          flip(),
                          shift({ padding: 8 }),
                        ],
                      }).then(({ x, y }) => {
                        Object.assign(popup!.style, {
                          left: `${x}px`,
                          top: `${y}px`,
                        })
                      })
                    }
                  )
                }
              },

              onUpdate(props: any) {
                component?.updateProps(props)
              },

              onKeyDown(props: { event: KeyboardEvent }) {
                if (props.event.key === 'Escape') {
                  cleanupAutoUpdate?.()
                  popup?.remove()
                  component?.destroy()
                  popup = null
                  component = null
                  cleanupAutoUpdate = null
                  return true
                }
                return (
                  (component?.ref as SlashCommandMenuRef | null)?.onKeyDown(
                    props
                  ) ?? false
                )
              },

              onExit() {
                cleanupAutoUpdate?.()
                popup?.remove()
                component?.destroy()
                popup = null
                component = null
                cleanupAutoUpdate = null
              },
            }
          },
        },
      }
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ]
    },
  })
}
