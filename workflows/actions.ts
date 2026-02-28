'use server';

/**
 * workflows/actions.ts
 *
 * Server actions for CRUD operations on workflows.
 * Only ADMIN+ can create/update/delete workflows.
 */

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { MemberRole } from '@/shared/types';
import type {
  Workflow,
  WorkflowAction,
  CreateWorkflowInput,
  WorkflowTriggerType,
  WorkflowActionType,
} from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowExecutionData {
  id: string;
  workflowId: string;
  triggeredBy: string;
  status: 'success' | 'failed' | 'partial';
  error: string | null;
  executedAt: Date;
}

// ---------------------------------------------------------------------------
// Authorization helper
// ---------------------------------------------------------------------------

async function assertAdminInWorkspace(workspaceId: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId: session.user.id },
    },
  });

  if (!member) throw new Error('Not a member of this workspace');
  if (member.role === MemberRole.MEMBER) throw new Error('Admin access required');

  return session.user.id;
}

// ---------------------------------------------------------------------------
// getWorkflows
// ---------------------------------------------------------------------------

/**
 * List all workflows for a workspace.
 */
export async function getWorkflows(workspaceId: string): Promise<Workflow[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const workflows = await prisma.workflow.findMany({
    where: { workspaceId },
    include: {
      actions: { orderBy: { sequence: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return workflows.map((w) => ({
    id: w.id,
    workspaceId: w.workspaceId,
    name: w.name,
    description: w.description,
    enabled: w.enabled,
    triggerType: w.triggerType as WorkflowTriggerType,
    triggerConfig: JSON.parse(w.triggerConfig) as Record<string, unknown>,
    actions: w.actions.map((a): WorkflowAction => ({
      id: a.id,
      workflowId: a.workflowId,
      sequence: a.sequence,
      actionType: a.actionType as WorkflowActionType,
      config: JSON.parse(a.config) as Record<string, unknown>,
    })),
    createdById: w.createdById,
    createdAt: w.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// createWorkflow
// ---------------------------------------------------------------------------

/**
 * Create a new workflow. Requires ADMIN+ role.
 */
export async function createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
  const userId = await assertAdminInWorkspace(input.workspaceId);

  const workflow = await prisma.workflow.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description ?? null,
      triggerType: input.triggerType,
      triggerConfig: JSON.stringify(input.triggerConfig ?? {}),
      createdById: userId,
      enabled: true,
      actions: {
        create: input.actions.map((a, i) => ({
          sequence: i,
          actionType: a.actionType,
          config: JSON.stringify(a.config ?? {}),
        })),
      },
    },
    include: {
      actions: { orderBy: { sequence: 'asc' } },
    },
  });

  return {
    id: workflow.id,
    workspaceId: workflow.workspaceId,
    name: workflow.name,
    description: workflow.description,
    enabled: workflow.enabled,
    triggerType: workflow.triggerType as WorkflowTriggerType,
    triggerConfig: JSON.parse(workflow.triggerConfig) as Record<string, unknown>,
    actions: workflow.actions.map((a): WorkflowAction => ({
      id: a.id,
      workflowId: a.workflowId,
      sequence: a.sequence,
      actionType: a.actionType as WorkflowActionType,
      config: JSON.parse(a.config) as Record<string, unknown>,
    })),
    createdById: workflow.createdById,
    createdAt: workflow.createdAt,
  };
}

// ---------------------------------------------------------------------------
// updateWorkflow
// ---------------------------------------------------------------------------

/**
 * Update a workflow. Requires ADMIN+ role.
 */
export async function updateWorkflow(
  id: string,
  updates: Partial<{
    name: string;
    description: string | null;
    enabled: boolean;
    triggerType: WorkflowTriggerType;
    triggerConfig: Record<string, unknown>;
    actions: Array<{
      actionType: WorkflowActionType;
      config: Record<string, unknown>;
    }>;
  }>
): Promise<Workflow> {
  // Fetch current workflow to get workspaceId for auth check
  const current = await prisma.workflow.findUnique({ where: { id } });
  if (!current) throw new Error('Workflow not found');

  await assertAdminInWorkspace(current.workspaceId);

  // If actions are provided, delete old and create new
  if (updates.actions !== undefined) {
    await prisma.workflowAction.deleteMany({ where: { workflowId: id } });
  }

  const workflow = await prisma.workflow.update({
    where: { id },
    data: {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
      ...(updates.triggerType !== undefined ? { triggerType: updates.triggerType } : {}),
      ...(updates.triggerConfig !== undefined
        ? { triggerConfig: JSON.stringify(updates.triggerConfig) }
        : {}),
      ...(updates.actions !== undefined
        ? {
            actions: {
              create: updates.actions.map((a, i) => ({
                sequence: i,
                actionType: a.actionType,
                config: JSON.stringify(a.config ?? {}),
              })),
            },
          }
        : {}),
    },
    include: {
      actions: { orderBy: { sequence: 'asc' } },
    },
  });

  return {
    id: workflow.id,
    workspaceId: workflow.workspaceId,
    name: workflow.name,
    description: workflow.description,
    enabled: workflow.enabled,
    triggerType: workflow.triggerType as WorkflowTriggerType,
    triggerConfig: JSON.parse(workflow.triggerConfig) as Record<string, unknown>,
    actions: workflow.actions.map((a): WorkflowAction => ({
      id: a.id,
      workflowId: a.workflowId,
      sequence: a.sequence,
      actionType: a.actionType as WorkflowActionType,
      config: JSON.parse(a.config) as Record<string, unknown>,
    })),
    createdById: workflow.createdById,
    createdAt: workflow.createdAt,
  };
}

// ---------------------------------------------------------------------------
// deleteWorkflow
// ---------------------------------------------------------------------------

/**
 * Delete a workflow. Requires ADMIN+ role.
 */
export async function deleteWorkflow(id: string): Promise<void> {
  const current = await prisma.workflow.findUnique({ where: { id } });
  if (!current) throw new Error('Workflow not found');

  await assertAdminInWorkspace(current.workspaceId);

  await prisma.workflow.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// getWorkflowExecutions
// ---------------------------------------------------------------------------

/**
 * Get execution history for a workflow.
 */
export async function getWorkflowExecutions(
  workflowId: string,
  limit = 20
): Promise<WorkflowExecutionData[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const executions = await prisma.workflowExecution.findMany({
    where: { workflowId },
    orderBy: { executedAt: 'desc' },
    take: limit,
  });

  return executions.map((e) => ({
    id: e.id,
    workflowId: e.workflowId,
    triggeredBy: e.triggeredBy,
    status: e.status as 'success' | 'failed' | 'partial',
    error: e.error,
    executedAt: e.executedAt,
  }));
}
