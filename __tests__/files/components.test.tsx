/**
 * @jest-environment jsdom
 */

/**
 * Tests for file upload UI components:
 * - FileUploader: drop zone, file selection, validation, progress
 * - FileAttachmentRow: file icon, name, size, download link
 * - ImageThumbnail: thumbnail rendering, lightbox, lazy loading
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Upload: (props: any) => <svg data-testid="upload-icon" {...props} />,
  X: (props: any) => <svg data-testid="x-icon" {...props} />,
  CheckCircle: (props: any) => <svg data-testid="check-icon" {...props} />,
  AlertCircle: (props: any) => <svg data-testid="alert-icon" {...props} />,
  AlertTriangle: (props: any) => <svg data-testid="alert-triangle-icon" {...props} />,
  FileText: (props: any) => <svg data-testid="file-text-icon" {...props} />,
  FileArchive: (props: any) => <svg data-testid="file-archive-icon" {...props} />,
  File: (props: any) => <svg data-testid="file-icon" {...props} />,
  Download: (props: any) => <svg data-testid="download-icon" {...props} />,
}));

// Mock shared/lib/utils
jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
  formatFileSize: (bytes: number) => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[i]}`;
  },
}));

// Mock constants
jest.mock('../../shared/lib/constants', () => ({
  MAX_FILE_SIZE: 10 * 1024 * 1024,
}));

// Mock files/types
jest.mock('../../files/types', () => ({
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/zip',
  ],
  isAllowedMimeType: (mimeType: string) =>
    [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/zip',
    ].includes(mimeType),
}));

// Import components after mocks
import { FileUploader } from '../../files/components/FileUploader';
import { FileAttachmentRow } from '../../files/components/FileAttachmentRow';
import { ImageThumbnail } from '../../files/components/ImageThumbnail';
import type { FileAttachment } from '../../shared/types';

// ---------------------------------------------------------------------------
// FileUploader Tests
// ---------------------------------------------------------------------------

describe('FileUploader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders drop zone with upload message', () => {
    render(<FileUploader />);

    expect(
      screen.getByText('Drag files here or click to upload')
    ).toBeInTheDocument();
    expect(screen.getByText(/Max.*MB per file/)).toBeInTheDocument();
  });

  it('renders hidden file input', () => {
    render(<FileUploader />);

    const input = screen.getByLabelText('Upload files');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveClass('hidden');
  });

  it('renders with multiple attribute by default', () => {
    render(<FileUploader />);

    const input = screen.getByLabelText('Upload files');
    expect(input).toHaveAttribute('multiple');
  });

  it('supports single file mode', () => {
    render(<FileUploader multiple={false} />);

    const input = screen.getByLabelText('Upload files');
    expect(input).not.toHaveAttribute('multiple');
  });

  it('accepts custom className', () => {
    const { container } = render(<FileUploader className="custom-class" />);

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('opens file picker on click', () => {
    render(<FileUploader />);

    const dropZone = screen.getByRole('button');
    const input = screen.getByLabelText('Upload files') as HTMLInputElement;
    const clickSpy = jest.spyOn(input, 'click');

    fireEvent.click(dropZone);

    expect(clickSpy).toHaveBeenCalled();
  });

  it('opens file picker on Enter key', () => {
    render(<FileUploader />);

    const dropZone = screen.getByRole('button');
    const input = screen.getByLabelText('Upload files') as HTMLInputElement;
    const clickSpy = jest.spyOn(input, 'click');

    fireEvent.keyDown(dropZone, { key: 'Enter' });

    expect(clickSpy).toHaveBeenCalled();
  });

  it('opens file picker on Space key', () => {
    render(<FileUploader />);

    const dropZone = screen.getByRole('button');
    const input = screen.getByLabelText('Upload files') as HTMLInputElement;
    const clickSpy = jest.spyOn(input, 'click');

    fireEvent.keyDown(dropZone, { key: ' ' });

    expect(clickSpy).toHaveBeenCalled();
  });

  it('shows error for files exceeding size limit', async () => {
    render(<FileUploader />);

    const input = screen.getByLabelText('Upload files') as HTMLInputElement;
    const oversizedFile = new File(['x'], 'big.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(oversizedFile, 'size', {
      value: 11 * 1024 * 1024,
    });

    Object.defineProperty(input, 'files', {
      value: [oversizedFile],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/too large/)).toBeInTheDocument();
    });
  });

  it('shows error for disallowed MIME types', async () => {
    render(<FileUploader />);

    const input = screen.getByLabelText('Upload files') as HTMLInputElement;
    const badFile = new File(['x'], 'script.js', {
      type: 'application/javascript',
    });

    Object.defineProperty(input, 'files', {
      value: [badFile],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/unsupported file type/)).toBeInTheDocument();
    });
  });

  it('shows error for files with empty MIME type', async () => {
    render(<FileUploader />);

    const input = screen.getByLabelText('Upload files') as HTMLInputElement;
    const badFile = new File(['x'], 'mystery', { type: '' });

    Object.defineProperty(input, 'files', {
      value: [badFile],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/unsupported file type/)).toBeInTheDocument();
    });
  });

  it('allows dismissing errors', async () => {
    render(<FileUploader />);

    const input = screen.getByLabelText('Upload files') as HTMLInputElement;
    const badFile = new File(['x'], 'script.js', {
      type: 'application/javascript',
    });

    Object.defineProperty(input, 'files', {
      value: [badFile],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/unsupported file type/)).toBeInTheDocument();
    });

    const dismissBtn = screen.getByLabelText('Dismiss error');
    fireEvent.click(dismissBtn);

    expect(screen.queryByText(/unsupported file type/)).not.toBeInTheDocument();
  });

  it('sets drag state on dragEnter', () => {
    render(<FileUploader />);

    const dropZone = screen.getByRole('button');

    fireEvent.dragEnter(dropZone);

    // The dropzone should get the dragging styles (blue border)
    expect(dropZone.className).toContain('border-blue-500');
  });

  it('handles drop event with files', async () => {
    // Mock XMLHttpRequest
    const xhrMock = {
      open: jest.fn(),
      send: jest.fn(),
      upload: { addEventListener: jest.fn() },
      addEventListener: jest.fn(),
      status: 200,
      responseText: JSON.stringify({
        ok: true,
        data: {
          id: 'file-1',
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          url: '/uploads/test.pdf',
        },
      }),
    };
    (global as any).XMLHttpRequest = jest.fn(() => xhrMock);

    render(<FileUploader />);

    const dropZone = screen.getByRole('button');
    const testFile = new File(['content'], 'test.pdf', {
      type: 'application/pdf',
    });

    const dataTransfer = {
      files: [testFile],
      items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => testFile }],
      types: ['Files'],
    };

    fireEvent.drop(dropZone, { dataTransfer });

    // Should have initiated XHR upload
    await waitFor(() => {
      expect(xhrMock.open).toHaveBeenCalledWith('POST', '/api/files');
      expect(xhrMock.send).toHaveBeenCalled();
    });
  });

  it('sets accept attribute from ALLOWED_MIME_TYPES', () => {
    render(<FileUploader />);

    const input = screen.getByLabelText('Upload files');
    const accept = input.getAttribute('accept');

    expect(accept).toContain('image/jpeg');
    expect(accept).toContain('application/pdf');
  });

  it('supports custom accept attribute', () => {
    render(<FileUploader accept="image/*" />);

    const input = screen.getByLabelText('Upload files');
    expect(input).toHaveAttribute('accept', 'image/*');
  });
});

// ---------------------------------------------------------------------------
// FileAttachmentRow Tests
// ---------------------------------------------------------------------------

describe('FileAttachmentRow', () => {
  const basePdfFile: FileAttachment = {
    id: 'file-1',
    name: 'document.pdf',
    url: '/uploads/uuid-document.pdf',
    size: 2_500_000,
    mimeType: 'application/pdf',
    width: null,
    height: null,
  };

  const baseTextFile: FileAttachment = {
    id: 'file-2',
    name: 'readme.txt',
    url: '/uploads/uuid-readme.txt',
    size: 1024,
    mimeType: 'text/plain',
    width: null,
    height: null,
  };

  const baseZipFile: FileAttachment = {
    id: 'file-3',
    name: 'archive.zip',
    url: '/uploads/uuid-archive.zip',
    size: 5_000_000,
    mimeType: 'application/zip',
    width: null,
    height: null,
  };

  const baseGenericFile: FileAttachment = {
    id: 'file-4',
    name: 'data.csv',
    url: '/uploads/uuid-data.csv',
    size: 500,
    mimeType: 'text/csv',
    width: null,
    height: null,
  };

  it('renders filename', () => {
    render(<FileAttachmentRow file={basePdfFile} />);

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  it('renders formatted file size', () => {
    render(<FileAttachmentRow file={basePdfFile} />);

    // 2.5MB should be formatted
    expect(screen.getByText(/2\.4 MB/)).toBeInTheDocument();
  });

  it('renders FileText icon for PDF files', () => {
    render(<FileAttachmentRow file={basePdfFile} />);

    expect(screen.getByTestId('file-text-icon')).toBeInTheDocument();
  });

  it('renders FileText icon for text files', () => {
    render(<FileAttachmentRow file={baseTextFile} />);

    expect(screen.getByTestId('file-text-icon')).toBeInTheDocument();
  });

  it('renders FileArchive icon for ZIP files', () => {
    render(<FileAttachmentRow file={baseZipFile} />);

    expect(screen.getByTestId('file-archive-icon')).toBeInTheDocument();
  });

  it('renders generic File icon for unknown types', () => {
    render(<FileAttachmentRow file={baseGenericFile} />);

    expect(screen.getByTestId('file-icon')).toBeInTheDocument();
  });

  it('shows PDF type label', () => {
    render(<FileAttachmentRow file={basePdfFile} />);

    expect(screen.getByText(/PDF/)).toBeInTheDocument();
  });

  it('shows Text type label', () => {
    render(<FileAttachmentRow file={baseTextFile} />);

    expect(screen.getByText(/Text/)).toBeInTheDocument();
  });

  it('shows ZIP type label', () => {
    render(<FileAttachmentRow file={baseZipFile} />);

    expect(screen.getByText(/ZIP/)).toBeInTheDocument();
  });

  it('shows generic File type label for unknown types', () => {
    render(<FileAttachmentRow file={baseGenericFile} />);

    expect(screen.getByText(/File/)).toBeInTheDocument();
  });

  it('renders download link with correct href', () => {
    render(<FileAttachmentRow file={basePdfFile} />);

    const downloadLink = screen.getByLabelText('Download document.pdf');
    expect(downloadLink).toHaveAttribute('href', '/uploads/uuid-document.pdf');
    expect(downloadLink).toHaveAttribute('download', 'document.pdf');
  });

  it('download link has correct filename in download attribute', () => {
    render(<FileAttachmentRow file={baseZipFile} />);

    const downloadLink = screen.getByLabelText('Download archive.zip');
    expect(downloadLink).toHaveAttribute('download', 'archive.zip');
  });

  it('accepts custom className', () => {
    const { container } = render(
      <FileAttachmentRow file={basePdfFile} className="my-custom" />
    );

    expect(container.firstChild).toHaveClass('my-custom');
  });

  it('renders small file sizes correctly', () => {
    render(<FileAttachmentRow file={baseGenericFile} />);

    expect(screen.getByText(/500 B/)).toBeInTheDocument();
  });

  it('renders KB file sizes correctly', () => {
    render(<FileAttachmentRow file={baseTextFile} />);

    expect(screen.getByText(/1 KB/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ImageThumbnail Tests
// ---------------------------------------------------------------------------

describe('ImageThumbnail', () => {
  const imageFile: FileAttachment = {
    id: 'img-1',
    name: 'photo.jpg',
    url: '/uploads/uuid-photo.jpg',
    size: 500_000,
    mimeType: 'image/jpeg',
    width: 800,
    height: 600,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders thumbnail image with correct src', () => {
    render(<ImageThumbnail file={imageFile} />);

    const img = screen.getByAltText('photo.jpg');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/uploads/uuid-photo.jpg');
  });

  it('has lazy loading attribute', () => {
    render(<ImageThumbnail file={imageFile} />);

    const img = screen.getByAltText('photo.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('renders clickable button to open lightbox', () => {
    render(<ImageThumbnail file={imageFile} />);

    const button = screen.getByLabelText('View full image: photo.jpg');
    expect(button).toBeInTheDocument();
  });

  it('opens lightbox on click', () => {
    render(<ImageThumbnail file={imageFile} />);

    const button = screen.getByLabelText('View full image: photo.jpg');
    fireEvent.click(button);

    // Lightbox should be open — look for the dialog
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('shows full-size image in lightbox', () => {
    render(<ImageThumbnail file={imageFile} />);

    const button = screen.getByLabelText('View full image: photo.jpg');
    fireEvent.click(button);

    // Should have two images now: thumbnail + full-size
    const images = screen.getAllByAltText('photo.jpg');
    expect(images.length).toBe(2);
  });

  it('closes lightbox on close button click', () => {
    render(<ImageThumbnail file={imageFile} />);

    // Open lightbox
    fireEvent.click(screen.getByLabelText('View full image: photo.jpg'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Close it
    fireEvent.click(screen.getByLabelText('Close lightbox'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes lightbox on backdrop click', () => {
    render(<ImageThumbnail file={imageFile} />);

    // Open lightbox
    fireEvent.click(screen.getByLabelText('View full image: photo.jpg'));

    // Click backdrop
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes lightbox on Escape key', () => {
    render(<ImageThumbnail file={imageFile} />);

    // Open lightbox
    fireEvent.click(screen.getByLabelText('View full image: photo.jpg'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not close lightbox when clicking on the full-size image', () => {
    render(<ImageThumbnail file={imageFile} />);

    // Open lightbox
    fireEvent.click(screen.getByLabelText('View full image: photo.jpg'));

    // Click on full-size image (should stopPropagation)
    const images = screen.getAllByAltText('photo.jpg');
    const fullSizeImg = images[images.length - 1]; // last one is lightbox image
    fireEvent.click(fullSizeImg);

    // Lightbox should still be open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows loading placeholder before image loads', () => {
    render(<ImageThumbnail file={imageFile} />);

    const img = screen.getByAltText('photo.jpg');
    // Before onLoad fires, the image should have opacity-0 class
    expect(img.className).toContain('opacity-0');
  });

  it('shows image after it loads', () => {
    render(<ImageThumbnail file={imageFile} />);

    const img = screen.getByAltText('photo.jpg');
    fireEvent.load(img);

    expect(img.className).toContain('opacity-100');
  });

  it('prevents body scroll when lightbox is open', () => {
    render(<ImageThumbnail file={imageFile} />);

    fireEvent.click(screen.getByLabelText('View full image: photo.jpg'));
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByLabelText('Close lightbox'));
    expect(document.body.style.overflow).toBe('');
  });

  it('accepts custom className', () => {
    render(<ImageThumbnail file={imageFile} className="my-custom" />);

    const button = screen.getByLabelText('View full image: photo.jpg');
    expect(button.className).toContain('my-custom');
  });

  it('has correct aria-label on lightbox dialog', () => {
    render(<ImageThumbnail file={imageFile} />);

    fireEvent.click(screen.getByLabelText('View full image: photo.jpg'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Full image: photo.jpg');
  });
});
