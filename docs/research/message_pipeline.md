# Message Composer & Rendering Pipeline Analysis

## Overview

This document provides a comprehensive analysis of the current message composer and message rendering architecture in the Slack clone, including recommended libraries and patterns for planned feature integrations.

## Current Architecture Summary

### Composer Pipeline

**Location**: `messages/components/MessageComposer.tsx` + `components/editor/SlackEditor.tsx`

**Current Features**:
- Tiptap v3 rich-text editor with markdown-like formatting
- File upload with drag-drop and attachment button
- Socket.IO typing indicators
- Slash command support (`/status`, `/away`, `/mute`, `/invite`, `/topic`)
- Attachment preview chips with removal capability

**Message Flow**:
1. User types in SlackEditor (Tiptap-powered)
2. Typing indicator emitted to channel via Socket.IO
3. On Enter, content submitted as TiptapJSON + plainText
4. Files attached via separate `/api/files` upload endpoint
5. Socket.IO `message:send` emitted with payload containing:
   - `channelId`: Target channel
   - `content`: Tiptap JSON document
   - `fileIds`: Attached file IDs (optional)
   - `parentId`: Parent message ID for thread replies

### Message Rendering Pipeline

**Location**: `messages/components/MessageList.tsx` + `messages/components/MessageItem.tsx`

**Rendering Strategy**:
- **Virtualization**: react-virtuoso GroupedVirtuoso for efficient rendering of large message lists
- **Grouping**: Messages grouped by date with sticky headers
- **Modes**:
  - **Full Mode**: Avatar + author name + timestamp + content
  - **Compact Mode**: Just content (same author, <5 min apart)

**Content Rendering** (MessageItem.tsx):
- Tiptap JSON → HTML via custom `renderTiptapContent()` function
- Renders text, formatting (bold, italic, strike, code, links)
- Blockquotes, lists, headings, code blocks with syntax highlighting
- Mentions and emojis with special styling
- File attachments: inline images or download links
- Reactions displayed as emoji chips below content
- Thread summary link shows reply count and opens thread panel

### Thread System

**Location**: `messages/components/ThreadPanel.tsx` + `messages/components/ThreadComposer.tsx`

**Architecture**:
- Parent message shown at top of thread panel
- Thread replies load via `GET /api/messages/[id]/threads`
- Socket.IO `thread:reply` events for real-time updates
- Reply count denormalized on parent message
- Messages store tracks `activeThreadId` and `threadMessages`

### State Management

**Location**: `messages/store.ts`

**Zustand Store**:
- `messagesByChannel`: Messages keyed by channel ID
- `loadingByChannel`: Per-channel loading state
- `hasMoreByChannel`: Pagination state
- `activeThreadId`: Current open thread
- `threadMessages`: Replies in active thread
- `unreadIndexByChannel`: First unread message position
- `isAtBottom`: Scroll position tracking
- `unseenCount`: Unseen messages while scrolled up

**Socket.IO Events Subscribed**:
- `message:new`: New message in channel
- `message:updated`: Message edited
- `message:deleted`: Message deleted
- `reaction:updated`: Reactions changed
- `thread:reply`: New thread reply

---

## Feature Integration Recommendations

### 1. Message Animations (Entry, Updates, Reactions)

**RECOMMENDATION**: Use **Motion** (formerly Framer Motion) v5.8+ for message animations due to superior developer experience and React integration. If bundle size is critical, consider using raw CSS transitions for simple animations and Motion only for complex choreography.

**Why Motion Over Alternatives**:
- Latest rebranding of Framer Motion with focused React support
- Declarative component API matches project's patterns
- Hardware acceleration for smooth animations on all devices
- Active maintenance and largest community (18M+ monthly npm downloads)
- Better bundle size than Framer Motion (~3-5kb core vs 17kb)
- Excellent for chat animations: entry, scale, opacity changes

**INSTALLATION**:
```bash
npm install motion@latest
```

**USAGE EXAMPLE**:

```tsx
import { motion } from "motion/react";
import { MessageItem } from "./MessageItem";

export function AnimatedMessageItem({ message, previousMessage, currentUserId }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <MessageItem
        message={message}
        previousMessage={previousMessage}
        currentUserId={currentUserId}
      />
    </motion.div>
  );
}

// For reaction animations
export function AnimatedReactionBar({ messageId, reactions, currentUserId }) {
  return (
    <motion.div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => (
        <motion.button
          key={reaction.emoji}
          layoutId={`reaction-${reaction.emoji}`}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.8 }}
          transition={{ type: "spring", damping: 15 }}
          // ... existing button props
        >
          {/* button content */}
        </motion.button>
      ))}
    </motion.div>
  );
}
```

**INTEGRATION NOTES**:
- Wrap MessageItem in `motion.div` for entry animations
- Use `layoutId` for reaction animations to smooth position changes
- Disable animations for mobile via `prefers-reduced-motion`
- Group animations in AnimatePresence for exit animations
- Consider lazy-loading Motion for first-meaningful-paint optimization

**ALTERNATIVES CONSIDERED**:
- GSAP: Overkill for chat animations, heavier bundle
- React Spring: Physics-based, better for elastic animations but less React-friendly
- AutoAnimate: Good for list animations, but limited customization
- Plain CSS transitions: Works for simple animations, less powerful

---

### 2. Audio Messages (Recording & Playback)

**RECOMMENDATION**: Use **React Voice Visualizer** v1.x for recording with built-in visualization, combined with native HTML5 `<audio>` element for playback. Provides production-ready Web Audio API abstraction without external dependencies for playback.

**Why React Voice Visualizer**:
- Handles MediaStream Recording API complexity
- Built-in real-time audio waveform visualization
- Customizable recording UI
- Lightweight and maintained
- Web Audio API under the hood for reliable browser support

**INSTALLATION**:
```bash
npm install react-voice-visualizer
```

**USAGE EXAMPLE**:

```tsx
import { useVoiceVisualizer } from "react-voice-visualizer";
import { Mic, Send } from "lucide-react";
import { useState } from "react";

interface AudioMessageDraftProps {
  onSend: (audioBlob: Blob, duration: number) => void;
}

export function AudioMessageDraft({ onSend }: AudioMessageDraftProps) {
  const [isRecording, setIsRecording] = useState(false);
  const { recordingBlob, startRecording, stopRecording, duration } =
    useVoiceVisualizer();

  const handleStartRecording = async () => {
    try {
      await startRecording();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      toast.error("Microphone access denied");
    }
  };

  const handleStopRecording = async () => {
    await stopRecording();
    setIsRecording(false);
  };

  const handleSendAudio = () => {
    if (recordingBlob) {
      onSend(recordingBlob, duration);
      // Reset state
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      {!isRecording ? (
        <button
          onClick={handleStartRecording}
          className="flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
        >
          <Mic className="h-4 w-4" />
          Start Recording
        </button>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Recording... {duration}s</span>
            <button
              onClick={handleStopRecording}
              className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
            >
              Stop
            </button>
          </div>
          {/* Visualization would go here */}
        </>
      )}

      {recordingBlob && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {duration}s audio message
            </span>
          </div>
          <AudioPreview blob={recordingBlob} />
          <button
            onClick={handleSendAudio}
            className="w-full rounded bg-green-600 px-3 py-2 text-white hover:bg-green-700"
          >
            <Send className="inline-block h-4 w-4" /> Send Audio
          </button>
        </div>
      )}
    </div>
  );
}

// Component to display audio message in message list
export function AudioMessageAttachment({
  file,
}: {
  file: MessageWithMeta["files"][number];
}) {
  const [isPlaying, setIsPlaying] = useState(false);

  // Detect audio MIME type
  if (!file.mimeType.startsWith("audio/")) return null;

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-border p-2">
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200"
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
      <div className="flex-1">
        <audio
          src={file.url}
          controls
          className="w-full"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      </div>
    </div>
  );
}
```

**DATABASE SCHEMA UPDATES**:
- Add `isAudio: boolean` flag to Message model
- Audio files stored as regular attachments, detected by MIME type
- Duration stored in FileAttachment metadata: `durationSeconds: number`

**INTEGRATION NOTES**:
- Hook into MessageComposer to add mic button in toolbar
- Use Socket.IO message:send with audio file ID in fileIds array
- Add audio detection in FileAttachment component
- For recording permissions, require HTTPS (browser security requirement)
- Consider codec support (Opus/WebM recommended, fallback to WAV)

**ALTERNATIVES CONSIDERED**:
- React Audio Recorder: More basic, less visualization support
- react-media-recorder: Lower level, more control but more code
- wav-recorder-js: WebRTC-based, good for complex scenarios
- Custom Web Audio API: Maximum control but significant implementation effort

---

### 3. GIF Search & Integration

**RECOMMENDATION**: Use **Giphy API** (with proper fee expectations) or **Klipy** (Giphy alternative) due to largest GIF library and best developer experience. Implement with a custom React modal dialog for search and selection.

**Critical Context (2024-2026)**:
- Giphy free tier heavily restricted; paid tier starts at $99/month
- Tenor API shutting down June 30, 2026
- **Klipy** emerging as successor (same API structure for easier migration)
- Imgur GIF API available as cost-free alternative

**RECOMMENDATION CHOICE**:
- **Primary**: Giphy (for best UX and library, requires budget discussion)
- **Budget Option**: Klipy (same API, free tier available, Tenor migration support)
- **No-Cost Option**: Imgur GIF API (smaller library, no API key needed for basic use)

**INSTALLATION** (Giphy approach):
```bash
npm install giphy-js-sdk-core
# OR with request library
npm install axios
```

**USAGE EXAMPLE**:

```tsx
import { useState, useCallback } from "react";
import { Search, X, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GifSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string, gifId: string) => void;
}

interface GiphyGif {
  id: string;
  images: {
    fixed_height: {
      url: string;
      height: string;
      width: string;
    };
  };
  title: string;
}

export function GifSelector({ open, onClose, onSelect }: GifSelectorProps) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);

  const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || "";

  const searchGifs = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm.trim()) {
        setGifs([]);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(
            searchTerm
          )}&limit=20&offset=0&rating=g&lang=en`
        );

        if (!response.ok) throw new Error("Giphy API error");
        const data = await response.json();
        setGifs(data.data || []);
      } catch (err) {
        console.error("Failed to search GIFs:", err);
        toast.error("Failed to search GIFs");
      } finally {
        setLoading(false);
      }
    },
    [GIPHY_API_KEY]
  );

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value;
      setQuery(newQuery);
      searchGifs(newQuery);
    },
    [searchGifs]
  );

  const handleSelectGif = (gif: GiphyGif) => {
    onSelect(gif.images.fixed_height.url, gif.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Find a GIF</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search GIFs..."
              value={query}
              onChange={handleSearch}
              className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* GIF grid */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {!loading && gifs.length > 0 && (
            <div className="grid max-h-[400px] grid-cols-3 gap-2 overflow-y-auto">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => handleSelectGif(gif)}
                  className="group relative overflow-hidden rounded-lg transition-opacity hover:opacity-80"
                  title={gif.title}
                >
                  <img
                    src={gif.images.fixed_height.url}
                    alt={gif.title}
                    className="h-24 w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                    <ImageIcon className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && query && gifs.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No GIFs found</p>
            </div>
          )}

          {!query && gifs.length === 0 && !loading && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                Search for GIFs to get started
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Integration in MessageComposer toolbar
export function GifButton({ onGifSelect }) {
  const [open, setOpen] = useState(false);

  const handleSelectGif = (gifUrl: string, gifId: string) => {
    onGifSelect(gifUrl);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Insert GIF"
        className="rounded p-1.5 text-muted-foreground hover:bg-muted"
      >
        <ImageIcon className="h-5 w-5" />
      </button>
      <GifSelector
        open={open}
        onClose={() => setOpen(false)}
        onSelect={handleSelectGif}
      />
    </>
  );
}
```

**ENV SETUP**:
```env
# .env.local
NEXT_PUBLIC_GIPHY_API_KEY=your_giphy_api_key_here
# For Klipy:
# NEXT_PUBLIC_GIF_API_BASE=https://api.klipy.com
```

**INTEGRATION NOTES**:
- Add GIF button to EditorToolbar next to attachment button
- GIF URL becomes temporary attachment with `sourceUrl` tracking
- On send, GIF treated as image file attachment
- Consider caching recent GIF searches in localStorage
- Add debouncing to search (200-300ms) to reduce API calls
- Implement pagination for large result sets

**MIGRATION PATH**:
- If using Giphy and costs escalate, Klipy has same API structure
- Only change: base URL and API endpoint paths
- All existing code remains compatible

**ALTERNATIVES CONSIDERED**:
- Tenor: Shutting down June 2026, not recommended for new code
- Imgur: Free, smaller library, no API key needed
- Tenor.js/NPM packages: Layered on top of Tenor API, affected by shutdown

---

### 4. Link Preview Cards

**RECOMMENDATION**: Use **Link Preview JS** for client-side parsing with server-side validation via **Metascraper** (for complex websites requiring HTML fetching). This hybrid approach prevents CORS issues while maintaining responsiveness.

**Implementation Pattern**:
- Client: Extract basic metadata from Open Graph tags
- Server: Fetch full HTML for sites without proper meta tags
- Cache previews to prevent repeated fetches

**INSTALLATION**:
```bash
# Client-side library
npm install link-preview-js

# Server-side library (for API route)
npm install metascraper metascraper-description metascraper-image metascraper-lang metascraper-logo metascraper-logo-favicon metascraper-publisher metascraper-title metascraper-url
```

**USAGE EXAMPLE**:

```tsx
// Frontend: messages/components/LinkPreview.tsx
import { useState, useEffect } from "react";
import { getLinkPreview } from "link-preview-js";
import { Loader2, X } from "lucide-react";

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}

interface LinkPreviewProps {
  url: string;
  onClose?: () => void;
}

export function LinkPreview({ url, onClose }: LinkPreviewProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        // Try client-side parsing first
        const data = await getLinkPreview(url);
        setPreview(data as LinkPreviewData);
      } catch (err) {
        // Fall back to server-side parsing
        try {
          const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
          if (res.ok) {
            const data = await res.json();
            setPreview(data.preview);
          } else {
            setError("Could not fetch preview");
          }
        } catch {
          setError("Failed to load preview");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-muted/50 p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !preview) {
    return null;
  }

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group mt-2 block rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex gap-3">
        {/* Thumbnail */}
        {preview.image && (
          <div className="shrink-0">
            <img
              src={preview.image}
              alt={preview.title || "Link preview"}
              className="h-24 w-24 rounded-md object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Favicon + domain */}
          <div className="mb-1 flex items-center gap-1.5">
            {preview.favicon && (
              <img
                src={preview.favicon}
                alt=""
                className="h-4 w-4 rounded"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <span className="text-xs text-muted-foreground truncate">
              {new URL(preview.url).hostname}
            </span>
          </div>

          {/* Title */}
          {preview.title && (
            <h4 className="mb-1 line-clamp-2 font-semibold text-foreground group-hover:text-primary">
              {preview.title}
            </h4>
          )}

          {/* Description */}
          {preview.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {preview.description}
            </p>
          )}
        </div>

        {/* Close button */}
        {onClose && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </a>
  );
}

// Integration in MessageItem below content
export function MessageItemWithLinkPreview({ message }) {
  const [dismissedPreviews, setDismissedPreviews] = useState<string[]>([]);

  // Extract URLs from message content
  const urls = extractUrlsFromMessage(message.content);

  return (
    <div>
      {/* Message content */}
      {/* ... existing content rendering ... */}

      {/* Link previews */}
      {urls.map((url) => (
        <LinkPreview
          key={url}
          url={url}
          onClose={() =>
            setDismissedPreviews((prev) => [...prev, url])
          }
        />
      ))}
    </div>
  );
}

function extractUrlsFromMessage(content: TiptapJSON): string[] {
  const urls: string[] = [];
  const urlPattern =
    /https?:\/\/[^\s<>"{}|\\^`\[\]]*[^\s<>"{}|\\^`\[\].,;:?!]/g;

  function walk(nodes: TiptapNode[]): void {
    for (const node of nodes) {
      if (node.text) {
        const matches = node.text.match(urlPattern);
        if (matches) urls.push(...matches);
      }
      if (node.content) walk(node.content);
    }
  }

  if (content.content) walk(content.content);
  return [...new Set(urls)]; // Deduplicate
}
```

**Backend API Route** (`app/api/link-preview/route.ts`):
```typescript
import { NextRequest, NextResponse } from "next/server";
import metascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperUrl from "metascraper-url";
import fetch from "node-fetch";

const ms = metascraper([
  metascraperTitle(),
  metascraperDescription(),
  metascraperImage(),
  metascraperUrl(),
]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter required" },
      { status: 400 }
    );
  }

  try {
    // Validate URL format
    new URL(url);

    // Fetch HTML
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 5000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const metadata = await ms({ html, url });

    return NextResponse.json({
      preview: {
        url: metadata.url || url,
        title: metadata.title || "Link",
        description: metadata.description || "",
        image: metadata.image || null,
      },
    });
  } catch (err) {
    console.error("Link preview error:", err);
    return NextResponse.json(
      { error: "Failed to fetch link preview" },
      { status: 500 }
    );
  }
}
```

**INTEGRATION NOTES**:
- Extract URLs from TiptapJSON during message rendering
- Debounce preview fetches (100-200ms after message renders)
- Cache previews in localStorage/IndexedDB to reduce API calls
- Limit to first 3 URLs per message to prevent abuse
- Add rate limiting on `/api/link-preview` route
- Consider storing fetched previews in database for frequently shared links

**ALTERNATIVES CONSIDERED**:
- Open Graph parser: Simple but requires HTML, doesn't handle Twitter Cards
- Custom HTML parsing: Full control but fragile
- Third-party service (Microlink): Hosted solution, adds dependency
- Oembed API: Good for media embeds, limited metadata

---

### 5. Polls & Voting

**RECOMMENDATION**: Build custom poll component using Zustand store (already used for messages) + Socket.IO for real-time updates. Avoid external libraries to keep control over UI/UX and maintain consistency with existing chat design.

**Why Custom Implementation**:
- Integrates seamlessly with existing Socket.IO + Zustand patterns
- Full design control matching Slack/Discord aesthetics
- No additional npm dependencies
- Poll options embedded directly in message JSON

**MESSAGE SCHEMA ADDITION**:
```typescript
// shared/types/index.ts - extend MessageWithMeta
export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  allowMultiple: boolean; // Single or multiple choice
  endAt?: Date; // Optional end date
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  voters: string[]; // User IDs who voted for this option
}

export interface MessageWithMeta extends Message {
  poll?: Poll; // Optional poll embedded in message
  // ... existing fields
}
```

**USAGE EXAMPLE**:

```tsx
// messages/components/PollComposer.tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";

interface PollComposerProps {
  onCreatePoll: (question: string, options: string[]) => void;
}

export function PollComposer({ onCreatePoll }: PollComposerProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, ""]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleCreate = () => {
    const validOptions = options.filter((o) => o.trim());
    if (!question.trim() || validOptions.length < 2) {
      toast.error("Poll needs a question and at least 2 options");
      return;
    }
    onCreatePoll(question, validOptions);
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
      <h3 className="mb-3 font-semibold text-foreground">Create a Poll</h3>

      <Input
        placeholder="What's your question?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className="mb-3"
      />

      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder={`Option ${index + 1}`}
              value={option}
              onChange={(e) => updateOption(index, e.target.value)}
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(index)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {options.length < 10 && (
        <Button
          variant="outline"
          size="sm"
          onClick={addOption}
          className="mt-3 w-full"
        >
          <Plus className="h-4 w-4" /> Add Option
        </Button>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          onClick={handleCreate}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          Create Poll
        </Button>
      </div>
    </div>
  );
}

// messages/components/PollDisplay.tsx
import { useSocket } from "@/shared/hooks/useSocket";
import { useCallback } from "react";

interface PollDisplayProps {
  poll: Poll;
  messageId: string;
  currentUserId: string;
  channelId: string;
}

export function PollDisplay({
  poll,
  messageId,
  currentUserId,
  channelId,
}: PollDisplayProps) {
  const socket = useSocket();
  const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0);

  const handleVote = useCallback(
    (optionId: string) => {
      socket.emit("poll:vote", {
        messageId,
        optionId,
        channelId,
      });
    },
    [messageId, channelId, socket]
  );

  const hasVoted = poll.options.some((opt) =>
    opt.voters.includes(currentUserId)
  );

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
      <h4 className="mb-3 font-semibold text-foreground">{poll.question}</h4>

      <div className="space-y-2">
        {poll.options.map((option) => {
          const percentage =
            totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
          const userVoted = option.voters.includes(currentUserId);

          return (
            <button
              key={option.id}
              onClick={() => handleVote(option.id)}
              className="group w-full text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <div className="relative flex-1 rounded-md bg-muted p-2">
                  {/* Progress bar background */}
                  <div
                    className={`absolute inset-0 rounded-md transition-all ${
                      userVoted
                        ? "bg-blue-500/30"
                        : "bg-muted-foreground/10 group-hover:bg-muted-foreground/20"
                    }`}
                    style={{ width: `${percentage}%` }}
                  />

                  {/* Text content */}
                  <div className="relative flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {option.text}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {option.votes} {option.votes === 1 ? "vote" : "votes"}
                      {totalVotes > 0 && ` (${percentage.toFixed(0)}%)`}
                    </span>
                  </div>
                </div>

                {/* Checkmark if user voted */}
                {userVoted && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                    <span className="text-xs text-white">✓</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {poll.endAt && (
        <p className="mt-2 text-xs text-muted-foreground">
          Poll ends {new Date(poll.endAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
```

**SOCKET.IO EVENTS**:
```typescript
// Backend: Add handlers
socket.on("poll:vote", async (data: { messageId, optionId, channelId }) => {
  // Update poll in database
  // Emit updated poll to channel
  io.to(channelRoom(data.channelId)).emit("poll:updated", {
    messageId: data.messageId,
    poll: updatedPoll,
  });
});
```

**INTEGRATION NOTES**:
- Add poll button to composer (next to GIF button)
- Store poll data in message document as embedded object
- Real-time sync via Socket.IO `poll:updated` events
- Track voter IDs to prevent duplicate votes and show participation
- Allow poll deletion only by creator
- Consider optional poll expiration

**ALTERNATIVES CONSIDERED**:
- SurveyJS: Overkill for simple messaging polls, adds complexity
- react-polls: Lightweight but minimal customization
- Firebase: Adds external dependency, overkill for chat context
- Custom: Best control, which is what we're recommending

---

### 6. Read Receipts & Delivery Status

**RECOMMENDATION**: Implement using existing Socket.IO infrastructure with Zustand store. Add three-state system: sent (✓), delivered (✓✓), read (✓✓ blue).

**MESSAGE SCHEMA ADDITION**:
```typescript
export enum MessageStatus {
  SENDING = "SENDING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  READ = "READ",
}

export interface MessageReadReceipt {
  messageId: string;
  userId: string;
  readAt: Date;
}

export interface MessageWithMeta extends Message {
  status: MessageStatus; // Current status
  deliveredAt?: Date;
  readBy?: MessageReadReceipt[]; // Who read this message
  // ... existing fields
}
```

**IMPLEMENTATION EXAMPLE**:

```tsx
// messages/components/MessageStatusIndicator.tsx
import { Check } from "lucide-react";
import { MessageStatus } from "@/shared/types";

interface MessageStatusIndicatorProps {
  status: MessageStatus;
  deliveredAt?: Date;
  readAt?: Date;
  isOwnMessage: boolean;
}

export function MessageStatusIndicator({
  status,
  isOwnMessage,
}: MessageStatusIndicatorProps) {
  if (!isOwnMessage) return null;

  const statusStyles = {
    [MessageStatus.SENDING]: {
      color: "text-gray-400",
      title: "Sending...",
    },
    [MessageStatus.SENT]: {
      color: "text-gray-400",
      title: "Sent",
    },
    [MessageStatus.DELIVERED]: {
      color: "text-gray-400",
      title: "Delivered",
    },
    [MessageStatus.READ]: {
      color: "text-blue-500",
      title: "Read",
    },
  };

  const style = statusStyles[status];

  return (
    <span
      className={`ml-1 inline-block ${style.color}`}
      title={style.title}
    >
      {status === MessageStatus.READ || status === MessageStatus.DELIVERED ? (
        <>
          <Check className="inline h-3.5 w-3.5" />
          <Check className="inline -ml-2 h-3.5 w-3.5" />
        </>
      ) : (
        <Check className="inline h-3.5 w-3.5" />
      )}
    </span>
  );
}

// Integration in MessageItem
export function MessageItem({ message, /* ... */ }: MessageItemProps) {
  return (
    <div>
      {/* ... existing message content ... */}
      <div className="flex items-baseline gap-1">
        <span className="text-xs text-muted-foreground">
          {formatMessageTime(createdAt)}
        </span>
        <MessageStatusIndicator
          status={message.status}
          isOwnMessage={isOwnMessage}
        />
      </div>
    </div>
  );
}
```

**SOCKET.IO EVENTS**:
```typescript
// Client sends read receipt when message comes into view
socket.emit("message:mark-read", { messageId, channelId });

// Server broadcasts to all users in channel
socket.on("message:read", (data: { messageId, readBy }) => {
  // Update store
});
```

**INTEGRATION NOTES**:
- Mark messages as READ when rendered in viewport (use Intersection Observer)
- Debounce read receipts (batch every 100-200ms)
- Store read receipts in database for persistence
- Show read avatars below message when 2+ users have read
- Add privacy setting: `showReadReceipts: boolean` per user

**ALTERNATIVES CONSIDERED**:
- Stream Chat: Built-in solution but adds dependency
- Pusher: Third-party service, more overhead
- Direct database polling: Not real-time

---

### 7. Forwarded Messages & Quotes

**RECOMMENDATION**: Extend MessageWithMeta model with `quotedMessageId` reference. Render quoted message as embedded preview above/below message content.

**MESSAGE SCHEMA ADDITION**:
```typescript
export interface MessageWithMeta extends Message {
  quotedMessageId?: string; // Reference to quoted/forwarded message
  quotedMessage?: MessageWithMeta; // Populated when loading
  isForwarded?: boolean; // Marks explicitly forwarded
  forwardedFrom?: string; // Original author for tracking
}
```

**USAGE EXAMPLE**:

```tsx
// messages/components/QuotedMessagePreview.tsx
import { MessageWithMeta } from "@/shared/types";
import { X } from "lucide-react";

interface QuotedMessagePreviewProps {
  message: MessageWithMeta;
  onRemove?: () => void;
}

export function QuotedMessagePreview({
  message,
  onRemove,
}: QuotedMessagePreviewProps) {
  if (!message.quotedMessage) return null;

  const quoted = message.quotedMessage;

  return (
    <div className="mt-2 rounded-lg border-l-4 border-blue-500 bg-muted/50 p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">
            Replying to {quoted.author.name}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-foreground">
            {quoted.contentPlain || "(attachment)"}
          </p>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// In MessageComposer: show preview of message being replied to
export function MessageComposerWithQuote({
  quotedMessageId,
  channelId,
  onRemoveQuote,
}: {
  quotedMessageId?: string;
  channelId: string;
  onRemoveQuote: () => void;
}) {
  const messages = useMessagesStore(
    (s) => s.messagesByChannel[channelId] ?? []
  );
  const quoted = quotedMessageId
    ? messages.find((m) => m.id === quotedMessageId)
    : null;

  return (
    <div>
      {quoted && (
        <QuotedMessagePreview message={quoted} onRemove={onRemoveQuote} />
      )}
      <MessageComposer
        // ... existing props
        parentId={quotedMessageId}
      />
    </div>
  );
}

// In MessageItem: render quoted message below content
export function MessageItemWithQuote({
  message,
  /* ... */
}: MessageItemProps) {
  return (
    <div>
      {/* ... existing message content ... */}

      {/* Quoted message preview */}
      {message.quotedMessage && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            In reply to {message.quotedMessage.author.name}
          </p>
          <div className="text-sm text-foreground line-clamp-3 border-l-2 border-blue-500 pl-2">
            {message.quotedMessage.contentPlain ||
              "(attachment)"}
          </div>
        </div>
      )}
    </div>
  );
}
```

**CONTEXT MENU INTEGRATION**:
```tsx
// messages/components/MessageActions.tsx
export function MessageActions({
  messageId,
  /* ... */
}: MessageActionsProps) {
  const setQuotedMessage = useMessagesStore((s) => s.setQuotedMessage);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => {
          setQuotedMessage(messageId);
          // Scroll to composer
        }}
        title="Reply to this message"
      >
        Reply
      </button>
      {/* ... other actions ... */}
    </div>
  );
}
```

**INTEGRATION NOTES**:
- Add `quotedMessageId` to MessageSendPayload
- Store reference in database to preserve quote integrity
- Lazy-load quoted message content when rendering
- Support quote chains (quote of quote)
- Add context menu action to quote/reply to message

---

### 8. Message Scheduling

**RECOMMENDATION**: Use **date-fns** (already installed) + Zustand for UI, with backend job queue (Bull/Node-schedule) for sending scheduled messages at correct times. Implement as feature flag initially for gradual rollout.

**MESSAGE SCHEMA ADDITION**:
```typescript
export enum ScheduledMessageStatus {
  SCHEDULED = "SCHEDULED",
  SENT = "SENT",
  CANCELLED = "CANCELLED",
  FAILED = "FAILED",
}

export interface ScheduledMessage {
  id: string;
  channelId: string;
  userId: string;
  content: TiptapJSON;
  contentPlain: string;
  scheduledFor: Date;
  status: ScheduledMessageStatus;
  createdAt: Date;
  sentAt?: Date;
  failureReason?: string;
}
```

**USAGE EXAMPLE**:

```tsx
// messages/components/ScheduleMessageButton.tsx
import { useState } from "react";
import { Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMinutes, format, isBefore, startOfDay } from "date-fns";

interface ScheduleMessageProps {
  onSchedule: (scheduledTime: Date) => void;
}

export function ScheduleMessageButton({ onSchedule }: ScheduleMessageProps) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const now = new Date();
  const minDateTime = addMinutes(now, 5); // Minimum 5 minutes from now

  const handleSchedule = () => {
    if (!selectedDate || !selectedTime) {
      toast.error("Please select date and time");
      return;
    }

    const scheduled = new Date(`${selectedDate}T${selectedTime}`);

    if (isBefore(scheduled, minDateTime)) {
      toast.error("Must schedule at least 5 minutes from now");
      return;
    }

    onSchedule(scheduled);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Schedule message"
        className="rounded p-1.5 text-muted-foreground hover:bg-muted"
      >
        <Clock className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Message</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={format(minDateTime, "yyyy-MM-dd")}
              />
            </div>

            <div>
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
              />
            </div>

            <Button
              onClick={handleSchedule}
              className="w-full"
            >
              Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Integration in MessageComposer
export function MessageComposerWithScheduling({
  channelId,
  /* ... */
}: MessageComposerProps) {
  const [scheduledTime, setScheduledTime] = useState<Date | null>(null);

  const handleSubmit = async (content: TiptapJSON, plainText: string) => {
    if (scheduledTime) {
      // Send to scheduled endpoint
      const res = await fetch("/api/messages/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          content,
          contentPlain: plainText,
          scheduledFor: scheduledTime,
        }),
      });

      if (res.ok) {
        toast.success(`Message scheduled for ${formatDistance(scheduledTime, now)}`);
        setScheduledTime(null);
      }
      return;
    }

    // Normal send
    // ... existing logic ...
  };

  return (
    <div>
      {scheduledTime && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-50 p-2 dark:bg-blue-950">
          <span className="text-sm font-medium">
            Scheduled for {format(scheduledTime, "MMM d, yyyy h:mm a")}
          </span>
          <button
            onClick={() => setScheduledTime(null)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <MessageComposer
          onSubmit={handleSubmit}
          /* ... */
        />
        <ScheduleMessageButton onSchedule={setScheduledTime} />
      </div>
    </div>
  );
}
```

**BACKEND JOB QUEUE** (using node-schedule):
```typescript
// backend/scheduled-messages.ts
import schedule from "node-schedule";
import { prisma } from "@/shared/lib/prisma";
import { sendMessage } from "@/messages/actions";

export function initScheduledMessageQueue() {
  // Check every minute for messages to send
  schedule.scheduleJob("*/1 * * * *", async () => {
    const now = new Date();
    const messagesToSend = await prisma.scheduledMessage.findMany({
      where: {
        status: "SCHEDULED",
        scheduledFor: { lte: now },
      },
    });

    for (const scheduled of messagesToSend) {
      try {
        const message = await sendMessage({
          channelId: scheduled.channelId,
          content: JSON.parse(scheduled.content),
          userId: scheduled.userId,
        });

        await prisma.scheduledMessage.update({
          where: { id: scheduled.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
          },
        });
      } catch (err) {
        await prisma.scheduledMessage.update({
          where: { id: scheduled.id },
          data: {
            status: "FAILED",
            failureReason: err instanceof Error ? err.message : "Unknown error",
          },
        });
      }
    }
  });
}
```

**INTEGRATION NOTES**:
- Add schedule button to composer toolbar
- Show countdown timer on scheduled messages
- Allow editing/cancelling scheduled messages before send time
- Display scheduled messages queue in separate view
- Add feature flag to enable/disable scheduling
- Consider timezone handling for distributed teams

---

## Summary of Recommendations

| Feature | Recommendation | Key Benefit |
|---------|---|---|
| **Animations** | Motion (Framer Motion v5+) | Best React DX, smallest bundle |
| **Audio Messages** | React Voice Visualizer | Web Audio API abstraction, visualization |
| **GIF Search** | Giphy API (or Klipy) | Largest library, well-documented |
| **Link Previews** | Link Preview JS + Metascraper | Hybrid approach, CORS-safe |
| **Polls** | Custom (Zustand + Socket.IO) | Full control, consistent design |
| **Read Receipts** | Custom (Socket.IO events) | Matches existing architecture |
| **Forwarded Messages** | Quoted message references | Simple, effective |
| **Message Scheduling** | node-schedule backend + UI | Async job queue pattern |

## Implementation Priority

1. **Message Animations** (Motion) - Low effort, high visual impact
2. **Link Previews** - Medium effort, frequently used feature
3. **Polls** - Medium effort, engagement tool
4. **Audio Messages** - Medium effort, accessibility feature
5. **Read Receipts** - Low effort once Socket.IO patterns established
6. **GIF Search** - Medium effort, requires API setup
7. **Message Scheduling** - High effort, requires job queue infrastructure
8. **Forwarded Messages** - Low effort, leverages existing quote/thread system

---

## Testing Checklist

When implementing features from this guide:

- [ ] Test on browser tabs (real-time updates work correctly)
- [ ] Test with poor network conditions (graceful degradation)
- [ ] Test accessibility (keyboard navigation, screen readers)
- [ ] Test mobile responsiveness (touch targets, viewport)
- [ ] Test with large message histories (virtualization performance)
- [ ] Test file uploads and edge cases (size limits, corrupted files)
- [ ] Load test Socket.IO events (many users, rapid updates)
- [ ] Test TypeScript coverage (no `any` types)

---

## Sources Referenced

- [Motion Documentation](https://motion.dev/)
- [Top React Animation Libraries 2025](https://www.dronahq.com/react-animation-libraries/)
- [React Voice Visualizer](https://github.com/YZarytskyi/react-voice-visualizer)
- [Link Preview JS](https://github.com/OP-Engineering/link-preview-js)
- [Metascraper](https://github.com/microlinkhq/metascraper)
- [Giphy API Documentation](https://developers.giphy.com/docs/)
- [Stream Chat React SDK](https://getstream.io/chat/docs/react/)
- [PubNub Read Receipts Pattern](https://www.pubnub.com/blog/read-receipts-pattern-for-realtime-chat-apps/)
