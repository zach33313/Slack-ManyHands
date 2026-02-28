import { useAppStore } from '@/store';
import { ChannelType, PresenceStatus } from '@/shared/types';
import type { MessageWithMeta, ChannelWithMeta, Workspace, Channel } from '@/shared/types';

// --- Helpers ---

function createMessage(overrides: Partial<MessageWithMeta> = {}): MessageWithMeta {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    userId: 'user-1',
    content: { type: 'doc', content: [] },
    contentPlain: 'Test message',
    parentId: null,
    replyCount: 0,
    isEdited: false,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    author: { id: 'user-1', name: 'Alice', image: null },
    files: [],
    reactions: [],
    ...overrides,
  };
}

function createChannel(overrides: Partial<ChannelWithMeta> = {}): ChannelWithMeta {
  return {
    id: 'ch-1',
    workspaceId: 'ws-1',
    name: 'general',
    description: null,
    type: ChannelType.PUBLIC,
    isArchived: false,
    createdById: 'user-1',
    createdAt: new Date('2024-01-01'),
    unreadCount: 0,
    memberCount: 5,
    ...overrides,
  };
}

const initialState = {
  user: null,
  currentWorkspace: null,
  workspaces: [],
  channels: [] as ChannelWithMeta[],
  currentChannel: null,
  starredChannels: [] as string[],
  dmParticipants: {},
  messagesByChannel: {} as Record<string, MessageWithMeta[]>,
  activeThread: null,
  threadReplies: [] as MessageWithMeta[],
  presenceMap: {} as Record<string, PresenceStatus>,
  typingByChannel: {},
  unreadCounts: {} as Record<string, number>,
  sidebarOpen: true,
  threadPanelOpen: false,
  searchOpen: false,
  profilePanelOpen: false,
  rightPanelView: null as null,
};

describe('AppStore', () => {
  beforeEach(() => {
    useAppStore.setState(initialState);
  });

  // --- Message Actions ---

  describe('addMessage', () => {
    it('adds a message to a channel', () => {
      const msg = createMessage({ id: 'msg-1', channelId: 'ch-1' });
      useAppStore.getState().addMessage('ch-1', msg);
      expect(useAppStore.getState().messagesByChannel['ch-1']).toEqual([msg]);
    });

    it('appends to existing messages', () => {
      const msg1 = createMessage({ id: 'msg-1' });
      const msg2 = createMessage({ id: 'msg-2' });
      useAppStore.getState().addMessage('ch-1', msg1);
      useAppStore.getState().addMessage('ch-1', msg2);
      expect(useAppStore.getState().messagesByChannel['ch-1']).toHaveLength(2);
    });

    it('prevents duplicate messages by id', () => {
      const msg = createMessage({ id: 'msg-1' });
      useAppStore.getState().addMessage('ch-1', msg);
      useAppStore.getState().addMessage('ch-1', msg);
      expect(useAppStore.getState().messagesByChannel['ch-1']).toHaveLength(1);
    });
  });

  describe('updateMessage', () => {
    it('replaces a message with matching id', () => {
      const msg = createMessage({ id: 'msg-1', contentPlain: 'Original' });
      useAppStore.getState().addMessage('ch-1', msg);

      const updated = createMessage({ id: 'msg-1', contentPlain: 'Updated', isEdited: true });
      useAppStore.getState().updateMessage('ch-1', updated);

      const messages = useAppStore.getState().messagesByChannel['ch-1'];
      expect(messages[0].contentPlain).toBe('Updated');
      expect(messages[0].isEdited).toBe(true);
    });

    it('does not add a message if id is not found', () => {
      const updated = createMessage({ id: 'msg-999' });
      useAppStore.getState().updateMessage('ch-1', updated);
      expect(useAppStore.getState().messagesByChannel['ch-1']).toEqual([]);
    });
  });

  describe('deleteMessage', () => {
    it('soft-deletes a message by marking isDeleted and setting deletedAt', () => {
      const msg1 = createMessage({ id: 'msg-1' });
      const msg2 = createMessage({ id: 'msg-2' });
      useAppStore.getState().addMessage('ch-1', msg1);
      useAppStore.getState().addMessage('ch-1', msg2);

      useAppStore.getState().deleteMessage('ch-1', 'msg-1');
      const messages = useAppStore.getState().messagesByChannel['ch-1'];
      expect(messages).toHaveLength(2);
      expect(messages[0].isDeleted).toBe(true);
      expect(messages[0].deletedAt).toBeInstanceOf(Date);
      expect(messages[1].isDeleted).toBe(false);
    });

    it('handles deletion of nonexistent message gracefully', () => {
      const msg = createMessage({ id: 'msg-1' });
      useAppStore.getState().addMessage('ch-1', msg);
      useAppStore.getState().deleteMessage('ch-1', 'msg-999');
      expect(useAppStore.getState().messagesByChannel['ch-1']).toHaveLength(1);
      expect(useAppStore.getState().messagesByChannel['ch-1'][0].isDeleted).toBe(false);
    });
  });

  describe('prependMessages', () => {
    it('prepends messages before existing ones', () => {
      const existing = createMessage({ id: 'msg-2' });
      const older = createMessage({ id: 'msg-1' });
      useAppStore.getState().addMessage('ch-1', existing);
      useAppStore.getState().prependMessages('ch-1', [older]);

      const messages = useAppStore.getState().messagesByChannel['ch-1'];
      expect(messages[0].id).toBe('msg-1');
      expect(messages[1].id).toBe('msg-2');
    });
  });

  // --- Thread Actions ---

  describe('openThread / closeThread', () => {
    it('openThread sets activeThread, clears replies, opens panel', () => {
      const msg = createMessage({ id: 'msg-1' });
      useAppStore.getState().openThread(msg);

      const state = useAppStore.getState();
      expect(state.activeThread).toEqual(msg);
      expect(state.threadReplies).toEqual([]);
      expect(state.threadPanelOpen).toBe(true);
      expect(state.rightPanelView).toBe('thread');
    });

    it('closeThread resets all thread state', () => {
      const msg = createMessage({ id: 'msg-1' });
      useAppStore.getState().openThread(msg);
      useAppStore.getState().closeThread();

      const state = useAppStore.getState();
      expect(state.activeThread).toBeNull();
      expect(state.threadReplies).toEqual([]);
      expect(state.threadPanelOpen).toBe(false);
      expect(state.rightPanelView).toBeNull();
    });
  });

  describe('addThreadReply', () => {
    it('appends a reply to threadReplies', () => {
      const reply = createMessage({ id: 'reply-1' });
      useAppStore.getState().addThreadReply(reply);
      expect(useAppStore.getState().threadReplies).toHaveLength(1);
      expect(useAppStore.getState().threadReplies[0].id).toBe('reply-1');
    });
  });

  // --- Unread Actions ---

  describe('markChannelRead', () => {
    it('sets unreadCount to 0 in unreadCounts map', () => {
      useAppStore.setState({ unreadCounts: { 'ch-1': 5, 'ch-2': 3 } });
      useAppStore.getState().markChannelRead('ch-1');
      expect(useAppStore.getState().unreadCounts['ch-1']).toBe(0);
      expect(useAppStore.getState().unreadCounts['ch-2']).toBe(3);
    });

    it('also updates channels array unreadCount', () => {
      const channel = createChannel({ id: 'ch-1', unreadCount: 5 });
      useAppStore.setState({ channels: [channel] });
      useAppStore.getState().markChannelRead('ch-1');
      expect(useAppStore.getState().channels[0].unreadCount).toBe(0);
    });
  });

  describe('setUnreadCount', () => {
    it('sets unread count and updates channels array', () => {
      const channel = createChannel({ id: 'ch-1', unreadCount: 0 });
      useAppStore.setState({ channels: [channel] });
      useAppStore.getState().setUnreadCount('ch-1', 7);
      expect(useAppStore.getState().unreadCounts['ch-1']).toBe(7);
      expect(useAppStore.getState().channels[0].unreadCount).toBe(7);
    });
  });

  // --- Workspace & Channel Actions ---

  describe('setCurrentWorkspace', () => {
    it('sets the current workspace', () => {
      const ws: Workspace = {
        id: 'ws-1',
        name: 'Test',
        slug: 'test',
        iconUrl: null,
        ownerId: 'u1',
        createdAt: new Date(),
      };
      useAppStore.getState().setCurrentWorkspace(ws);
      expect(useAppStore.getState().currentWorkspace).toEqual(ws);
    });

    it('can clear workspace to null', () => {
      useAppStore.getState().setCurrentWorkspace(null);
      expect(useAppStore.getState().currentWorkspace).toBeNull();
    });
  });

  describe('setCurrentChannel', () => {
    it('sets the current channel', () => {
      const ch: Channel = {
        id: 'ch-1',
        workspaceId: 'ws-1',
        name: 'general',
        description: null,
        type: ChannelType.PUBLIC,
        isArchived: false,
        createdById: 'u1',
        createdAt: new Date(),
      };
      useAppStore.getState().setCurrentChannel(ch);
      expect(useAppStore.getState().currentChannel).toEqual(ch);
    });
  });

  describe('toggleStarChannel', () => {
    it('adds channel to starred list', () => {
      useAppStore.getState().toggleStarChannel('ch-1');
      expect(useAppStore.getState().starredChannels).toContain('ch-1');
    });

    it('removes channel from starred list when already starred', () => {
      useAppStore.setState({ starredChannels: ['ch-1'] });
      useAppStore.getState().toggleStarChannel('ch-1');
      expect(useAppStore.getState().starredChannels).not.toContain('ch-1');
    });
  });

  // --- Presence Actions ---

  describe('setPresence', () => {
    it('sets presence for a single user', () => {
      useAppStore.getState().setPresence('u1', PresenceStatus.ONLINE);
      expect(useAppStore.getState().presenceMap['u1']).toBe(PresenceStatus.ONLINE);
    });
  });

  describe('setBulkPresence', () => {
    it('merges new presence data with existing', () => {
      useAppStore.setState({ presenceMap: { u1: PresenceStatus.ONLINE } });
      useAppStore.getState().setBulkPresence({ u2: PresenceStatus.AWAY });

      const map = useAppStore.getState().presenceMap;
      expect(map['u1']).toBe(PresenceStatus.ONLINE);
      expect(map['u2']).toBe(PresenceStatus.AWAY);
    });
  });

  // --- Typing Actions ---

  describe('setTyping', () => {
    it('sets typing users for a channel', () => {
      useAppStore.getState().setTyping('ch-1', [{ userId: 'u1', name: 'Alice' }]);
      expect(useAppStore.getState().typingByChannel['ch-1']).toHaveLength(1);
    });
  });

  // --- UI Actions ---

  describe('setRightPanelView', () => {
    it('syncs threadPanelOpen when set to thread', () => {
      useAppStore.getState().setRightPanelView('thread');
      expect(useAppStore.getState().rightPanelView).toBe('thread');
      expect(useAppStore.getState().threadPanelOpen).toBe(true);
      expect(useAppStore.getState().profilePanelOpen).toBe(false);
    });

    it('syncs profilePanelOpen when set to members', () => {
      useAppStore.getState().setRightPanelView('members');
      expect(useAppStore.getState().rightPanelView).toBe('members');
      expect(useAppStore.getState().profilePanelOpen).toBe(true);
      expect(useAppStore.getState().threadPanelOpen).toBe(false);
    });

    it('closes all panels when set to null', () => {
      useAppStore.getState().setRightPanelView('thread');
      useAppStore.getState().setRightPanelView(null);
      expect(useAppStore.getState().rightPanelView).toBeNull();
      expect(useAppStore.getState().threadPanelOpen).toBe(false);
      expect(useAppStore.getState().profilePanelOpen).toBe(false);
    });
  });

  describe('setSidebarOpen', () => {
    it('sets sidebar open state', () => {
      useAppStore.getState().setSidebarOpen(false);
      expect(useAppStore.getState().sidebarOpen).toBe(false);
    });
  });

  describe('setThreadPanelOpen', () => {
    it('opens thread panel and sets rightPanelView to thread', () => {
      useAppStore.getState().setThreadPanelOpen(true);
      expect(useAppStore.getState().threadPanelOpen).toBe(true);
      expect(useAppStore.getState().rightPanelView).toBe('thread');
    });

    it('closes thread panel and sets rightPanelView to null', () => {
      useAppStore.getState().setThreadPanelOpen(true);
      useAppStore.getState().setThreadPanelOpen(false);
      expect(useAppStore.getState().threadPanelOpen).toBe(false);
      expect(useAppStore.getState().rightPanelView).toBeNull();
    });
  });
});
