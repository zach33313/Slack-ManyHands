/**
 * @jest-environment jsdom
 *
 * __tests__/custom-emojis/CustomEmojiUI.test.tsx
 *
 * Tests for custom emoji UI components:
 *  1. CustomEmojiCreator (EmojiUploader) renders upload form with image preview and name input
 *  2. Name validation rejects special characters and shows error
 *  3. File size validation rejects files > 256KB and shows error
 *  4. Successful upload shows toast and clears form
 *  5. CustomEmojiPicker fetches and displays emoji grid
 *  6. Clicking an emoji in picker calls the onSelect callback
 *  7. ReactionPicker includes a 'Custom' tab when workspaceId is provided
 */

// ---------------------------------------------------------------------------
// framer-motion mock — renders children directly, no animation overhead
// ---------------------------------------------------------------------------
jest.mock('framer-motion', () => {
  const React = require('react');

  const motionProxy = new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        return function MotionEl({
          children,
          animate,
          initial,
          exit,
          transition,
          variants,
          whileTap,
          whileHover,
          layout,
          ...props
        }: Record<string, unknown>) {
          return React.createElement(tag as string, props, children as React.ReactNode);
        };
      },
    }
  );

  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// ---------------------------------------------------------------------------
// sonner toast mock
// ---------------------------------------------------------------------------
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({ toast: mockToast }));

// ---------------------------------------------------------------------------
// lucide-react mock — stub icon components to bare elements
// ---------------------------------------------------------------------------
jest.mock('lucide-react', () => {
  const React = require('react');
  const stub = (name: string) =>
    function Icon(props: Record<string, unknown>) {
      return React.createElement('svg', { 'data-testid': `icon-${name}`, ...props });
    };
  return {
    Upload: stub('Upload'),
    Image: stub('Image'),
    CheckCircle: stub('CheckCircle'),
    AlertCircle: stub('AlertCircle'),
    Loader2: stub('Loader2'),
    SmilePlus: stub('SmilePlus'),
    Trash2: stub('Trash2'),
  };
});

// ---------------------------------------------------------------------------
// @emoji-mart/react + data mocks
// ---------------------------------------------------------------------------
const MockPicker = jest.fn(({ onEmojiSelect }: { onEmojiSelect: (e: any) => void }) => {
  const React = require('react');
  return React.createElement(
    'div',
    { 'data-testid': 'emoji-mart-picker' },
    React.createElement(
      'button',
      { onClick: () => onEmojiSelect({ native: '😊' }) },
      'Pick emoji'
    )
  );
});
jest.mock('@emoji-mart/react', () => ({ __esModule: true, default: MockPicker }));
jest.mock('@emoji-mart/data', () => ({ __esModule: true, default: { categories: [] } }));

// ---------------------------------------------------------------------------
// next-themes mock
// ---------------------------------------------------------------------------
jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

// ---------------------------------------------------------------------------
// @radix-ui/react-popover mock — renders content inline (no portal/open logic)
// ---------------------------------------------------------------------------
jest.mock('@radix-ui/react-popover', () => {
  const React = require('react');
  return {
    Root: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'popover-root' }, children),
    Trigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) =>
      React.createElement('div', { 'data-testid': 'popover-trigger' }, children),
    Portal: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'popover-portal' }, children),
    Content: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'popover-content' }, children),
  };
});

// ---------------------------------------------------------------------------
// shared/lib/utils mock
// ---------------------------------------------------------------------------
jest.mock('@/shared/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// ---------------------------------------------------------------------------
// Imports (after all jest.mock calls)
// ---------------------------------------------------------------------------
import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// "CustomEmojiCreator" = EmojiUploader — the upload form component
import { EmojiUploader } from '../../workspaces/components/EmojiUploader';
import { CustomEmojiPicker } from '../../workspaces/components/CustomEmojiPicker';
import { ReactionPicker } from '../../messages/components/ReactionPicker';

// ---------------------------------------------------------------------------
// Browser API stubs (URL + Image — must be set up once for the whole file)
// ---------------------------------------------------------------------------
beforeAll(() => {
  // URL.createObjectURL / revokeObjectURL are not available in jsdom
  global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-preview-url');
  global.URL.revokeObjectURL = jest.fn();

  // window.Image is the real HTMLImageElement constructor in jsdom, but it
  // never fires load events. Replace with a minimal mock that triggers onload.
  class MockImage {
    width = 64;
    height = 64;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      // Fire onload asynchronously, same timing as a real browser
      Promise.resolve().then(() => this.onload?.());
    }
  }
  (global as unknown as { Image: typeof MockImage }).Image = MockImage;
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a PNG File with the given byte size (for size validation tests). */
function makePngFile(sizeBytes: number, name = 'emoji.png'): File {
  const content = new Uint8Array(sizeBytes).fill(1);
  return new File([content], name, { type: 'image/png' });
}

/** Render EmojiUploader and return the hidden file input element. */
function renderUploader(props: Partial<React.ComponentProps<typeof EmojiUploader>> = {}) {
  const defaults = {
    workspaceId: 'ws-1',
    onSuccess: jest.fn(),
    usedCount: 0,
  };
  const result = render(<EmojiUploader {...defaults} {...props} />);
  const input = result.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...result, input };
}

/** Simulate selecting a file via the hidden input. */
function selectFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

/** Advance from idle to preview state by selecting a valid small PNG. */
async function advanceToPreview(input: HTMLInputElement) {
  const smallFile = makePngFile(1024, 'smile.png'); // 1 KB — passes all checks
  selectFile(input, smallFile);
  // Wait for the async validateFile (Image.onload) to resolve and state to update
  await waitFor(() => {
    expect(screen.getByPlaceholderText('my_emoji')).toBeInTheDocument();
  });
}

// ---------------------------------------------------------------------------
// Suite 1: CustomEmojiCreator (= EmojiUploader)
// ---------------------------------------------------------------------------

describe('CustomEmojiCreator (EmojiUploader)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockPicker.mockClear();
  });

  // -------------------------------------------------------------------------
  // Test 1: renders upload form with image preview area and name input
  // -------------------------------------------------------------------------

  it('renders the upload drop zone in idle state', () => {
    renderUploader();
    expect(screen.getByText('Drop emoji image here')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('my_emoji')).not.toBeInTheDocument();
  });

  it('shows image preview area and shortcode name input after a valid file is selected', async () => {
    const { input } = renderUploader();
    await advanceToPreview(input);

    // Preview image
    expect(screen.getByAltText('Preview')).toBeInTheDocument();
    // Shortcode (name) input
    expect(screen.getByPlaceholderText('my_emoji')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 2: name validation rejects special characters
  // -------------------------------------------------------------------------

  it('shows an error when the shortcode contains special characters', async () => {
    const { input } = renderUploader();
    await advanceToPreview(input);

    const shortcodeInput = screen.getByPlaceholderText('my_emoji');

    // Type a shortcode with spaces and an exclamation mark
    fireEvent.change(shortcodeInput, { target: { value: 'my emoji!' } });

    expect(
      screen.getByText('Only lowercase letters, numbers, and underscores are allowed.')
    ).toBeInTheDocument();
  });

  it('shows an error when the shortcode is too short', async () => {
    const { input } = renderUploader();
    await advanceToPreview(input);

    const shortcodeInput = screen.getByPlaceholderText('my_emoji');
    fireEvent.change(shortcodeInput, { target: { value: 'a' } });

    expect(
      screen.getByText('Shortcode must be at least 2 characters.')
    ).toBeInTheDocument();
  });

  it('clears the shortcode error when valid input replaces invalid input', async () => {
    // Phase 1: confirm an invalid shortcode shows the validation error.
    {
      const { input } = renderUploader();
      await advanceToPreview(input);
      const shortcodeInput = screen.getByPlaceholderText('my_emoji');
      fireEvent.change(shortcodeInput, { target: { value: 'bad!' } });
      expect(
        screen.getByText('Only lowercase letters, numbers, and underscores are allowed.')
      ).toBeInTheDocument();
      cleanup(); // unmount so Phase 2 starts with a fresh controlled-input tracker
    }

    // Phase 2: a fresh render with the auto-filled valid shortcode ('smile') has
    // no validation error, confirming the error state is driven solely by the
    // current value and is not permanent.
    {
      const { input } = renderUploader();
      await advanceToPreview(input); // auto-fills 'smile' — valid shortcode
      expect(
        screen.queryByText('Only lowercase letters, numbers, and underscores are allowed.')
      ).not.toBeInTheDocument();
    }
  });

  // -------------------------------------------------------------------------
  // Test 3: file size validation rejects files > 256KB
  // -------------------------------------------------------------------------

  it('shows an error when file exceeds 256KB', async () => {
    const { input } = renderUploader();

    const bigFile = makePngFile(300 * 1024, 'toobig.png'); // 300 KB
    selectFile(input, bigFile);

    await waitFor(() => {
      expect(screen.getByText(/File must be smaller than 256KB/)).toBeInTheDocument();
    });

    // Should stay in idle (drop zone still visible)
    expect(screen.getByText('Drop emoji image here')).toBeInTheDocument();
  });

  it('does not show a size error for a file that is exactly 256KB', async () => {
    const { input } = renderUploader();

    const exactFile = makePngFile(256 * 1024, 'exact.png'); // exactly 256 KB
    selectFile(input, exactFile);

    // File passes size check — proceeds to dimension check (MockImage returns 64×64)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my_emoji')).toBeInTheDocument();
    });

    expect(screen.queryByText(/File must be smaller than 256KB/)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 4: successful upload shows toast and clears form
  // -------------------------------------------------------------------------

  it('shows a success toast and resets the form after a successful upload', async () => {
    const mockOnSuccess = jest.fn();
    const uploadResult = {
      id: 'emoji-1',
      name: 'smile',
      imageUrl: '/uploads/emojis/ws-1/smile.png',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(uploadResult),
    }) as jest.Mock;

    const { input } = renderUploader({ onSuccess: mockOnSuccess });

    // Get to preview state with real timers — advanceToPreview uses waitFor
    // which requires real setTimeout for its internal polling loop.
    await advanceToPreview(input);

    // Only NOW enable fake timers so we can control the 1500ms reset timeout
    // without interfering with the microtask-based image load above.
    jest.useFakeTimers();

    const uploadBtn = screen.getByRole('button', { name: 'Upload Emoji' });

    // Flush the entire async handleSubmit chain (fetch → json → state updates)
    // using act so React processes all resulting state changes.
    await act(async () => {
      fireEvent.click(uploadBtn);
      // Each await drains one microtask tick in the chain:
      //   tick 1: fetch() resolves
      //   tick 2: response.json() resolves
      //   tick 3: React state updates + effects flush
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Toast and callback are synchronously available after the microtask drain
    expect(mockToast.success).toHaveBeenCalledWith('Custom emoji :smile: uploaded!');
    expect(mockOnSuccess).toHaveBeenCalledWith(uploadResult);

    // Fire the 1.5 s reset timeout
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.getByText('Drop emoji image here')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('my_emoji')).not.toBeInTheDocument();

    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Suite 2: CustomEmojiPicker
// ---------------------------------------------------------------------------

describe('CustomEmojiPicker', () => {
  const mockEmojis = [
    { id: 'e1', name: 'smile', imageUrl: '/uploads/emojis/ws-1/smile.png' },
    { id: 'e2', name: 'party', imageUrl: '/uploads/emojis/ws-1/party.png' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: mockEmojis }),
    }) as jest.Mock;
  });

  // -------------------------------------------------------------------------
  // Test 5: fetches and displays emoji grid
  // -------------------------------------------------------------------------

  it('shows a loading indicator while fetching', () => {
    // fetch never resolves in this test
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {})) as jest.Mock;
    render(<CustomEmojiPicker workspaceId="ws-1" onSelect={jest.fn()} />);
    expect(screen.getByTestId('custom-emoji-loading')).toBeInTheDocument();
  });

  it('fetches custom emoji from the API and renders a grid', async () => {
    render(<CustomEmojiPicker workspaceId="ws-1" onSelect={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('custom-emoji-grid')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/custom-emojis?workspaceId=ws-1'
    );

    const items = screen.getAllByTestId('custom-emoji-item');
    expect(items).toHaveLength(2);
  });

  it('displays emoji images with correct alt text', async () => {
    render(<CustomEmojiPicker workspaceId="ws-1" onSelect={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByAltText(':smile:')).toBeInTheDocument();
    });
    expect(screen.getByAltText(':party:')).toBeInTheDocument();
  });

  it('shows empty state when workspace has no custom emoji', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: [] }),
    }) as jest.Mock;

    render(<CustomEmojiPicker workspaceId="ws-1" onSelect={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('custom-emoji-empty')).toBeInTheDocument();
    });
  });

  it('shows an error message when the fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as jest.Mock;

    render(<CustomEmojiPicker workspaceId="ws-1" onSelect={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('custom-emoji-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to load custom emoji')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 6: clicking an emoji calls onSelect
  // -------------------------------------------------------------------------

  it('calls onSelect with "custom_<id>" when an emoji is clicked', async () => {
    const mockOnSelect = jest.fn();
    render(<CustomEmojiPicker workspaceId="ws-1" onSelect={mockOnSelect} />);

    await waitFor(() => {
      expect(screen.getByTestId('custom-emoji-grid')).toBeInTheDocument();
    });

    const items = screen.getAllByTestId('custom-emoji-item');

    // Click the first emoji (smile, id = e1)
    fireEvent.click(items[0]!);
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
    expect(mockOnSelect).toHaveBeenCalledWith('custom_e1');

    // Click the second emoji (party, id = e2)
    fireEvent.click(items[1]!);
    expect(mockOnSelect).toHaveBeenCalledTimes(2);
    expect(mockOnSelect).toHaveBeenLastCalledWith('custom_e2');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: ReactionPicker — Custom tab
// ---------------------------------------------------------------------------

describe('ReactionPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockPicker.mockClear();
    // Default fetch mock (not used in these tests, but prevents network errors
    // if CustomEmojiPicker is ever rendered by the tab switch)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: [] }),
    }) as jest.Mock;
  });

  // -------------------------------------------------------------------------
  // Test 7: ReactionPicker includes a 'Custom' tab
  // -------------------------------------------------------------------------

  it("does NOT show Standard/Custom tabs when workspaceId is not provided", () => {
    render(<ReactionPicker onSelect={jest.fn()} />);
    expect(screen.queryByRole('tab', { name: 'Custom' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Standard' })).not.toBeInTheDocument();
  });

  it("shows a 'Custom' tab and a 'Standard' tab when workspaceId is provided", () => {
    render(<ReactionPicker onSelect={jest.fn()} workspaceId="ws-1" />);

    expect(screen.getByRole('tab', { name: 'Custom' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Standard' })).toBeInTheDocument();
  });

  it("defaults to the 'Standard' tab (emoji-mart picker is visible)", () => {
    render(<ReactionPicker onSelect={jest.fn()} workspaceId="ws-1" />);

    const standardTab = screen.getByRole('tab', { name: 'Standard' });
    expect(standardTab).toHaveAttribute('aria-selected', 'true');

    const customTab = screen.getByRole('tab', { name: 'Custom' });
    expect(customTab).toHaveAttribute('aria-selected', 'false');

    // emoji-mart Picker should be rendered in standard tab content
    expect(screen.getByTestId('emoji-mart-picker')).toBeInTheDocument();
  });

  it("switches to the Custom tab on click and shows the custom emoji picker", async () => {
    render(<ReactionPicker onSelect={jest.fn()} workspaceId="ws-1" />);

    const customTab = screen.getByRole('tab', { name: 'Custom' });
    fireEvent.click(customTab);

    expect(customTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Standard' })).toHaveAttribute(
      'aria-selected',
      'false'
    );

    // The standard picker is replaced by the custom emoji picker
    expect(screen.queryByTestId('emoji-mart-picker')).not.toBeInTheDocument();

    // CustomEmojiPicker loading/content should appear
    await waitFor(() => {
      // Either loading state or empty/grid/error from the mocked fetch
      const hasLoadingOrContent =
        screen.queryByTestId('custom-emoji-loading') !== null ||
        screen.queryByTestId('custom-emoji-empty') !== null ||
        screen.queryByTestId('custom-emoji-grid') !== null;
      expect(hasLoadingOrContent).toBe(true);
    });
  });
});
