/**
 * workflows/types.ts
 *
 * Types for workflow automation (trigger → action chains).
 * Workflows are workspace-scoped, created by admins,
 * and executed server-side by workflows/engine.ts.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Types
// ---------------------------------------------------------------------------

export type WorkflowTriggerType =
  | 'message_posted'
  | 'message_contains'
  | 'member_joined'
  | 'reaction_added'
  | 'scheduled';

export type WorkflowActionType =
  | 'send_message'
  | 'post_message'
  | 'send_dm'
  | 'add_reaction'
  | 'post_thread_reply';

// ---------------------------------------------------------------------------
// Domain Types
// ---------------------------------------------------------------------------

/** A workflow automation definition */
export interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerType: WorkflowTriggerType;
  /** Trigger-specific configuration (e.g. channelId, schedule pattern) */
  triggerConfig: Record<string, unknown>;
  actions: WorkflowAction[];
  createdById: string;
  createdAt: Date;
}

/** A single action step within a workflow */
export interface WorkflowAction {
  id: string;
  workflowId: string;
  /** Execution order (0-based) */
  sequence: number;
  actionType: WorkflowActionType;
  /** Action-specific configuration (e.g. message content, role name) */
  config: Record<string, unknown>;
}

/** Input for creating a new workflow */
export interface CreateWorkflowInput {
  workspaceId: string;
  name: string;
  description?: string;
  triggerType: WorkflowTriggerType;
  triggerConfig: Record<string, unknown>;
  actions: Array<{
    actionType: WorkflowActionType;
    config: Record<string, unknown>;
  }>;
}
