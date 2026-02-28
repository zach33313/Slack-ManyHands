'use client';

/**
 * workflows/components/WorkflowList.tsx
 *
 * List of workspace workflows with create, edit, and status view.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Zap, Plus, MessageSquare, Hash, UserPlus, Smile,
  CheckCircle, XCircle, ChevronRight, Clock,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '@/shared/lib/animations';
import { cn } from '@/shared/lib/utils';
import { WorkflowBuilder } from './WorkflowBuilder';
import type { Workflow, WorkflowTriggerType } from '../types';

// ---------------------------------------------------------------------------
// Trigger icons
// ---------------------------------------------------------------------------

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  message_posted: <MessageSquare className="w-3.5 h-3.5" />,
  message_contains: <Hash className="w-3.5 h-3.5" />,
  member_joined: <UserPlus className="w-3.5 h-3.5" />,
  reaction_added: <Smile className="w-3.5 h-3.5" />,
  scheduled: <Clock className="w-3.5 h-3.5" />,
};

const TRIGGER_LABELS: Record<string, string> = {
  message_posted: 'Message Posted',
  message_contains: 'Message Contains',
  member_joined: 'Member Joined',
  reaction_added: 'Reaction Added',
  scheduled: 'Scheduled',
};

const ACTION_LABELS: Record<string, string> = {
  send_message: 'Send Message',
  post_message: 'Send Message',
  send_dm: 'Send DM',
  add_reaction: 'Add Reaction',
  post_thread_reply: 'Thread Reply',
  send_notification: 'Notification',
  assign_role: 'Assign Role',
};

function triggerSummary(workflow: Workflow): string {
  const label = TRIGGER_LABELS[workflow.triggerType] ?? workflow.triggerType;
  const config = workflow.triggerConfig;
  if (workflow.triggerType === 'message_contains' && config.keyword) {
    return `${label}: "${config.keyword}"`;
  }
  if (workflow.triggerType === 'reaction_added' && config.emoji) {
    return `${label}: ${config.emoji}`;
  }
  return label;
}

function actionSummary(workflow: Workflow): string {
  const first = workflow.actions[0];
  if (!first) return 'No action';
  const label = ACTION_LABELS[first.actionType] ?? first.actionType;
  if (
    (first.actionType === 'send_message' || first.actionType === 'send_dm') &&
    first.config.messageText
  ) {
    const text = String(first.config.messageText).slice(0, 40);
    return `${label}: "${text}${text.length < String(first.config.messageText).length ? '…' : ''}"`;
  }
  if (first.actionType === 'add_reaction' && first.config.emoji) {
    return `${label}: ${first.config.emoji}`;
  }
  return label;
}

// ---------------------------------------------------------------------------
// WorkflowCard
// ---------------------------------------------------------------------------

function WorkflowCard({
  workflow,
  onClick,
}: {
  workflow: Workflow;
  onClick: () => void;
}) {
  return (
    <motion.button
      variants={staggerItem}
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 border rounded-xl bg-card hover:border-primary/40 hover:bg-muted/30 transition-colors text-left group"
    >
      {/* Status indicator */}
      <div className="flex-shrink-0">
        {workflow.enabled ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold truncate">{workflow.name}</p>
          <span
            className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
              workflow.enabled
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {workflow.enabled ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            {TRIGGER_ICONS[workflow.triggerType] ?? <Zap className="w-3.5 h-3.5" />}
            <span>{triggerSummary(workflow)}</span>
          </div>
          <span>→</span>
          <span>{actionSummary(workflow)}</span>
        </div>

        <p className="text-[10px] text-muted-foreground mt-1">
          Created {formatDistanceToNow(new Date(workflow.createdAt), { addSuffix: true })}
        </p>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface WorkflowListProps {
  workspaceId: string;
  initialWorkflows: Workflow[];
}

export function WorkflowList({ workspaceId, initialWorkflows }: WorkflowListProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>(initialWorkflows);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const handleSaved = (workflow: Workflow) => {
    setWorkflows((prev) => {
      const existing = prev.findIndex((w) => w.id === workflow.id);
      if (existing >= 0) {
        return prev.map((w) => (w.id === workflow.id ? workflow : w));
      }
      return [workflow, ...prev];
    });
    setEditingWorkflow(null);
    setShowCreate(false);
  };

  const handleDeleted = (id: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    setEditingWorkflow(null);
  };

  // Show builder for edit or create
  if (editingWorkflow || showCreate) {
    return (
      <div>
        <button
          onClick={() => {
            setEditingWorkflow(null);
            setShowCreate(false);
          }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          ← Back to workflows
        </button>
        <WorkflowBuilder
          workspaceId={workspaceId}
          workflow={editingWorkflow ?? undefined}
          onSave={handleSaved}
          onDelete={handleDeleted}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Automations</h2>
          <p className="text-sm text-muted-foreground">
            {workflows.length} workflow{workflows.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Workflow
        </button>
      </div>

      {/* Workflow list */}
      {workflows.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-card">
          <Zap className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm font-medium">No workflows yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Automate repetitive tasks with trigger-based workflows.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Create your first workflow
          </button>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-2"
        >
          <AnimatePresence>
            {workflows.map((workflow) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onClick={() => setEditingWorkflow(workflow)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
