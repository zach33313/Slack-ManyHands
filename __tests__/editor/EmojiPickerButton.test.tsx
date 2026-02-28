/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock dependencies
jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

jest.mock('lucide-react', () => ({
  Smile: (props: any) => <svg data-testid="smile-icon" {...props} />,
}))

// Mock emoji-mart lazy imports
const MockPicker = jest.fn((props: any) => (
  <div data-testid="emoji-picker">
    <button
      data-testid="emoji-smile"
      onClick={() => props.onEmojiSelect({ native: '😊' })}
    >
      Smile emoji
    </button>
    <button
      data-testid="emoji-no-native"
      onClick={() => props.onEmojiSelect({ shortcodes: ':fire:' })}
    >
      Fire emoji
    </button>
  </div>
))

const mockEmojiData = { categories: [] }

jest.mock('@emoji-mart/react', () => ({ __esModule: true, default: MockPicker }))
jest.mock('@emoji-mart/data', () => ({ __esModule: true, default: mockEmojiData }))

import EmojiPickerButton from '../../components/editor/EmojiPickerButton'

// ---------------------------------------------------------------------------
// Mock editor
// ---------------------------------------------------------------------------

function createMockEditor() {
  const chain: any = {}
  chain.focus = jest.fn(() => chain)
  chain.insertContent = jest.fn(() => chain)
  chain.run = jest.fn()
  return {
    chain: jest.fn(() => chain),
    _chain: chain,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmojiPickerButton', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    MockPicker.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders the emoji button with Smile icon', () => {
    render(<EmojiPickerButton editor={null} />)
    expect(screen.getByRole('button', { name: 'Insert emoji' })).toBeInTheDocument()
    expect(screen.getByTestId('smile-icon')).toBeInTheDocument()
  })

  it('opens the picker on click', async () => {
    const editor = createMockEditor() as any
    render(<EmojiPickerButton editor={editor} />)

    const button = screen.getByRole('button', { name: 'Insert emoji' })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
    })
  })

  it('toggles closed on second click', async () => {
    const editor = createMockEditor() as any
    render(<EmojiPickerButton editor={editor} />)

    const button = screen.getByRole('button', { name: 'Insert emoji' })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
    })

    fireEvent.click(button)
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
  })

  it('inserts native emoji on selection', async () => {
    const editor = createMockEditor() as any
    render(<EmojiPickerButton editor={editor} />)

    fireEvent.click(screen.getByRole('button', { name: 'Insert emoji' }))

    await waitFor(() => {
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('emoji-smile'))

    expect(editor._chain.focus).toHaveBeenCalled()
    expect(editor._chain.insertContent).toHaveBeenCalledWith('😊')
    expect(editor._chain.run).toHaveBeenCalled()

    // Picker should close after selection
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
  })

  it('falls back to shortcodes when no native emoji', async () => {
    const editor = createMockEditor() as any
    render(<EmojiPickerButton editor={editor} />)

    fireEvent.click(screen.getByRole('button', { name: 'Insert emoji' }))

    await waitFor(() => {
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('emoji-no-native'))

    expect(editor._chain.insertContent).toHaveBeenCalledWith(':fire:')
  })

  it('does nothing on selection if editor is null', async () => {
    render(<EmojiPickerButton editor={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Insert emoji' }))

    await waitFor(() => {
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
    })

    // Should not throw
    fireEvent.click(screen.getByTestId('emoji-smile'))
  })

  it('closes on outside click', async () => {
    const editor = createMockEditor() as any
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <EmojiPickerButton editor={editor} />
      </div>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Insert emoji' }))

    await waitFor(() => {
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
    })

    // Advance timers past the setTimeout(0) in the component
    act(() => {
      jest.advanceTimersByTime(10)
    })

    // Click outside
    fireEvent.mouseDown(screen.getByTestId('outside'))

    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
  })

  it('passes correct props to Picker component', async () => {
    const editor = createMockEditor() as any
    render(<EmojiPickerButton editor={editor} />)

    fireEvent.click(screen.getByRole('button', { name: 'Insert emoji' }))

    await waitFor(() => {
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
    })

    expect(MockPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        data: mockEmojiData,
        theme: 'auto',
        previewPosition: 'none',
        skinTonePosition: 'none',
      }),
      expect.anything()
    )
  })
})
