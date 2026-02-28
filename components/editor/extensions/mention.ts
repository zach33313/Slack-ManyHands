import { Mention } from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import { PluginKey } from '@tiptap/pm/state'
import {
  computePosition,
  autoUpdate,
  offset,
  flip,
  shift,
} from '@floating-ui/dom'
import MentionDropdown from '../MentionDropdown'
import type { MentionDropdownRef, MentionItem } from '../MentionDropdown'
import ChannelMentionDropdown from '../ChannelMentionDropdown'
import type {
  ChannelMentionDropdownRef,
  ChannelItem,
} from '../ChannelMentionDropdown'

/**
 * Creates a suggestion render lifecycle for floating-ui positioned React dropdown.
 * Shared between user mention and channel mention extensions.
 */
function createSuggestionRender<TRef extends { onKeyDown: (props: { event: KeyboardEvent }) => boolean }>(
  Component: React.ForwardRefExoticComponent<any>
) {
  return () => {
    let component: ReactRenderer | null = null
    let popup: HTMLElement | null = null
    let cleanupAutoUpdate: (() => void) | null = null

    return {
      onStart(props: any) {
        component = new ReactRenderer(Component, {
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
                middleware: [offset(8), flip(), shift({ padding: 8 })],
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
        return (component?.ref as TRef | null)?.onKeyDown(props) ?? false
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
  }
}

const userMentionKey = new PluginKey('mention-users')
const channelMentionKey = new PluginKey('mention-channels')

/**
 * Creates a UserMention extension configured for a specific workspace.
 * Triggered by '@', fetches workspace members via API.
 * Renders as <span class="mention user-mention">@Name</span>.
 */
export function createUserMention(workspaceId: string) {
  return Mention.configure({
    HTMLAttributes: {
      class: 'mention user-mention',
    },
    renderText({ node }) {
      return `@${node.attrs.label ?? node.attrs.id}`
    },
    renderHTML({ options, node }) {
      return [
        'span',
        {
          ...options.HTMLAttributes,
          'data-type': 'mention',
          'data-user-id': node.attrs.id,
        },
        `@${node.attrs.label ?? node.attrs.id}`,
      ]
    },
    deleteTriggerWithBackspace: true,
    suggestion: {
      char: '@',
      pluginKey: userMentionKey,
      allowSpaces: false,
      startOfLine: false,

      items: async ({ query }: { query: string }): Promise<MentionItem[]> => {
        try {
          const params = new URLSearchParams()
          if (query) params.set('q', query)
          params.set('limit', '8')
          const res = await fetch(
            `/api/workspaces/${workspaceId}/members?${params.toString()}`
          )
          if (!res.ok) return []
          const data = await res.json()
          const members = data.data || data
          return (Array.isArray(members) ? members : []).map(
            (member: any) => ({
              id: member.userId || member.id,
              label:
                member.user?.name || member.name || member.email || 'Unknown',
              avatar: member.user?.image || member.image || null,
              role: member.role || undefined,
            })
          )
        } catch {
          return []
        }
      },

      command: ({ editor, range, props }: any) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: 'mention',
              attrs: { id: props.id, label: props.label },
            },
            { type: 'text', text: ' ' },
          ])
          .run()
      },

      render: createSuggestionRender<MentionDropdownRef>(MentionDropdown),
    },
  })
}

/**
 * Creates a ChannelMention extension configured for a specific workspace.
 * Triggered by '#', fetches workspace channels via API.
 * Uses a separate node type name ('channelMention') so it can coexist with user mentions.
 * Renders as <span class="mention channel-mention">#channel</span>.
 */
export function createChannelMention(workspaceId: string) {
  return Mention.extend({ name: 'channelMention' }).configure({
    HTMLAttributes: {
      class: 'mention channel-mention',
    },
    renderText({ node }) {
      return `#${node.attrs.label ?? node.attrs.id}`
    },
    renderHTML({ options, node }) {
      return [
        'span',
        {
          ...options.HTMLAttributes,
          'data-type': 'channel-mention',
          'data-channel-id': node.attrs.id,
        },
        `#${node.attrs.label ?? node.attrs.id}`,
      ]
    },
    deleteTriggerWithBackspace: true,
    suggestion: {
      char: '#',
      pluginKey: channelMentionKey,
      allowSpaces: false,
      startOfLine: false,

      items: async ({ query }: { query: string }): Promise<ChannelItem[]> => {
        try {
          const params = new URLSearchParams()
          if (query) params.set('q', query)
          params.set('limit', '8')
          const res = await fetch(
            `/api/workspaces/${workspaceId}/channels?${params.toString()}`
          )
          if (!res.ok) return []
          const data = await res.json()
          const channels = data.data || data
          return (Array.isArray(channels) ? channels : []).map(
            (channel: any) => ({
              id: channel.id,
              label: channel.name,
              description: channel.description || null,
            })
          )
        } catch {
          return []
        }
      },

      command: ({ editor, range, props }: any) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: 'channelMention',
              attrs: { id: props.id, label: props.label },
            },
            { type: 'text', text: ' ' },
          ])
          .run()
      },

      render:
        createSuggestionRender<ChannelMentionDropdownRef>(
          ChannelMentionDropdown
        ),
    },
  })
}
