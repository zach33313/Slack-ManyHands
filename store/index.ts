'use client';

import { create } from 'zustand';
import type {
  User,
  Workspace,
  Channel,
  ChannelWithMeta,
  MessageWithMeta,
  PresenceStatus,
  TypingUser,
  UserSummary,
} from '@/shared/types';

export type RightPanelView = 'thread' | 'members' | 'channel-info' | null;

export interface AppStore {
  // --- Auth ---
  user: User | null;

  // --- Workspace ---
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];

  // --- Channels ---
  channels: ChannelWithMeta[];
  currentChannel: Channel | null;
  starredChannels: string[];

  // --- DM participants (channelId → other user(s)) ---
  dmParticipants: Record<string, UserSummary[]>;

  // --- Messages (keyed by channelId) ---
  messagesByChannel: Record<string, MessageWithMeta[]>;

  // --- Threads ---
  activeThread: MessageWithMeta | null;
  threadReplies: MessageWithMeta[];

  // --- Presence ---
  presenceMap: Record<string, PresenceStatus>;

  // --- Typing ---
  typingByChannel: Record<string, TypingUser[]>;

  // --- Unread ---
  unreadCounts: Record<string, number>;

  // --- UI State ---
  sidebarOpen: boolean;
  threadPanelOpen: boolean;
  searchOpen: boolean;
  profilePanelOpen: boolean;
  rightPanelView: RightPanelView;

  // --- Auth Actions ---
  setUser: (user: User | null) => void;

  // --- Workspace Actions ---
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;

  // --- Channel Actions ---
  setChannels: (channels: ChannelWithMeta[]) => void;
  setCurrentChannel: (channel: Channel | null) => void;
  toggleStarChannel: (channelId: string) => void;
  setDmParticipants: (participants: Record<string, UserSummary[]>) => void;
  mergeDmParticipants: (channelId: string, participants: UserSummary[]) => void;

  // --- Message Actions ---
  addMessage: (channelId: string, message: MessageWithMeta) => void;
  updateMessage: (channelId: string, message: MessageWithMeta) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  setMessages: (channelId: string, messages: MessageWithMeta[]) => void;
  prependMessages: (channelId: string, messages: MessageWithMeta[]) => void;

  // --- Thread Actions ---
  openThread: (message: MessageWithMeta) => void;
  closeThread: () => void;
  setThreadReplies: (replies: MessageWithMeta[]) => void;
  addThreadReply: (reply: MessageWithMeta) => void;

  // --- Presence Actions ---
  setPresence: (userId: string, status: PresenceStatus) => void;
  setBulkPresence: (presenceMap: Record<string, PresenceStatus>) => void;

  // --- Typing Actions ---
  setTyping: (channelId: string, users: TypingUser[]) => void;

  // --- Unread Actions ---
  markChannelRead: (channelId: string) => void;
  setUnreadCount: (channelId: string, count: number) => void;

  // --- UI Actions ---
  setSidebarOpen: (open: boolean) => void;
  setThreadPanelOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setProfilePanelOpen: (open: boolean) => void;
  setRightPanelView: (view: RightPanelView) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // --- Initial State ---
  user: null,
  currentWorkspace: null,
  workspaces: [],
  channels: [],
  currentChannel: null,
  starredChannels: [],
  dmParticipants: {},
  messagesByChannel: {},
  activeThread: null,
  threadReplies: [],
  presenceMap: {},
  typingByChannel: {},
  unreadCounts: {},
  sidebarOpen: true,
  threadPanelOpen: false,
  searchOpen: false,
  profilePanelOpen: false,
  rightPanelView: null,

  // --- Auth Actions ---
  setUser: (user) => set({ user }),

  // --- Workspace Actions ---
  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
  setWorkspaces: (workspaces) => set({ workspaces }),

  // --- Channel Actions ---
  setChannels: (channels) => set({ channels }),
  setCurrentChannel: (channel) => set({ currentChannel: channel }),
  toggleStarChannel: (channelId) =>
    set((state) => {
      const isStarred = state.starredChannels.includes(channelId);
      return {
        starredChannels: isStarred
          ? state.starredChannels.filter((id) => id !== channelId)
          : [...state.starredChannels, channelId],
      };
    }),
  setDmParticipants: (participants) => set({ dmParticipants: participants }),
  mergeDmParticipants: (channelId, participants) =>
    set((state) => ({
      dmParticipants: {
        ...state.dmParticipants,
        [channelId]: participants,
      },
    })),

  // --- Message Actions ---
  addMessage: (channelId, message) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] ?? [];
      // Prevent duplicates
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...existing, message],
        },
      };
    }),

  updateMessage: (channelId, message) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] ?? [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map((m) =>
            m.id === message.id ? message : m
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

  setMessages: (channelId, messages) =>
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: messages,
      },
    })),

  prependMessages: (channelId, messages) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] ?? [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...messages, ...existing],
        },
      };
    }),

  // --- Thread Actions ---
  openThread: (message) =>
    set({
      activeThread: message,
      threadReplies: [],
      threadPanelOpen: true,
      rightPanelView: 'thread',
    }),

  closeThread: () =>
    set({
      activeThread: null,
      threadReplies: [],
      threadPanelOpen: false,
      rightPanelView: null,
    }),

  setThreadReplies: (replies) => set({ threadReplies: replies }),

  addThreadReply: (reply) =>
    set((state) => ({
      threadReplies: [...state.threadReplies, reply],
    })),

  // --- Presence Actions ---
  setPresence: (userId, status) =>
    set((state) => ({
      presenceMap: { ...state.presenceMap, [userId]: status },
    })),

  setBulkPresence: (presenceMap) =>
    set((state) => ({
      presenceMap: { ...state.presenceMap, ...presenceMap },
    })),

  // --- Typing Actions ---
  setTyping: (channelId, users) =>
    set((state) => ({
      typingByChannel: { ...state.typingByChannel, [channelId]: users },
    })),

  // --- Unread Actions ---
  markChannelRead: (channelId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: 0 },
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, unreadCount: 0 } : ch
      ),
    })),

  setUnreadCount: (channelId, count) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: count },
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, unreadCount: count } : ch
      ),
    })),

  // --- UI Actions ---
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setThreadPanelOpen: (open) =>
    set({
      threadPanelOpen: open,
      rightPanelView: open ? 'thread' : null,
    }),

  setSearchOpen: (open) => set({ searchOpen: open }),

  setProfilePanelOpen: (open) =>
    set({
      profilePanelOpen: open,
      rightPanelView: open ? 'members' : null,
    }),

  setRightPanelView: (view) =>
    set({
      rightPanelView: view,
      threadPanelOpen: view === 'thread',
      profilePanelOpen: view === 'members',
    }),
}));
