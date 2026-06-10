import { describe, expect, it, vi } from 'vitest';
import { setProfileVisibility, type SetVisibilityDeps } from './toggle-privacy';

/**
 * Slice behaviour: the use-case validates the requested visibility against the
 * kernel's known values, then persists it. The privacy *rule* (what public vs
 * private means) is unit-tested in domain/gamification/visibility — here we only
 * assert the orchestration: a valid value is written, a bogus one is rejected
 * with NO write.
 */

function makeDeps(): SetVisibilityDeps & { setVisibility: ReturnType<typeof vi.fn> } {
  return { setVisibility: vi.fn(async () => {}) };
}

describe('setProfileVisibility', () => {
  it('persists a valid visibility for the user', async () => {
    const deps = makeDeps();
    const result = await setProfileVisibility(deps, 'user-1', 'private');
    expect(result).toEqual({ ok: true, visibility: 'private' });
    expect(deps.setVisibility).toHaveBeenCalledWith('user-1', 'private');
  });

  it('accepts switching back to public', async () => {
    const deps = makeDeps();
    const result = await setProfileVisibility(deps, 'user-1', 'public');
    expect(result).toEqual({ ok: true, visibility: 'public' });
    expect(deps.setVisibility).toHaveBeenCalledWith('user-1', 'public');
  });

  it('rejects an unknown visibility and writes nothing', async () => {
    const deps = makeDeps();
    const result = await setProfileVisibility(deps, 'user-1', 'ghost');
    expect(result).toEqual({ ok: false, error: 'invalid-visibility' });
    expect(deps.setVisibility).not.toHaveBeenCalled();
  });
});
