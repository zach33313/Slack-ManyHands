# UX Issues Audit: Native Browser Dialogs & Component Issues

**Date**: February 2026
**Status**: Complete Audit with Fix Strategies
**Scope**: Native browser dialogs, hydration issues, React dependency array problems

---

## Executive Summary

This audit identified **9 instances of native browser dialogs** (`confirm()`, `prompt()`, `alert()`), **2 hydration-related issues**, and **1 React dependency array issue** that degrade user experience and violate modern UI best practices.

### Key Findings

| Category | Count | Severity | Impact |
|----------|-------|----------|--------|
| Native Browser Dialogs | 9 | High | Unstyled, blocks main thread, poor mobile UX |
| Hydration Mismatches | 2 | Medium | Inconsistent SSR/Client rendering |
| Dependency Array Issues | 1 | Medium | Stale closures, missing dependencies |
| Existing Dialog Components | 6+ | N/A | Already available for use |

---

## 1. NATIVE BROWSER DIALOGS (9 INSTANCES)

### Problem Statement

Native browser dialogs (`window.confirm()`, `window.prompt()`, `window.alert()`) are:
- **Unstyled**: Don't match application theming
- **Blocking**: Stop execution until user responds
- **Poor UX**: No animation, inflexible buttons, bad mobile experience
- **Inaccessible**: Limited ARIA support, no custom styling
- **Unprofessional**: Look like browser chrome, not app UI

### Instances Found

#### 1.1 Canvas Editor - URL Prompt
**File**: `canvas/components/CanvasEditor.tsx:103`
**Pattern**: `window.prompt()`
**Context**: Setting link URL in editor

```typescript
const url = window.prompt('Enter URL', previousUrl);
```

**Risk Level**: Medium - Interrupts editing flow

---

#### 1.2 Channel Settings - Archive Channel
**File**: `channels/components/ChannelSettings.tsx:115`
**Pattern**: `confirm()`
**Context**: Destructive action - archiving channel

```typescript
if (!confirm('Are you sure you want to archive this channel? Members will no longer be able to post messages.')) {
  return;
}
```

**Risk Level**: High - Destructive action without proper confirmation

---

#### 1.3 Channel Settings - Leave Channel
**File**: `channels/components/ChannelSettings.tsx:136`
**Pattern**: `confirm()`
**Context**: User leaving channel

```typescript
if (!confirm('Are you sure you want to leave this channel?')) return;
```

**Risk Level**: Medium - Moderately destructive

---

#### 1.4 Channel Settings - Remove Member
**File**: `channels/components/ChannelSettings.tsx:156`
**Pattern**: `confirm()`
**Context**: Removing member from channel

```typescript
if (!confirm('Remove this member from the channel?')) return;
```

**Risk Level**: Medium - Destructive action

---

#### 1.5 Emoji Manager - Delete Emoji
**File**: `workspaces/components/EmojiManager.tsx:63`
**Pattern**: `confirm()`
**Context**: Custom emoji deletion

```typescript
if (!confirm(`Delete :${emoji.name}:? This cannot be undone.`)) return;
```

**Risk Level**: Medium - Destructive, permanent action

---

#### 1.6 Workflow Builder - Delete Workflow
**File**: `workflows/components/WorkflowBuilder.tsx:350`
**Pattern**: `confirm()`
**Context**: Workflow deletion

```typescript
if (!confirm(`Delete workflow "${existingWorkflow.name}"? This cannot be undone.`)) return;
```

**Risk Level**: High - Destructive action

---

#### 1.7 Admin Dashboard - Delete Workspace
**File**: `admin/components/AdminDashboard.tsx:221-223`
**Pattern**: `confirm()` + `alert()`
**Context**: Workspace deletion (not implemented)

```typescript
if (confirm('Are you sure you want to delete this workspace? This cannot be undone.')) {
  alert('Workspace deletion not implemented in this build.');
}
```

**Risk Level**: High - Destructive operation + unimplemented feature

---

#### 1.8 Member Manager - Remove Member
**File**: `admin/components/MemberManager.tsx:223`
**Pattern**: `confirm()`
**Context**: Remove workspace member

```typescript
if (!confirm(`Remove ${userName} from the workspace?`)) return;
```

**Risk Level**: Medium - Destructive action

---

### Summary Table

| File | Line | Type | Dialog | Action | Priority |
|------|------|------|--------|--------|----------|
| CanvasEditor.tsx | 103 | prompt | URL entry | Link insertion | Medium |
| ChannelSettings.tsx | 115 | confirm | Archive | Destructive | High |
| ChannelSettings.tsx | 136 | confirm | Leave | Destructive | Medium |
| ChannelSettings.tsx | 156 | confirm | Remove | Destructive | Medium |
| EmojiManager.tsx | 63 | confirm | Delete | Destructive | Medium |
| WorkflowBuilder.tsx | 350 | confirm | Delete | Destructive | High |
| AdminDashboard.tsx | 221-223 | confirm+alert | Delete | Destructive + Info | High |
| MemberManager.tsx | 223 | confirm | Remove | Destructive | Medium |

---

## 2. HYDRATION & SSR ISSUES

### 2.1 ThemePicker - Auto Button Hydration
**File**: `components/ThemePicker.tsx:92-102`
**Issue**: Potential hydration mismatch with next-themes

**Context**:
```typescript
export function ThemePicker({ className }: ThemePickerProps) {
  const { colorTheme, setColorTheme } = useAppTheme();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  // ...
  <button
    onClick={() => setTheme('system')}
    className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
      theme === 'system'  // <-- Potential mismatch
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-border hover:bg-muted text-muted-foreground'
    )}
  >
    Auto
  </button>
```

**Root Cause**: `next-themes` `theme` state is `undefined` on SSR, becomes 'system'|'light'|'dark' on client. Button styling depends on `theme === 'system'`.

**Impact**:
- Flash of unstyled content (FOUC) on page load
- Button briefly shows wrong selected state
- Bad user experience on slow networks

**Severity**: Medium

---

### 2.2 ChannelCategories - useEffect Dependency Override
**File**: `components/layout/ChannelCategories.tsx:242-243`
**Issue**: Explicitly disabled dependency warning with `exhaustive-deps` comment

**Context**:
```typescript
useEffect(() => {
  // ... complex logic involving channels, starredChannels, categories, ...
  setCategories(merged);
}, [user?.id, currentWorkspace?.id, channelIdKey, starredKey]);
// eslint-disable-next-line react-hooks/exhaustive-deps
```

**Problem**:
- Dependencies `channels` and `starredChannels` are missing
- Effect depends on `categories` but `categories` not in dependency array
- Creates stale closure risks
- Effect runs less frequently than it should

**Impact**:
- Categories may not update when channels change
- Potential UI inconsistency
- Hard-to-debug state synchronization issues

**Severity**: Medium

---

## 3. EXISTING DIALOG/MODAL COMPONENTS

Good news: The project **already has production-ready dialog components** from shadcn/ui:

### Available Components

#### ✅ Core Dialog (Radix UI)
**File**: `components/ui/dialog.tsx`
**Export**: `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`
**Foundation**: `@radix-ui/react-dialog`
**Status**: Fully implemented and styled

#### ✅ Existing Dialog Pattern
**File**: `messages/components/ForwardDialog.tsx`
**Shows**: Production-ready implementation of Dialog component
**Features**:
- Controlled open/closed state via props
- Search input with real-time filtering
- Loading states
- Error handling with toast notifications
- Proper async/await pattern

#### ✅ Additional UI Components Available
- `Popover` - `components/ui/popover.tsx`
- `Sheet` - `components/ui/sheet.tsx`
- `Dropdown Menu` - `components/ui/dropdown-menu.tsx`
- `Button` - `components/ui/button.tsx` (with variants)
- `Input` - `components/ui/input.tsx`
- `Label` - `components/ui/label.tsx`
- `Tooltip` - `components/ui/tooltip.tsx`

---

## 4. FIX STRATEGIES

### Strategy 1: Replace `prompt()` with Dialog

**Before**:
```typescript
const url = window.prompt('Enter URL', previousUrl);
if (url === null) return;
```

**After** (using existing Dialog component):
```typescript
const [urlDialogOpen, setUrlDialogOpen] = useState(false);
const [urlInput, setUrlInput] = useState(previousUrl);

const handleSetLink = useCallback(() => {
  if (!urlInput.trim()) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  } else {
    editor.chain().focus().extendMarkRange('link').setLink({ href: urlInput }).run();
  }
  setUrlDialogOpen(false);
}, [editor, urlInput]);

// In JSX:
<Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Add URL</DialogTitle>
    </DialogHeader>
    <Input
      value={urlInput}
      onChange={(e) => setUrlInput(e.target.value)}
      placeholder="https://example.com"
      autoFocus
    />
    <DialogFooter>
      <Button variant="outline" onClick={() => setUrlDialogOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleSetLink}>Add</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Benefits**:
- ✅ Styled to match app theme
- ✅ Accessible (ARIA labels, keyboard nav)
- ✅ Non-blocking
- ✅ Animated
- ✅ Mobile-friendly

---

### Strategy 2: Create Reusable ConfirmDialog Component

**Create**: `components/ui/confirm-dialog.tsx`

```typescript
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Usage Example** (replacing `confirm()`):

```typescript
const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
const [isDeleting, setIsDeleting] = useState(false);

const handleDelete = async () => {
  setIsDeleting(true);
  try {
    await archiveChannel(channelId);
    onClose();
    router.refresh();
  } catch (err) {
    toast.error('Failed to archive');
  } finally {
    setIsDeleting(false);
  }
};

// In JSX:
<ConfirmDialog
  open={deleteConfirmOpen}
  onOpenChange={setDeleteConfirmOpen}
  title="Archive Channel?"
  description="Members will no longer be able to post messages. This action cannot be undone."
  confirmText="Archive"
  cancelText="Cancel"
  variant="destructive"
  isLoading={isDeleting}
  onConfirm={handleDelete}
/>

<Button
  variant="destructive"
  onClick={() => setDeleteConfirmOpen(true)}
>
  Archive Channel
</Button>
```

---

### Strategy 3: Fix Hydration Mismatch (ThemePicker)

**Root Cause**: `next-themes` `theme` is undefined during SSR

**Solution 1: Use `resolvedTheme` instead**:

```typescript
// Before - problematic
className={cn(
  'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
  theme === 'system'  // ❌ undefined during SSR
    ? 'border-primary bg-primary/10 text-primary'
    : 'border-border hover:bg-muted text-muted-foreground'
)}

// After - hydration-safe
className={cn(
  'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
  theme === 'system'  // Safe: only used for button selection logic
    ? 'border-primary bg-primary/10 text-primary'
    : 'border-border hover:bg-muted text-muted-foreground'
)}
```

**Solution 2: Add mounted check**:

```typescript
export function ThemePicker({ className }: ThemePickerProps) {
  const [mounted, setMounted] = useState(false);
  const { colorTheme, setColorTheme } = useAppTheme();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null; // Return nothing during SSR

  return (
    // ... rest of component
  );
}
```

**Better Solution 3: Use `suppressHydrationWarning` (Next.js specific)**:

```typescript
// In parent layout or wrapper component
<div suppressHydrationWarning>
  <ThemePicker />
</div>
```

---

### Strategy 4: Fix ChannelCategories Dependency Array

**Current Issue**:
```typescript
useEffect(() => {
  // Uses: channels, starredChannels, categories, user, currentWorkspace
  // But dependency array misses: channels, starredChannels
  setCategories(merged);
}, [user?.id, currentWorkspace?.id, channelIdKey, starredKey]);
// ❌ eslint-disable-next-line react-hooks/exhaustive-deps
```

**Fix Option 1: Add missing dependencies**:

```typescript
useEffect(() => {
  if (categoriesEnabled && savedCategories) {
    // Existing logic...
    setCategories(merged);
  } else {
    setCategories(buildDefaultCategories(channels, starredChannels));
  }
  // Add all dependencies used in the effect
}, [
  user?.id,
  currentWorkspace?.id,
  channelIdKey,
  starredKey,
  channels,           // ✅ Add
  starredChannels,    // ✅ Add
  categoriesEnabled,  // ✅ Add if used
]);
```

**Fix Option 2: Restructure to avoid cycles** (Recommended):

```typescript
// 1. Load saved categories (rarely changes)
useEffect(() => {
  if (!user || !currentWorkspace) return;
  loadSavedCategories(user.id, currentWorkspace.id).then(setCategories);
}, [user?.id, currentWorkspace?.id]);

// 2. Merge new channels into existing categories
useEffect(() => {
  setCategories(prev => {
    // Build uncategorized from channels/starredChannels
    // Merge into existing prev
    return merged;
  });
}, [channels, starredChannels]);

// 3. Save changes
useEffect(() => {
  if (!user || !currentWorkspace || categories.length === 0) return;
  saveCategories(user.id, currentWorkspace.id, categories);
}, [categories, user?.id, currentWorkspace?.id]);
```

---

## 5. IMPLEMENTATION ROADMAP

### Priority 1 (High - Destructive Actions)
- [ ] Archive Channel - `ChannelSettings.tsx:115` → ConfirmDialog
- [ ] Delete Workflow - `WorkflowBuilder.tsx:350` → ConfirmDialog
- [ ] Delete Workspace - `AdminDashboard.tsx:221` → ConfirmDialog (needs implementation)

### Priority 2 (Medium - Data Modifications)
- [ ] Leave Channel - `ChannelSettings.tsx:136` → ConfirmDialog
- [ ] Remove Member - `ChannelSettings.tsx:156` → ConfirmDialog
- [ ] Remove Member (Admin) - `MemberManager.tsx:223` → ConfirmDialog
- [ ] Delete Emoji - `EmojiManager.tsx:63` → ConfirmDialog

### Priority 3 (Medium - User Input)
- [ ] Add URL to Canvas - `CanvasEditor.tsx:103` → URLDialog component
- [ ] Fix ChannelCategories deps - `ChannelCategories.tsx:242`

### Priority 4 (Low - Polish)
- [ ] Suppress hydration warning - `ThemePicker.tsx`
- [ ] Add keyboard shortcuts (Escape to cancel, Enter to confirm)

---

## 6. IMPLEMENTATION CHECKLIST

### Before Starting
- [ ] Create `ConfirmDialog` component in `components/ui/confirm-dialog.tsx`
- [ ] Create `URLDialog` component (reusable URL input dialog)
- [ ] Review Dialog usage pattern in `ForwardDialog.tsx`

### Per Component Fix
- [ ] Update file
- [ ] Add state for dialog open/loading
- [ ] Add handler function
- [ ] Add Dialog component to JSX
- [ ] Remove window.confirm/prompt/alert call
- [ ] Test: keyboard navigation, loading state, cancel flow
- [ ] Test: mobile responsive
- [ ] Test: theme application

### Testing Checklist
- [ ] Dialog opens/closes correctly
- [ ] Keyboard accessibility (Tab, Enter, Escape)
- [ ] Animations smooth on all devices
- [ ] Theme colors applied correctly
- [ ] Loading states work
- [ ] Error handling via toast
- [ ] No console warnings

---

## 7. REFERENCE: ForwardDialog Pattern

The `ForwardDialog.tsx` component provides an excellent template showing:

✅ Controlled component pattern (`open`, `onOpenChange`)
✅ Async loading states
✅ Input validation
✅ Error handling with toast
✅ Reset function on close
✅ Accessible UI with proper labels
✅ Scrollable content area
✅ Footer button layout

Use this as the pattern for implementing all dialog replacements.

---

## 8. MIGRATION GUIDE

### Step-by-Step Process

1. **Create ConfirmDialog component** (5 min)
   ```bash
   # Create file
   components/ui/confirm-dialog.tsx
   ```

2. **Test ConfirmDialog in isolation** (10 min)
   - Verify open/close
   - Verify variants (default, destructive)
   - Verify loading state

3. **Pick one file to migrate** (30-45 min per file)
   - Identify the confirm() call
   - Add state for dialog
   - Add async handler
   - Replace confirm() logic
   - Test thoroughly

4. **Repeat for remaining files** (7 files total)

---

## 9. TOOLS & DEPENDENCIES

### Already Available
- ✅ `@radix-ui/react-dialog` - Dialog foundation
- ✅ `shadcn/ui components` - Button, Input, Label, etc.
- ✅ `sonner` - Toast notifications
- ✅ `framer-motion` - Animations

### No Additional Dependencies Needed
All components can be built with existing libraries.

---

## Conclusion

The project has a **solid foundation** with shadcn/ui components and Dialog infrastructure already in place. The migration from native browser dialogs to custom-styled dialogs is straightforward and will significantly improve user experience, accessibility, and visual consistency.

**Estimated Time to Fix**: 4-6 hours for all 9 instances
**Complexity**: Low to Medium
**Impact**: High (user experience, accessibility, professionalism)
