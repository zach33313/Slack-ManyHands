/**
 * app/api/files/route.ts
 *
 * POST /api/files — Upload a file.
 *
 * Parses multipart FormData, delegates to the uploadFile server action,
 * and returns a FileUploadResult wrapped in the standard API envelope.
 *
 * Files are served statically from /uploads/ via Next.js public directory,
 * so no GET handler is needed here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ok, err } from '@/shared/types/api';
import { uploadFile } from '@/files/actions';
import { FileValidationError } from '@/files/storage';
import { IS_DEMO, demoBlock } from '@/shared/lib/demo';

export async function POST(request: NextRequest) {
  if (IS_DEMO) return demoBlock('File uploads');
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        err('INVALID_CONTENT_TYPE', 'Expected multipart/form-data'),
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        err('MISSING_FILE', 'No file provided in form data'),
        { status: 400 }
      );
    }

    const result = await uploadFile(formData);

    return NextResponse.json(ok(result), { status: 201 });
  } catch (error) {
    if (error instanceof FileValidationError) {
      return NextResponse.json(
        err('VALIDATION_ERROR', error.message),
        { status: 413 }
      );
    }

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json(
          err('UNAUTHORIZED', 'Authentication required'),
          { status: 401 }
        );
      }

      console.error('File upload error:', error);
      return NextResponse.json(
        err('INTERNAL_ERROR', error.message),
        { status: 500 }
      );
    }

    console.error('Unknown file upload error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'An unexpected error occurred'),
      { status: 500 }
    );
  }
}
