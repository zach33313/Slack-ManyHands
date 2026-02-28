'use client';

/**
 * scheduling/components/SchedulePicker.tsx
 *
 * Popover with quick scheduling options plus a custom date/time picker
 * using react-day-picker. Calls createScheduledMessage on selection.
 */

import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { format, addMinutes, addHours, setHours, setMinutes, nextMonday } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createScheduledMessage } from '../actions';
import type { TiptapJSON } from '@/shared/types';

interface SchedulePickerProps {
  channelId: string;
  contentJson: TiptapJSON;
  contentPlain: string;
  onScheduled: () => void;
  onCancel: () => void;
}

type QuickOption = {
  label: string;
  getDate: () => Date;
};

function getQuickOptions(): QuickOption[] {
  const now = new Date();
  return [
    {
      label: 'In 30 minutes',
      getDate: () => addMinutes(now, 30),
    },
    {
      label: 'In 1 hour',
      getDate: () => addHours(now, 1),
    },
    {
      label: 'Tomorrow at 9am',
      getDate: () => {
        const d = addHours(now, 24);
        return setMinutes(setHours(d, 9), 0);
      },
    },
    {
      label: 'Monday at 9am',
      getDate: () => {
        const monday = nextMonday(now);
        return setMinutes(setHours(monday, 9), 0);
      },
    },
  ];
}

export function SchedulePicker({
  channelId,
  contentJson,
  contentPlain,
  onScheduled,
  onCancel,
}: SchedulePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [timeValue, setTimeValue] = useState('09:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function scheduleAt(date: Date) {
    if (date <= new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }
    setIsSubmitting(true);
    try {
      await createScheduledMessage(channelId, contentJson, contentPlain, date);
      toast.success(`Message scheduled for ${format(date, 'MMM d, yyyy \'at\' h:mm a')}`);
      onScheduled();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to schedule message';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleQuickOption(option: QuickOption) {
    await scheduleAt(option.getDate());
  }

  async function handleCustomSubmit() {
    if (!selectedDay) {
      toast.error('Please select a date');
      return;
    }
    const [hours, minutes] = timeValue.split(':').map(Number);
    const date = setMinutes(setHours(selectedDay, hours ?? 9), minutes ?? 0);
    await scheduleAt(date);
  }

  const quickOptions = getQuickOptions();

  if (showCustom) {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Pick a date & time</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => setShowCustom(false)}
          >
            ← Back
          </Button>
        </div>
        <DayPicker
          mode="single"
          selected={selectedDay}
          onSelect={setSelectedDay}
          disabled={{ before: new Date() }}
          className="rdp-small"
        />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Time</label>
          <Input
            type="time"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="flex-1 h-8"
            onClick={handleCustomSubmit}
            disabled={!selectedDay || isSubmitting}
          >
            {isSubmitting ? 'Scheduling…' : 'Schedule'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Schedule message
      </div>
      {quickOptions.map((opt) => (
        <button
          key={opt.label}
          className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-left"
          onClick={() => handleQuickOption(opt)}
          disabled={isSubmitting}
        >
          <span>{opt.label}</span>
          <span className="text-xs text-muted-foreground">
            {format(opt.getDate(), 'h:mm a')}
          </span>
        </button>
      ))}
      <div className="border-t my-1" />
      <button
        className="w-full flex items-center px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-left"
        onClick={() => setShowCustom(true)}
      >
        Custom time…
      </button>
    </div>
  );
}
