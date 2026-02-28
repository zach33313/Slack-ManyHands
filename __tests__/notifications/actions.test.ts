/**
 * Tests for notifications/actions.ts
 *
 * Tests server actions for notification creation and management:
 * - createNotification: DB record + socket emit, self-skip, channel pref checks
 * - createMentionNotifications: batch MENTION for @mentioned users
 * - createDMNotification: DM notification for recipient
 * - createThreadReplyNotifications: THREAD_REPLY for thread participants
 * - createReactionNotification: REACTION for message author
 * - markRead: auth-wrapped single mark
 * - markAllNotificationsRead: auth-wrapped bulk mark
 * - updateChannelNotifyPref: auth + membership check
 */

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

// Mock auth
const mockAuth = jest.fn();
jest.mock('../../auth/auth', () => ({
  auth: () => mockAuth(),
}));

// Mock prisma
const mockNotificationCreate = jest.fn();
const mockChannelMemberFindUnique = jest.fn();
const mockChannelMemberUpdate = jest.fn();
const mockMessageFindUnique = jest.fn();
const mockMessageFindMany = jest.fn();

jest.mock('../../shared/lib/prisma', () => ({
  prisma: {
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
    channelMember: {
      findUnique: (...args: unknown[]) => mockChannelMemberFindUnique(...args),
      update: (...args: unknown[]) => mockChannelMemberUpdate(...args),
    },
    message: {
      findUnique: (...args: unknown[]) => mockMessageFindUnique(...args),
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
    },
  },
}));

// Mock socket emitter
const mockEmitToUser = jest.fn();
jest.mock('../../server/socket-emitter', () => ({
  emitToUser: (...args: unknown[]) => mockEmitToUser(...args),
}));

// Mock notification queries (used by markRead / markAllNotificationsRead)
const mockMarkNotificationRead = jest.fn();
const mockMarkAllReadQuery = jest.fn();
jest.mock('../../notifications/queries', () => ({
  markNotificationRead: (...args: unknown[]) =>
    mockMarkNotificationRead(...args),
  markAllRead: (...args: unknown[]) => mockMarkAllReadQuery(...args),
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import {
  createNotification,
  createMentionNotifications,
  createDMNotification,
  createThreadReplyNotifications,
  createReactionNotification,
  markRead,
  markAllNotificationsRead,
  updateChannelNotifyPref,
} from '../../notifications/actions';
import { NotificationType } from '../../shared/types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createNotification', () => {
  const defaultPayload = {
    messageId: 'msg-1',
    channelId: 'ch-1',
    workspaceId: 'ws-1',
    actorId: 'actor-1',
    preview: 'Hello world',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no channel membership (no pref check)
    mockChannelMemberFindUnique.mockResolvedValue(null);
    // Default: notification create succeeds
    mockNotificationCreate.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      actorId: 'actor-1',
      type: 'MENTION',
      payload: JSON.stringify(defaultPayload),
      readAt: null,
      createdAt: new Date('2025-01-15T10:00:00Z'),
      actor: { id: 'actor-1', name: 'Alice', image: null },
    });
  });

  it('creates a DB record and emits socket event', async () => {
    await createNotification(
      NotificationType.MENTION,
      'user-1',
      defaultPayload,
      'actor-1'
    );

    // DB record created
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        actorId: 'actor-1',
        type: 'MENTION',
        payload: JSON.stringify(defaultPayload),
      },
      include: {
        actor: { select: { id: true, name: true, image: true } },
      },
    });

    // Socket event emitted
    expect(mockEmitToUser).toHaveBeenCalledWith(
      'user-1',
      'notification:new',
      expect.objectContaining({
        id: 'notif-1',
        userId: 'user-1',
        type: 'MENTION',
      })
    );
  });

  it('skips notification when recipient equals actor (self-notification)', async () => {
    await createNotification(
      NotificationType.MENTION,
      'user-1',
      defaultPayload,
      'user-1' // same as recipient
    );

    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockEmitToUser).not.toHaveBeenCalled();
  });

  it('skips notification when channel pref is NOTHING', async () => {
    mockChannelMemberFindUnique.mockResolvedValue({
      id: 'cm-1',
      notifyPref: 'NOTHING',
    });

    await createNotification(
      NotificationType.MENTION,
      'user-1',
      defaultPayload,
      'actor-1'
    );

    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('skips non-mention notification when channel pref is MENTIONS', async () => {
    mockChannelMemberFindUnique.mockResolvedValue({
      id: 'cm-1',
      notifyPref: 'MENTIONS',
    });

    await createNotification(
      NotificationType.DM,
      'user-1',
      defaultPayload,
      'actor-1'
    );

    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('allows MENTION type when channel pref is MENTIONS', async () => {
    mockChannelMemberFindUnique.mockResolvedValue({
      id: 'cm-1',
      notifyPref: 'MENTIONS',
    });

    await createNotification(
      NotificationType.MENTION,
      'user-1',
      defaultPayload,
      'actor-1'
    );

    expect(mockNotificationCreate).toHaveBeenCalled();
  });

  it('allows notification when channel pref is ALL', async () => {
    mockChannelMemberFindUnique.mockResolvedValue({
      id: 'cm-1',
      notifyPref: 'ALL',
    });

    await createNotification(
      NotificationType.DM,
      'user-1',
      defaultPayload,
      'actor-1'
    );

    expect(mockNotificationCreate).toHaveBeenCalled();
  });

  it('allows notification when no channel membership exists', async () => {
    mockChannelMemberFindUnique.mockResolvedValue(null);

    await createNotification(
      NotificationType.MENTION,
      'user-1',
      defaultPayload,
      'actor-1'
    );

    expect(mockNotificationCreate).toHaveBeenCalled();
  });

  it('handles socket emit failure gracefully', async () => {
    mockEmitToUser.mockImplementation(() => {
      throw new Error('Socket not initialized');
    });
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await createNotification(
      NotificationType.MENTION,
      'user-1',
      defaultPayload,
      'actor-1'
    );

    // DB record should still be created
    expect(mockNotificationCreate).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('createMentionNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannelMemberFindUnique.mockResolvedValue(null);
    mockNotificationCreate.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      actorId: 'sender-1',
      type: 'MENTION',
      payload: '{}',
      readAt: null,
      createdAt: new Date(),
      actor: { id: 'sender-1', name: 'Sender', image: null },
    });
  });

  it('creates MENTION notifications for all mentioned users', async () => {
    await createMentionNotifications(
      'msg-1',
      'ch-1',
      'ws-1',
      'sender-1',
      'Hey @user2 and @user3',
      ['user-2', 'user-3']
    );

    expect(mockNotificationCreate).toHaveBeenCalledTimes(2);
  });

  it('skips sender in mentioned users (self-notification)', async () => {
    await createMentionNotifications(
      'msg-1',
      'ch-1',
      'ws-1',
      'sender-1',
      'Hey @sender1',
      ['sender-1']
    );

    // Self-notification is filtered by createNotification
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('includes truncated preview in payload', async () => {
    const longContent = 'A'.repeat(200);

    await createMentionNotifications(
      'msg-1',
      'ch-1',
      'ws-1',
      'sender-1',
      longContent,
      ['user-2']
    );

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.stringContaining('...'),
        }),
      })
    );
  });
});

describe('createDMNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannelMemberFindUnique.mockResolvedValue(null);
    mockNotificationCreate.mockResolvedValue({
      id: 'notif-1',
      userId: 'recipient-1',
      actorId: 'sender-1',
      type: 'DM',
      payload: '{}',
      readAt: null,
      createdAt: new Date(),
      actor: { id: 'sender-1', name: 'Sender', image: null },
    });
  });

  it('creates a DM notification for the recipient', async () => {
    await createDMNotification(
      'msg-1',
      'dm-ch-1',
      'ws-1',
      'sender-1',
      'recipient-1',
      'Hello!'
    );

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'recipient-1',
          actorId: 'sender-1',
          type: 'DM',
        }),
      })
    );
  });

  it('does not notify sender about their own DM', async () => {
    await createDMNotification(
      'msg-1',
      'dm-ch-1',
      'ws-1',
      'sender-1',
      'sender-1', // recipient is sender
      'Hello!'
    );

    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });
});

describe('createThreadReplyNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannelMemberFindUnique.mockResolvedValue(null);
    mockNotificationCreate.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      actorId: 'sender-1',
      type: 'THREAD_REPLY',
      payload: '{}',
      readAt: null,
      createdAt: new Date(),
      actor: { id: 'sender-1', name: 'Sender', image: null },
    });
  });

  it('notifies parent author and thread participants', async () => {
    mockMessageFindUnique.mockResolvedValue({ userId: 'author-1' });
    mockMessageFindMany.mockResolvedValue([
      { userId: 'replier-1' },
      { userId: 'replier-2' },
    ]);

    await createThreadReplyNotifications(
      'reply-msg-1',
      'parent-msg-1',
      'ch-1',
      'ws-1',
      'sender-1',
      'New reply'
    );

    // author-1 + replier-1 + replier-2 = 3 notifications
    expect(mockNotificationCreate).toHaveBeenCalledTimes(3);
  });

  it('excludes the sender from notifications', async () => {
    mockMessageFindUnique.mockResolvedValue({ userId: 'sender-1' }); // parent author is sender
    mockMessageFindMany.mockResolvedValue([
      { userId: 'replier-1' },
    ]);

    await createThreadReplyNotifications(
      'reply-msg-1',
      'parent-msg-1',
      'ch-1',
      'ws-1',
      'sender-1',
      'New reply'
    );

    // Only replier-1 (sender-1 is excluded as both parent author and sender)
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
  });

  it('deduplicates participants (parent author who also replied)', async () => {
    mockMessageFindUnique.mockResolvedValue({ userId: 'author-1' });
    mockMessageFindMany.mockResolvedValue([
      { userId: 'author-1' }, // author also replied
      { userId: 'replier-1' },
    ]);

    await createThreadReplyNotifications(
      'reply-msg-1',
      'parent-msg-1',
      'ch-1',
      'ws-1',
      'sender-1',
      'New reply'
    );

    // author-1 (deduplicated) + replier-1 = 2 notifications
    expect(mockNotificationCreate).toHaveBeenCalledTimes(2);
  });

  it('handles missing parent message gracefully', async () => {
    mockMessageFindUnique.mockResolvedValue(null);
    mockMessageFindMany.mockResolvedValue([{ userId: 'replier-1' }]);

    await createThreadReplyNotifications(
      'reply-msg-1',
      'parent-msg-1',
      'ch-1',
      'ws-1',
      'sender-1',
      'New reply'
    );

    // Only replier-1 notified (no parent author)
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
  });
});

describe('createReactionNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannelMemberFindUnique.mockResolvedValue(null);
    mockNotificationCreate.mockResolvedValue({
      id: 'notif-1',
      userId: 'author-1',
      actorId: 'reactor-1',
      type: 'REACTION',
      payload: '{}',
      readAt: null,
      createdAt: new Date(),
      actor: { id: 'reactor-1', name: 'Reactor', image: null },
    });
  });

  it('creates a REACTION notification for the message author', async () => {
    await createReactionNotification(
      'msg-1',
      'ch-1',
      'ws-1',
      'reactor-1',
      'author-1',
      '👍'
    );

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'REACTION',
          userId: 'author-1',
          actorId: 'reactor-1',
        }),
      })
    );
  });

  it('does not notify user about their own reaction', async () => {
    await createReactionNotification(
      'msg-1',
      'ch-1',
      'ws-1',
      'author-1',
      'author-1', // reactor is the author
      '👍'
    );

    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });
});

describe('markRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks notification as read for authenticated user', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
    });
    mockMarkNotificationRead.mockResolvedValue(true);

    const result = await markRead('notif-1');

    expect(result).toBe(true);
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('notif-1', 'user-1');
  });

  it('throws when user is not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(markRead('notif-1')).rejects.toThrow('Unauthorized');
    expect(mockMarkNotificationRead).not.toHaveBeenCalled();
  });

  it('throws when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: { id: undefined } });

    await expect(markRead('notif-1')).rejects.toThrow('Unauthorized');
  });
});

describe('markAllNotificationsRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks all notifications as read for authenticated user', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
    });
    mockMarkAllReadQuery.mockResolvedValue(5);

    const count = await markAllNotificationsRead();

    expect(count).toBe(5);
    expect(mockMarkAllReadQuery).toHaveBeenCalledWith('user-1');
  });

  it('throws when user is not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(markAllNotificationsRead()).rejects.toThrow('Unauthorized');
    expect(mockMarkAllReadQuery).not.toHaveBeenCalled();
  });
});

describe('updateChannelNotifyPref', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
    });
  });

  it('updates notification preference for channel member', async () => {
    mockChannelMemberFindUnique.mockResolvedValue({
      id: 'cm-1',
      channelId: 'ch-1',
      userId: 'user-1',
    });
    mockChannelMemberUpdate.mockResolvedValue({});

    await updateChannelNotifyPref('ch-1', 'MENTIONS' as any);

    expect(mockChannelMemberUpdate).toHaveBeenCalledWith({
      where: { id: 'cm-1' },
      data: { notifyPref: 'MENTIONS' },
    });
  });

  it('throws when user is not a member of the channel', async () => {
    mockChannelMemberFindUnique.mockResolvedValue(null);

    await expect(
      updateChannelNotifyPref('ch-1', 'MENTIONS' as any)
    ).rejects.toThrow('Not a member of this channel');

    expect(mockChannelMemberUpdate).not.toHaveBeenCalled();
  });

  it('throws when user is not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(
      updateChannelNotifyPref('ch-1', 'MENTIONS' as any)
    ).rejects.toThrow('Unauthorized');

    expect(mockChannelMemberFindUnique).not.toHaveBeenCalled();
  });
});
