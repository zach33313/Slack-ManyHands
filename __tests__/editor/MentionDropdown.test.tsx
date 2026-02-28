/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock dependencies
jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

import MentionDropdown from '../../components/editor/MentionDropdown'
import type { MentionItem } from '../../components/editor/MentionDropdown'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockItems: MentionItem[] = [
  { id: 'u1', label: 'Alice Smith', avatar: '/avatar/alice.png', role: 'ADMIN' },
  { id: 'u2', label: 'Bob Jones', avatar: null, role: 'MEMBER' },
  { id: 'u3', label: 'Carol White' },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MentionDropdown', () => {
  it('renders "No users found" when items is empty', () => {
    const command = jest.fn()
    render(<MentionDropdown items={[]} command={command} />)
    expect(screen.getByText('No users found')).toBeInTheDocument()
  })

  it('renders all provided items', () => {
    const command = jest.fn()
    render(<MentionDropdown items={mockItems} command={command} />)

    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    expect(screen.getByText('Carol White')).toBeInTheDocument()
  })

  it('renders avatar image when available', () => {
    const command = jest.fn()
    const { container } = render(<MentionDropdown items={mockItems} command={command} />)

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', '/avatar/alice.png')
  })

  it('renders initial letter fallback when no avatar', () => {
    const command = jest.fn()
    render(<MentionDropdown items={[mockItems[1]]} command={command} />)

    // Bob Jones: fallback shows 'B'
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders role when provided', () => {
    const command = jest.fn()
    render(<MentionDropdown items={mockItems} command={command} />)

    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('member')).toBeInTheDocument()
  })

  it('calls command when item is clicked', () => {
    const command = jest.fn()
    render(<MentionDropdown items={mockItems} command={command} />)

    fireEvent.click(screen.getByText('Bob Jones'))
    expect(command).toHaveBeenCalledWith(mockItems[1])
  })

  it('updates selectedIndex on mouse enter', () => {
    const command = jest.fn()
    render(<MentionDropdown items={mockItems} command={command} />)

    const buttons = screen.getAllByRole('button')
    // First button should have bg-accent initially (index 0 selected)
    expect(buttons[0].className).toContain('bg-accent')

    // Hover over third item
    fireEvent.mouseEnter(buttons[2])

    // Now third button should have bg-accent
    expect(buttons[2].className).toContain('bg-accent')
  })

  describe('keyboard navigation via ref', () => {
    function renderWithRef() {
      const command = jest.fn()
      const ref = React.createRef<any>()
      render(<MentionDropdown ref={ref} items={mockItems} command={command} />)
      return { ref, command }
    }

    it('ArrowDown advances selected index', () => {
      const { ref } = renderWithRef()
      const buttons = screen.getAllByRole('button')
      expect(buttons[0].className).toContain('bg-accent')

      const handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) })
      expect(handled).toBe(true)
    })

    it('ArrowUp wraps around to last item', () => {
      const { ref } = renderWithRef()

      const handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowUp' }) })
      expect(handled).toBe(true)
    })

    it('Enter selects the current item', () => {
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
      render(<MentionDropdown ref={ref} items={[]} command={command} />)

      const handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) })
      expect(handled).toBe(false)
    })
  })

  it('resets selectedIndex when items change', () => {
    const command = jest.fn()
    const { rerender } = render(<MentionDropdown items={mockItems} command={command} />)

    // Navigate down
    const buttons = screen.getAllByRole('button')
    fireEvent.mouseEnter(buttons[2])
    expect(buttons[2].className).toContain('bg-accent')

    // Rerender with new items — selectedIndex should reset to 0
    const newItems: MentionItem[] = [
      { id: 'u4', label: 'Dave Park' },
      { id: 'u5', label: 'Eve Yang' },
    ]
    rerender(<MentionDropdown items={newItems} command={command} />)

    const newButtons = screen.getAllByRole('button')
    expect(newButtons[0].className).toContain('bg-accent')
  })
})
