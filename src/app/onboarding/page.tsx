import { redirect } from 'next/navigation';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Logo,
} from '@/components';
import { JOB_ROLES } from '@/domain/identity';
import { ConnectGitHubButton } from '@/features/identity/connect-github/ConnectGitHubButton';
import { RoleForm } from '@/features/identity/select-role/RoleForm';
import { getIdentity } from '@/infra/auth';

export default async function OnboardingPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status === 'complete') redirect('/dashboard');

  const onRoleStep = identity.status === 'needs-role';
  const roleLabel = JOB_ROLES.find((r) => r.id === identity.jobRole)?.label;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-8 p-6">
      <div className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2" aria-label={`Step ${onRoleStep ? 1 : 2} of 2`}>
          <Badge variant={onRoleStep ? 'volt' : 'neutral'}>1 Â· Role</Badge>
          <Badge variant={onRoleStep ? 'outline' : 'volt'}>2 Â· GitHub</Badge>
        </div>
      </div>

      {onRoleStep ? (
        <Card accent>
          <CardHeader>
            <CardTitle>Pick your battlefield</CardTitle>
            <CardDescription>
              Your job role decides which prize pools you see. You can compete across roles later â€”
              this is your home turf.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RoleForm />
          </CardContent>
        </Card>
      ) : (
        <Card accent>
          <CardHeader>
            <CardTitle>Connect GitHub</CardTitle>
            <CardDescription>
              {roleLabel} locked in. Now connect your GitHub (read-only) â€” it&apos;s how pool work
              gets verified, so it&apos;s required to compete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectGitHubButton />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
