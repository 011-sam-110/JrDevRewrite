'use client';

import { useActionState } from 'react';
import { Button } from '@/components';
import { JOIN_CREDIT_COST } from '@/domain/prize-pools';
import { joinPoolAction, type JoinActionState } from './join-pool.action';

const IDLE: JoinActionState = { status: 'idle' };

/**
 * The join CTA. The page only renders this when the kernel verdict says the
 * user may join — but the verdict can go stale between render and click, so
 * the action's late rejections land here as an inline alert.
 */
export function JoinPoolButton({ poolId }: { poolId: string }) {
  const [state, formAction, pending] = useActionState(joinPoolAction, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="poolId" value={poolId} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Joining…' : `Join pool — ${JOIN_CREDIT_COST} credit`}
      </Button>
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
