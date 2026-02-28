/**
 * messages/store.ts
 *
 * Zustand store for managing message state across the application.
 * Handles messages per channel, thread state, unread tracking, and scroll position.
 *
 * Usage:
 *   import { useMessagesStore } from '@/messages/store'
 *   const messages = useMessagesStore(s => s.messagesByChannel[channelId] ?? [])
 */

'use client';

import { create } from 'zustand';
import type { MessageWithMeta } from '@/shared/types';
import type { MessagesState } from './types';

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messagesByChannel: {},
  loadingByChannel: {},
  hasMoreByChannel: {},
  activeThreadId: null,
  threadMessages: [],
  threadLoading: false,
  unreadIndexByChannel: {},
  isAtBottom: true,
  unseenCount: 0,

  setMessages: (channelId, messages) =>
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: messages,
      },
    })),

  prependMessages: (channelId, olderMessages) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] ?? [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...olderMessages, ...existing],
        },
      };
    }),

  addMessage: (channelId, message) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] ?? [];
      // Deduplicate — avoid adding if message already exists
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...existing, message],
        },
      };
    }),

  updateMessage: (channelId, updatedMessage) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] ?? [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map((m) =>
            m.id === updatedMessage.id ? updatedMessage : m
          ),
        },
      };
    }),

  deleteMessage: (channelId, messageId) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] ?? [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map((m) =>
            m.id === messageId
              ? { ...m, isDeleted: true, deletedAt: new Date() }
              : m
          ),
        },
      };
    }),

  setReactions: (channelId, messageId, reactions) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] ?? [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map((m) =>
            m.id === messageId ? { ...m, reactions } : m
          ),
        },
      };
    }),

  setLoading: (channelId, loading) =>
    set((state) => ({
      loadingByChannel: {
        ...state.loadingByChannel,
        [channelId]: loading,
      },
    })),

  setHasMore: (channelId, hasMore) =>
    set((state) => ({
      hasMoreByChannel: {
        ...state.hasMoreByChannel,
        [channelId]: hasMore,
      },
    })),

  setActiveThread: (messageId) =>
    set({ activeThreadId: messageId, threadMessages: [], threadLoading: false }),

  setThreadMessages: (messages) =>
    set({ threadMessages: messages }),

  addThreadMessage: (message) =>
    set((state) => {
      // Deduplicate
      if (state.threadMessages.some((m) => m.id === message.id)) return state;
      return { threadMessages: [...state.threadMessages, message] };
    }),

  setThreadLoading: (loading) =>
    set({ threadLoading: loading }),

  setUnreadIndex: (channelId, index) =>
    set((state) => ({
      unreadIndexByChannel: {
        ...state.unreadIndexByChannel,
        [channelId]: index,
      },
    })),

  setIsAtBottom: (isAtBottom) =>
    set((state) => ({
      isAtBottom,
      // Reset unseen count when user scrolls to bottom
      unseenCount: isAtBottom ? 0 : state.unseenCount,
    })),

  incrementUnseen: () =>
    set((state) => ({
      unseenCount: state.unseenCount + 1,
    })),

  resetUnseen: () =>
    set({ unseenCount: 0 }),

  incrementReplyCount: (channelId, parentId) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] ?? [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map((m) =>
            m.id === parentId ? { ...m, replyCount: m.replyCount + 1 } : m
          ),
        },
      };
    }),
}));
