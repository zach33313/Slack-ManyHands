'use client';

/**
 * workflows/components/WorkflowBuilder.tsx
 *
 * Visual card-based workflow builder.
 * Trigger card → Arrow → Action card.
 * Supports template variables: {{user.name}}, {{channel.name}}, {{message.text}}.
 */

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowDown, MessageSquare, Hash, UserPlus, Smile,
  Send, GitBranch, Mail, MessageCircle, Zap,
  Trash2, ToggleLeft, ToggleRight, Save, Loader2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { createWorkflow, updateWorkflow, deleteWorkflow } from '../actions';
import type { Workflow, WorkflowTriggerType, WorkflowActionType } from '../types';

// ---------------------------------------------------------------------------
// Trigger + action metadata
// ---------------------------------------------------------------------------

interface TriggerDef {
  type: WorkflowTriggerType | 'message_contains';
  label: string;
  description: string;
  icon: React.ReactNode;
  configFields: ConfigField[];
}

interface ActionDef {
  type: WorkflowActionType | 'send_dm' | 'post_thread_reply';
  label: string;
  description: string;
  icon: React.ReactNode;
  configFields: ConfigField[];
}

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  hint?: string;
}

const TRIGGER_DEFS: TriggerDef[] = [
  {
    type: 'message_posted',
    label: 'Message Posted',
    description: 'Triggers when a message is sent in a channel',
    icon: <MessageSquare className="w-4 h-4" />,
    configFields: [
      {
        key: 'channelId',
        label: 'Channel (optional)',
        type: 'text',
        placeholder: 'Leave empty for any channel',
        hint: 'Enter channel ID to restrict to a specific channel',
      },
    ],
  },
  {
    type: 'message_contains',
    label: 'Message Contains Keyword',
    description: 'Triggers when a message contains a specific word or phrase',
    icon: <Hash className="w-4 h-4" />,
    configFields: [
      {
        key: 'keyword',
        label: 'Keyword',
        type: 'text',
        placeholder: 'e.g. urgent, help, alert',
        hint: 'Case-insensitive match',
      },
    ],
  },
  {
    type: 'member_joined',
    label: 'Member Joined',
    description: 'Triggers when a new member joins the workspace',
    icon: <UserPlus className="w-4 h-4" />,
    configFields: [],
  },
  {
    type: 'reaction_added',
    label: 'Reaction Added',
    description: 'Triggers when a specific emoji reaction is added',
    icon: <Smile className="w-4 h-4" />,
    configFields: [
      {
        key: 'emoji',
        label: 'Emoji (optional)',
        type: 'text',
        placeholder: '👍 or :thumbsup:',
        hint: 'Leave empty to trigger on any reaction',
      },
    ],
  },
];

const ACTION_DEFS: ActionDef[] = [
  {
    type: 'send_message',
    label: 'Send Message',
    description: 'Post a message to a channel',
    icon: <Send className="w-4 h-4" />,
    configFields: [
      {
        key: 'targetChannelId',
        label: 'Target Channel ID',
        type: 'text',
        placeholder: 'Channel ID',
      },
      {
        key: 'messageText',
        label: 'Message',
        type: 'textarea',
        placeholder: 'Hello, {{user.name}}! Welcome to {{channel.name}}.',
        hint: 'Variables: {{user.name}}, {{channel.name}}, {{message.text}}',
      },
    ],
  },
  {
    type: 'send_dm',
    label: 'Send Direct Message',
    description: 'Send a DM to a specific user',
    icon: <Mail className="w-4 h-4" />,
    configFields: [
      {
        key: 'targetUserId',
        label: 'Target User ID',
        type: 'text',
        placeholder: 'User ID',
      },
      {
        key: 'messageText',
        label: 'Message',
        type: 'textarea',
        placeholder: 'Hi {{user.name}}, welcome!',
        hint: 'Variables: {{user.name}}, {{channel.name}}, {{message.text}}',
      },
    ],
  },
  {
    type: 'add_reaction',
    label: 'Add Reaction',
    description: 'Add an emoji reaction to the triggering message',
    icon: <Smile className="w-4 h-4" />,
    configFields: [
      {
        key: 'emoji',
        label: 'Emoji',
        type: 'text',
        placeholder: '👍',
      },
    ],
  },
  {
    type: 'post_thread_reply',
    label: 'Post Thread Reply',
    description: 'Reply in the thread of the triggering message',
    icon: <MessageCircle className="w-4 h-4" />,
    configFields: [
      {
        key: 'messageText',
        label: 'Reply Message',
        type: 'textarea',
        placeholder: 'Got it! I\'ll look into this.',
        hint: 'Variables: {{user.name}}, {{channel.name}}, {{message.text}}',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Config form renderer
// ---------------------------------------------------------------------------

function ConfigForm({
  fields,
  config,
  onChange,
}: {
  fields: ConfigField[];
  config: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">No configuration needed.</p>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1">
          <label className="text-xs font-medium">{field.label}</label>
          {field.type === 'textarea' ? (
            <textarea
              value={config[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={3}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          ) : field.type === 'select' ? (
            <select
              value={config[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select…</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={config[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
          {field.hint && (
            <p className="text-[10px] text-muted-foreground">{field.hint}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface WorkflowBuilderProps {
  workspaceId: string;
  workflow?: Workflow;
  onSave?: (workflow: Workflow) => void;
  onDelete?: (id: string) => void;
}

export function WorkflowBuilder({
  workspaceId,
  workflow: existingWorkflow,
  onSave,
  onDelete,
}: WorkflowBuilderProps) {
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(existingWorkflow?.name ?? 'New Workflow');
  const [enabled, setEnabled] = useState(existingWorkflow?.enabled ?? true);

  const [triggerType, setTriggerType] = useState<string>(
    existingWorkflow?.triggerType ?? 'message_posted'
  );
  const [triggerConfig, setTriggerConfig] = useState<Record<string, string>>(
    existingWorkflow?.triggerConfig
      ? Object.fromEntries(
          Object.entries(existingWorkflow.triggerConfig).map(([k, v]) => [k, String(v)])
        )
      : {}
  );

  const [actionType, setActionType] = useState<string>(
    existingWorkflow?.actions[0]?.actionType ?? 'send_message'
  );
  const [actionConfig, setActionConfig] = useState<Record<string, string>>(
    existingWorkflow?.actions[0]?.config
      ? Object.fromEntries(
          Object.entries(existingWorkflow.actions[0].config).map(([k, v]) => [k, String(v)])
        )
      : {}
  );

  const selectedTrigger = TRIGGER_DEFS.find((t) => t.type === triggerType);
  const selectedAction = ACTION_DEFS.find((a) => a.type === actionType);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Workflow name is required');
      return;
    }

    startTransition(async () => {
      try {
        const triggerConfigObj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(triggerConfig)) {
          if (v.trim()) triggerConfigObj[k] = v.trim();
        }

        const actionConfigObj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(actionConfig)) {
          if (v.trim()) actionConfigObj[k] = v.trim();
        }

        let result: Workflow;

        if (existingWorkflow) {
          result = await updateWorkflow(existingWorkflow.id, {
            name: name.trim(),
            enabled,
            triggerType: triggerType as WorkflowTriggerType,
            triggerConfig: triggerConfigObj,
            actions: [
              {
                actionType: actionType as WorkflowActionType,
                config: actionConfigObj,
              },
            ],
          });
        } else {
          result = await createWorkflow({
            workspaceId,
            name: name.trim(),
            triggerType: triggerType as WorkflowTriggerType,
            triggerConfig: triggerConfigObj,
            actions: [
              {
                actionType: actionType as WorkflowActionType,
                config: actionConfigObj,
              },
            ],
          });
        }

        toast.success(`Workflow "${result.name}" saved`);
        onSave?.(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save workflow';
        toast.error(msg);
      }
    });
  };

  const handleDelete = () => {
    if (!existingWorkflow) return;
    if (!confirm(`Delete workflow "${existingWorkflow.name}"? This cannot be undone.`)) return;

    startTransition(async () => {
      try {
        await deleteWorkflow(existingWorkflow.id);
        toast.success('Workflow deleted');
        onDelete?.(existingWorkflow.id);
      } catch (err) {
        toast.error('Failed to delete workflow');
      }
    });
  };

  const handleToggleEnabled = () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    if (existingWorkflow) {
      startTransition(async () => {
        try {
          await updateWorkflow(existingWorkflow.id, { enabled: newEnabled });
          toast.success(`Workflow ${newEnabled ? 'enabled' : 'disabled'}`);
        } catch {
          setEnabled(!newEnabled); // Revert
          toast.error('Failed to update workflow');
        }
      });
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4 py-4">
      {/* Workflow name + toggle */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workflow name"
          className="flex-1 px-3 py-2 text-sm font-medium border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleToggleEnabled}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors',
            enabled
              ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30'
              : 'text-muted-foreground bg-muted'
          )}
          title={enabled ? 'Click to disable' : 'Click to enable'}
        >
          {enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {enabled ? 'Active' : 'Inactive'}
        </button>
      </div>

      {/* Trigger card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="border rounded-xl p-4 bg-card space-y-4"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Trigger
            </p>
            <p className="text-sm font-medium">When this happens…</p>
          </div>
        </div>

        {/* Trigger type selector */}
        <select
          value={triggerType}
          onChange={(e) => {
            setTriggerType(e.target.value);
            setTriggerConfig({});
          }}
          className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {TRIGGER_DEFS.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>

        {selectedTrigger && (
          <p className="text-xs text-muted-foreground">{selectedTrigger.description}</p>
        )}

        {/* Trigger config */}
        {selectedTrigger && (
          <ConfigForm
            fields={selectedTrigger.configFields}
            config={triggerConfig}
            onChange={(key, value) =>
              setTriggerConfig((prev) => ({ ...prev, [key]: value }))
            }
          />
        )}
      </motion.div>

      {/* Connector arrow */}
      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-1">
          <div className="w-0.5 h-4 bg-border" />
          <ArrowDown className="w-4 h-4 text-muted-foreground" />
          <div className="w-0.5 h-4 bg-border" />
        </div>
      </div>

      {/* Action card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="border rounded-xl p-4 bg-card space-y-4"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <GitBranch className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Action
            </p>
            <p className="text-sm font-medium">Do this…</p>
          </div>
        </div>

        {/* Action type selector */}
        <select
          value={actionType}
          onChange={(e) => {
            setActionType(e.target.value);
            setActionConfig({});
          }}
          className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {ACTION_DEFS.map((a) => (
            <option key={a.type} value={a.type}>
              {a.label}
            </option>
          ))}
        </select>

        {selectedAction && (
          <p className="text-xs text-muted-foreground">{selectedAction.description}</p>
        )}

        {/* Action config */}
        {selectedAction && (
          <ConfigForm
            fields={selectedAction.configFields}
            config={actionConfig}
            onChange={(key, value) =>
              setActionConfig((prev) => ({ ...prev, [key]: value }))
            }
          />
        )}
      </motion.div>

      {/* Footer buttons */}
      <div className="flex items-center gap-2 pt-2">
        {existingWorkflow && (
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {existingWorkflow ? 'Update Workflow' : 'Create Workflow'}
        </button>
      </div>
    </div>
  );
}
