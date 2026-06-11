import { describe, expect, it, vi } from 'vitest';
import { enterQueue, leaveQueue, type EnterQueueDeps, type LeaveQueueDeps } from './enter-queue';

/**
 * enter-queue — joining/leaving the simple battle queue. The queue row is the
 * whole state (PK = one ticket per user); pairing itself is the match-queue
 * slice ticking in the realtime service. Entering twice is idempotent, and a
 * player with a battle in motion can't camp the queue.
 */

function makeDeps(overrides: Partial<EnterQueueDeps> = {}): EnterQueueDeps {
  return {
    isBusy: vi.fn(async () => false),
    enqueue: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('enterQueue', () => {
  it('enqueues a free player', async () => {
    const deps = makeDeps();
    const result = await enterQueue(deps, 'me');
    expect(result).toEqual({ ok: true });
    expect(deps.enqueue).toHaveBeenCalledWith('me');
  });

  it('a player with a battle in motion cannot queue', async () => {
    const deps = makeDeps({ isBusy: vi.fn(async () => true) });
    const result = await enterQueue(deps, 'me');
    expect(result).toEqual({ ok: false, error: 'player-busy' });
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
});

describe('leaveQueue', () => {
  it('dequeues unconditionally — leaving an empty queue is a no-op, not an error', async () => {
    const deps: LeaveQueueDeps = { dequeue: vi.fn(async () => {}) };
    const result = await leaveQueue(deps, 'me');
    expect(result).toEqual({ ok: true });
    expect(deps.dequeue).toHaveBeenCalledWith('me');
  });
});
