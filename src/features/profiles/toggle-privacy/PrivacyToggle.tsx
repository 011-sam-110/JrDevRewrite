import { Button } from '@/components';
import { toggleVisibility, type ProfileVisibility } from '@/domain/gamification';
import { setVisibilityAction } from './toggle-privacy.action';

/**
 * The single account-level privacy control, shown only on the owner's own
 * profile. A plain server-action form — the hidden field carries the TARGET
 * visibility (the opposite of the current one), so the action is idempotent and
 * needs no client JS. Switching to private hides the account from every public
 * surface (other viewers, leaderboards, search).
 */
export function PrivacyToggle({ visibility }: { visibility: ProfileVisibility }) {
  const target = toggleVisibility(visibility);
  const goingPrivate = target === 'private';
  return (
    <form action={setVisibilityAction} className="shrink-0">
      <input type="hidden" name="visibility" value={target} />
      <Button type="submit" variant="ghost" size="sm">
        {goingPrivate ? 'Make private' : 'Make public'}
      </Button>
    </form>
  );
}
