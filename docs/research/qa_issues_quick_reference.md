# QA Issues - Quick Reference for Implementation Workers

**Use this guide to prioritize and fix issues systematically.**

---

## 🔴 CRITICAL - Fix NOW (Blocks Deployment)

### 1. Missing Error Boundaries
**Task**: Create and add error boundaries at root and app levels

**Files to modify**:
- `app/layout.tsx` - Wrap providers in `<RootErrorBoundary>`
- `app/(app)/layout.tsx` - Add app-level error boundary

**Code template**:
```tsx
'use client';

import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function Layout({ children }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  );
}
```

**Create file**: `components/ErrorBoundary.tsx` (150-200 lines)
- Use React.ErrorBoundary or external library (react-error-boundary)
- Log errors to console/Sentry
- Show fallback UI with retry button

**Est. Effort**: 2-3 hours | **Priority**: P0 | **Owner**: assign first

---

### 2. Unhandled Promise Rejections
**Task**: Add error handling to all `.catch()` and async operations

**Locations**:
| File | Line | Issue | Fix |
|------|------|-------|-----|
| `calls/hooks/useAudioLevel.ts` | 56 | `audioContext.resume().catch(() => {})` | Log + show user toast |
| `calls/hooks/useAudioLevel.ts` | 110 | `close().catch(() => {})` | Log error for debugging |
| `calls/hooks/useCall.ts` | 451 | `replaceTrack().catch(console.error)` | Show toast on failure |
| `workspaces/components/EmojiManager.tsx` | 46 | JSON parse swallowed | Log actual error |
| `workspaces/components/EmojiUploader.tsx` | 47 | JSON parse swallowed | Log actual error |

**Code template**:
```tsx
// BAD
.catch(() => {})

// GOOD
.catch((err) => {
  console.error('Operation failed:', err);
  toast.error('Failed to perform action');
})
```

**Est. Effort**: 2-3 hours | **Priority**: P0 | **Blocker**: Yes

---

### 3. Missing Async Loading States
**Task**: Add visual feedback for async operations

**Quick wins**:
1. `components/layout/RightPanel.tsx:74` - DM creation
2. `channels/components/ChannelSettings.tsx:157` - Member removal
3. `workspaces/components/EmojiManager.tsx` - Emoji delete
4. `workspaces/components/EmojiUploader.tsx` - Upload

**Pattern**:
```tsx
const [isLoading, setIsLoading] = useState(false);

const handleClick = async () => {
  setIsLoading(true);
  try {
    await operation();
  } catch (err) {
    toast.error('Failed');
  } finally {
    setIsLoading(false);
  }
};

return <button disabled={isLoading}>{isLoading ? 'Loading...' : 'Action'}</button>;
```

**Est. Effort**: 2-3 hours | **Priority**: P0

---

## 🟠 HIGH - Fix Before Beta (6-8 hours)

### 1. Accessibility Issues
**Quick wins list** (20+ components):

**Add aria-label to buttons**:
```tsx
// Before
<button onClick={toggleStar}><Star size={20} /></button>

// After
<button
  aria-label="Star this channel"
  title="Star this channel"
  onClick={toggleStar}
>
  <Star size={20} />
</button>
```

**Affected files**:
- `components/editor/EditorToolbar.tsx` - Format buttons
- `components/layout/ChannelSidebar.tsx` - All action buttons
- `components/ThemePicker.tsx` - Theme toggles
- `messages/components/ReactionPicker.tsx` - Emoji picker

**Est. Effort**: 3-4 hours | **Priority**: P1 | **Type**: Mechanical

---

### 2. Type Safety
**Task**: Improve error typing and null checks

**Files**:
- All components with `catch (err)` → `catch (err: unknown)`
- `components/layout/RightPanel.tsx` → Add null checks before using optional values

**Pattern**:
```tsx
// Before
catch (err) {
  const message = err instanceof Error ? err.message : 'Failed';
}

// After
catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
}
```

**Est. Effort**: 2-3 hours | **Priority**: P1

---

## 🟡 MEDIUM - Fix This Sprint (6-8 hours)

### 1. ESLint Disable Review
**Action**: Don't remove—document why each is needed

**Files**:
- `server/socket-emitter.ts`, `server.ts` - Document global necessity
- `components/layout/*` - Document why deps are omitted
- Add comment explaining each `eslint-disable` line

**Pattern**:
```tsx
// eslint-disable-next-line react-hooks/exhaustive-deps
// intentional: socket reference changes but we want stable effect
```

**Est. Effort**: 1-2 hours | **Priority**: P2

---

### 2. Console.log Cleanup
**Action**: Use automated replacement

**Command**:
```bash
# Find all console logs
grep -r "console\.\(log\|warn\|error\)" --include="*.tsx" --include="*.ts" src/

# Replace with proper logging or remove
# Consider: winston, pino, or just remove debug logs
```

**Est. Effort**: 2-3 hours (batched) | **Priority**: P2

---

### 3. Hardcoded Strings Extraction
**Action**: Move magic strings to constants

**Files to create**:
- `shared/lib/constants.ts` - Add error messages, timeouts, limits

**Pattern**:
```tsx
// Before
catch (err) {
  setError('Failed to update channel');
}

// After
catch (err) {
  setError(ERROR_MESSAGES.CHANNEL_UPDATE_FAILED);
}
```

**Est. Effort**: 2-3 hours | **Priority**: P2

---

## 📋 Implementation Checklist

### Phase 1 (TODAY - 2-3 hours)
- [ ] Create `components/ErrorBoundary.tsx`
- [ ] Add to `app/layout.tsx` and `app/(app)/layout.tsx`
- [ ] Fix 5 unhandled promise rejection sites
- [ ] Add loading states to 3-4 components
- [ ] Run tests, verify no crashes

### Phase 2 (THIS WEEK - 6-8 hours)
- [ ] Add `aria-label` to 20+ buttons/inputs
- [ ] Add `title` attributes for tooltips
- [ ] Fix type safety (error typing, null checks)
- [ ] Add comments to ESLint disables
- [ ] Update any broken tests

### Phase 3 (NEXT SPRINT - 6-8 hours)
- [ ] Extract hardcoded strings
- [ ] Remove console logs
- [ ] Set up error logging (Sentry/etc)
- [ ] Add more comprehensive error boundaries

---

## 🚀 Quick Start Commands

### Check Progress
```bash
# Find all eslint-disable comments
grep -r "eslint-disable" --include="*.tsx" --include="*.ts"

# Find all .catch() patterns
grep -r "\.catch" --include="*.tsx" --include="*.ts"

# Find missing aria-label on buttons
grep -r "<button" --include="*.tsx" -A1 | grep -v "aria-label"
```

### Run Tests
```bash
# Before and after fixing
npm test -- --coverage

# Check accessibility
npm run lint -- --max-warnings=0
```

---

## 📞 Questions?

- **For error handling patterns**: See `messages/components/MessageActions.tsx` for reference
- **For accessibility**: Check `files/components/ImageThumbnail.tsx` for aria-label patterns
- **For loading states**: Check `components/ui/SkeletonMessage.tsx` for skeleton patterns

---

## 📊 Tracking Progress

Use this table to track completion:

| Issue ID | Component | Status | Owner | Notes |
|----------|-----------|--------|-------|-------|
| 1.1.1 | ErrorBoundary | ⬜ TODO | - | Block all others |
| 2.1.1 | useAudioLevel | ⬜ TODO | - | After EB |
| 2.2.1 | RightPanel | ⬜ TODO | - | After EB |
| 3.2.1 | aria-labels | ⬜ TODO | - | Parallel work |
| 3.4.1 | Type Safety | ⬜ TODO | - | Parallel work |

**Status Legend**: ⬜ TODO | 🟨 IN PROGRESS | ✅ DONE

---

**Last Updated**: Feb 28, 2026
