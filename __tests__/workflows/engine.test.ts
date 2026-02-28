/**
 * Tests for workflows/engine.ts
 *
 * Verifies workflow automation execution:
 * - executeWorkflowsForEvent queries enabled workflows matching trigger type
 * - Evaluates trigger conditions (channel match, keyword match, emoji match)
 * - Executes actions: send_message, add_reaction, send_dm, post_thread_reply
 * - Substitutes template variables: {{user.name}}, {{channel.name}}, {{message.text}}
 * - Creates WorkflowExecution record with correct status (success / failed / partial)
 * - Per-workflow error isolation and Socket.IO emission
 */

// ---------------------------------------------------------------------------
// Socket-emitter mock
// ---------------------------------------------------------------------------

const mockIOEmit = jest.fn();
const mockIOTo = jest.fn().mockReturnValue({ emit: mockIOEmit });
const mockGetIO = jest.fn();

jest.mock('../../server/socket-emitter', () => ({
  getIO: mockGetIO,
}));

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockPrismaWorkflow = {
  findMany: jest.fn(),
};

const mockPrismaWorkflowExecution = {
  create: jest.fn(),
};

const mockPrismaMessage = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};

const mockPrismaReaction = {
  upsert: jest.fn(),
  findMany: jest.fn(),
};

const mockPrismaChannel = {
  findFirst: jest.fn(),
  create: jest.fn(),
  findUnique: jest.fn(),
};

const mockPrismaUser = {
  findUnique: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    workflow: mockPrismaWorkflow,
    workflowExecution: mockPrismaWorkflowExecution,
    message: mockPrismaMessage,
    reaction: mockPrismaReaction,
    channel: mockPrismaChannel,
    user: mockPrismaUser,
  })),
}));

jest.mock('../../shared/lib/constants', () => ({
  channelRoom: (id: string) => `channel:${id}`,
  userRoom: (id: string) => `user:${id}`,
  workspaceRoom: (id: string) => `workspace:${id}`,
}));

import { executeWorkflowsForEvent } from '../../workflows/engine';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wf-1',
    workspaceId: 'ws-1',
    name: 'Test Workflow',
    enabled: true,
    triggerType: 'message_posted',
    triggerConfig: '{}',
    actions: [],
    ...overrides,
  };
}

function makeAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-1',
    workflowId: 'wf-1',
    sequence: 0,
    actionType: 'send_message',
    config: JSON.stringify({ targetChannelId: 'ch-target', messageText: 'Hello!' }),
    ...overrides,
  };
}

function makeDbMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-created',
    channelId: 'ch-target',
    userId: 'user-actor',
    contentJson: '{"type":"doc","content":[]}',
    contentPlain: 'Hello!',
    parentId: null,
    replyCount: 0,
    isEdited: false,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    author: { id: 'user-actor', name: 'Actor', image: null },
    files: [],
    reactions: [],
    ...overrides,
  };
}

const baseContext = {
  workspaceId: 'ws-1',
  channelId: 'ch-1',
  messageId: 'msg-1',
  userId: 'user-actor',
  contentPlain: 'Hello world',
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Workflow Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetIO.mockReturnValue({ to: mockIOTo });
    mockIOTo.mockReturnValue({ emit: mockIOEmit });
    mockPrismaWorkflowExecution.create.mockResolvedValue({ id: 'exec-1' });
  });

  // -------------------------------------------------------------------------
  // Guard conditions
  // -------------------------------------------------------------------------

  describe('guard conditions', () => {
    it('returns early when workspaceId is missing from context', async () => {
      const context = { channelId: 'ch-1', messageId: 'msg-1', userId: 'user-1' };

      await executeWorkflowsForEvent('message_posted', context);

      expect(mockPrismaWorkflow.findMany).not.toHaveBeenCalled();
    });

    it('does nothing when no matching workflows found', async () => {
      mockPrismaWorkflow.findMany.mockResolvedValue([]);

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaWorkflowExecution.create).not.toHaveBeenCalled();
    });

    it('queries workflows filtered by workspaceId, enabled=true, and triggerType', async () => {
      mockPrismaWorkflow.findMany.mockResolvedValue([]);

      await executeWorkflowsForEvent('member_joined', { workspaceId: 'ws-1', userId: 'user-1' });

      expect(mockPrismaWorkflow.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', enabled: true, triggerType: 'member_joined' },
        include: {
          actions: {
            orderBy: { sequence: 'asc' },
            select: { id: true, sequence: true, actionType: true, config: true },
          },
        },
      });
    });

    it('handles DB query failure gracefully', async () => {
      mockPrismaWorkflow.findMany.mockRejectedValue(new Error('DB down'));

      await expect(
        executeWorkflowsForEvent('message_posted', baseContext)
      ).resolves.toBeUndefined();

      expect(mockPrismaWorkflowExecution.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Trigger condition: message_posted
  // -------------------------------------------------------------------------

  describe('trigger: message_posted', () => {
    it('triggers when no channelId filter is configured', async () => {
      const wf = makeWorkflow({ triggerType: 'message_posted', triggerConfig: '{}', actions: [makeAction()] });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );
    });

    it('triggers when message channelId matches trigger config channelId', async () => {
      const wf = makeWorkflow({
        triggerType: 'message_posted',
        triggerConfig: JSON.stringify({ channelId: 'ch-1' }),
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', { ...baseContext, channelId: 'ch-1' });

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalled();
    });

    it('does NOT trigger when message channelId does not match config', async () => {
      const wf = makeWorkflow({
        triggerType: 'message_posted',
        triggerConfig: JSON.stringify({ channelId: 'ch-other' }),
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);

      await executeWorkflowsForEvent('message_posted', { ...baseContext, channelId: 'ch-1' });

      expect(mockPrismaWorkflowExecution.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Trigger condition: message_contains
  // -------------------------------------------------------------------------

  describe('trigger: message_contains', () => {
    it('triggers when message text contains the keyword (case-insensitive)', async () => {
      const wf = makeWorkflow({
        triggerType: 'message_contains',
        triggerConfig: JSON.stringify({ keyword: 'urgent' }),
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_contains', {
        ...baseContext,
        contentPlain: 'This is URGENT please review',
      });

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );
    });

    it('does NOT trigger when message does not contain the keyword', async () => {
      const wf = makeWorkflow({
        triggerType: 'message_contains',
        triggerConfig: JSON.stringify({ keyword: 'urgent' }),
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);

      await executeWorkflowsForEvent('message_contains', {
        ...baseContext,
        contentPlain: 'Good morning everyone!',
      });

      expect(mockPrismaWorkflowExecution.create).not.toHaveBeenCalled();
    });

    it('does NOT trigger when keyword is missing from triggerConfig', async () => {
      const wf = makeWorkflow({
        triggerType: 'message_contains',
        triggerConfig: '{}', // no keyword configured
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);

      await executeWorkflowsForEvent('message_contains', baseContext);

      expect(mockPrismaWorkflowExecution.create).not.toHaveBeenCalled();
    });

    it('performs case-insensitive keyword matching', async () => {
      const wf = makeWorkflow({
        triggerType: 'message_contains',
        triggerConfig: JSON.stringify({ keyword: 'HELLO' }),
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_contains', {
        ...baseContext,
        contentPlain: 'hello world',
      });

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Trigger condition: member_joined
  // -------------------------------------------------------------------------

  describe('trigger: member_joined', () => {
    it('triggers on member_joined with matching workspaceId', async () => {
      const wf = makeWorkflow({
        triggerType: 'member_joined',
        triggerConfig: '{}',
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('member_joined', {
        workspaceId: 'ws-1',
        userId: 'new-user-1',
      });

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Trigger condition: reaction_added
  // -------------------------------------------------------------------------

  describe('trigger: reaction_added', () => {
    it('triggers when emoji matches the configured trigger emoji', async () => {
      const wf = makeWorkflow({
        triggerType: 'reaction_added',
        triggerConfig: JSON.stringify({ emoji: '👍' }),
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('reaction_added', {
        ...baseContext,
        emoji: '👍',
      });

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalled();
    });

    it('does NOT trigger when emoji does not match', async () => {
      const wf = makeWorkflow({
        triggerType: 'reaction_added',
        triggerConfig: JSON.stringify({ emoji: '👍' }),
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);

      await executeWorkflowsForEvent('reaction_added', {
        ...baseContext,
        emoji: '❤️',
      });

      expect(mockPrismaWorkflowExecution.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Action: send_message / post_message
  // -------------------------------------------------------------------------

  describe('action: send_message', () => {
    it('creates a message in the target channel and emits message:new', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'send_message',
            config: JSON.stringify({ targetChannelId: 'ch-target', messageText: 'Automated reply!' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage({ id: 'msg-new', channelId: 'ch-target' }));

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channelId: 'ch-target',
          userId: 'user-actor',
          contentPlain: 'Automated reply!',
        }),
      });

      expect(mockIOTo).toHaveBeenCalledWith('channel:ch-target');
      expect(mockIOEmit).toHaveBeenCalledWith('message:new', expect.any(Object));
    });

    it('also works with actionType "post_message"', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'post_message',
            config: JSON.stringify({ targetChannelId: 'ch-target', messageText: 'Msg!' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaMessage.create).toHaveBeenCalled();
    });

    it('returns error string when targetChannelId is missing from config', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'send_message',
            config: JSON.stringify({ messageText: 'No channel!' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);

      await executeWorkflowsForEvent('message_posted', baseContext);

      // Execution should be recorded as failed
      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' })
      );
      expect(mockPrismaMessage.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Action: add_reaction
  // -------------------------------------------------------------------------

  describe('action: add_reaction', () => {
    it('upserts a reaction on the triggering message and emits reaction:updated', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'add_reaction',
            config: JSON.stringify({ emoji: '✅' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaReaction.upsert.mockResolvedValue({});
      mockPrismaMessage.findUnique.mockResolvedValue({ channelId: 'ch-1' });
      mockPrismaReaction.findMany.mockResolvedValue([
        { emoji: '✅', userId: 'user-actor' },
      ]);

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaReaction.upsert).toHaveBeenCalledWith({
        where: {
          userId_messageId_emoji: {
            userId: 'user-actor',
            messageId: 'msg-1',
            emoji: '✅',
          },
        },
        create: { userId: 'user-actor', messageId: 'msg-1', emoji: '✅' },
        update: {},
      });

      expect(mockIOEmit).toHaveBeenCalledWith(
        'reaction:updated',
        expect.objectContaining({ messageId: 'msg-1' })
      );
    });

    it('returns error string when messageId is missing from context', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'add_reaction',
            config: JSON.stringify({ emoji: '✅' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);

      const contextWithoutMessageId = { workspaceId: 'ws-1', channelId: 'ch-1', userId: 'user-1' };
      await executeWorkflowsForEvent('message_posted', contextWithoutMessageId);

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' })
      );
      expect(mockPrismaReaction.upsert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Action: send_dm
  // -------------------------------------------------------------------------

  describe('action: send_dm', () => {
    it('finds existing DM channel and sends a message', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'send_dm',
            config: JSON.stringify({ targetUserId: 'target-user', messageText: 'DM from bot!' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaChannel.findFirst.mockResolvedValue({ id: 'dm-ch-1' });
      mockPrismaMessage.create.mockResolvedValue({ id: 'dm-msg-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage({ id: 'dm-msg-1', channelId: 'dm-ch-1' }));

      await executeWorkflowsForEvent('message_posted', baseContext);

      // Should look for existing DM channel first
      expect(mockPrismaChannel.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws-1',
            type: 'DM',
          }),
        })
      );

      // Should create message in the DM channel
      expect(mockPrismaMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channelId: 'dm-ch-1',
          contentPlain: 'DM from bot!',
        }),
      });
    });

    it('creates a new DM channel when none exists', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'send_dm',
            config: JSON.stringify({ targetUserId: 'target-user', messageText: 'Hello!' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaChannel.findFirst.mockResolvedValue(null); // No existing DM
      mockPrismaChannel.create.mockResolvedValue({ id: 'new-dm-ch' });
      mockPrismaMessage.create.mockResolvedValue({ id: 'new-dm-msg' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage({ id: 'new-dm-msg', channelId: 'new-dm-ch' }));

      await executeWorkflowsForEvent('message_posted', baseContext);

      // Should create a new DM channel with both members
      expect(mockPrismaChannel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          type: 'DM',
          members: {
            create: expect.arrayContaining([
              { userId: 'user-actor' },
              { userId: 'target-user' },
            ]),
          },
        }),
        select: { id: true },
      });
    });

    it('returns error when targetUserId is missing', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'send_dm',
            config: JSON.stringify({ messageText: 'No target!' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' })
      );
      expect(mockPrismaChannel.findFirst).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Action: post_thread_reply
  // -------------------------------------------------------------------------

  describe('action: post_thread_reply', () => {
    it('creates a thread reply on the triggering message', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'post_thread_reply',
            config: JSON.stringify({ messageText: 'Reply from bot!' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'reply-1' });
      mockPrismaMessage.update.mockResolvedValue({});
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage({ id: 'reply-1', parentId: 'msg-1' }));

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channelId: 'ch-1',
          parentId: 'msg-1',
          contentPlain: 'Reply from bot!',
        }),
      });

      // Should increment parent's reply count
      expect(mockPrismaMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { replyCount: { increment: 1 } },
      });

      // Should emit both message:new and thread:reply
      expect(mockIOEmit).toHaveBeenCalledWith('message:new', expect.any(Object));
      expect(mockIOEmit).toHaveBeenCalledWith('thread:reply', expect.any(Object));
    });

    it('returns error when messageId is missing from context', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'post_thread_reply',
            config: JSON.stringify({ messageText: 'Reply!' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);

      await executeWorkflowsForEvent('message_posted', {
        workspaceId: 'ws-1',
        channelId: 'ch-1',
        userId: 'user-1',
        // no messageId
      });

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Execution recording
  // -------------------------------------------------------------------------

  describe('workflow execution recording', () => {
    it('creates WorkflowExecution with status "success" on all-actions-pass', async () => {
      const wf = makeWorkflow({
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledWith({
        data: {
          workflowId: 'wf-1',
          triggeredBy: 'message_posted',
          status: 'success',
          error: null,
        },
      });
    });

    it('creates WorkflowExecution with status "failed" when single action fails', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            actionType: 'send_message',
            config: '{}', // missing required fields → returns error string
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', error: expect.any(String) })
      );
    });

    it('creates WorkflowExecution with status "partial" when some actions fail', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({ id: 'a1', actionType: 'send_message', config: JSON.stringify({ targetChannelId: 'ch-target', messageText: 'ok' }) }),
          makeAction({ id: 'a2', actionType: 'send_message', config: '{}' }), // fails
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'partial' })
      );
    });

    it('emits workflow:executed to the workspace room', async () => {
      const wf = makeWorkflow({
        actions: [makeAction()],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockIOTo).toHaveBeenCalledWith('workspace:ws-1');
      expect(mockIOEmit).toHaveBeenCalledWith('workflow:executed', {
        workflowId: 'wf-1',
        workspaceId: 'ws-1',
        triggeredBy: 'message_posted',
        status: 'success',
      });
    });

    it('records execution for each matching workflow independently', async () => {
      const wf1 = makeWorkflow({ id: 'wf-1', actions: [makeAction({ id: 'a1' })] });
      const wf2 = makeWorkflow({ id: 'wf-2', actions: [makeAction({ id: 'a2' })] });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf1, wf2]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Template variable substitution
  // -------------------------------------------------------------------------

  describe('template variable substitution', () => {
    it('substitutes {{message.text}} with contentPlain from context', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            config: JSON.stringify({ targetChannelId: 'ch-target', messageText: 'You said: {{message.text}}' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', {
        ...baseContext,
        contentPlain: 'urgent help needed',
      });

      expect(mockPrismaMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentPlain: 'You said: urgent help needed',
          }),
        })
      );
    });

    it('substitutes {{user.name}} by fetching user from DB', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            config: JSON.stringify({ targetChannelId: 'ch-target', messageText: 'Welcome {{user.name}}!' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaUser.findUnique.mockResolvedValue({ name: 'Alice' });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ contentPlain: 'Welcome Alice!' }),
        })
      );
    });

    it('substitutes {{channel.name}} by fetching channel from DB', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            config: JSON.stringify({ targetChannelId: 'ch-target', messageText: 'Posted in #{{channel.name}}' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaChannel.findUnique.mockResolvedValue({ name: 'general' });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ contentPlain: 'Posted in #general' }),
        })
      );
    });

    it('uses "Unknown" when user is not found', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            config: JSON.stringify({ targetChannelId: 'ch-target', messageText: 'Hello {{user.name}}' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ contentPlain: 'Hello Unknown' }),
        })
      );
    });

    it('skips substitution when template has no {{ placeholders', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({
            config: JSON.stringify({ targetChannelId: 'ch-target', messageText: 'Plain message, no template.' }),
          }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await executeWorkflowsForEvent('message_posted', baseContext);

      // Should NOT have fetched user or channel for template substitution
      expect(mockPrismaUser.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaChannel.findUnique).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Unknown action type
  // -------------------------------------------------------------------------

  describe('unknown action type', () => {
    it('returns an error string for unrecognised action types', async () => {
      const wf = makeWorkflow({
        actions: [
          makeAction({ actionType: 'nonexistent_action', config: '{}' }),
        ],
      });
      mockPrismaWorkflow.findMany.mockResolvedValue([wf]);

      await executeWorkflowsForEvent('message_posted', baseContext);

      expect(mockPrismaWorkflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('Unknown action type'),
        })
      );
    });
  });
});
