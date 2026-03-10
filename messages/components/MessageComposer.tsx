'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import SlackEditor from '@/components/editor/SlackEditor'
import { useSocket } from '@/shared/hooks/useSocket'
import { useAppStore } from '@/store'
import { TYPING_TIMEOUT, MAX_FILE_SIZE } from '@/shared/lib/constants'
import { cn } from '@/shared/lib/utils'
import { formatFileSize } from '@/shared/lib/utils'
import { X, FileIcon, ImageIcon, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { updateProfile } from '@/members/actions'
import { updateChannel, updateChannelNotifyPref } from '@/channels/actions'
import type { TiptapJSON } from '@/shared/types'
import type { MessageSendPayload } from '@/shared/types/socket'
import { GifSearchPanel } from '@/gifs/components/GifSearchPanel'
import { SchedulePicker } from '@/scheduling/components/SchedulePicker'
import { AudioRecorder } from './AudioRecorder'
import type { TenorGif } from '@/gifs/types'

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

interface PendingFile {
  file: File
  id: string
  uploadedId?: string
  uploading: boolean
  error?: string
}

interface MessageComposerProps {
  channelId: string
  channelName: string
  workspaceId: string
  parentId?: string
  disabled?: boolean
}

/**
 * Message composer wrapper used in channel and thread views.
 * Wraps SlackEditor with:
 * - Socket.IO `message:send` integration
 * - File upload with drag-drop zone
 * - Attached file chips (removable before sending)
 * - Typing indicator emission (typing:start/typing:stop)
 */
export default function MessageComposer({
  channelId,
  channelName,
  workspaceId,
  parentId,
  disabled = false,
}: MessageComposerProps) {
  const socket = useSocket()
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)
  const fileIdCounter = useRef(0)

  // GIF picker state
  const [showGifPicker, setShowGifPicker] = useState(false)
  // Schedule picker state
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleContent, setScheduleContent] = useState<{ contentJson: TiptapJSON; contentPlain: string } | null>(null)

  // Clean up typing state on unmount or channel change
  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        socket.emit('typing:stop', { channelId })
        isTypingRef.current = false
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = null
      }
    }
  }, [channelId, socket])

  // Emit typing indicators
  const emitTypingStart = useCallback(() => {
    if (!isTypingRef.current) {
      socket.emit('typing:start', { channelId })
      isTypingRef.current = true
    }

    // Reset the idle timer
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { channelId })
      isTypingRef.current = false
      typingTimeoutRef.current = null
    }, TYPING_TIMEOUT)
  }, [channelId, socket])

  const emitTypingStop = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
    if (isTypingRef.current) {
      socket.emit('typing:stop', { channelId })
      isTypingRef.current = false
    }
  }, [channelId, socket])

  // Upload a single file to the server
  const uploadFile = useCallback(
    async (pendingFile: PendingFile) => {
      if (pendingFile.file.size > MAX_FILE_SIZE) {
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.id === pendingFile.id
              ? {
                  ...f,
                  uploading: false,
                  error: `File too large (max ${formatFileSize(MAX_FILE_SIZE)})`,
                }
              : f
          )
        )
        return
      }

      const formData = new FormData()
      formData.append('file', pendingFile.file)

      try {
        const res = await fetch('/api/files', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          throw new Error(`Upload failed: ${res.statusText}`)
        }

        const data = await res.json()
        const uploadedId = data.data?.id || data.id

        setPendingFiles((prev) =>
          prev.map((f) =>
            f.id === pendingFile.id
              ? { ...f, uploading: false, uploadedId }
              : f
          )
        )
      } catch (err) {
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.id === pendingFile.id
              ? {
                  ...f,
                  uploading: false,
                  error:
                    err instanceof Error ? err.message : 'Upload failed',
                }
              : f
          )
        )
      }
    },
    []
  )

  // Handle file addition (from drag-drop or attachment button)
  const handleFileUpload = useCallback(
    (files: File[]) => {
      const newPendingFiles: PendingFile[] = files.map((file) => ({
        file,
        id: `file-${++fileIdCounter.current}`,
        uploading: true,
      }))

      setPendingFiles((prev) => [...prev, ...newPendingFiles])

      // Upload each file
      newPendingFiles.forEach((pf) => uploadFile(pf))
    },
    [uploadFile]
  )

  // Remove a pending file
  const removeFile = useCallback((fileId: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId))
  }, [])

  // Submit handler — sends message via Socket.IO, intercepts slash commands
  const handleSubmit = useCallback(
    async (content: TiptapJSON, plainText: string) => {
      // Stop typing indicator
      emitTypingStop()

      const trimmed = plainText.trim()

      // --- Slash command interception ---
      if (trimmed.startsWith('/')) {
        const parts = trimmed.split(/\s+/)
        const command = parts[0].toLowerCase()
        const args = trimmed.slice(command.length).trim()

        switch (command) {
          case '/status': {
            // Parse: /status :emoji: text  OR  /status emoji text
            let emoji = ''
            let text = args
            // Try to extract a leading emoji (single character or :shortcode:)
            const emojiMatch = args.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)/u)
            if (emojiMatch) {
              emoji = emojiMatch[0]
              text = args.slice(emoji.length).trim()
            }
            try {
              const updated = await updateProfile({
                statusEmoji: emoji || undefined,
                statusText: text || undefined,
              })
              const store = useAppStore.getState()
              if (store.user) {
                store.setUser({
                  ...store.user,
                  statusEmoji: updated.statusEmoji,
                  statusText: updated.statusText,
                })
              }
              toast.success('Status updated')
            } catch (err) {
              toast.error('Failed to update status')
            }
            return
          }
          case '/away': {
            // Read current status synchronously before the async call so the toggle
            // decision is based on the state at the moment the command was submitted.
            const isCurrentlyAway = useAppStore.getState().user?.statusText === 'Away'
            try {
              const updated = await updateProfile({
                statusEmoji: isCurrentlyAway ? '' : '🌙',
                statusText: isCurrentlyAway ? '' : 'Away',
              })
              // Re-read store after the await to avoid spreading stale user data.
              const store = useAppStore.getState()
              if (store.user) {
                store.setUser({
                  ...store.user,
                  statusEmoji: updated.statusEmoji,
                  statusText: updated.statusText,
                })
              }
              toast.success(isCurrentlyAway ? 'Away status cleared' : 'Away status set')
            } catch (err) {
              toast.error('Failed to toggle away status')
            }
            return
          }
          case '/mute': {
            try {
              await updateChannelNotifyPref(channelId, 'NOTHING')
              toast.success('Channel muted')
            } catch (err) {
              toast.error('Failed to mute channel')
            }
            return
          }
          case '/invite': {
            const email = args.trim()
            if (!email) {
              toast.error('Usage: /invite user@example.com')
              return
            }
            try {
              const res = await fetch(`/api/channels/${channelId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
              })
              if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error?.message ?? 'Failed to invite')
              }
              toast.success(`Invited ${email} to the channel`)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Failed to invite user')
            }
            return
          }
          case '/topic': {
            const topic = args.trim()
            if (!topic) {
              toast.error('Usage: /topic New topic here')
              return
            }
            try {
              await updateChannel(channelId, { topic })
              toast.success('Channel topic updated')
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Failed to update topic')
            }
            return
          }
          case '/remind': {
            toast.info('Reminders are not yet supported')
            return
          }
          case '/poll': {
            // Format: /poll Question? | Option 1 | Option 2 | Option 3
            if (!args) {
              toast.error('Usage: /poll Question? | Option 1 | Option 2')
              return
            }
            const parts = args.split('|').map((p) => p.trim()).filter(Boolean)
            if (parts.length < 3) {
              toast.error('Usage: /poll Question? | Option 1 | Option 2')
              return
            }
            const question = parts[0]!
            const options = parts.slice(1)
            if (options.length < 2) {
              toast.error('A poll needs at least 2 options')
              return
            }
            {
              const messageContentJson: TiptapJSON = {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: `📊 Poll: ${question}` }] },
                ],
              }
              socket.emit(
                'message:send',
                {
                  channelId,
                  content: messageContentJson as unknown as Record<string, unknown>,
                  ...(parentId && { parentId }),
                  poll: { question, options },
                } as any,
                (res: { ok: boolean; error?: string }) => {
                  if (res.ok) {
                    toast.success('Poll created!')
                  } else {
                    toast.error(res.error ?? 'Failed to create poll')
                  }
                }
              )
            }
            return
          }
          default:
            // Not a known command — fall through to send as message
            break
        }
      }

      // --- Normal message send ---
      // Guard: if any file is still uploading, block send and tell the user
      if (pendingFiles.some((f) => f.uploading)) {
        toast.error('Please wait for files to finish uploading')
        return
      }

      // Collect uploaded file IDs (skip files that failed or are still uploading)
      const fileIds = pendingFiles
        .filter((f) => f.uploadedId && !f.error)
        .map((f) => f.uploadedId!)

      const payload: MessageSendPayload = {
        channelId,
        content: content as unknown as Record<string, unknown>,
        ...(parentId && { parentId }),
        ...(fileIds.length > 0 && { fileIds }),
      }

      socket.emit('message:send', payload)

      // Clear pending files after send
      setPendingFiles([])
    },
    [channelId, parentId, pendingFiles, socket, emitTypingStop]
  )

  // Drag-and-drop handlers for the composer wrapper
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set false if we're leaving the container (not entering a child)
    if (
      e.currentTarget === e.target ||
      !e.currentTarget.contains(e.relatedTarget as Node)
    ) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = e.dataTransfer?.files
      if (files?.length) {
        handleFileUpload(Array.from(files))
      }
    },
    [handleFileUpload]
  )

  // Attach typing start to editor activity
  // We hook into editor updates by wrapping the SlackEditor in a div with keyboard listeners
  const handleKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      // Emit typing for any printable character (not just Enter/modifiers)
      if (
        e.key.length === 1 ||
        e.key === 'Backspace' ||
        e.key === 'Delete'
      ) {
        emitTypingStart()
      }
    },
    [emitTypingStart]
  )

  // Handle audio recording send — file is already uploaded; attach it via fileId
  const handleAudioSend = useCallback(
    async (fileId: string, fileName: string, mimeType: string, size: number, duration: number) => {
      const contentJson: TiptapJSON = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { audioMetadata: { fileName, mimeType, size, duration } },
            content: [{ type: 'text', text: '🎙️ Voice message' }],
          },
        ],
      }
      const payload: MessageSendPayload = {
        channelId,
        content: contentJson as unknown as Record<string, unknown>,
        ...(parentId && { parentId }),
        fileIds: [fileId],
        audioMetadata: { fileName, mimeType, size, duration },
      }
      socket.emit('message:send', payload)
    },
    [channelId, parentId, socket]
  )

  // Handle GIF selection — send as image message
  const handleGifSelect = useCallback(
    (gif: TenorGif) => {
      const contentJson: TiptapJSON = {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: gif.url,
              alt: gif.title || 'GIF',
              title: gif.title || 'GIF',
            },
          },
        ],
      }
      const payload: MessageSendPayload = {
        channelId,
        content: contentJson as unknown as Record<string, unknown>,
        ...(parentId && { parentId }),
      }
      socket.emit('message:send', payload)
      setShowGifPicker(false)
    },
    [channelId, parentId, socket]
  )

  // Handle schedule button click — capture content and open picker
  const handleScheduleClick = useCallback(
    (contentJson: TiptapJSON, contentPlain: string) => {
      if (!contentPlain.trim()) {
        toast.error('Write a message first to schedule it')
        return
      }
      setScheduleContent({ contentJson, contentPlain })
      setScheduleOpen(true)
    },
    []
  )

  const placeholderText = parentId
    ? 'Reply...'
    : `Message #${channelName}`

  const hasFilesUploading = pendingFiles.some((f) => f.uploading)

  return (
    <div
      className={cn('relative px-4 pb-4', isDragOver && 'ring-2 ring-primary/50 rounded-lg')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay indicator */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/5 border-2 border-dashed border-primary/30 pointer-events-none">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Paperclip className="h-5 w-5" />
            Drop files to upload
          </div>
        </div>
      )}

      {/* Pending file attachments */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingFiles.map((pf) => (
            <div
              key={pf.id}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
                pf.error
                  ? 'border-destructive/50 bg-destructive/5 text-destructive'
                  : 'border-border bg-muted/50'
              )}
            >
              {pf.file.type.startsWith('image/') ? (
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="max-w-[150px] truncate">{pf.file.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(pf.file.size)}
              </span>
              {pf.uploading && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  Uploading...
                </span>
              )}
              {pf.error && (
                <span className="text-xs text-destructive">{pf.error}</span>
              )}
              <button
                type="button"
                onClick={() => removeFile(pf.id)}
                className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label={`Remove ${pf.file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* GIF picker overlay (positioned above composer) */}
      {showGifPicker && (
        <div className="relative">
          <GifSearchPanel
            onSelect={handleGifSelect}
            onClose={() => setShowGifPicker(false)}
          />
        </div>
      )}

      {/* Schedule picker popover */}
      {scheduleOpen && scheduleContent && (
        <div className="absolute bottom-full left-0 mb-2 z-50 bg-popover border rounded-lg shadow-lg min-w-[240px]">
          <SchedulePicker
            channelId={channelId}
            contentJson={scheduleContent.contentJson}
            contentPlain={scheduleContent.contentPlain}
            onScheduled={() => {
              setScheduleOpen(false)
              setScheduleContent(null)
            }}
            onCancel={() => {
              setScheduleOpen(false)
              setScheduleContent(null)
            }}
          />
        </div>
      )}

      {/* Editor wrapper with keyboard capture for typing indicator */}
      <div onKeyDownCapture={handleKeyDownCapture}>
        <SlackEditor
          onSubmit={handleSubmit}
          placeholder={placeholderText}
          disabled={disabled}
          workspaceId={workspaceId}
          onFileUpload={IS_DEMO ? undefined : handleFileUpload}
          onGifClick={IS_DEMO ? undefined : () => setShowGifPicker((prev) => !prev)}
          onScheduleClick={handleScheduleClick}
          extraToolbarButtons={
            <AudioRecorder onSend={handleAudioSend} />
          }
        />
      </div>
    </div>
  )
}
