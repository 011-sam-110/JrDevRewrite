import { Button } from '@/components';
import { JOB_ROLES } from '@/domain/identity';
import { selectRoleAction } from './select-role.action';

/**
 * Radio-card role picker. Server component — native radios + Tailwind
 * `has-checked:` styling need zero client JS.
 */
export function RoleForm() {
  return (
    <form action={selectRoleAction} className="flex flex-col gap-5">
      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <legend className="sr-only">Job role</legend>
        {JOB_ROLES.map((role) => (
          <label
            key={role.id}
            className="cursor-pointer rounded-md border border-edge bg-raised px-4 py-3 text-center text-sm font-semibold transition-colors has-checked:border-volt has-checked:bg-volt/10 has-checked:text-volt has-focus-visible:outline-2 has-focus-visible:outline-volt"
          >
            <input type="radio" name="role" value={role.id} required className="sr-only" />
            {role.label}
          </label>
        ))}
      </fieldset>
      <Button type="submit" className="self-start">
        Lock in role
      </Button>
    </form>
  );
}
