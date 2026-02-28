import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import {
  computePosition,
  autoUpdate,
  offset,
  flip,
  shift,
} from '@floating-ui/dom'

/**
 * Emoji data — a curated list of common emojis with shortcodes.
 * Used for :shortcode: autocomplete in the editor.
 */
const EMOJI_LIST = [
  { name: 'smile', emoji: '😊', keywords: ['happy', 'face'] },
  { name: 'laughing', emoji: '😂', keywords: ['lol', 'tears'] },
  { name: 'heart', emoji: '❤️', keywords: ['love', 'red'] },
  { name: 'thumbsup', emoji: '👍', keywords: ['yes', 'ok', 'like', '+1'] },
  { name: 'thumbsdown', emoji: '👎', keywords: ['no', 'dislike', '-1'] },
  { name: 'fire', emoji: '🔥', keywords: ['hot', 'lit'] },
  { name: 'rocket', emoji: '🚀', keywords: ['launch', 'ship'] },
  { name: 'tada', emoji: '🎉', keywords: ['celebration', 'party'] },
  { name: 'thinking', emoji: '🤔', keywords: ['hmm', 'consider'] },
  { name: 'wave', emoji: '👋', keywords: ['hello', 'hi', 'bye'] },
  { name: 'clap', emoji: '👏', keywords: ['bravo', 'applause'] },
  { name: 'pray', emoji: '🙏', keywords: ['please', 'thanks'] },
  { name: 'eyes', emoji: '👀', keywords: ['look', 'see'] },
  { name: 'check', emoji: '✅', keywords: ['done', 'complete', 'yes'] },
  { name: 'x', emoji: '❌', keywords: ['no', 'wrong', 'cross'] },
  { name: 'warning', emoji: '⚠️', keywords: ['alert', 'caution'] },
  { name: 'bug', emoji: '🐛', keywords: ['issue', 'problem'] },
  { name: 'sparkles', emoji: '✨', keywords: ['new', 'magic'] },
  { name: 'zap', emoji: '⚡', keywords: ['fast', 'lightning'] },
  { name: 'star', emoji: '⭐', keywords: ['favorite'] },
  { name: 'muscle', emoji: '💪', keywords: ['strong', 'flex'] },
  { name: 'coffee', emoji: '☕', keywords: ['break', 'morning'] },
  { name: 'wink', emoji: '😉', keywords: ['flirty'] },
  { name: 'sob', emoji: '😭', keywords: ['cry', 'sad'] },
  { name: 'skull', emoji: '💀', keywords: ['dead', 'dying'] },
  { name: 'sunglasses', emoji: '😎', keywords: ['cool'] },
  { name: 'rolling_eyes', emoji: '🙄', keywords: ['whatever'] },
  { name: 'shrug', emoji: '🤷', keywords: ['dunno', 'idk'] },
  { name: 'salute', emoji: '🫡', keywords: ['yes', 'aye'] },
  { name: 'handshake', emoji: '🤝', keywords: ['deal', 'agree'] },
  { name: 'bulb', emoji: '💡', keywords: ['idea', 'light'] },
  { name: 'link', emoji: '🔗', keywords: ['url', 'chain'] },
  { name: 'pin', emoji: '📌', keywords: ['important'] },
  { name: 'memo', emoji: '📝', keywords: ['note', 'write'] },
  { name: 'calendar', emoji: '📅', keywords: ['date', 'schedule'] },
  { name: 'clock', emoji: '🕐', keywords: ['time'] },
  { name: 'bell', emoji: '🔔', keywords: ['notification', 'alert'] },
  { name: 'lock', emoji: '🔒', keywords: ['secure', 'private'] },
  { name: 'key', emoji: '🔑', keywords: ['password', 'access'] },
  { name: 'gear', emoji: '⚙️', keywords: ['settings', 'config'] },
  { name: 'wrench', emoji: '🔧', keywords: ['tool', 'fix'] },
  { name: 'hammer', emoji: '🔨', keywords: ['build', 'tool'] },
  { name: 'package', emoji: '📦', keywords: ['box', 'delivery'] },
  { name: 'truck', emoji: '🚚', keywords: ['shipping'] },
  { name: 'money', emoji: '💰', keywords: ['cash', 'dollar'] },
  { name: 'chart', emoji: '📈', keywords: ['graph', 'up', 'growth'] },
  { name: 'hundred', emoji: '💯', keywords: ['perfect', '100'] },
  { name: 'poop', emoji: '💩', keywords: ['crap'] },
  { name: 'ghost', emoji: '👻', keywords: ['boo', 'spooky'] },
  { name: 'robot', emoji: '🤖', keywords: ['bot', 'ai'] },
]

const emojiSuggestionKey = new PluginKey('emoji-suggestion')

/**
 * Custom emoji extension using @tiptap/suggestion.
 * Triggered by ':' character, shows matching emojis as the user types.
 * On selection, inserts the emoji unicode character inline.
 */
export const emojiExtension = Extension.create({
  name: 'emojiSuggestion',

  addOptions() {
    return {
      suggestion: {
        char: ':',
        pluginKey: emojiSuggestionKey,
        allowSpaces: false,

        items: ({ query }: { query: string }) => {
          if (!query) return EMOJI_LIST.slice(0, 10)
          const q = query.toLowerCase()
          return EMOJI_LIST.filter(
            (e) =>
              e.name.includes(q) ||
              e.keywords.some((k) => k.includes(q))
          ).slice(0, 10)
        },

        command: ({
          editor,
          range,
          props,
        }: {
          editor: any
          range: any
          props: any
        }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent(props.emoji)
            .run()
        },

        render: () => {
          let popup: HTMLElement | null = null
          let cleanup: (() => void) | null = null
          let selectedIndex = 0
          let currentItems: typeof EMOJI_LIST = []
          let currentCommand: ((item: (typeof EMOJI_LIST)[0]) => void) | null =
            null

          const renderList = () => {
            if (!popup) return
            popup.innerHTML = ''

            if (currentItems.length === 0) {
              const empty = document.createElement('div')
              empty.className =
                'px-3 py-2 text-sm text-muted-foreground'
              empty.textContent = 'No emojis found'
              popup.appendChild(empty)
              return
            }

            currentItems.forEach((item, i) => {
              const btn = document.createElement('button')
              btn.className = `flex items-center gap-2 px-3 py-1.5 text-sm w-full text-left hover:bg-accent transition-colors ${
                i === selectedIndex ? 'bg-accent' : ''
              }`
              btn.innerHTML = `<span class="text-base">${item.emoji}</span><span class="text-foreground">:${item.name}:</span>`
              btn.addEventListener('click', () => {
                if (currentCommand) currentCommand(item)
              })
              popup!.appendChild(btn)
            })
          }

          return {
            onStart(props: any) {
              currentItems = props.items || []
              currentCommand = props.command
              selectedIndex = 0

              popup = document.createElement('div')
              popup.className =
                'bg-popover text-popover-foreground border rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto min-w-[200px]'
              renderList()
              document.body.appendChild(popup)

              if (props.clientRect) {
                const virtualEl = {
                  getBoundingClientRect: () => props.clientRect!(),
                }
                cleanup = autoUpdate(
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
                        position: 'absolute',
                        zIndex: '50',
                      })
                    })
                  }
                )
              }
            },

            onUpdate(props: any) {
              currentItems = props.items || []
              currentCommand = props.command
              selectedIndex = 0
              renderList()
            },

            onKeyDown({ event }: { event: KeyboardEvent }) {
              if (currentItems.length === 0) return false

              if (event.key === 'ArrowUp') {
                selectedIndex =
                  (selectedIndex + currentItems.length - 1) %
                  currentItems.length
                renderList()
                return true
              }
              if (event.key === 'ArrowDown') {
                selectedIndex =
                  (selectedIndex + 1) % currentItems.length
                renderList()
                return true
              }
              if (event.key === 'Enter') {
                const item = currentItems[selectedIndex]
                if (item && currentCommand) currentCommand(item)
                return true
              }
              return false
            },

            onExit() {
              cleanup?.()
              popup?.remove()
              popup = null
              cleanup = null
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
