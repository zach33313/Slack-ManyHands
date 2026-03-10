'use client';

import { useEffect, useState } from 'react';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppStore } from '@/store';
import { useMessagesStore } from '@/messages/store';
import {
  Hash,
  Lock,
  Users,
  UserPlus,
  Menu,
  Phone,
  Video,
  Headphones,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChannelInviteDialog } from '@/channels/components/ChannelInviteDialog';
import { useCallContext } from '@/calls/components/CallProvider';
import type { Channel, MessageWithMeta } from '@/shared/types';
import { TypingIndicator } from '@/presence/components/TypingIndicator';
import { MessageList } from '@/messages/components/MessageList';
import MessageComposer from '@/messages/components/MessageComposer';
import { useMarkChannelRead } from '@/messages/components/ReadReceipt';
import { CanvasTab, type ChannelTab } from '@/canvas/components/CanvasTab';
import { CanvasEditor } from '@/canvas/components/CanvasEditor';
import { HuddleBar } from '@/calls/components/HuddleBar';

interface ChannelViewProps {
  channel: Channel & { memberCount: number };
  initialMessages: MessageWithMeta[];
  dmParticipantName: string | null;
  dmParticipantId?: string | null;
  currentUserId: string;
}

/**
 * Client component for the channel view.
 * Uses the real MessageList (virtualized), MessageComposer (Tiptap),
 * and TypingIndicator components.
 */
export function ChannelView({
  channel,
  initialMessages,
  dmParticipantName,
  dmParticipantId,
  currentUserId,
}: ChannelViewProps) {
  const socket = useSocket();
  const setCurrentChannel = useAppStore((s) => s.setCurrentChannel);
  const markChannelRead = useAppStore((s) => s.markChannelRead);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const setRightPanelView = useAppStore((s) => s.setRightPanelView);
  const currentUserName = useAppStore((s) => s.user?.name ?? '');

  const setMessages = useMessagesStore((s) => s.setMessages);
  const messages = useMessagesStore((s) => s.messagesByChannel[channel.id] ?? initialMessages);
  const lastMessageId = messages[messages.length - 1]?.id ?? '';

  // Emit channel:mark-read so read receipts update for other participants
  useMarkChannelRead(channel.id, lastMessageId);

  const { startCall, joinHuddle } = useCallContext();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ChannelTab>('messages');

  const isDM = channel.type === 'DM';
  const isGroupDM = channel.type === 'GROUP_DM';
  const displayName = isDM || isGroupDM
    ? dmParticipantName ?? channel.name
    : channel.name;

  // Set current channel in store, seed messages store, and join socket room
  useEffect(() => {
    setCurrentChannel(channel);
    setMessages(channel.id, initialMessages);
    markChannelRead(channel.id);

    socket.emit('channel:join', { channelId: channel.id });

    return () => {
      socket.emit('channel:leave', { channelId: channel.id });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  return (
    <div className="flex flex-1 flex-col h-full">
      {/* Channel Header */}
      <header className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2 min-w-0">
          {isDM ? null : channel.type === 'PRIVATE' ? (
            <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <h1 className="font-semibold truncate">{displayName}</h1>
        </div>

        {channel.description && !isDM && (
          <span className="hidden md:block text-sm text-muted-foreground truncate border-l pl-3 ml-1">
            {channel.description}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* 1:1 call button (DMs only) */}
          {isDM && dmParticipantId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => startCall(dmParticipantId, channel.id, '1:1')}
              title="Start call"
            >
              <Phone className="h-4 w-4" />
            </Button>
          )}

          {/* Huddle button (channels and group DMs) */}
          {!isDM && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => joinHuddle(channel.id)}
              title="Start or join huddle"
            >
              <Headphones className="h-4 w-4" />
            </Button>
          )}

          {!isDM && !isGroupDM && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setInviteOpen(true)}
              title="Add member"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setRightPanelView('members')}
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">
              {channel.memberCount}
            </span>
          </Button>
        </div>
      </header>

      {/* Tab bar — Messages | Canvas */}
      <CanvasTab activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Messages Area — virtualized with react-virtuoso */}
      {activeTab === 'messages' && (
        <div className="flex-1 min-h-0">
          <MessageList
            channelId={channel.id}
            channelName={channel.name}
            currentUserId={currentUserId}
          />
        </div>
      )}

      {/* Canvas Area — collaborative Yjs editor */}
      {activeTab === 'canvas' && (
        <div className="flex-1 min-h-0 overflow-auto">
          <CanvasEditor
            channelId={channel.id}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
          />
        </div>
      )}

      {/* Typing Indicator (messages tab only) */}
      {activeTab === 'messages' && (
        <TypingIndicator channelId={channel.id} className="px-4 py-1" />
      )}

      {/* Active huddle bar */}
      <HuddleBar channelId={channel.id} />

      {/* Message Composer — Tiptap rich text editor (messages tab only) */}
      {activeTab === 'messages' && (
        <div className="border-t shrink-0">
          <MessageComposer
            channelId={channel.id}
            channelName={displayName}
            workspaceId={channel.workspaceId}
          />
        </div>
      )}

      {/* Channel Invite Dialog */}
      {!isDM && !isGroupDM && (
        <ChannelInviteDialog
          channelId={channel.id}
          channelName={channel.name}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      )}
    </div>
  );
}
