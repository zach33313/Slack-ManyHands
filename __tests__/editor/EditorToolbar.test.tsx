/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock dependencies
jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

jest.mock('lucide-react', () => ({
  Bold: (props: any) => <svg data-testid="icon-bold" {...props} />,
  Italic: (props: any) => <svg data-testid="icon-italic" {...props} />,
  Strikethrough: (props: any) => <svg data-testid="icon-strikethrough" {...props} />,
  Code: (props: any) => <svg data-testid="icon-code" {...props} />,
  CodeSquare: (props: any) => <svg data-testid="icon-codesquare" {...props} />,
  Link2: (props: any) => <svg data-testid="icon-link" {...props} />,
  List: (props: any) => <svg data-testid="icon-list" {...props} />,
  ListOrdered: (props: any) => <svg data-testid="icon-listordered" {...props} />,
  Quote: (props: any) => <svg data-testid="icon-quote" {...props} />,
  Paperclip: (props: any) => <svg data-testid="icon-paperclip" {...props} />,
  Smile: (props: any) => <svg data-testid="icon-smile" {...props} />,
}))

// Mock EmojiPickerButton to isolate toolbar tests
jest.mock('../../components/editor/EmojiPickerButton', () => {
  return function MockEmojiPickerButton() {
    return <div data-testid="emoji-picker-button" />
  }
})

import EditorToolbar from '../../components/editor/EditorToolbar'

// ---------------------------------------------------------------------------
// Mock editor factory
// ---------------------------------------------------------------------------

function createMockEditor(activeFormats: string[] = []) {
  const chain: any = {}
  chain.focus = jest.fn(() => chain)
  chain.toggleBold = jest.fn(() => chain)
  chain.toggleItalic = jest.fn(() => chain)
  chain.toggleStrike = jest.fn(() => chain)
  chain.toggleCode = jest.fn(() => chain)
  chain.toggleCodeBlock = jest.fn(() => chain)
  chain.toggleOrderedList = jest.fn(() => chain)
  chain.toggleBulletList = jest.fn(() => chain)
  chain.toggleBlockquote = jest.fn(() => chain)
  chain.setLink = jest.fn(() => chain)
  chain.unsetLink = jest.fn(() => chain)
  chain.run = jest.fn()

  return {
    chain: jest.fn(() => chain),
    isActive: jest.fn((format: string) => activeFormats.includes(format)),
    _chain: chain,
  } as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EditorToolbar', () => {
  it('returns null when editor is null', () => {
    const { container } = render(<EditorToolbar editor={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders all 9 format buttons', () => {
    const editor = createMockEditor()
    render(<EditorToolbar editor={editor} />)

    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Strikethrough' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inline code' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Code block' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ordered list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bullet list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blockquote' })).toBeInTheDocument()
  })

  it('renders emoji picker button', () => {
    const editor = createMockEditor()
    render(<EditorToolbar editor={editor} />)
    expect(screen.getByTestId('emoji-picker-button')).toBeInTheDocument()
  })

  it('does not render attachment button when onAttachmentClick is not provided', () => {
    const editor = createMockEditor()
    render(<EditorToolbar editor={editor} />)
    expect(screen.queryByRole('button', { name: 'Attach file' })).not.toBeInTheDocument()
  })

  it('renders attachment button when onAttachmentClick is provided', () => {
    const editor = createMockEditor()
    const onAttachmentClick = jest.fn()
    render(<EditorToolbar editor={editor} onAttachmentClick={onAttachmentClick} />)

    const attachBtn = screen.getByRole('button', { name: 'Attach file' })
    expect(attachBtn).toBeInTheDocument()

    fireEvent.click(attachBtn)
    expect(onAttachmentClick).toHaveBeenCalled()
  })

  it('shows shortcut in title for Bold and Italic', () => {
    const editor = createMockEditor()
    render(<EditorToolbar editor={editor} />)

    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
      'title',
      'Bold (Ctrl+B)'
    )
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute(
      'title',
      'Italic (Ctrl+I)'
    )
  })

  describe('format button actions', () => {
    it('toggleBold when Bold button clicked', () => {
      const editor = createMockEditor()
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
      expect(editor._chain.focus).toHaveBeenCalled()
      expect(editor._chain.toggleBold).toHaveBeenCalled()
      expect(editor._chain.run).toHaveBeenCalled()
    })

    it('toggleItalic when Italic button clicked', () => {
      const editor = createMockEditor()
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Italic' }))
      expect(editor._chain.toggleItalic).toHaveBeenCalled()
    })

    it('toggleStrike when Strikethrough button clicked', () => {
      const editor = createMockEditor()
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Strikethrough' }))
      expect(editor._chain.toggleStrike).toHaveBeenCalled()
    })

    it('toggleCode when Inline code button clicked', () => {
      const editor = createMockEditor()
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Inline code' }))
      expect(editor._chain.toggleCode).toHaveBeenCalled()
    })

    it('toggleCodeBlock when Code block button clicked', () => {
      const editor = createMockEditor()
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Code block' }))
      expect(editor._chain.toggleCodeBlock).toHaveBeenCalled()
    })

    it('toggleOrderedList when Ordered list button clicked', () => {
      const editor = createMockEditor()
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Ordered list' }))
      expect(editor._chain.toggleOrderedList).toHaveBeenCalled()
    })

    it('toggleBulletList when Bullet list button clicked', () => {
      const editor = createMockEditor()
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }))
      expect(editor._chain.toggleBulletList).toHaveBeenCalled()
    })

    it('toggleBlockquote when Blockquote button clicked', () => {
      const editor = createMockEditor()
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Blockquote' }))
      expect(editor._chain.toggleBlockquote).toHaveBeenCalled()
    })
  })

  describe('Link button', () => {
    it('prompts for URL and sets link when not active', () => {
      const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('https://example.com')
      const editor = createMockEditor()
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Link' }))

      expect(promptSpy).toHaveBeenCalledWith('Enter URL:')
      expect(editor._chain.setLink).toHaveBeenCalledWith({ href: 'https://example.com' })
      promptSpy.mockRestore()
    })

    it('does not set link when user cancels prompt', () => {
      const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue(null)
      const editor = createMockEditor()
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Link' }))

      expect(editor._chain.setLink).not.toHaveBeenCalled()
      promptSpy.mockRestore()
    })

    it('unsets link when link is active', () => {
      const editor = createMockEditor(['link'])
      render(<EditorToolbar editor={editor} />)

      fireEvent.click(screen.getByRole('button', { name: 'Link' }))

      expect(editor._chain.unsetLink).toHaveBeenCalled()
    })
  })

  describe('active state display', () => {
    it('shows active styling for active formats', () => {
      const editor = createMockEditor(['bold', 'italic'])
      render(<EditorToolbar editor={editor} />)

      const boldBtn = screen.getByRole('button', { name: 'Bold' })
      expect(boldBtn).toHaveAttribute('aria-pressed', 'true')

      const italicBtn = screen.getByRole('button', { name: 'Italic' })
      expect(italicBtn).toHaveAttribute('aria-pressed', 'true')

      const strikeBtn = screen.getByRole('button', { name: 'Strikethrough' })
      expect(strikeBtn).toHaveAttribute('aria-pressed', 'false')
    })
  })
})
