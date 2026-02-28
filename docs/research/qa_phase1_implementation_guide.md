# Phase 1 Implementation Guide - Critical QA Fixes

**Target**: Fix 3 blocking issues in 2-3 hours
**Scope**: Error boundaries + unhandled promises + loading states
**Prerequisites**: Familiarity with React hooks, error handling

---

## Issue #1: Missing Error Boundaries (2-3 hours)

### Overview
Currently, if any component throws an error, the entire app crashes. Error boundaries catch these and display a fallback UI.

### Step 1: Create Error Boundary Component

**File**: `components/ErrorBoundary.tsx` (NEW)

```tsx
'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  level?: 'app' | 'page' | 'component'; // For different error messages
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console for debugging
    console.error('Error caught by boundary:', error, errorInfo);

    // TODO: Log to error tracking service (Sentry, LogRocket, etc)
    // sentry.captureException(error, { contexts: { react: errorInfo } });

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Also try to reload the page for persistent issues
    // window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isDev = process.env.NODE_ENV === 'development';
      const { level = 'component' } = this.props;

      const messages: Record<string, string> = {
        app: 'The application encountered a critical error. Please refresh the page.',
        page: 'This page encountered an error. Try refreshing or going back.',
        component: 'This component failed to load. Try the action again.',
      };

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
          <div className="max-w-md w-full">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-red-100 dark:bg-red-900 mb-4 mx-auto">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>

            <h1 className="text-2xl font-bold text-center mb-2">
              {level === 'app' ? 'Application Error' : 'Something went wrong'}
            </h1>

            <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
              {messages[level]}
            </p>

            {isDev && this.state.error && (
              <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg max-h-48 overflow-auto">
                <p className="text-sm font-mono text-red-600 dark:text-red-400 mb-2">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <p className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                onClick={this.handleReset}
                variant="default"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>

              {level === 'app' && (
                <Button
                  onClick={() => {
                    window.location.href = '/';
                  }}
                  variant="outline"
                >
                  Go Home
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Step 2: Update Root Layout

**File**: `app/layout.tsx` (MODIFY)

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { MotionProvider } from '@/components/providers/motion-provider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Slack Clone',
  description: 'A real-time team messaging platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ErrorBoundary level="app">
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <MotionProvider>
              {children}
            </MotionProvider>
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
```

### Step 3: Update App Layout

**File**: `app/(app)/layout.tsx` (MODIFY)

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary level="page">
      {/* Your existing layout content */}
      {children}
    </ErrorBoundary>
  );
}
```

**Tests to run**:
```bash
# 1. Render without errors
npm run build

# 2. Manually test: Add error throw in a component to verify boundary catches it
# 3. In dev mode, you should see error details
# 4. Test "Try Again" button resets the boundary
```

---

## Issue #2: Unhandled Promise Rejections (2-3 hours)

### Pattern Overview
Several `.catch()` handlers silently swallow errors. These need proper error logging and user feedback.

### Fix #2.1: Audio Context Errors

**File**: `calls/hooks/useAudioLevel.ts` (MODIFY)

**Before (lines 54-57)**:
```tsx
const audioContext = new AudioContextClass();
if (audioContext.state === 'suspended') {
  audioContext.resume().catch(() => {}); // ❌ Silent error
}
```

**After**:
```tsx
const audioContext = new AudioContextClass();
if (audioContext.state === 'suspended') {
  audioContext.resume().catch((err) => {
    console.warn('Failed to resume audio context:', err);
    // Note: Don't show toast here as it's not user-initiated
    // This is background audio setup, not a direct action
  });
}
```

**Before (line 110)**:
```tsx
audioContextRef.current?.close().catch(() => {}); // ❌ Silent error
```

**After**:
```tsx
audioContextRef.current?.close().catch((err) => {
  // This is cleanup, log for debugging but don't alarm user
  if (err instanceof Error) {
    console.warn('Error closing audio context:', err.message);
  }
});
```

---

### Fix #2.2: WebRTC Track Replacement

**File**: `calls/hooks/useCall.ts` (MODIFY)

**Before (line 451)**:
```tsx
sender.replaceTrack(cameraTrack).catch(console.error); // ⚠️ Only console, no user feedback
```

**After**:
```tsx
sender.replaceTrack(cameraTrack).catch((err) => {
  console.error('Failed to replace video track:', err);
  // Show user-facing error since this is a direct action
  toast.error('Failed to switch camera');
});
```

---

### Fix #2.3: Emoji Manager Delete

**File**: `workspaces/components/EmojiManager.tsx` (MODIFY)

**Before (lines 44-49)**:
```tsx
if (!response.ok) {
  const data = await response.json().catch(() => ({ error: 'Delete failed' })); // ❌ Swallows actual error
  throw new Error(data.error ?? 'Delete failed');
}
```

**After**:
```tsx
if (!response.ok) {
  let errorMessage = 'Failed to delete emoji';
  try {
    const data = await response.json();
    errorMessage = data.error ?? errorMessage;
  } catch (parseErr) {
    // If JSON parsing fails, log the issue but use generic message
    console.error('Failed to parse error response:', parseErr);
  }
  throw new Error(errorMessage);
}
```

**Also ensure the delete handler has try-catch**:
```tsx
const handleDelete = async (emojiId: string) => {
  try {
    setLoading(true);
    await deleteEmoji(emojiId); // Now has proper error from above
    setEmojis((prev) => prev.filter((e) => e.id !== emojiId));
    toast.success('Emoji deleted');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete emoji';
    toast.error(message);
    console.error('Delete emoji error:', err);
  } finally {
    setLoading(false);
  }
};
```

---

### Fix #2.4: Emoji Uploader

**File**: `workspaces/components/EmojiUploader.tsx` (MODIFY)

Same pattern as Emoji Manager—improve error parsing and add toast feedback:

```tsx
if (!response.ok) {
  let errorMessage = 'Failed to upload emoji';
  try {
    const data = await response.json();
    errorMessage = data.error ?? errorMessage;
  } catch (parseErr) {
    console.error('Failed to parse upload error:', parseErr);
  }
  throw new Error(errorMessage);
}
```

**Tests**:
```bash
# Test each fix:
# 1. Disable network in DevTools
# 2. Try the operation (audio resume, camera switch, emoji delete/upload)
# 3. Verify toast error appears (or no crash if background operation)
# 4. Check console for helpful error logs
```

---

## Issue #3: Missing Async Loading States (1-2 hours)

### Pattern Overview
When async operations run, show visual feedback so user knows something is happening.

### Fix #3.1: Right Panel DM Creation

**File**: `components/layout/RightPanel.tsx` (MODIFY)

**Before (lines 64-90)**:
```tsx
function MemberListContent() {
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const router = useRouter();

  const handleMessageClick = useCallback(async (targetUserId: string) => {
    if (!currentWorkspace) return;
    try {
      await openDM(currentWorkspace.id, targetUserId);
      // ❌ No loading state while navigation happens
      router.push(`/${currentWorkspace.slug}/dm/${targetUserId}`);
      router.refresh();
    } catch (err) {
```

**After**:
```tsx
function MemberListContent() {
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [creatingDM, setCreatingDM] = useState<string | null>(null); // ✅ Track which user
  const router = useRouter();

  const handleMessageClick = useCallback(async (targetUserId: string) => {
    if (!currentWorkspace) return;

    setCreatingDM(targetUserId); // ✅ Show loading for this user
    try {
      await openDM(currentWorkspace.id, targetUserId);
      router.push(`/${currentWorkspace.slug}/dm/${targetUserId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open DM');
      toast.error('Failed to open conversation');
    } finally {
      setCreatingDM(null); // ✅ Clear loading state
    }
  }, [currentWorkspace, router]);

  return (
    <>
      {members.map((member) => (
        <button
          key={member.id}
          onClick={() => handleMessageClick(member.userId)}
          disabled={creatingDM === member.userId} // ✅ Disable while loading
          className={cn(
            'w-full px-3 py-2 rounded text-left',
            creatingDM === member.userId && 'opacity-60 cursor-not-allowed'
          )}
        >
          {creatingDM === member.userId ? (
            <Loader2 className="w-4 h-4 animate-spin" /> // ✅ Show spinner
          ) : (
            member.user.name
          )}
        </button>
      ))}
    </>
  );
}
```

---

### Fix #3.2: Channel Settings Member Removal

**File**: `channels/components/ChannelSettings.tsx` (MODIFY)

**Before (lines 157-167)**:
```tsx
const handleRemoveMember = async (userId: string) => {
  setRemovingUserId(userId);
  try {
    await removeChannelMember(channelId, userId);
    router.refresh();
  } catch (err) {
    setError(
      err instanceof Error ? err.message : 'Failed to remove member'
    );
  } finally {
    setRemovingUserId(null); // ✅ Already has loading state!
  }
};
```

**Status**: This one already has `setRemovingUserId`! Just verify the UI uses it:

```tsx
<button
  onClick={() => handleRemoveMember(member.id)}
  disabled={removingUserId === member.id} // ✅ Verify this exists
  className="text-red-600 hover:text-red-700 disabled:opacity-50"
>
  {removingUserId === member.id ? (
    <Loader2 className="w-4 h-4 animate-spin" />
  ) : (
    'Remove'
  )}
</button>
```

**Action**: Just verify the disabled state and spinner are in place; add if missing.

---

### Fix #3.3: Emoji Manager Delete

**File**: `workspaces/components/EmojiManager.tsx` (MODIFY)

Add loading state:

```tsx
const [deletingId, setDeletingId] = useState<string | null>(null);

const handleDelete = async (emojiId: string) => {
  setDeletingId(emojiId); // ✅ Show loading
  try {
    await deleteEmoji(emojiId);
    setEmojis((prev) => prev.filter((e) => e.id !== emojiId));
    toast.success('Emoji deleted');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete';
    toast.error(message);
  } finally {
    setDeletingId(null); // ✅ Clear loading
  }
};

// In render:
<button
  onClick={() => handleDelete(emoji.id)}
  disabled={deletingId === emoji.id}
  className="text-red-500 hover:text-red-600 disabled:opacity-50"
>
  {deletingId === emoji.id ? (
    <Loader2 className="w-4 h-4 animate-spin" />
  ) : (
    <Trash2 className="w-4 h-4" />
  )}
</button>
```

---

## Testing Checklist

### Error Boundaries
- [ ] Component renders with error boundary
- [ ] When component throws, fallback UI shows
- [ ] "Try Again" button resets state
- [ ] Error details visible in dev mode only

### Promise Handling
- [ ] Disable network → operations show error toast
- [ ] Check browser console for error logs
- [ ] User-initiated actions show toast errors
- [ ] Background operations log but don't show toast

### Loading States
- [ ] Button disabled while operation runs
- [ ] Spinner/loader visible during operation
- [ ] State clears when operation completes
- [ ] Works with network throttling

### All Together
- [ ] No unhandled promise rejections in console
- [ ] No JavaScript errors in production
- [ ] All async operations have feedback
- [ ] Tests pass: `npm test`

---

## Time Estimate: 2-3 hours

| Task | Time | Notes |
|------|------|-------|
| Error Boundary component + integration | 45-60 min | Most important |
| Unhandled promise fixes | 45-60 min | 5 locations |
| Loading state additions | 30-45 min | 3-4 components |
| Testing & verification | 30 min | Manual + automated |

---

## After Completion

1. **Commit**: Create single commit for Phase 1
   ```bash
   git add .
   git commit -m "fix: Add error boundaries and handle unhandled promises

   - Add RootErrorBoundary and app-level error boundaries
   - Fix unhandled promise rejections in audio/WebRTC
   - Add loading states to async operations
   - Improve error user feedback with toasts"
   ```

2. **Test**: Run full test suite
   ```bash
   npm test
   npm run build
   ```

3. **Verify**: Manually test error scenarios
4. **Document**: Update QA issues catalog with completion status

---

**Created by**: Research Agent
**Date**: Feb 28, 2026
**Next Phase**: High-priority a11y + type safety fixes
