'use server';

import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/infra/auth';
import { requestMagicLink } from './sign-in';

export interface SignInFormState {
  error: string | null;
}

/** Thin entry point: parse the form, delegate to the slice, route the outcome. */
export async function signInAction(
  _prev: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const result = await requestMagicLink(
    {
      sendMagicLink: async (email) => {
        // redirect:false — we control navigation so the form can render errors.
        await signIn('sussex', { email, redirect: false, redirectTo: '/dashboard' });
      },
    },
    String(formData.get('email') ?? ''),
  );
  if (!result.ok) return { error: result.error };
  redirect('/check-email');
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' });
}
