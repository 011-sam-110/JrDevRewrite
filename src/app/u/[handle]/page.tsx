import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AppShell,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageShell,
} from '@/components';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { getProfileByHandle } from '@/features/profiles/view-profile/profile';
import { ProfileView } from '@/features/profiles/view-profile/ProfileView';
import { getIdentity } from '@/infra/auth';
import { MAIN_NAV } from '@/lib/nav';

/**
 * The public developer profile — the shareable, recruiter-facing portfolio. This
 * page is intentionally viewable SIGNED OUT (the whole thesis is a public,
 * linkable identity surface): we read the session only to decide ownership (the
 * privacy toggle) and to highlight "you", never as an access gate. Privacy is
 * enforced in the read model: a private profile returns the `private` notice to
 * everyone but its owner.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const title = `${handle} · Junior Dev`;
  const description = `${handle}'s Junior Dev portfolio — rank, level, wins, badges and competition history.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const identity = await getIdentity();
  const lookup = await getProfileByHandle(handle, identity?.userId ?? null);

  if (lookup.kind === 'not-found') notFound();

  return (
    <AppShell
      items={MAIN_NAV}
      currentPath=""
      right={
        identity ? (
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        ) : (
          <Link href="/">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
        )
      }
    >
      <PageShell>
        <PageHeader title="Profile" description={`@${handle}`} />
        {lookup.kind === 'private' ? (
          <Card accent>
            <CardHeader>
              <CardTitle>This profile is private</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-fg-muted">
                @{handle} has set their profile to private — it&apos;s hidden from public view,
                leaderboards and search.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ProfileView profile={lookup.profile} />
        )}
      </PageShell>
    </AppShell>
  );
}
