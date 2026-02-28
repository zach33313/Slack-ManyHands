'use client';

/**
 * polls/components/PollCreator.tsx
 *
 * Dialog for creating a new poll. Includes question input, dynamic option
 * list (min 2, max 10), and single/multi-choice toggle.
 */

import { useState } from 'react';
import { Plus, Trash2, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PollCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the poll data when the user submits; caller creates the message */
  onSubmit: (data: {
    question: string;
    options: string[];
    multiChoice: boolean;
  }) => Promise<void>;
}

export function PollCreator({ open, onOpenChange, onSubmit }: PollCreatorProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiChoice, setMultiChoice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function addOption() {
    if (options.length < 10) {
      setOptions((prev) => [...prev, '']);
    }
  }

  function removeOption(index: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function reset() {
    setQuestion('');
    setOptions(['', '']);
    setMultiChoice(false);
  }

  async function handleSubmit() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      toast.error('Please enter a question');
      return;
    }
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      toast.error('Please enter at least 2 options');
      return;
    }
    const uniqueOptions = [...new Set(validOptions)];
    if (uniqueOptions.length < validOptions.length) {
      toast.error('Options must be unique');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ question: trimmedQuestion, options: uniqueOptions, multiChoice });
      reset();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create poll';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Create a Poll
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Question */}
          <div className="space-y-1.5">
            <Label htmlFor="poll-question">Question</Label>
            <Input
              id="poll-question"
              placeholder="Ask a question…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              autoFocus
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <Label>Options</Label>
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder={`Option ${index + 1}`}
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  maxLength={200}
                  className="flex-1"
                />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeOption(index)}
                    type="button"
                    aria-label={`Remove option ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-sm"
                onClick={addOption}
                type="button"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add option
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              {options.length}/10 options
            </p>
          </div>

          {/* Multi-choice toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={multiChoice}
              onClick={() => setMultiChoice((p) => !p)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                multiChoice ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  multiChoice ? 'translate-x-4.5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-medium">Allow multiple choices</p>
              <p className="text-xs text-muted-foreground">
                Members can select more than one option
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Poll'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
