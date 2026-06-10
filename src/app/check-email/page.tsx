import { Card, CardContent, CardDescription, CardHeader, CardTitle, Logo } from '@/components';

export default function CheckEmailPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 p-6">
      <Logo />
      <Card accent className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            We sent a one-time sign-in link to your Sussex email. It works once and expires in an
            hour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-fg-subtle">
            Nothing arriving? Check spam, or go back and re-enter your address.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
