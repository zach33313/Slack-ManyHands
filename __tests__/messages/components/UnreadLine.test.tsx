/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UnreadLine } from '@/messages/components/UnreadLine';

describe('UnreadLine', () => {
  it('renders the "New" label', () => {
    render(<UnreadLine />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('has the "New messages" aria-label for accessibility', () => {
    render(<UnreadLine />);
    expect(screen.getByLabelText('New messages')).toBeInTheDocument();
  });

  it('renders two divider lines (before and after the label)', () => {
    const { container } = render(<UnreadLine />);
    const dividers = container.querySelectorAll('.bg-red-500');
    // Two red divider lines + the "New" text span that has text-red-500
    expect(dividers.length).toBeGreaterThanOrEqual(2);
  });

  it('uses red color for the label', () => {
    render(<UnreadLine />);
    const label = screen.getByText('New');
    expect(label).toHaveClass('text-red-500');
  });

  it('renders uppercase text', () => {
    render(<UnreadLine />);
    const label = screen.getByText('New');
    expect(label).toHaveClass('uppercase');
  });
});
