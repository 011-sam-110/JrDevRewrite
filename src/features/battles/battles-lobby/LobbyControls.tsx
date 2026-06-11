'use client';

import { useActionState } from 'react';
import { Badge, Button, Input } from '@/components';
import { acceptChallengeAction } from '../accept-challenge/accept-challenge.action';
import {
  sendChallengeAction,
  type ChallengeActionState,
} from '../send-challenge/send-challenge.action';
import {
  enterQueueAction,
  leaveQueueAction,
  type QueueActionState,
} from '../enter-queue/enter-queue.action';

/**
 * The lobby's interactive strips — thin useActionState wrappers over the
 * owning slices' actions so rejections (busy, unknown handle, empty bank)
 * surface inline instead of vanishing into a server log.
 */

const IDLE: ChallengeActionState = { status: 'idle' };

export function ChallengeForm() {
  const [state, formAction, pending] = useActionState(sendChallengeAction, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          name="target"
          placeholder="handle or profile link"
          aria-label="Opponent handle"
          autoComplete="off"
          className="flex-1"
        />
        <Button type="submit" loading={pending} data-testid="send-challenge">
          Challenge
        </Button>
      </div>
      {state.status === 'error' && (
        <p className="text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'sent' && (
        <p className="text-xs text-volt" role="status">
          Challenge sent — it appears below until they answer.
        </p>
      )}
    </form>
  );
}

export function AcceptChallengeButton({ battleId }: { battleId: string }) {
  const [state, formAction, pending] = useActionState(async () => acceptChallengeAction(battleId), {
    status: 'idle',
  } as Awaited<ReturnType<typeof acceptChallengeAction>>);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <Button type="submit" size="sm" loading={pending} data-testid="accept-challenge">
        Accept
      </Button>
      {state.status === 'error' && 'message' in state && (
        <span className="text-xs text-danger" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function QueueControls({ inQueue, queueSize }: { inQueue: boolean; queueSize: number }) {
  const [state, formAction, pending] = useActionState(
    async (): Promise<QueueActionState> => (inQueue ? leaveQueueAction() : enterQueueAction()),
    { status: 'idle' } as QueueActionState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant={inQueue ? 'secondary' : 'primary'}
          loading={pending}
          data-testid="queue-toggle"
        >
          {inQueue ? 'Leave queue' : 'Find a match'}
        </Button>
        {inQueue ? (
          <Badge variant="elo">Searching… {queueSize} in queue</Badge>
        ) : (
          <span className="text-xs text-fg-muted">{queueSize} waiting right now</span>
        )}
      </div>
      {state.status === 'error' && (
        <p className="text-xs text-danger" role="alert">
          {state.message}
        </p>
      )}
      {inQueue && (
        <p className="text-xs text-fg-subtle">
          Pairing prefers close Elo and widens fast — stay on this page; you&apos;ll be pulled in
          the moment a match is made.
        </p>
      )}
    </form>
  );
}
