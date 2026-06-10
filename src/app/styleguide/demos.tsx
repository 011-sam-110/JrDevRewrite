'use client';

import { useState } from 'react';
import { Button, Field, Input, Modal, ToastProvider, useToast } from '@/components';

/* Client island: only the primitives that need state (modal open/close,
   toast firing) run client-side — the rest of /styleguide stays server. */

export function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Forfeit match?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Keep fighting
            </Button>
            <Button variant="danger" size="sm" onClick={() => setOpen(false)}>
              Forfeit
            </Button>
          </>
        }
      >
        Leaving now counts as a forfeit — your opponent takes the win and your Elo takes the hit.
        This cannot be undone.
      </Modal>
    </>
  );
}

function ToastButtons() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          toast({ title: 'All tests passed', description: '+120 XP earned', variant: 'success' })
        }
      >
        Success toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          toast({
            title: 'Submission rejected',
            description: '3/14 hidden tests failed — +20s penalty',
            variant: 'danger',
          })
        }
      >
        Danger toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          toast({
            title: 'Challenge received',
            description: 'k.osei wants to battle — 15 min window',
            variant: 'info',
          })
        }
      >
        Info toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => toast({ title: 'Pool spec updated', variant: 'neutral' })}
      >
        Neutral toast
      </Button>
    </div>
  );
}

export function ToastDemo() {
  return (
    <ToastProvider>
      <ToastButtons />
    </ToastProvider>
  );
}

export function ControlledInputDemo() {
  const [value, setValue] = useState('not-a-sussex-email@gmail.com');
  const invalid = !value.endsWith('@sussex.ac.uk');
  return (
    <Field
      label="University email"
      hint="Sign-in is restricted to @sussex.ac.uk"
      error={invalid ? 'Use your @sussex.ac.uk address.' : undefined}
    >
      {(props) => (
        <Input
          {...props}
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="you@sussex.ac.uk"
        />
      )}
    </Field>
  );
}
