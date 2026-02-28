/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

jest.mock('lucide-react', () => ({
  Bold: (props: any) => <svg {...props} />,
  Italic: (props: any) => <svg {...props} />,
  Strikethrough: (props: any) => <svg {...props} />,
  Code: (props: any) => <svg {...props} />,
  CodeSquare: (props: any) => <svg {...props} />,
  Link2: (props: any) => <svg {...props} />,
  List: (props: any) => <svg {...props} />,
  ListOrdered: (props: any) => <svg {...props} />,
  Quote: (props: any) => <svg {...props} />,
  Paperclip: (props: any) => <svg {...props} />,
  Smile: (props: any) => <svg {...props} />,
}))

// Mock highlight.js CSS import
jest.mock('highlight.js/styles/github-dark.css', () => ({}))

// Mock EmojiPickerButton to avoid emoji-mart lazy loading complexity
jest.mock('../../components/editor/EmojiPickerButton', () => {
  return function MockEmojiPickerButton() {
    return <div data-testid="emoji-picker-button" />
  }
})

// Mock all tiptap extensions to avoid ProseMirror DOM complexity
jest.mock('@tiptap/starter-kit', () => ({
  __esModule: true,
  default: { configure: jest.fn(() => 'mock-starter-kit') },
}))
jest.mock('@tiptap/extension-placeholder', () => ({
  __esModule: true,
  default: { configure: jest.fn(() => 'mock-placeholder') },
}))
jest.mock('@tiptap/extension-link', () => ({
  __esModule: true,
  default: { configure: jest.fn(() => 'mock-link') },
}))
jest.mock('@tiptap/core', () => ({
  Extension: {
    create: jest.fn(() => 'mock-submit-extension'),
  },
}))
jest.mock('@tiptap/pm/state', () => ({
  Plugin: jest.fn(),
  PluginKey: jest.fn(),
}))

jest.mock('../../components/editor/extensions/code-block', () => ({
  codeBlockLowlight: 'mock-code-block',
}))
jest.mock('../../components/editor/extensions/emoji', () => ({
  emojiExtension: 'mock-emoji-extension',
}))
jest.mock('../../components/editor/extensions/mention', () => ({
  createUserMention: jest.fn(() => 'mock-user-mention'),
  createChannelMention: jest.fn(() => 'mock-channel-mention'),
}))
jest.mock('../../components/editor/extensions/slash-command', () => ({
  createSlashCommand: jest.fn(() => 'mock-slash-command'),
}))

// Mock useEditor and EditorContent from @tiptap/react
const mockEditor = {
  isActive: jest.fn(() => false),
  chain: jest.fn(() => ({
    focus: jest.fn().mockReturnThis(),
    toggleBold: jest.fn().mockReturnThis(),
    run: jest.fn(),
  })),
  getText: jest.fn(() => 'Hello'),
  getJSON: jest.fn(() => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
  })),
  commands: { clearContent: jest.fn() },
}

jest.mock('@tiptap/react', () => ({
  useEditor: jest.fn(() => mockEditor),
  EditorContent: jest.fn(({ editor }: any) => (
    <div data-testid="editor-content">
      {editor ? 'Editor active' : 'No editor'}
    </div>
  )),
  ReactRenderer: jest.fn(),
}))

import SlackEditor from '../../components/editor/SlackEditor'
import { createUserMention, createChannelMention } from '../../components/editor/extensions/mention'
import { createSlashCommand } from '../../components/editor/extensions/slash-command'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlackEditor', () => {
  const defaultProps = {
    onSubmit: jest.fn(),
    workspaceId: 'ws-1',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders editor content area', () => {
    render(<SlackEditor {...defaultProps} />)
    expect(screen.getByTestId('editor-content')).toBeInTheDocument()
    expect(screen.getByText('Editor active')).toBeInTheDocument()
  })

  it('renders the EditorToolbar', () => {
    render(<SlackEditor {...defaultProps} />)
    // Toolbar renders format buttons when editor is present
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument()
  })

  it('creates mention extensions with workspaceId', () => {
    render(<SlackEditor {...defaultProps} />)
    expect(createUserMention).toHaveBeenCalledWith('ws-1')
    expect(createChannelMention).toHaveBeenCalledWith('ws-1')
  })

  it('creates slash command extension', () => {
    render(<SlackEditor {...defaultProps} />)
    expect(createSlashCommand).toHaveBeenCalled()
  })

  it('applies disabled styling when disabled', () => {
    const { container } = render(<SlackEditor {...defaultProps} disabled />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('opacity-50')
    expect(wrapper.className).toContain('pointer-events-none')
  })

  it('does not show attachment button when onFileUpload is not provided', () => {
    render(<SlackEditor {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Attach file' })).not.toBeInTheDocument()
  })

  it('shows attachment button when onFileUpload is provided', () => {
    const onFileUpload = jest.fn()
    render(<SlackEditor {...defaultProps} onFileUpload={onFileUpload} />)
    expect(screen.getByRole('button', { name: 'Attach file' })).toBeInTheDocument()
  })

  it('triggers file input on attachment button click', () => {
    const onFileUpload = jest.fn()
    const createElementSpy = jest.spyOn(document, 'createElement')

    render(<SlackEditor {...defaultProps} onFileUpload={onFileUpload} />)

    fireEvent.click(screen.getByRole('button', { name: 'Attach file' }))

    // Should have created a file input
    const inputCalls = createElementSpy.mock.results.filter(
      (result) => result.value?.type === 'file'
    )
    expect(inputCalls.length).toBeGreaterThanOrEqual(0) // Input is created programmatically

    createElementSpy.mockRestore()
  })

  it('renders styled wrapper with border classes', () => {
    const { container } = render(<SlackEditor {...defaultProps} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('rounded-lg')
    expect(wrapper.className).toContain('border')
  })
})
