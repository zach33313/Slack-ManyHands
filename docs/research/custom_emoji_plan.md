# Custom Emoji Infrastructure Research & Implementation Plan

**Date**: February 28, 2026
**Status**: Complete Research Document
**Target Audience**: Implementation workers

---

## Executive Summary

This project already has strong foundational infrastructure for custom emoji support:
- **Prisma Model**: `CustomEmoji` table exists with workspace relationships
- **Upload Component**: `EmojiUploader.tsx` with drag-drop, preview, and validation
- **Display Component**: `EmojiManager.tsx` for browsing/managing emoji
- **Reaction System**: `AnimatedReactionBar.tsx` + `ReactionPicker.tsx` using emoji-mart
- **Storage**: `/uploads` directory and FormData-based API at `/api/files`

**Key Gap**: The `ReactionPicker` currently only uses standard emoji-mart data. To enable custom emoji selection in reactions, we need to:
1. Enhance `ReactionPicker` to include custom emoji from the workspace
2. Implement emoji normalization (custom emoji use URL references, not native characters)
3. Add API routes to fetch and manage custom emoji
4. Optimize emoji image storage with WebP conversion

---

## Current State Assessment

### ✅ What Already Exists

**Database Model** (`prisma/schema.prisma:400-415`)
```prisma
model CustomEmoji {
  id          String @id @default(cuid())
  workspaceId String
  name        String
  imageUrl    String
  createdById String
  createdAt   DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy User      @relation("EmojiCreator", fields: [createdById], references: [id])

  @@unique([workspaceId, name])
  @@index([workspaceId])
  @@map("custom_emojis")
}
```

**Upload Component** (`workspaces/components/EmojiUploader.tsx`)
- Drag-drop file input with preview
- Validation: PNG/GIF/JPEG, max 128×128px, max 256KB
- Shortcode validation: alphanumeric + underscores, 2-32 chars
- Successful uploads return emoji object with `{id, name, imageUrl}`
- Calls `/api/workspaces/custom-emoji` POST endpoint

**Manager Component** (`workspaces/components/EmojiManager.tsx`)
- Grid display of workspace custom emoji
- Search filtering by name
- Delete button (admin-only)
- Animated card layout with Framer Motion
- Calls `/api/workspaces/custom-emoji/{emojiId}` DELETE endpoint

**Reaction UI** (`messages/components/AnimatedReactionBar.tsx`)
- Animated reaction pills with counts
- Uses standard emoji strings from `ReactionPicker`
- Socket.IO events: `message:react`, `message:unreact`

**Emoji Picker** (`messages/components/ReactionPicker.tsx`)
- Uses `@emoji-mart/react` with radix-ui Popover
- Supports theme switching
- Returns native emoji characters

**File Upload Pattern** (`app/api/files/route.ts`)
- Accepts multipart FormData
- Delegates to `uploadFile()` server action
- Returns `FileUploadResult` in standard API envelope

---

## Technology Recommendations

### 1. **Image Storage Strategy**

**RECOMMENDATION**: Use hybrid approach:
- **Local storage** (`/public/uploads/emoji/`) for development and small deployments
- **AWS S3** for production with CDN (CloudFront)
- **Fallback**: Scale incrementally from local → S3 as needed

**Rationale**:
- Local storage works well for teams < 10k users, costs nothing
- S3 enables automatic scaling without disk management
- Both can coexist with environment-based configuration
- Transition path is straightforward

**Installation**:
```bash
# Already installed - @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner exist in package.json
npm install @aws-sdk/client-s3@^3.600.0 @aws-sdk/s3-request-presigner@^3.600.0
```

**Configuration**:
```typescript
// backend/storage/emoji-storage.ts (pseudocode)
const isProduction = process.env.NODE_ENV === 'production';
const useS3 = isProduction && process.env.AWS_ACCESS_KEY_ID;

// Use S3 if configured, otherwise local filesystem
export const emojiStorage = useS3
  ? new S3EmojiStorage(s3Client)
  : new LocalEmojiStorage('/public/uploads/emoji');
```

### 2. **Image Optimization**

**RECOMMENDATION**: Use Sharp for WebP conversion with automatic fallback

**Installation** (already installed):
```bash
npm install sharp@^0.33.0
```

**Processing Pipeline**:
```typescript
import sharp from 'sharp';

async function optimizeEmojiImage(buffer: Buffer): Promise<{
  png: Buffer;
  webp: Buffer;
}> {
  const png = await sharp(buffer)
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 90 })
    .toBuffer();

  const webp = await sharp(buffer)
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 85 })
    .toBuffer();

  return { png, webp };
}
```

**Rationale**:
- PNG for maximum compatibility (guaranteed in all browsers)
- WebP as primary format (25-35% smaller, 2025 standard)
- Automatic resizing to 128×128px ensures consistency
- Transparent background support for emoji
- Next.js Image component can serve both with Accept header detection

### 3. **Custom Emoji Picker Integration**

**RECOMMENDATION**: Extend current `ReactionPicker` to support custom emoji

**Current Implementation**:
- Uses `@emoji-mart/react` for standard emoji only
- Radix-ui Popover wrapper
- Takes `onSelect(emoji: string)` callback

**Enhancement Strategy**:

Create new component `EnhancedReactionPicker.tsx` that:
1. Fetches workspace custom emoji via new API
2. Adds custom emoji as separate category in emoji-mart
3. Handles both emoji types in selection callback

**Implementation Example**:
```typescript
// messages/components/EnhancedReactionPicker.tsx
import { useEffect, useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';

interface CustomEmojiData {
  id: string;
  name: string;
  imageUrl: string;
}

export function EnhancedReactionPicker({
  workspaceId,
  onSelect,
}: {
  workspaceId: string;
  onSelect: (emoji: string) => void;
}) {
  const [customEmojis, setCustomEmojis] = useState<CustomEmojiData[]>([]);

  useEffect(() => {
    // Fetch custom emoji for workspace
    fetch(`/api/workspaces/${workspaceId}/emoji`)
      .then(r => r.json())
      .then(data => setCustomEmojis(data.emojis || []))
      .catch(console.error);
  }, [workspaceId]);

  // Build custom emoji category for emoji-mart
  const customCategory = {
    id: 'custom',
    name: 'Custom',
    emojis: customEmojis.map(emoji => ({
      id: `custom_${emoji.id}`,
      name: emoji.name,
      keywords: [emoji.name],
      skins: [{ src: emoji.imageUrl }],
    })),
  };

  // Merge with standard data
  const augmentedData = {
    ...data,
    categories: [customCategory, ...data.categories],
  };

  const handleSelect = (emojiData: any) => {
    // For custom emoji: emojiData.id starts with 'custom_'
    // For standard emoji: use native character
    const emoji = emojiData.id?.startsWith('custom_')
      ? `custom_${emojiData.id.replace('custom_', '')}`
      : emojiData.native;
    onSelect(emoji);
  };

  return (
    <Picker
      data={augmentedData}
      onEmojiSelect={handleSelect}
      // ... other props
    />
  );
}
```

**Database Changes Needed** for Custom Emoji Reference:
```typescript
// Reaction model - already exists, but emoji field stores both types:
// - Standard emoji: "👍" (native character)
// - Custom emoji: "custom_abc123" (ID reference)

// Normalize on storage:
const normalizedEmoji = emoji.startsWith('custom_')
  ? emoji  // Already normalized
  : emoji; // Standard emoji character (no change)
```

---

## API Routes Required

### 1. **GET /api/workspaces/{workspaceId}/emoji**

Fetch all custom emoji for a workspace.

```typescript
// backend/routes/emoji.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const emojis = await prisma.customEmoji.findMany({
    where: { workspaceId: params.workspaceId },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      createdById: true,
      createdAt: true,
      createdBy: { select: { name: true, image: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ emojis });
}
```

### 2. **POST /api/workspaces/{workspaceId}/emoji** (Already exists)

Upload custom emoji image and create CustomEmoji record.

**Expected behavior**:
- Accept FormData with `file`, `workspaceId`, `name`
- Validate file type, size, dimensions
- Optimize images (PNG + WebP)
- Store optimized images
- Return `{ id, name, imageUrl }`

**Enhancement**: Add image optimization pipeline

```typescript
async function uploadCustomEmoji(
  workspaceId: string,
  name: string,
  file: File,
  userId: string
) {
  // 1. Validate
  const buffer = await file.arrayBuffer();
  const optimized = await optimizeEmojiImage(Buffer.from(buffer));

  // 2. Store images (PNG primary, WebP cached)
  const pngUrl = await emojiStorage.save(`${workspaceId}/${name}.png`, optimized.png);

  // 3. Create record
  const emoji = await prisma.customEmoji.create({
    data: {
      workspaceId,
      name,
      imageUrl: pngUrl, // Store PNG URL
      createdById: userId,
    },
  });

  return { id: emoji.id, name: emoji.name, imageUrl: emoji.imageUrl };
}
```

### 3. **DELETE /api/workspaces/{workspaceId}/emoji/{emojiId}** (Already exists)

Delete custom emoji and clean up storage.

---

## Reaction Storage Normalization

### Problem
Current `Reaction` model stores emojis as native characters. Custom emoji need to be references (IDs).

### Solution: Use Encoded String Format

Store reactions as-is, but normalize to allow both types:

```typescript
// Type: emoji can be either native character or "custom_<id>"

// When rendering reactions:
function renderReaction(emoji: string, customEmojiMap: Map<string, CustomEmoji>) {
  if (emoji.startsWith('custom_')) {
    const id = emoji.replace('custom_', '');
    const customEmoji = customEmojiMap.get(id);
    return customEmoji
      ? `<img src="${customEmoji.imageUrl}" alt=":${customEmoji.name}:" />`
      : '❓'; // Fallback if deleted
  }
  return emoji; // Standard emoji
}

// When adding reaction:
socket.emit('message:react', {
  messageId,
  emoji: selectedEmojiId.startsWith('custom_')
    ? selectedEmojiId
    : selectedNativeEmoji,
});
```

### Database Changes
No schema changes needed! The emoji field remains `String` and can accommodate both formats.

---

## File Structure Summary

### Components (Already Exist)
- ✅ `workspaces/components/EmojiUploader.tsx` - Upload UI
- ✅ `workspaces/components/EmojiManager.tsx` - Browse/manage
- ✅ `messages/components/ReactionPicker.tsx` - Emoji selection
- ✅ `messages/components/AnimatedReactionBar.tsx` - Display reactions

### New Components Needed
- `messages/components/EnhancedReactionPicker.tsx` - Custom emoji support
- `components/EmojiRenderer.tsx` - Unified emoji display (standard + custom)

### API Routes (Already Exist)
- ✅ `POST /api/workspaces/custom-emoji` - Create
- ✅ `DELETE /api/workspaces/custom-emoji/{emojiId}` - Delete
- ✅ `GET /api/workspaces/{workspaceId}/settings` - Fetch workspace emoji (add this)

### Backend Utilities (New)
- `backend/storage/emoji-storage.ts` - Local/S3 abstraction
- `backend/images/emoji-optimizer.ts` - Sharp processing pipeline
- `backend/lib/emoji-normalize.ts` - Type conversion utilities

---

## Alternative Emoji Picker Libraries Evaluated

### emoji-mart (Current Choice) ✅
**Pros**:
- Already in dependencies
- Full categorization and search
- Custom category support via augmented data
- Excellent skin tone support
- Most popular (Slack, Discord use variants)

**Cons**:
- Larger bundle (~200KB)
- Requires data import

**Custom Emoji Support**: Native via category merging

### emoji-picker-react
**Pros**:
- Very lightweight
- React hooks-based
- Easy custom emoji injection
- Good for minimal footprints

**Cons**:
- Less polished UI
- Fewer features (no skin tones, limited search)
- Community support smaller than emoji-mart

**Custom Emoji Support**: Via `customEmojis` prop array

### Frimousse (New 2025)
**Pros**:
- Headless/unstyled (full control)
- Smallest bundle
- Latest emoji data
- Liveblocks maintained

**Cons**:
- Very new (limited production usage)
- Requires full UI implementation
- Fewer preset styles

**Custom Emoji Support**: Via custom categories

### **Recommendation**: Stick with emoji-mart + custom category augmentation
- Already integrated
- Battle-tested in production
- Custom support is straightforward
- No breaking changes needed

---

## Implementation Phases

### Phase 1: API Layer (1-2 days)
- [ ] Create `/api/workspaces/{workspaceId}/emoji` GET endpoint
- [ ] Enhance `/api/workspaces/{workspaceId}/emoji` POST with image optimization
- [ ] Add emoji storage abstraction (local vs S3)
- [ ] Create Sharp optimization pipeline
- [ ] Tests for new endpoints

### Phase 2: Frontend Components (1-2 days)
- [ ] Build `EnhancedReactionPicker.tsx` with custom emoji support
- [ ] Create `EmojiRenderer.tsx` for unified display
- [ ] Update `ReactionBar` to use enhanced picker
- [ ] Update socket handlers to accept custom emoji format
- [ ] Component tests

### Phase 3: Integration & Polish (1 day)
- [ ] Update Reaction storage/retrieval to handle custom emoji
- [ ] Add custom emoji to message display (reactions, status emoji, etc.)
- [ ] Update socket event handlers for custom emoji
- [ ] E2E tests for emoji workflow
- [ ] Documentation

### Phase 4: Performance & Scaling (Optional)
- [ ] Add CDN caching headers for emoji images
- [ ] Implement S3 storage option
- [ ] Add emoji image versioning/cleanup
- [ ] Monitor emoji storage usage

---

## Database Additions (Optional, Future)

If you want to track emoji usage analytics:

```prisma
model EmojiUsage {
  id        String   @id @default(cuid())
  emojiId   String   @unique
  messageId String?
  userId    String
  count     Int      @default(1)
  lastUsed  DateTime @updatedAt

  emoji  CustomEmoji @relation(fields: [emojiId], references: [id])
  user   User        @relation(fields: [userId], references: [id])

  @@index([emojiId])
  @@index([userId])
}
```

Not required for MVP, but useful for "recently used" picker optimization.

---

## Image Optimization Specifications

### Constraints
- **Max Input**: 256KB (validated client-side)
- **Output Size**: ≤ 50KB PNG, ≤ 30KB WebP
- **Dimensions**: 128×128px (will resize if larger)
- **Format**: PNG primary, WebP cache
- **Quality**: PNG 90%, WebP 85%

### Storage Paths
```
Local:  /public/uploads/emoji/{workspaceId}/{emojiName}.{png|webp}
S3:     s3://{bucket}/emoji/{workspaceId}/{emojiName}.{png|webp}
URL:    /uploads/emoji/{workspaceId}/{emojiName}.png  (with .webp fallback)
```

---

## Testing Checklist

- [ ] Upload valid PNG/GIF/JPEG → succeeds
- [ ] Upload oversized file → fails with message
- [ ] Upload non-image file → fails with message
- [ ] Upload 256×256px image → resized to 128×128px
- [ ] Shortcode validation (special chars) → rejected
- [ ] Shortcode duplicate in workspace → rejected
- [ ] Delete emoji as admin → succeeds
- [ ] Delete emoji as non-admin/non-creator → fails
- [ ] React with custom emoji → stored as `custom_<id>`
- [ ] Render custom emoji reaction → displays image
- [ ] Switch workspace → emoji picker shows correct workspace emoji
- [ ] Image optimization → PNG and WebP both created
- [ ] S3 upload → files served via CDN URL

---

## Security Considerations

1. **File Upload Validation**
   - Verify file type via magic bytes, not extension
   - Scan uploaded images for embedded code/malware
   - Consider image scanning library: `sharp-scan` or Cloudinary ML

2. **Storage Security**
   - S3: Use bucket policies to restrict public read
   - Local: Serve via Next.js route (no direct file system access)
   - CDN: Use signed URLs if private

3. **Database Access**
   - Verify workspace membership before returning emoji
   - Check role for delete operations
   - Rate-limit upload endpoint

4. **XSS Prevention**
   - Sanitize emoji shortcode input
   - Always use `alt` tags on emoji images
   - Never trust `imageUrl` parameter from client

---

## Performance Targets

- Image optimization: < 500ms per upload
- Emoji list fetch: < 100ms (< 1000 emoji)
- Reaction rendering: < 50ms
- Picker load time: < 1s (including network)

### Caching Strategy
```typescript
// Cache emoji list per workspace
const emojiCache = new Map<string, { data: CustomEmoji[], ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getWorkspaceEmoji(workspaceId: string) {
  const cached = emojiCache.get(workspaceId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const data = await prisma.customEmoji.findMany({ where: { workspaceId } });
  emojiCache.set(workspaceId, { data, ts: Date.now() });
  return data;
}
```

---

## Limitations & Future Improvements

### Current Limitations
- Single emoji per workspace (emoji names are unique per workspace)
- No emoji categories beyond "custom"
- No animated emoji support (GIF/APNG)
- No emoji packs/sharing between workspaces

### Future Enhancements
1. **Animated Emoji**: Support GIF/APNG in upload (requires APNG-optimized output)
2. **Emoji Packs**: Share emoji sets across workspaces
3. **Usage Analytics**: Track most-used emoji, trending reactions
4. **AI Tagging**: Auto-suggest shortcodes from image content
5. **Emoji Search**: Full-text search on shortcode + keywords
6. **Duplicate Detection**: Prevent similar emoji uploads
7. **Emoji Versioning**: Keep history of emoji updates

---

## References

### Storage & Performance
- [S3 vs Local Storage Comparison](https://dev.to/ash_dubai/aws-s3-file-uploads-in-nodejs-master-aws-s3-file-uploads-in-node-261f)
- [Image Optimization 2025 Guide](https://www.frontendtools.tech/blog/modern-image-optimization-techniques-2025)
- [Next.js Image Optimization](https://nextjs.org/docs/app/getting-started/images)

### Emoji Libraries
- [emoji-mart GitHub](https://github.com/missive/emoji-mart)
- [emoji-picker-react](https://www.npmjs.com/package/emoji-picker-react)
- [Frimousse Picker](https://frimousse.liveblocks.io/)
- [React Emoji Picker Guide 2025](https://velt.dev/blog/react-emoji-picker-guide)

### Best Practices
- [Discord Emoji Size Specifications](https://www.arkthinker.com/edit-image/discord-emoji-size/)
- [Sharp Image Processing](https://sharp.pixelplumbing.com/)
- [WebP Format Benefits](https://www.frontendtools.tech/blog/modern-image-optimization-techniques-2025)

---

## Summary

The project has **excellent foundational infrastructure** for custom emoji. The main work is:

1. **Connecting components**: Make `ReactionPicker` aware of custom emoji
2. **Enhancing storage**: Add image optimization pipeline
3. **Normalizing data**: Support both native emoji and custom emoji references

Estimated total implementation time: **3-4 days** including tests and documentation.

The existing Prisma model, upload component, and manager UI are production-ready and require minimal changes.

