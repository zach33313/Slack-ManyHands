/**
 * Tests for workflows/actions.ts
 *
 * Covers:
 * - getWorkflows: lists workflows with parsed JSON fields
 * - createWorkflow: requires ADMIN+, creates workflow + actions
 * - updateWorkflow: requires ADMIN+, replaces actions when provided
 * - deleteWorkflow: requires ADMIN+, removes workflow
 * - getWorkflowExecutions: returns execution history
 * - assertAdminInWorkspace: auth enforcement (Unauthorized, not a member, MEMBER role rejected)
 */

// Mock auth
jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

// Mock prisma
jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    workspaceMember: {
      findUnique: jest.fn(),
    },
    workflow: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    workflowAction: {
      deleteMany: jest.fn(),
    },
    workflowExecution: {
      findMany: jest.fn(),
    },
  },
}));

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import {
  getWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getWorkflowExecutions,
} from '@/workflows/actions';
import type { CreateWorkflowInput } from '@/workflows/types';

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedPrisma = prisma as any;

function mockSession(userId = 'user-1') {
  (mockedAuth as jest.Mock).mockResolvedValue({
    user: { id: userId, name: 'Test', email: 'test@test.com' },
  });
}

function mockNoSession() {
  (mockedAuth as jest.Mock).mockResolvedValue(null);
}

function mockMember(role: 'OWNER' | 'ADMIN' | 'MEMBER' | null) {
  mockedPrisma.workspaceMember.findUnique.mockResolvedValue(
    role ? { id: 'mem-1', role } : null
  );
}

function makeDbWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wf-1',
    workspaceId: 'ws-1',
    name: 'Test Workflow',
    description: null,
    enabled: true,
    triggerType: 'message_posted',
    triggerConfig: '{}',
    createdById: 'user-1',
    createdAt: new Date('2026-01-10'),
    actions: [],
    ...overrides,
  };
}

function makeDbAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-1',
    workflowId: 'wf-1',
    sequence: 0,
    actionType: 'send_message',
    config: JSON.stringify({ targetChannelId: 'ch-1', messageText: 'Hello!' }),
    ...overrides,
  };
}

function makeDbExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-1',
    workflowId: 'wf-1',
    triggeredBy: 'message_posted',
    status: 'success',
    error: null,
    executedAt: new Date('2026-01-15'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getWorkflows
// ---------------------------------------------------------------------------

describe('getWorkflows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it('returns workflows with parsed JSON fields and mapped actions', async () => {
    const action = makeDbAction({
      config: JSON.stringify({ targetChannelId: 'ch-target', messageText: 'Hi!' }),
    });
    const workflow = makeDbWorkflow({
      triggerConfig: JSON.stringify({ channelId: 'ch-1' }),
      actions: [action],
    });
    mockedPrisma.workflow.findMany.mockResolvedValue([workflow]);

    const result = await getWorkflows('ws-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('wf-1');
    expect(result[0].triggerConfig).toEqual({ channelId: 'ch-1' });
    expect(result[0].actions).toHaveLength(1);
    expect(result[0].actions[0].config).toEqual({
      targetChannelId: 'ch-target',
      messageText: 'Hi!',
    });
  });

  it('returns empty array when workspace has no workflows', async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([]);

    const result = await getWorkflows('ws-1');

    expect(result).toEqual([]);
  });

  it('queries with actions ordered by sequence', async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([]);

    await getWorkflows('ws-1');

    expect(mockedPrisma.workflow.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      include: { actions: { orderBy: { sequence: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('throws Unauthorized when no session', async () => {
    mockNoSession();

    await expect(getWorkflows('ws-1')).rejects.toThrow('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// createWorkflow
// ---------------------------------------------------------------------------

describe('createWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  const validInput: CreateWorkflowInput = {
    workspaceId: 'ws-1',
    name: 'My Workflow',
    triggerType: 'message_posted',
    triggerConfig: { channelId: 'ch-1' },
    actions: [
      { actionType: 'post_message', config: { targetChannelId: 'ch-out', messageText: 'Hi' } },
    ],
  };

  it('creates workflow with actions when user is ADMIN', async () => {
    mockMember('ADMIN');

    const createdWorkflow = makeDbWorkflow({
      name: 'My Workflow',
      triggerConfig: JSON.stringify({ channelId: 'ch-1' }),
      actions: [
        makeDbAction({
          config: JSON.stringify({ targetChannelId: 'ch-out', messageText: 'Hi' }),
        }),
      ],
    });
    mockedPrisma.workflow.create.mockResolvedValue(createdWorkflow);

    const result = await createWorkflow(validInput);

    expect(mockedPrisma.workflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        name: 'My Workflow',
        triggerType: 'message_posted',
        triggerConfig: JSON.stringify({ channelId: 'ch-1' }),
        createdById: 'user-1',
        enabled: true,
        actions: {
          create: [
            {
              sequence: 0,
              actionType: 'post_message',
              config: JSON.stringify({ targetChannelId: 'ch-out', messageText: 'Hi' }),
            },
          ],
        },
      }),
      include: { actions: { orderBy: { sequence: 'asc' } } },
    });

    expect(result.name).toBe('My Workflow');
    expect(result.triggerConfig).toEqual({ channelId: 'ch-1' });
  });

  it('creates workflow when user is OWNER', async () => {
    mockMember('OWNER');
    mockedPrisma.workflow.create.mockResolvedValue(makeDbWorkflow());

    await expect(createWorkflow(validInput)).resolves.toBeDefined();
  });

  it('throws "Admin access required" when user is MEMBER', async () => {
    mockMember('MEMBER');

    await expect(createWorkflow(validInput)).rejects.toThrow('Admin access required');
    expect(mockedPrisma.workflow.create).not.toHaveBeenCalled();
  });

  it('throws "Not a member" when user is not in workspace', async () => {
    mockMember(null);

    await expect(createWorkflow(validInput)).rejects.toThrow('Not a member');
  });

  it('throws Unauthorized when no session', async () => {
    mockNoSession();

    await expect(createWorkflow(validInput)).rejects.toThrow('Unauthorized');
  });

  it('serialises actions with correct sequence numbers', async () => {
    mockMember('ADMIN');
    const inputWithMultipleActions: CreateWorkflowInput = {
      ...validInput,
      actions: [
        { actionType: 'post_message', config: { targetChannelId: 'ch-1', messageText: 'First' } },
        { actionType: 'add_reaction', config: { emoji: '✅' } },
      ],
    };
    mockedPrisma.workflow.create.mockResolvedValue(
      makeDbWorkflow({
        actions: [
          makeDbAction({ id: 'a1', sequence: 0 }),
          makeDbAction({ id: 'a2', sequence: 1, actionType: 'add_reaction', config: '{"emoji":"✅"}' }),
        ],
      })
    );

    await createWorkflow(inputWithMultipleActions);

    const createCall = mockedPrisma.workflow.create.mock.calls[0][0];
    expect(createCall.data.actions.create[0].sequence).toBe(0);
    expect(createCall.data.actions.create[1].sequence).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// updateWorkflow
// ---------------------------------------------------------------------------

describe('updateWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it('updates workflow name when user is ADMIN', async () => {
    mockedPrisma.workflow.findUnique.mockResolvedValue(
      makeDbWorkflow({ workspaceId: 'ws-1' })
    );
    mockMember('ADMIN');
    const updatedWorkflow = makeDbWorkflow({ name: 'Renamed Workflow' });
    mockedPrisma.workflow.update.mockResolvedValue(updatedWorkflow);

    const result = await updateWorkflow('wf-1', { name: 'Renamed Workflow' });

    expect(result.name).toBe('Renamed Workflow');
    expect(mockedPrisma.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wf-1' },
        data: expect.objectContaining({ name: 'Renamed Workflow' }),
      })
    );
  });

  it('deletes old actions and creates new ones when actions are provided', async () => {
    mockedPrisma.workflow.findUnique.mockResolvedValue(makeDbWorkflow());
    mockMember('ADMIN');
    mockedPrisma.workflowAction.deleteMany.mockResolvedValue({});
    const updatedWorkflow = makeDbWorkflow({
      actions: [makeDbAction({ actionType: 'add_reaction', config: '{"emoji":"👍"}' })],
    });
    mockedPrisma.workflow.update.mockResolvedValue(updatedWorkflow);

    await updateWorkflow('wf-1', {
      actions: [{ actionType: 'add_reaction', config: { emoji: '👍' } }],
    });

    expect(mockedPrisma.workflowAction.deleteMany).toHaveBeenCalledWith({
      where: { workflowId: 'wf-1' },
    });
  });

  it('does NOT delete actions when actions field is not provided in update', async () => {
    mockedPrisma.workflow.findUnique.mockResolvedValue(makeDbWorkflow());
    mockMember('ADMIN');
    mockedPrisma.workflow.update.mockResolvedValue(makeDbWorkflow({ enabled: false }));

    await updateWorkflow('wf-1', { enabled: false });

    expect(mockedPrisma.workflowAction.deleteMany).not.toHaveBeenCalled();
  });

  it('throws "Workflow not found" when id does not exist', async () => {
    mockedPrisma.workflow.findUnique.mockResolvedValue(null);

    await expect(updateWorkflow('nonexistent', { name: 'test' })).rejects.toThrow(
      'Workflow not found'
    );
  });

  it('throws "Admin access required" when user is MEMBER', async () => {
    mockedPrisma.workflow.findUnique.mockResolvedValue(makeDbWorkflow());
    mockMember('MEMBER');

    await expect(updateWorkflow('wf-1', { enabled: false })).rejects.toThrow(
      'Admin access required'
    );
  });

  it('serialises triggerConfig to JSON when updating', async () => {
    mockedPrisma.workflow.findUnique.mockResolvedValue(makeDbWorkflow());
    mockMember('OWNER');
    mockedPrisma.workflow.update.mockResolvedValue(
      makeDbWorkflow({ triggerConfig: JSON.stringify({ channelId: 'ch-new' }) })
    );

    await updateWorkflow('wf-1', { triggerConfig: { channelId: 'ch-new' } });

    const updateCall = mockedPrisma.workflow.update.mock.calls[0][0];
    expect(updateCall.data.triggerConfig).toBe(JSON.stringify({ channelId: 'ch-new' }));
  });
});

// ---------------------------------------------------------------------------
// deleteWorkflow
// ---------------------------------------------------------------------------

describe('deleteWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it('deletes workflow when user is ADMIN', async () => {
    mockedPrisma.workflow.findUnique.mockResolvedValue(makeDbWorkflow());
    mockMember('ADMIN');
    mockedPrisma.workflow.delete.mockResolvedValue({});

    await deleteWorkflow('wf-1');

    expect(mockedPrisma.workflow.delete).toHaveBeenCalledWith({ where: { id: 'wf-1' } });
  });

  it('deletes workflow when user is OWNER', async () => {
    mockedPrisma.workflow.findUnique.mockResolvedValue(makeDbWorkflow());
    mockMember('OWNER');
    mockedPrisma.workflow.delete.mockResolvedValue({});

    await expect(deleteWorkflow('wf-1')).resolves.toBeUndefined();
  });

  it('throws "Workflow not found" when id does not exist', async () => {
    mockedPrisma.workflow.findUnique.mockResolvedValue(null);

    await expect(deleteWorkflow('nonexistent')).rejects.toThrow('Workflow not found');
    expect(mockedPrisma.workflow.delete).not.toHaveBeenCalled();
  });

  it('throws "Admin access required" when user is MEMBER', async () => {
    mockedPrisma.workflow.findUnique.mockResolvedValue(makeDbWorkflow());
    mockMember('MEMBER');

    await expect(deleteWorkflow('wf-1')).rejects.toThrow('Admin access required');
    expect(mockedPrisma.workflow.delete).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when no session', async () => {
    mockNoSession();

    await expect(deleteWorkflow('wf-1')).rejects.toThrow('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// getWorkflowExecutions
// ---------------------------------------------------------------------------

describe('getWorkflowExecutions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it('returns mapped execution history ordered newest-first', async () => {
    const executions = [
      makeDbExecution({ id: 'exec-2', status: 'failed', error: 'Timeout', executedAt: new Date('2026-01-20') }),
      makeDbExecution({ id: 'exec-1', executedAt: new Date('2026-01-10') }),
    ];
    mockedPrisma.workflowExecution.findMany.mockResolvedValue(executions);

    const result = await getWorkflowExecutions('wf-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'exec-2',
      workflowId: 'wf-1',
      triggeredBy: 'message_posted',
      status: 'failed',
      error: 'Timeout',
      executedAt: executions[0].executedAt,
    });
    expect(result[1].status).toBe('success');
    expect(result[1].error).toBeNull();
  });

  it('queries with correct workflowId, order, and limit', async () => {
    mockedPrisma.workflowExecution.findMany.mockResolvedValue([]);

    await getWorkflowExecutions('wf-42', 15);

    expect(mockedPrisma.workflowExecution.findMany).toHaveBeenCalledWith({
      where: { workflowId: 'wf-42' },
      orderBy: { executedAt: 'desc' },
      take: 15,
    });
  });

  it('uses default limit of 20 when not specified', async () => {
    mockedPrisma.workflowExecution.findMany.mockResolvedValue([]);

    await getWorkflowExecutions('wf-1');

    expect(mockedPrisma.workflowExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });

  it('returns empty array when no executions exist', async () => {
    mockedPrisma.workflowExecution.findMany.mockResolvedValue([]);

    const result = await getWorkflowExecutions('wf-1');

    expect(result).toEqual([]);
  });

  it('throws Unauthorized when no session', async () => {
    mockNoSession();

    await expect(getWorkflowExecutions('wf-1')).rejects.toThrow('Unauthorized');
  });
});
