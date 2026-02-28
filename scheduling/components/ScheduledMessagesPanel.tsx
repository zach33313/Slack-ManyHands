'use client';

/**
 * scheduling/components/ScheduledMessagesPanel.tsx
 *
 * Panel listing all of the current user's pending scheduled messages.
 * Allows editing (reschedule), canceling, and shows a countdown.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { Clock, X, RotateCcw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { setHours, setMinutes } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { staggerContainer, staggerItem } from '@/shared/lib/animations';
import {
  getScheduledMessages,
  cancelScheduledMessage,
  rescheduleMessage,
} from '../actions';
import type { ScheduledMessage } from '../types';

type ScheduledWithChannel = ScheduledMessage & {
  channel: { id: string; name: string };
};

interface ScheduledMessagesPanelProps {
  /** Optionally filter by channel */
  channelId?: string;
}

export function ScheduledMessagesPanel({ channelId }: ScheduledMessagesPanelProps) {
  const [messages, setMessages] = useState<ScheduledWithChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleTarget, setRescheduleTarget] = useState<ScheduledWithChannel | null>(
    null
  );
  const [rescheduleDay, setRescheduleDay] = useState<Date | undefined>(undefined);
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [isRescheduling, setIsRescheduling] = useState(false);

  const loadMessages = useCallback(async () => {
    try {
      const data = await getScheduledMessages(channelId);
      setMessages(data as ScheduledWithChannel[]);
    } catch {
      toast.error('Failed to load scheduled messages');
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function handleCancel(id: string) {
    try {
      await cancelScheduledMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      toast.success('Scheduled message cancelled');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel';
      toast.error(msg);
    }
  }

  function openReschedule(msg: ScheduledWithChannel) {
    setRescheduleTarget(msg);
    setRescheduleDay(new Date(msg.scheduledFor));
    setRescheduleTime(format(new Date(msg.scheduledFor), 'HH:mm'));
  }

  async function handleReschedule() {
    if (!rescheduleTarget || !rescheduleDay) return;
    const [hours, minutes] = rescheduleTime.split(':').map(Number);
    const newDate = setMinutes(setHours(rescheduleDay, hours ?? 9), minutes ?? 0);

    if (newDate <= new Date()) {
      toast.error('New time must be in the future');
      return;
    }

    setIsRescheduling(true);
    try {
      const updated = await rescheduleMessage(rescheduleTarget.id, newDate);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === updated.id
            ? { ...m, scheduledFor: updated.scheduledFor }
            : m
        )
      );
      toast.success(`Rescheduled to ${format(newDate, 'MMM d \'at\' h:mm a')}`);
      setRescheduleTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reschedule';
      toast.error(msg);
    } finally {
      setIsRescheduling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
        <Clock className="h-8 w-8 opacity-30" />
        <p className="text-sm">No scheduled messages</p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-full">
        <motion.div
          className="divide-y"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                variants={staggerItem}
                layout
                exit={{ opacity: 0, height: 0 }}
                className="p-3 space-y-1"
              >
                {/* Channel + time */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    #{msg.channel.name}
                  </span>
                  <span title={format(new Date(msg.scheduledFor), 'PPpp')}>
                    {formatDistanceToNow(new Date(msg.scheduledFor), { addSuffix: true })}
                  </span>
                </div>

                {/* Content preview */}
                <p className="text-sm line-clamp-2 text-foreground">{msg.contentPlain}</p>

                {/* Scheduled time */}
                <p className="text-xs text-muted-foreground">
                  {format(new Date(msg.scheduledFor), 'EEE, MMM d \'at\' h:mm a')}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => openReschedule(msg)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reschedule
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2 text-destructive hover:text-destructive"
                    onClick={() => handleCancel(msg.id)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </ScrollArea>

      {/* Reschedule dialog */}
      <Dialog
        open={!!rescheduleTarget}
        onOpenChange={(o) => !o && setRescheduleTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <DayPicker
              mode="single"
              selected={rescheduleDay}
              onSelect={setRescheduleDay}
              disabled={{ before: new Date() }}
            />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Time</label>
              <Input
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setRescheduleTarget(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleReschedule}
                disabled={!rescheduleDay || isRescheduling}
              >
                {isRescheduling ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
