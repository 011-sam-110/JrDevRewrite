'use client';

import { useActionState } from 'react';
import { Button, Field, Input } from '@/components';
import { signInAction, type SignInFormState } from './sign-in.action';

const initialState: SignInFormState = { error: null };

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <Field
        label="Sussex email"
        hint="We'll email you a one-time sign-in link."
        error={state.error ?? undefined}
      >
        {(props) => (
          <Input
            {...props}
            type="email"
            name="email"
            placeholder="ab123@sussex.ac.uk"
            autoComplete="email"
            required
          />
        )}
      </Field>
      <Button type="submit" loading={pending}>
        Send sign-in link
      </Button>
    </form>
  );
}
