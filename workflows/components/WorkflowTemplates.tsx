'use client';

/**
 * workflows/components/WorkflowTemplates.tsx
 *
 * Pre-built workflow templates. Click to pre-fill WorkflowBuilder.
 */

import { motion } from 'framer-motion';
import { UserPlus, Smile, Hash, ArrowRight } from 'lucide-react';
import { staggerContainer, staggerItem } from '@/shared/lib/animations';
import type { WorkflowTriggerType, WorkflowActionType } from '../types';

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  triggerType: WorkflowTriggerType;
  triggerConfig: Record<string, unknown>;
  actionType: WorkflowActionType;
  actionConfig: Record<string, unknown>;
}

const TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'welcome-bot',
    name: 'Welcome Bot',
    description:
      'Send a friendly DM to every new member when they join your workspace.',
    icon: <UserPlus className="w-5 h-5" />,
    color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    triggerType: 'member_joined',
    triggerConfig: {},
    actionType: 'send_dm' as WorkflowActionType,
    actionConfig: {
      targetUserId: '{{userId}}',
      messageText:
        'Welcome to the workspace, {{user.name}}! 👋 Feel free to reach out if you have any questions.',
    },
  },
  {
    id: 'auto-react',
    name: 'Auto-React',
    description:
      'Automatically add a 👍 reaction to every message posted in a specific channel.',
    icon: <Smile className="w-5 h-5" />,
    color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    triggerType: 'message_posted',
    triggerConfig: {
      channelId: '',
    },
    actionType: 'add_reaction',
    actionConfig: {
      emoji: '👍',
    },
  },
  {
    id: 'keyword-alert',
    name: 'Keyword Alert',
    description:
      'Get notified via DM whenever a message contains a specific keyword like "urgent" or "help".',
    icon: <Hash className="w-5 h-5" />,
    color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    triggerType: 'message_posted',
    triggerConfig: {
      keyword: 'urgent',
    },
    actionType: 'send_dm' as WorkflowActionType,
    actionConfig: {
      targetUserId: '',
      messageText:
        '🚨 Alert: {{user.name}} mentioned "urgent" in {{channel.name}}: "{{message.text}}"',
    },
  },
];

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onSelect,
}: {
  template: WorkflowTemplate;
  onSelect: (template: WorkflowTemplate) => void;
}) {
  return (
    <motion.button
      variants={staggerItem}
      onClick={() => onSelect(template)}
      className="w-full flex items-start gap-4 p-4 border rounded-xl bg-card hover:border-primary/50 hover:bg-muted/30 transition-colors text-left group"
    >
      {/* Icon */}
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${template.color}`}
      >
        {template.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{template.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>

        {/* Trigger → Action summary */}
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span className="px-1.5 py-0.5 bg-muted rounded">
            {template.triggerType.replace(/_/g, ' ')}
          </span>
          <ArrowRight className="w-3 h-3" />
          <span className="px-1.5 py-0.5 bg-muted rounded">
            {template.actionType.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors mt-1 flex-shrink-0" />
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface WorkflowTemplatesProps {
  onSelect: (template: WorkflowTemplate) => void;
}

export function WorkflowTemplates({ onSelect }: WorkflowTemplatesProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Start from a Template</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Select a template to pre-fill the workflow builder.
        </p>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-2"
      >
        {TEMPLATES.map((template) => (
          <TemplateCard key={template.id} template={template} onSelect={onSelect} />
        ))}
      </motion.div>
    </div>
  );
}

export { TEMPLATES };
