'use client';

/**
 * canvas/components/CanvasTab.tsx
 *
 * Tab bar component rendering 'Messages' | 'Canvas' tabs at top of channel view.
 * Clicking 'Canvas' swaps the message list for CanvasEditor.
 * Animated tab indicator using motion.div layoutId for sliding underline.
 */

import { motion } from 'framer-motion';
import { MessageSquare, FileText } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type ChannelTab = 'messages' | 'canvas';

interface CanvasTabProps {
  activeTab: ChannelTab;
  onTabChange: (tab: ChannelTab) => void;
  className?: string;
}

interface Tab {
  id: ChannelTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  {
    id: 'messages',
    label: 'Messages',
    icon: <MessageSquare className="w-3.5 h-3.5" />,
  },
  {
    id: 'canvas',
    label: 'Canvas',
    icon: <FileText className="w-3.5 h-3.5" />,
  },
];

export function CanvasTab({ activeTab, onTabChange, className }: CanvasTabProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-0 border-b bg-background px-4',
        className
      )}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.icon}
            {tab.label}

            {/* Animated underline indicator */}
            {isActive && (
              <motion.div
                layoutId="canvas-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                initial={false}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
