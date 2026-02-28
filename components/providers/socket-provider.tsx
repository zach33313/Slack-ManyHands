'use client';

import { useEffect, type ReactNode } from 'react';
import { getSocket, disconnectSocket } from '@/shared/lib/socket-client';
import { useAppStore } from '@/store';
import { useMessagesStore } from '@/messages/store';
import { usePresenceStore } from '@/presence/store';
import { usePresence } from '@/presence/hooks/usePresence';

/**
 * SocketProvider connects the Socket.IO client on mount and registers
 * global event handlers that update the Zustand store. Place this inside
 * the authenticated layout so the socket is only created after login.
 *
 * Also initializes the usePresence hook for heartbeats and activity detection.
 * Syncs presence and typing data to both useAppStore and usePresenceStore
 * so components from either domain can access the same data.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const setPresence = useAppStore((s) => s.setPresence);
  const setTyping = useAppStore((s) => s.setTyping);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateMessage = useAppStore((s) => s.updateMessage);
  const deleteMessage = useAppStore((s) => s.deleteMessage);
  const addThreadReply = useAppStore((s) => s.addThreadReply);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const setChannels = useAppStore((s) => s.setChannels);
  const mergeDmParticipants = useAppStore((s) => s.mergeDmParticipants);

  const presenceSetPresence = usePresenceStore((s) => s.setPresence);
  const presenceSetTyping = usePresenceStore((s) => s.setTypingUsers);

  // Initialize presence heartbeats and activity detection
  usePresence();

  useEffect(() => {
    const socket = getSocket();

    const handlePresenceUpdate = (payload: { userId: string; status: import('@/shared/types').PresenceStatus }) => {
      setPresence(payload.userId, payload.status);
      presenceSetPresence(payload.userId, payload.status);
    };

    const handleTypingUsers = (payload: { channelId: string; users: import('@/shared/types').TypingUser[] }) => {
      setTyping(payload.channelId, payload.users);
      presenceSetTyping(payload.channelId, payload.users);
    };

    const handleNewMessage = (message: import('@/shared/types').MessageWithMeta) => {
      // Skip thread replies — they are handled by the thread:reply handler
      if (message.parentId) return;
      addMessage(message.channelId, message);
      useMessagesStore.getState().addMessage(message.channelId, message);

      // Increment unread count for channels that aren't the currently active channel
      const store = useAppStore.getState();
      const isOwnMessage = message.userId === store.user?.id;
      const isActiveChannel = store.currentChannel?.id === message.channelId;
      if (!isOwnMessage && !isActiveChannel) {
        const currentCount = store.unreadCounts[message.channelId] ?? 0;
        setUnreadCount(message.channelId, currentCount + 1);
      }
    };

    const handleUpdatedMessage = (message: import('@/shared/types').MessageWithMeta) => {
      updateMessage(message.channelId, message);
      useMessagesStore.getState().updateMessage(message.channelId, message);
    };

    const handleDeletedMessage = (payload: { messageId: string; channelId: string }) => {
      deleteMessage(payload.channelId, payload.messageId);
      useMessagesStore.getState().deleteMessage(payload.channelId, payload.messageId);
    };

    const handleThreadReply = (message: import('@/shared/types').MessageWithMeta) => {
      const { activeThread } = useAppStore.getState();
      if (activeThread && message.parentId === activeThread.id) {
        addThreadReply(message);
      }
      // Also sync thread replies and parent reply count to messages store
      if (message.parentId) {
        useMessagesStore.getState().addThreadMessage(message);
        useMessagesStore.getState().incrementReplyCount(message.channelId, message.parentId);
      }
    };

    const handleUnreadUpdate = (payload: { channelId: string; unreadCount: number }) => {
      setUnreadCount(payload.channelId, payload.unreadCount);
    };

    const handleChannelCreated = (channel: import('@/shared/types').Channel) => {
      const store = useAppStore.getState();
      // Dedup: don't add if channel already exists
      if (store.channels.some((ch) => ch.id === channel.id)) return;
      const isDm = channel.type === 'DM' || channel.type === 'GROUP_DM';
      const enrichedChannel = { ...channel, unreadCount: 0, memberCount: isDm ? 2 : 1 };
      setChannels([...store.channels, enrichedChannel]);
    };

    const handleDmParticipants = (payload: { channelId: string; participants: import('@/shared/types').UserSummary[] }) => {
      const store = useAppStore.getState();
      const currentUserId = store.user?.id;
      // Filter out current user from participants
      const otherParticipants = currentUserId
        ? payload.participants.filter((p) => p.id !== currentUserId)
        : payload.participants;
      mergeDmParticipants(payload.channelId, otherParticipants);
    };

    const handleChannelUpdated = (channel: import('@/shared/types').Channel) => {
      const store = useAppStore.getState();
      setChannels(
        store.channels.map((ch) =>
          ch.id === channel.id
            ? { ...ch, name: channel.name, description: channel.description }
            : ch
        )
      );
    };

    socket.on('presence:update', handlePresenceUpdate);
    socket.on('typing:users', handleTypingUsers);
    socket.on('message:new', handleNewMessage);
    socket.on('message:updated', handleUpdatedMessage);
    socket.on('message:deleted', handleDeletedMessage);
    socket.on('thread:reply', handleThreadReply);
    socket.on('unread:update', handleUnreadUpdate);
    socket.on('channel:created', handleChannelCreated);
    socket.on('channel:updated', handleChannelUpdated);
    socket.on('dm:participants', handleDmParticipants);

    return () => {
      socket.off('presence:update', handlePresenceUpdate);
      socket.off('typing:users', handleTypingUsers);
      socket.off('message:new', handleNewMessage);
      socket.off('message:updated', handleUpdatedMessage);
      socket.off('message:deleted', handleDeletedMessage);
      socket.off('thread:reply', handleThreadReply);
      socket.off('unread:update', handleUnreadUpdate);
      socket.off('channel:created', handleChannelCreated);
      socket.off('channel:updated', handleChannelUpdated);
      socket.off('dm:participants', handleDmParticipants);
    };
  }, [
    setPresence,
    setTyping,
    addMessage,
    updateMessage,
    deleteMessage,
    addThreadReply,
    setUnreadCount,
    setChannels,
    mergeDmParticipants,
    presenceSetPresence,
    presenceSetTyping,
  ]);

  return <>{children}</>;
}
