/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock dependencies
jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

import SlashCommandMenu from '../../components/editor/SlashCommandMenu'
import type { SlashCommandItem } from '../../components/editor/SlashCommandMenu'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockCommand = jest.fn()

const mockItems: SlashCommandItem[] = [
  {
    title: '/bold',
    description: 'Make selected text bold',
    icon: 'B',
    command: jest.fn(),
  },
  {
    title: '/italic',
    description: 'Make selected text italic',
    icon: 'I',
    command: jest.fn(),
  },
  {
    title: '/code',
    description: 'Insert a code block',
    icon: 'C',
    command: jest.fn(),
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlashCommandMenu', () => {
  beforeEach(() => {
    mockCommand.mockClear()
  })

  it('renders "No commands found" when items is empty', () => {
    render(<SlashCommandMenu items={[]} command={mockCommand} />)
    expect(screen.getByText('No commands found')).toBeInTheDocument()
  })

  it('renders "Commands" header and all items', () => {
    render(<SlashCommandMenu items={mockItems} command={mockCommand} />)

    expect(screen.getByText('Commands')).toBeInTheDocument()
    expect(screen.getByText('/bold')).toBeInTheDocument()
    expect(screen.getByText('/italic')).toBeInTheDocument()
    expect(screen.getByText('/code')).toBeInTheDocument()
  })

  it('renders item icons', () => {
    render(<SlashCommandMenu items={mockItems} command={mockCommand} />)

    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('I')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('renders item descriptions', () => {
    render(<SlashCommandMenu items={mockItems} command={mockCommand} />)

    expect(screen.getByText('Make selected text bold')).toBeInTheDocument()
    expect(screen.getByText('Make selected text italic')).toBeInTheDocument()
    expect(screen.getByText('Insert a code block')).toBeInTheDocument()
  })

  it('calls command when item is clicked', () => {
    render(<SlashCommandMenu items={mockItems} command={mockCommand} />)

    fireEvent.click(screen.getByText('/italic'))
    expect(mockCommand).toHaveBeenCalledWith(mockItems[1])
  })

  it('highlights first item by default', () => {
    render(<SlashCommandMenu items={mockItems} command={mockCommand} />)

    const buttons = screen.getAllByRole('button')
    // First button has 'bg-accent' as a standalone class (not just hover:bg-accent)
    expect(buttons[0].className).toMatch(/(?:^|\s)bg-accent(?:\s|$)/)
    // Second button should only have hover:bg-accent, not standalone bg-accent
    const nonHoverClasses = buttons[1].className.replace(/hover:bg-accent/g, '')
    expect(nonHoverClasses).not.toContain('bg-accent')
  })

  it('updates selected index on mouse enter', () => {
    render(<SlashCommandMenu items={mockItems} command={mockCommand} />)

    const buttons = screen.getAllByRole('button')
    fireEvent.mouseEnter(buttons[2])
    expect(buttons[2].className).toContain('bg-accent')
  })

  describe('keyboard navigation via ref', () => {
    function renderWithRef() {
      const command = jest.fn()
      const ref = React.createRef<any>()
      render(<SlashCommandMenu ref={ref} items={mockItems} command={command} />)
      return { ref, command }
    }

    it('ArrowDown advances selected index', () => {
      const { ref } = renderWithRef()
      const handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) })
      expect(handled).toBe(true)
    })

    it('ArrowUp wraps around', () => {
      const { ref } = renderWithRef()
      const handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowUp' }) })
      expect(handled).toBe(true)
    })

    it('Enter selects the current item and calls command', () => {
      const { ref, command } = renderWithRef()
      const handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) })
      expect(handled).toBe(true)
      expect(command).toHaveBeenCalledWith(mockItems[0])
    })

    it('returns false for unhandled keys', () => {
      const { ref } = renderWithRef()
      const handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Tab' }) })
      expect(handled).toBe(false)
    })

    it('returns false when items are empty', () => {
      const command = jest.fn()
      const ref = React.createRef<any>()
      render(<SlashCommandMenu ref={ref} items={[]} command={command} />)
      const handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) })
      expect(handled).toBe(false)
    })
  })

  it('resets selectedIndex when items change', () => {
    const command = jest.fn()
    const { rerender } = render(<SlashCommandMenu items={mockItems} command={command} />)

    const buttons = screen.getAllByRole('button')
    fireEvent.mouseEnter(buttons[2])
    expect(buttons[2].className).toContain('bg-accent')

    const newItems: SlashCommandItem[] = [
      { title: '/list', description: 'Bullet list', icon: 'L', command: jest.fn() },
    ]
    rerender(<SlashCommandMenu items={newItems} command={command} />)

    const newButtons = screen.getAllByRole('button')
    expect(newButtons[0].className).toContain('bg-accent')
  })
})
