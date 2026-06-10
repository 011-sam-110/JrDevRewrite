import { describe, expect, it, vi } from 'vitest';
import { selectRole } from './select-role';

describe('selectRole', () => {
  it('persists a valid role for the user', async () => {
    const setJobRole = vi.fn().mockResolvedValue(undefined);

    const result = await selectRole({ setJobRole }, 'user-1', 'backend');

    expect(result).toEqual({ ok: true });
    expect(setJobRole).toHaveBeenCalledExactlyOnceWith('user-1', 'backend');
  });

  it('rejects unknown roles without touching storage (form data is untrusted)', async () => {
    const setJobRole = vi.fn();

    const result = await selectRole({ setJobRole }, 'user-1', 'astronaut');

    expect(result).toEqual({ ok: false, error: 'Pick one of the listed roles.' });
    expect(setJobRole).not.toHaveBeenCalled();
  });
});
