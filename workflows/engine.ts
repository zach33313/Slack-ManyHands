/**
 * workflows/engine.ts
 *
 * Workflow automation execution engine.
 *
 * Exported function:
 *   executeWorkflowsForEvent(eventType, context)
 *
 * When called after a triggering event (message posted, member joined, reaction
 * added), this module:
 *   1. Queries enabled Workflows matching the given trigger type
 *   2. Evaluates trigger conditions (channel match, keyword match, emoji match)
 *   3. Executes each action in sequence order (send_message, add_reaction, send_dm, post_thread_reply)
 *   4. Substitutes template variables ({{user.name}}, {{channel.name}}, {{message.text}})
 *   5. Creates a WorkflowExecution record with status SUCCESS or FAILED
 *
 * Supported trigger types:
 *   - 'message_posted'  — triggered when any message is sent (filter by channelId in triggerConfig)
 *   - 'message_contains' — triggered when message text contains a keyword
 *   - 'member_joined'   — triggered when a user joins the workspace
 *   - 'reaction_added'  — triggered when an emoji reaction is added (filter by emoji)
 *
 * Supported action types:
 *   - 'send_message' / 'post_message' — create a message in a target channel
 *   - 'add_reaction'                  — add a reaction to the triggering message
 *   - 'send_dm'                       — find or create a DM channel and send a message
 *   - 'post_thread_reply'             — reply in the thread of the triggering message
 */

import { prisma } from '../shared/lib/prisma';
import { getIO } from '../server/socket-emitter';
import { channelRoom } from '../shared/lib/constants';
import type { MessageWithMeta, ReactionGroup } from '../shared/types';

// ---------------------------------------------------------------------------
// Context shape per trigger type
// ---------------------------------------------------------------------------

/**
 * Context for 'message_posted' and 'message_contains' events.
 */
export interface MessageEventContext {
  workspaceId: string;
  channelId: string;
  messageId: string;
  userId: string;
  contentPlain: string;
}

/**
 * Context for 'member_joined' events.
 */
export interface MemberJoinedContext {
  workspaceId: string;
  userId: string;
}

/**
 * Context for 'reaction_added' events.
 */
export interface ReactionAddedContext {
  workspaceId: string;
  channelId: string;
  messageId: string;
  userId: string;
  emoji: string;
}

// ---------------------------------------------------------------------------
// Template variable substitution
// ---------------------------------------------------------------------------

/**
 * Replaces {{user.name}}, {{channel.name}}, {{message.text}} placeholders
 * in action config strings. Fetches names lazily and caches them.
 */
async function substituteTemplateVars(
  template: string,
  context: Record<string, unknown>
): Promise<string> {
  if (!template.includes('{{')) return template;

  let result = template;

  // {{message.text}}
  if (result.includes('{{message.text}}')) {
    const text = (context.contentPlain as string | undefined) ?? '';
    result = result.replaceAll('{{message.text}}', text);
  }

  // {{user.name}}
  if (result.includes('{{user.name}}')) {
    const userId = context.userId as string | undefined;
    let userName = 'Unknown';
    if (userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        userName = user?.name ?? 'Unknown';
      } catch {
        // ignore
      }
    }
    result = result.replaceAll('{{user.name}}', userName);
  }

  // {{channel.name}}
  if (result.includes('{{channel.name}}')) {
    const channelId = context.channelId as string | undefined;
    let channelName = 'Unknown';
    if (channelId) {
      try {
        const channel = await prisma.channel.findUnique({
          where: { id: channelId },
          select: { name: true },
        });
        channelName = channel?.name ?? 'Unknown';
      } catch {
        // ignore
      }
    }
    result = result.replaceAll('{{channel.name}}', channelName);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Reaction helpers
// ---------------------------------------------------------------------------

function groupReactions(
  reactions: Array<{ emoji: string; userId: string }>
): ReactionGroup[] {
  const groups = new Map<string, string[]>();
  for (const r of reactions) {
    const existing = groups.get(r.emoji) ?? [];
    existing.push(r.userId);
    groups.set(r.emoji, existing);
  }
  return Array.from(groups.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

// ---------------------------------------------------------------------------
// Message building helper
// ---------------------------------------------------------------------------

async function buildMessageWithMeta(messageId: string): Promise<MessageWithMeta | null> {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      author: { select: { id: true, name: true, image: true } },
      files: {
        select: {
          id: true, name: true, url: true, size: true, mimeType: true, width: true, height: true,
        },
      },
      reactions: { select: { emoji: true, userId: true } },
    },
  });

  if (!msg) return null;

  let content: Record<string, unknown>;
  try {
    content = JSON.parse(msg.contentJson) as Record<string, unknown>;
  } catch {
    content = { type: 'doc', content: [] };
  }

  return {
    id: msg.id,
    channelId: msg.channelId,
    userId: msg.userId,
    content: content as unknown as MessageWithMeta['content'],
    contentPlain: msg.contentPlain,
    parentId: msg.parentId,
    replyCount: msg.replyCount,
    isEdited: msg.isEdited,
    isDeleted: msg.isDeleted,
    editedAt: msg.editedAt,
    deletedAt: msg.deletedAt,
    createdAt: msg.createdAt,
    author: {
      id: msg.author.id,
      name: msg.author.name ?? 'Unknown',
      image: msg.author.image,
    },
    files: msg.files.map((f) => ({
      id: f.id,
      name: f.name,
      url: f.url,
      size: f.size,
      mimeType: f.mimeType,
      width: f.width,
      height: f.height,
    })),
    reactions: groupReactions(msg.reactions),
  };
}

// ---------------------------------------------------------------------------
// Trigger condition evaluation
// ---------------------------------------------------------------------------

/**
 * Returns true if the workflow trigger conditions are satisfied for the given event.
 */
function evaluateTriggerConditions(
  triggerType: string,
  triggerConfig: Record<string, unknown>,
  context: Record<string, unknown>
): boolean {
  switch (triggerType) {
    case 'message_posted': {
      // Optional: filter to a specific channelId
      const targetChannel = triggerConfig.channelId as string | undefined;
      if (targetChannel && context.channelId !== targetChannel) {
        return false;
      }
      return true;
    }

    case 'message_contains': {
      // Required: keyword to match in contentPlain (case-insensitive)
      const keyword = triggerConfig.keyword as string | undefined;
      if (!keyword) return false;
      const text = (context.contentPlain as string | undefined) ?? '';
      return text.toLowerCase().includes(keyword.toLowerCase());
    }

    case 'member_joined': {
      // Optional: filter to specific workspaceId (typically always matches)
      const targetWorkspace = triggerConfig.workspaceId as string | undefined;
      if (targetWorkspace && context.workspaceId !== targetWorkspace) {
        return false;
      }
      return true;
    }

    case 'reaction_added': {
      // Optional: filter to specific emoji
      const targetEmoji = triggerConfig.emoji as string | undefined;
      if (targetEmoji && context.emoji !== targetEmoji) {
        return false;
      }
      // Optional: filter to specific channelId
      const targetChannel = triggerConfig.channelId as string | undefined;
      if (targetChannel && context.channelId !== targetChannel) {
        return false;
      }
      return true;
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Action executors
// ---------------------------------------------------------------------------

/**
 * Execute a single workflow action.
 * Returns an error message string on failure, or undefined on success.
 */
async function executeAction(
  actionType: string,
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<string | undefined> {
  // The workflow bot user — the workspaceId must be provided in context
  // Actions post messages as a system/bot user (the workflow creator is the actor)
  const actorUserId = context.userId as string;

  switch (actionType) {
    case 'send_message':
    case 'post_message': {
      // Config: { targetChannelId: string, messageText: string }
      const targetChannelId = config.targetChannelId as string | undefined;
      const messageTemplate = (config.messageText ?? config.message) as string | undefined;

      if (!targetChannelId || !messageTemplate) {
        return `send_message: missing targetChannelId or messageText in config`;
      }

      const text = await substituteTemplateVars(messageTemplate, context);
      const contentJson = JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      });

      const message = await prisma.message.create({
        data: {
          channelId: targetChannelId,
          userId: actorUserId,
          contentJson,
          contentPlain: text,
        },
      });

      const fullMessage = await buildMessageWithMeta(message.id);
      if (fullMessage) {
        try {
          const io = getIO();
          io.to(channelRoom(targetChannelId)).emit('message:new', fullMessage);
        } catch {
          // Socket may not be available in all contexts
        }
      }
      return undefined;
    }

    case 'add_reaction': {
      // Config: { emoji: string }
      const emoji = config.emoji as string | undefined;
      const messageId = context.messageId as string | undefined;

      if (!emoji || !messageId) {
        return `add_reaction: missing emoji or messageId in context/config`;
      }

      await prisma.reaction.upsert({
        where: {
          userId_messageId_emoji: { userId: actorUserId, messageId, emoji },
        },
        create: { userId: actorUserId, messageId, emoji },
        update: {},
      });

      // Fetch updated reactions and emit
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { channelId: true },
      });
      if (message) {
        const reactions = await prisma.reaction.findMany({
          where: { messageId },
          select: { emoji: true, userId: true },
        });
        const reactionGroups = groupReactions(reactions);
        try {
          const io = getIO();
          io.to(channelRoom(message.channelId)).emit('reaction:updated', {
            messageId,
            reactions: reactionGroups,
          });
        } catch {
          // Socket may not be available
        }
      }
      return undefined;
    }

    case 'send_dm': {
      // Config: { targetUserId: string, messageText: string }
      const targetUserId = config.targetUserId as string | undefined;
      const messageTemplate = (config.messageText ?? config.message) as string | undefined;
      const workspaceId = context.workspaceId as string | undefined;

      if (!targetUserId || !messageTemplate || !workspaceId) {
        return `send_dm: missing targetUserId, messageText, or workspaceId`;
      }

      const text = await substituteTemplateVars(messageTemplate, context);

      // Find or create a DM channel between actorUserId and targetUserId
      // Look for an existing DM channel in this workspace
      const existingDmChannel = await prisma.channel.findFirst({
        where: {
          workspaceId,
          type: 'DM',
          members: {
            every: {
              userId: { in: [actorUserId, targetUserId] },
            },
          },
          AND: [
            { members: { some: { userId: actorUserId } } },
            { members: { some: { userId: targetUserId } } },
          ],
        },
        select: { id: true },
      });

      let dmChannelId: string;

      if (existingDmChannel) {
        dmChannelId = existingDmChannel.id;
      } else {
        // Create a new DM channel
        const dmChannel = await prisma.channel.create({
          data: {
            workspaceId,
            name: `dm-${actorUserId}-${targetUserId}`,
            type: 'DM',
            createdById: actorUserId,
            members: {
              create: [
                { userId: actorUserId },
                { userId: targetUserId },
              ],
            },
          },
          select: { id: true },
        });
        dmChannelId = dmChannel.id;
      }

      const contentJson = JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      });

      const message = await prisma.message.create({
        data: {
          channelId: dmChannelId,
          userId: actorUserId,
          contentJson,
          contentPlain: text,
        },
      });

      const fullMessage = await buildMessageWithMeta(message.id);
      if (fullMessage) {
        try {
          const io = getIO();
          io.to(channelRoom(dmChannelId)).emit('message:new', fullMessage);
        } catch {
          // Socket may not be available
        }
      }
      return undefined;
    }

    case 'post_thread_reply': {
      // Config: { messageText: string }
      const messageTemplate = (config.messageText ?? config.message) as string | undefined;
      const parentMessageId = context.messageId as string | undefined;
      const channelId = context.channelId as string | undefined;

      if (!messageTemplate || !parentMessageId || !channelId) {
        return `post_thread_reply: missing messageText, messageId, or channelId`;
      }

      const text = await substituteTemplateVars(messageTemplate, context);
      const contentJson = JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      });

      const message = await prisma.message.create({
        data: {
          channelId,
          userId: actorUserId,
          contentJson,
          contentPlain: text,
          parentId: parentMessageId,
        },
      });

      // Increment parent reply count
      await prisma.message.update({
        where: { id: parentMessageId },
        data: { replyCount: { increment: 1 } },
      });

      const fullMessage = await buildMessageWithMeta(message.id);
      if (fullMessage) {
        try {
          const io = getIO();
          io.to(channelRoom(channelId)).emit('message:new', fullMessage);
          io.to(channelRoom(channelId)).emit('thread:reply', fullMessage);
        } catch {
          // Socket may not be available
        }
      }
      return undefined;
    }

    default:
      return `Unknown action type: ${actionType}`;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Executes all enabled workflows that match the given event type and context.
 *
 * @param eventType - The trigger type (e.g., 'message_posted', 'member_joined')
 * @param context   - Event-specific data used for condition evaluation and template substitution
 */
export async function executeWorkflowsForEvent(
  eventType: string,
  context: Record<string, unknown>
): Promise<void> {
  const workspaceId = context.workspaceId as string | undefined;
  if (!workspaceId) {
    console.warn('[workflows] executeWorkflowsForEvent: missing workspaceId in context');
    return;
  }

  // Load all enabled workflows in this workspace matching the trigger type
  let workflows: Array<{
    id: string;
    triggerType: string;
    triggerConfig: string;
    actions: Array<{
      id: string;
      sequence: number;
      actionType: string;
      config: string;
    }>;
  }>;

  try {
    workflows = await prisma.workflow.findMany({
      where: {
        workspaceId,
        enabled: true,
        triggerType: eventType,
      },
      include: {
        actions: {
          orderBy: { sequence: 'asc' },
          select: { id: true, sequence: true, actionType: true, config: true },
        },
      },
    });
  } catch (err) {
    console.error('[workflows] Failed to query workflows:', err);
    return;
  }

  if (workflows.length === 0) return;

  console.log(
    `[workflows] Evaluating ${workflows.length} workflow(s) for event "${eventType}" in workspace ${workspaceId}`
  );

  for (const workflow of workflows) {
    let triggerConfig: Record<string, unknown>;
    try {
      triggerConfig = JSON.parse(workflow.triggerConfig) as Record<string, unknown>;
    } catch {
      triggerConfig = {};
    }

    // Evaluate trigger conditions
    const conditionsMet = evaluateTriggerConditions(
      workflow.triggerType,
      triggerConfig,
      context
    );

    if (!conditionsMet) {
      continue;
    }

    console.log(`[workflows] Executing workflow ${workflow.id} (${workflow.actions.length} action(s))`);

    let executionStatus: 'success' | 'failed' | 'partial' = 'success';
    let executionError: string | null = null;
    const actionErrors: string[] = [];

    // Execute each action in sequence order
    for (const action of workflow.actions) {
      let actionConfig: Record<string, unknown>;
      try {
        actionConfig = JSON.parse(action.config) as Record<string, unknown>;
      } catch {
        actionConfig = {};
      }

      try {
        const errorMsg = await executeAction(action.actionType, actionConfig, context);
        if (errorMsg) {
          actionErrors.push(`Action ${action.id} (${action.actionType}): ${errorMsg}`);
          console.warn(`[workflows] Action failed: ${errorMsg}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        actionErrors.push(`Action ${action.id} (${action.actionType}): ${msg}`);
        console.error(`[workflows] Action ${action.id} threw error:`, err);
      }
    }

    // Determine overall execution status
    if (actionErrors.length > 0) {
      if (actionErrors.length === workflow.actions.length) {
        executionStatus = 'failed';
      } else {
        executionStatus = 'partial';
      }
      executionError = actionErrors.join('; ');
    }

    // Record the execution
    try {
      await prisma.workflowExecution.create({
        data: {
          workflowId: workflow.id,
          triggeredBy: eventType,
          status: executionStatus,
          error: executionError,
        },
      });
    } catch (err) {
      console.error(`[workflows] Failed to record execution for workflow ${workflow.id}:`, err);
    }

    // Notify workspace admins of the execution via Socket.IO
    try {
      const io = getIO();
      io.to(`workspace:${workspaceId}`).emit('workflow:executed', {
        workflowId: workflow.id,
        workspaceId,
        triggeredBy: eventType,
        status: executionStatus,
      });
    } catch {
      // Not critical
    }

    console.log(
      `[workflows] Workflow ${workflow.id} completed with status "${executionStatus}"`
    );
  }
}
