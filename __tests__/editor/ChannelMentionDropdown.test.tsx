/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock dependencies
jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

jest.mock('lucide-react', () => ({
  Hash: (props: any) => <svg data-testid="hash-icon" {...props} />,
}))

import ChannelMentionDropdown from '../../components/editor/ChannelMentionDropdown'
import type { ChannelItem } from '../../components/editor/ChannelMentionDropdown'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockItems: ChannelItem[] = [
  { id: 'ch1', label: 'general', description: 'Company-wide announcements' },
  { id: 'ch2', label: 'engineering', description: null },
  { id: 'ch3', label: 'random' },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChannelMentionDropdown', () => {
  it('renders "No channels found" when items is empty', () => {
    const command = jest.fn()
    render(<ChannelMentionDropdown items={[]} command={command} />)
    expect(screen.getByText('No channels found')).toBeInTheDocument()
  })

  it('renders all provided items with Hash icons', () => {
    const command = jest.fn()
    render(<ChannelMentionDropdown items={mockItems} command={command} />)

    expect(screen.getByText('general')).toBeInTheDocument()
    expect(screen.getByText('engineering')).toBeInTheDocument()
    expect(screen.getByText('random')).toBeInTheDocument()

    // Each item should have a Hash icon
    const hashIcons = screen.getAllByTestId('hash-icon')
    expect(hashIcons).toHaveLength(3)
  })

  it('renders description when provided', () => {
    const command = jest.fn()
    render(<ChannelMentionDropdown items={mockItems} command={command} />)

    expect(screen.getByText('Company-wide announcements')).toBeInTheDocument()
  })

  it('does not render description when null or missing', () => {
    const command = jest.fn()
    render(<ChannelMentionDropdown items={[mockItems[1]]} command={command} />)

    // Only the channel name and icon should be present
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('engineering')
  })

  it('calls command when item is clicked', () => {
    const command = jest.fn()
    render(<ChannelMentionDropdown items={mockItems} command={command} />)

    fireEvent.click(screen.getByText('random'))
    expect(command).toHaveBeenCalledWith(mockItems[2])
  })

  it('updates selectedIndex on mouse enter', () => {
    const command = jest.fn()
    render(<ChannelMentionDropdown items={mockItems} command={command} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons[0].className).toContain('bg-accent')

    fireEvent.mouseEnter(buttons[1])
    expect(buttons[1].className).toContain('bg-accent')
  })

  describe('keyboard navigation via ref', () => {
    function renderWithRef() {
      const command = jest.fn()
      const ref = React.createRef<any>()
      render(<ChannelMentionDropdown ref={ref} items={mockItems} command={command} />)
      return { ref, command }
    }

    it('ArrowDown advances selected index', () => {
      const { ref } = renderWithRef()
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
      const handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Escape' }) })
      expect(handled).toBe(false)
    })

    it('returns false when items are empty', () => {
      const command = jest.fn()
      const ref = React.createRef<any>()
      render(<ChannelMentionDropdown ref={ref} items={[]} command={command} />)
      const handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) })
      expect(handled).toBe(false)
    })
  })

  it('resets selectedIndex when items change', () => {
    const command = jest.fn()
    const { rerender } = render(<ChannelMentionDropdown items={mockItems} command={command} />)

    const buttons = screen.getAllByRole('button')
    fireEvent.mouseEnter(buttons[2])
    expect(buttons[2].className).toContain('bg-accent')

    const newItems: ChannelItem[] = [
      { id: 'ch4', label: 'design' },
      { id: 'ch5', label: 'marketing' },
    ]
    rerender(<ChannelMentionDropdown items={newItems} command={command} />)

    const newButtons = screen.getAllByRole('button')
    expect(newButtons[0].className).toContain('bg-accent')
  })
})
