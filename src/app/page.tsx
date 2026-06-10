import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Logo } from '@/components';
import { SignInForm } from '@/features/identity/sign-in/SignInForm';
import { getIdentity } from '@/infra/auth';

/* Auth.js error codes (?error=...) mapped to human messages. */
const authErrors: Record<string, string> = {
  Verification: 'That sign-in link is invalid or has expired â€” request a fresh one below.',
  AccessDenied: 'Junior Dev is Sussex-only â€” sign in with your @sussex.ac.uk address.',
  EmailSignInError: 'Junior Dev is Sussex-only â€” sign in with your @sussex.ac.uk address.',
  Configuration: 'Sign-in is misconfigured â€” try again or poke the operator.',
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const identity = await getIdentity();
  if (identity) redirect(identity.status === 'complete' ? '/dashboard' : '/onboarding');

  const { error } = await searchParams;
  const errorMessage = error
    ? (authErrors[error] ?? 'Something went wrong signing you in â€” try again.')
    : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo />
        <h1 className="max-w-xl font-display text-4xl tracking-wide text-balance">
          Prove you can <span className="text-volt text-glow">ship</span>.
        </h1>
        <p className="max-w-md text-sm text-fg-muted">
          Prize-pool project competitions and live 1v1 code battles for Sussex CS students â€” one
          profile that shows you build real things.
        </p>
      </div>

      <Card accent className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Your Sussex email is your account â€” no password.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {errorMessage && (
            <p
              role="alert"
              className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {errorMessage}
            </p>
          )}
          <SignInForm />
        </CardContent>
      </Card>
    </main>
  );
}
