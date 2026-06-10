'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { Badge, Button } from '@/components';
import { castVoteAction, type CastVoteActionState } from './cast-vote.action';
import type { JudgeSubmissionView } from './judge-task';

const IDLE: CastVoteActionState = { status: 'idle' };

/**
 * The judging surface: watch each anonymised demo and order them best → worst.
 * Reordering is drag-and-drop (the headline interaction) with up/down buttons as
 * the accessible, test-stable fallback; the live order is serialised into a
 * hidden `ranking` field (comma-joined entry ids) the action re-validates
 * server-side. Anonymity is already baked into the data — labels A/B/C…, no
 * entrant identity reaches the client.
 */
export function JudgePanel({
  poolId,
  submissions,
}: {
  poolId: string;
  submissions: JudgeSubmissionView[];
}) {
  const [order, setOrder] = useState(submissions);
  const [dragId, setDragId] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(castVoteAction, IDLE);

  const done = state.status === 'submitted';

  function reorder(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  }

  function onDrop(targetId: string) {
    if (dragId === null || dragId === targetId) return;
    reorder(
      order.findIndex((s) => s.entryId === dragId),
      order.findIndex((s) => s.entryId === targetId),
    );
    setDragId(null);
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="ranking" value={order.map((s) => s.entryId).join(',')} />

      <ol className="flex flex-col gap-3">
        {order.map((submission, i) => (
          <li
            key={submission.entryId}
            draggable={!done}
            onDragStart={() => setDragId(submission.entryId)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(submission.entryId)}
            aria-label={`Rank ${i + 1}: ${submission.label}`}
            className="flex cut-corner gap-4 border border-edge bg-surface p-3 transition-colors hover:border-volt-dim"
          >
            <div className="flex w-10 shrink-0 flex-col items-center gap-2 pt-1">
              <Badge variant={i === 0 ? 'gold' : 'neutral'}>#{i + 1}</Badge>
              <span aria-hidden="true" className="cursor-grab text-fg-subtle select-none">
                ⠿
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="mb-2 font-display text-sm tracking-wide text-fg">{submission.label}</p>
              {submission.videoPlaybackUrl ? (
                <video
                  controls
                  preload="metadata"
                  src={submission.videoPlaybackUrl}
                  className="aspect-video w-full max-w-md rounded-md border border-edge bg-bg"
                />
              ) : (
                <div className="flex aspect-video w-full max-w-md items-center justify-center rounded-md border border-dashed border-edge bg-bg text-xs text-fg-subtle">
                  demo unavailable
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={i === 0 || done}
                aria-label={`Move ${submission.label} up`}
                onClick={() => reorder(i, i - 1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={i === order.length - 1 || done}
                aria-label={`Move ${submission.label} down`}
                onClick={() => reorder(i, i + 1)}
              >
                ↓
              </Button>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending || done}>
          {pending ? 'Submitting…' : 'Submit ranking'}
        </Button>
        {state.status === 'error' && (
          <p role="alert" className="text-sm text-danger">
            {state.message}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm text-volt">
            Ranking submitted — judging complete.
          </p>
        )}
      </div>
    </form>
  );
}
