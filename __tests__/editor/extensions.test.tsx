/** @jest-environment jsdom */
import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

jest.mock('lucide-react', () => ({
  Hash: (props: any) => ({ type: 'svg', props }),
}))

// Mock floating-ui
jest.mock('@floating-ui/dom', () => ({
  computePosition: jest.fn().mockResolvedValue({ x: 0, y: 0 }),
  autoUpdate: jest.fn(() => jest.fn()),
  offset: jest.fn(() => 'offset'),
  flip: jest.fn(() => 'flip'),
  shift: jest.fn(() => 'shift'),
}))

// Mock ReactRenderer
const mockRendererInstance = {
  element: document.createElement('div'),
  ref: null as any,
  updateProps: jest.fn(),
  destroy: jest.fn(),
}

jest.mock('@tiptap/react', () => ({
  ReactRenderer: jest.fn(() => mockRendererInstance),
}))

// Mock Mention extension
const mockMentionConfigure = jest.fn().mockReturnValue({ name: 'mention', configured: true })
const mockMentionExtend = jest.fn().mockReturnValue({
  configure: jest.fn().mockReturnValue({ name: 'channelMention', configured: true }),
})

jest.mock('@tiptap/extension-mention', () => ({
  Mention: {
    configure: mockMentionConfigure,
    extend: mockMentionExtend,
  },
}))

// Mock tiptap core
jest.mock('@tiptap/core', () => ({
  Extension: {
    create: jest.fn((config: any) => ({
      name: config.name,
      _config: config,
    })),
  },
}))

jest.mock('@tiptap/suggestion', () => ({
  __esModule: true,
  default: jest.fn(() => 'mock-suggestion-plugin'),
}))

jest.mock('@tiptap/pm/state', () => ({
  PluginKey: jest.fn((name: string) => ({ key: name })),
}))

// Mock lowlight for code-block
jest.mock('lowlight', () => ({
  createLowlight: jest.fn(() => 'mock-lowlight'),
  common: 'mock-common',
}))

jest.mock('@tiptap/extension-code-block-lowlight', () => ({
  CodeBlockLowlight: {
    configure: jest.fn((opts: any) => ({
      name: 'codeBlockLowlight',
      lowlight: opts.lowlight,
    })),
  },
}))

// ---------------------------------------------------------------------------
// Tests: mention.ts — createUserMention / createChannelMention
// ---------------------------------------------------------------------------

describe('mention extensions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createUserMention', () => {
    it('configures Mention with @ char trigger', () => {
      const { createUserMention } = require('../../components/editor/extensions/mention')
      createUserMention('ws-123')

      expect(mockMentionConfigure).toHaveBeenCalledWith(
        expect.objectContaining({
          HTMLAttributes: { class: 'mention user-mention' },
          deleteTriggerWithBackspace: true,
          suggestion: expect.objectContaining({
            char: '@',
            allowSpaces: false,
            startOfLine: false,
          }),
        })
      )
    })

    it('suggestion items fetches from workspace members API', async () => {
      const { createUserMention } = require('../../components/editor/extensions/mention')
      createUserMention('ws-123')

      const config = mockMentionConfigure.mock.calls[0][0]
      const items = config.suggestion.items

      // Mock fetch
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { userId: 'u1', user: { name: 'Alice', image: '/a.png' }, role: 'ADMIN' },
              { userId: 'u2', user: { name: 'Bob', image: null }, role: 'MEMBER' },
            ],
          }),
      }
      global.fetch = jest.fn().mockResolvedValue(mockResponse)

      const result = await items({ query: 'ali' })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/workspaces/ws-123/members')
      )
      expect(result).toEqual([
        { id: 'u1', label: 'Alice', avatar: '/a.png', role: 'ADMIN' },
        { id: 'u2', label: 'Bob', avatar: null, role: 'MEMBER' },
      ])
    })

    it('suggestion items returns empty array on fetch failure', async () => {
      const { createUserMention } = require('../../components/editor/extensions/mention')
      createUserMention('ws-123')

      const config = mockMentionConfigure.mock.calls[0][0]
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      const result = await config.suggestion.items({ query: '' })
      expect(result).toEqual([])
    })

    it('suggestion items returns empty array on non-ok response', async () => {
      const { createUserMention } = require('../../components/editor/extensions/mention')
      createUserMention('ws-123')

      const config = mockMentionConfigure.mock.calls[0][0]
      global.fetch = jest.fn().mockResolvedValue({ ok: false })

      const result = await config.suggestion.items({ query: '' })
      expect(result).toEqual([])
    })

    it('suggestion command inserts mention node with trailing space', () => {
      const { createUserMention } = require('../../components/editor/extensions/mention')
      createUserMention('ws-123')

      const config = mockMentionConfigure.mock.calls[0][0]
      const mockChain: any = {}
      mockChain.focus = jest.fn(() => mockChain)
      mockChain.insertContentAt = jest.fn(() => mockChain)
      mockChain.run = jest.fn()

      const mockEditor = { chain: jest.fn(() => mockChain) }

      config.suggestion.command({
        editor: mockEditor,
        range: { from: 1, to: 5 },
        props: { id: 'u1', label: 'Alice' },
      })

      expect(mockChain.insertContentAt).toHaveBeenCalledWith(
        { from: 1, to: 5 },
        [
          { type: 'mention', attrs: { id: 'u1', label: 'Alice' } },
          { type: 'text', text: ' ' },
        ]
      )
    })

    it('renderText returns @label', () => {
      const { createUserMention } = require('../../components/editor/extensions/mention')
      createUserMention('ws-123')

      const config = mockMentionConfigure.mock.calls[0][0]
      expect(config.renderText({ node: { attrs: { id: 'u1', label: 'Alice' } } })).toBe('@Alice')
    })

    it('renderText falls back to @id when label is missing', () => {
      const { createUserMention } = require('../../components/editor/extensions/mention')
      createUserMention('ws-123')

      const config = mockMentionConfigure.mock.calls[0][0]
      expect(config.renderText({ node: { attrs: { id: 'u1', label: null } } })).toBe('@u1')
    })
  })

  describe('createChannelMention', () => {
    it('extends Mention with name channelMention', () => {
      const { createChannelMention } = require('../../components/editor/extensions/mention')
      createChannelMention('ws-123')

      expect(mockMentionExtend).toHaveBeenCalledWith({ name: 'channelMention' })
    })

    it('configures with # char trigger and channel-mention class', () => {
      const { createChannelMention } = require('../../components/editor/extensions/mention')
      createChannelMention('ws-123')

      const extendedConfigure = mockMentionExtend.mock.results[0].value.configure
      expect(extendedConfigure).toHaveBeenCalledWith(
        expect.objectContaining({
          HTMLAttributes: { class: 'mention channel-mention' },
          suggestion: expect.objectContaining({
            char: '#',
          }),
        })
      )
    })

    it('suggestion items fetches from workspace channels API', async () => {
      const { createChannelMention } = require('../../components/editor/extensions/mention')
      createChannelMention('ws-456')

      const extendedConfigure = mockMentionExtend.mock.results[0].value.configure
      const config = extendedConfigure.mock.calls[0][0]

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 'ch1', name: 'general', description: 'Main channel' },
              { id: 'ch2', name: 'random', description: null },
            ],
          }),
      })

      const result = await config.suggestion.items({ query: 'gen' })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/workspaces/ws-456/channels')
      )
      expect(result).toEqual([
        { id: 'ch1', label: 'general', description: 'Main channel' },
        { id: 'ch2', label: 'random', description: null },
      ])
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: slash-command.ts — createSlashCommand
// ---------------------------------------------------------------------------

describe('slash-command extension', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates extension with name slashCommand', () => {
    const { createSlashCommand } = require('../../components/editor/extensions/slash-command')
    const ext = createSlashCommand()
    expect(ext.name).toBe('slashCommand')
  })

  it('filters commands by query', () => {
    const { createSlashCommand } = require('../../components/editor/extensions/slash-command')
    const ext = createSlashCommand()
    const items = ext._config.addOptions().suggestion.items

    // No query returns first 8
    const allItems = items({ query: '' })
    expect(allItems.length).toBeLessThanOrEqual(8)

    // Query "code" should match /code
    const codeItems = items({ query: 'code' })
    expect(codeItems.some((item: any) => item.title === '/code')).toBe(true)
  })

  it('filters commands by description', () => {
    const { createSlashCommand } = require('../../components/editor/extensions/slash-command')
    const ext = createSlashCommand()
    const items = ext._config.addOptions().suggestion.items

    // "bullet" appears in the /list description
    const bulletItems = items({ query: 'bullet' })
    expect(bulletItems.some((item: any) => item.title === '/list')).toBe(true)
  })

  it('returns empty for non-matching query', () => {
    const { createSlashCommand } = require('../../components/editor/extensions/slash-command')
    const ext = createSlashCommand()
    const items = ext._config.addOptions().suggestion.items

    const result = items({ query: 'zzzznonexistent' })
    expect(result).toHaveLength(0)
  })

  it('suggestion command delegates to item command', () => {
    const { createSlashCommand } = require('../../components/editor/extensions/slash-command')
    const ext = createSlashCommand()
    const commandFn = ext._config.addOptions().suggestion.command

    const mockItemCommand = jest.fn()
    commandFn({
      editor: 'mock-editor',
      range: { from: 0, to: 5 },
      props: { command: mockItemCommand },
    })

    expect(mockItemCommand).toHaveBeenCalledWith({
      editor: 'mock-editor',
      range: { from: 0, to: 5 },
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: emoji.ts — emojiExtension
// ---------------------------------------------------------------------------

describe('emoji extension', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates extension with name emojiSuggestion', () => {
    const { emojiExtension } = require('../../components/editor/extensions/emoji')
    expect(emojiExtension.name).toBe('emojiSuggestion')
  })

  it('filters emojis by name', () => {
    const { emojiExtension } = require('../../components/editor/extensions/emoji')
    const items = emojiExtension._config.addOptions().suggestion.items

    const result = items({ query: 'fire' })
    expect(result.some((e: any) => e.emoji === '🔥')).toBe(true)
  })

  it('filters emojis by keyword', () => {
    const { emojiExtension } = require('../../components/editor/extensions/emoji')
    const items = emojiExtension._config.addOptions().suggestion.items

    // "happy" is a keyword for smile
    const result = items({ query: 'happy' })
    expect(result.some((e: any) => e.name === 'smile')).toBe(true)
  })

  it('returns max 10 items without query', () => {
    const { emojiExtension } = require('../../components/editor/extensions/emoji')
    const items = emojiExtension._config.addOptions().suggestion.items

    const result = items({ query: '' })
    expect(result.length).toBeLessThanOrEqual(10)
  })

  it('suggestion command inserts emoji character', () => {
    const { emojiExtension } = require('../../components/editor/extensions/emoji')
    const commandFn = emojiExtension._config.addOptions().suggestion.command

    const mockChain: any = {}
    mockChain.focus = jest.fn(() => mockChain)
    mockChain.deleteRange = jest.fn(() => mockChain)
    mockChain.insertContent = jest.fn(() => mockChain)
    mockChain.run = jest.fn()

    commandFn({
      editor: { chain: jest.fn(() => mockChain) },
      range: { from: 0, to: 5 },
      props: { emoji: '🔥' },
    })

    expect(mockChain.deleteRange).toHaveBeenCalledWith({ from: 0, to: 5 })
    expect(mockChain.insertContent).toHaveBeenCalledWith('🔥')
  })

  it('emoji suggestion render creates and removes popup', () => {
    const { emojiExtension } = require('../../components/editor/extensions/emoji')
    const renderFactory = emojiExtension._config.addOptions().suggestion.render

    const lifecycle = renderFactory()

    // onStart should create popup and append to body
    lifecycle.onStart({
      items: [{ name: 'fire', emoji: '🔥', keywords: [] }],
      command: jest.fn(),
      clientRect: null,
    })

    // A popup div should have been added to the body
    const popups = document.body.querySelectorAll('div')
    expect(popups.length).toBeGreaterThan(0)

    // onExit should clean up
    lifecycle.onExit()
  })

  it('emoji suggestion keyboard navigation works', () => {
    const { emojiExtension } = require('../../components/editor/extensions/emoji')
    const renderFactory = emojiExtension._config.addOptions().suggestion.render
    const lifecycle = renderFactory()

    const command = jest.fn()
    lifecycle.onStart({
      items: [
        { name: 'fire', emoji: '🔥', keywords: [] },
        { name: 'rocket', emoji: '🚀', keywords: [] },
      ],
      command,
      clientRect: null,
    })

    // ArrowDown should return true
    expect(
      lifecycle.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) })
    ).toBe(true)

    // ArrowUp should return true
    expect(
      lifecycle.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowUp' }) })
    ).toBe(true)

    // Enter should select and return true
    expect(
      lifecycle.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) })
    ).toBe(true)
    expect(command).toHaveBeenCalled()

    lifecycle.onExit()
  })

  it('emoji suggestion returns false for empty items', () => {
    const { emojiExtension } = require('../../components/editor/extensions/emoji')
    const renderFactory = emojiExtension._config.addOptions().suggestion.render
    const lifecycle = renderFactory()

    lifecycle.onStart({
      items: [],
      command: jest.fn(),
      clientRect: null,
    })

    expect(
      lifecycle.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) })
    ).toBe(false)

    lifecycle.onExit()
  })
})

// ---------------------------------------------------------------------------
// Tests: code-block.ts
// ---------------------------------------------------------------------------

describe('code-block extension', () => {
  it('exports a configured codeBlockLowlight', () => {
    const { codeBlockLowlight } = require('../../components/editor/extensions/code-block')
    expect(codeBlockLowlight).toBeDefined()
    expect(codeBlockLowlight.name).toBe('codeBlockLowlight')
  })
})
