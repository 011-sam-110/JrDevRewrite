'use client';

import { useActionState } from 'react';
import { Button, Field, Input } from '@/components';
import { submitEntryAction, type SubmitActionState } from './submit-entry.action';

const IDLE: SubmitActionState = { status: 'idle' };

/**
 * Build-window submission form. The page renders it only while the pool is
 * `building` and the user is a joined-but-unsubmitted entrant; the action
 * re-checks every guard server-side, so a stale render just lands an inline
 * rejection here.
 */
export function SubmitEntryForm({ poolId }: { poolId: string }) {
  const [state, formAction, pending] = useActionState(submitEntryAction, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="poolId" value={poolId} />

      <Field
        label="Competition repo"
        hint="The fresh public repo you created after the window opened."
      >
        {(props) => (
          <Input
            {...props}
            name="repoUrl"
            type="url"
            required
            placeholder="https://github.com/you/your-build"
          />
        )}
      </Field>

      <Field label="Demo video" hint="A 30–90s screen recording of your build (200MB max).">
        {(props) => (
          <input
            id={props.id}
            aria-describedby={props['aria-describedby']}
            name="video"
            type="file"
            accept="video/*"
            required
            className="text-sm text-fg-muted file:mr-3 file:rounded-md file:border file:border-edge file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-fg hover:file:border-volt-dim"
          />
        )}
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Verifying…' : 'Submit entry'}
      </Button>

      {state.status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.status === 'submitted' && (
        <p role="status" className="text-sm text-volt">
          Submitted — repo verified and demo uploaded.
        </p>
      )}
    </form>
  );
}
