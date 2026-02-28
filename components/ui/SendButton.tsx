'use client';

/**
 * components/ui/SendButton.tsx
 *
 * Send button with a paper-plane icon that animates on click:
 * - Icon flies off to the right (translateX: 40px + opacity: 0)
 * - Then resets back to the starting position (ready for next send)
 *
 * Used in EditorToolbar to provide a clickable send action as an
 * alternative to pressing Enter.
 *
 * Usage:
 *   import { SendButton } from '@/components/ui/SendButton';
 *   <SendButton onSend={handleSubmit} disabled={isDisabled} />
 */

import { useState, useCallback } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Send } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SendButtonProps {
  onSend: () => void;
  disabled?: boolean;
  className?: string;
}

export function SendButton({ onSend, disabled = false, className }: SendButtonProps) {
  const [isSending, setIsSending] = useState(false);

  const handleClick = useCallback(() => {
    if (disabled || isSending) return;
    setIsSending(true);
    onSend();
    // Reset after animation completes
    setTimeout(() => setIsSending(false), 500);
  }, [disabled, isSending, onSend]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'relative flex h-7 w-7 items-center justify-center rounded',
        'text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground',
        'disabled:opacity-50 disabled:pointer-events-none',
        isSending && 'text-primary',
        className
      )}
      title="Send message (Enter)"
      aria-label="Send message"
    >
      <m.span
        animate={
          isSending
            ? { x: 40, opacity: 0 }
            : { x: 0, opacity: 1 }
        }
        transition={
          isSending
            ? { duration: 0.25, ease: 'easeIn' }
            : { duration: 0.1, ease: 'easeOut' }
        }
        style={{ display: 'inline-flex' }}
      >
        <Send className="h-4 w-4" />
      </m.span>
    </button>
  );
}
