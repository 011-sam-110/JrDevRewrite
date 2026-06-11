import { notFound, redirect } from 'next/navigation';
import { AppShell, Badge, PageHeader, PageShell, Button } from '@/components';
import { isOperator, parseOperatorEmails } from '@/domain/identity';
import { ProblemQueue } from '@/features/battles/approve-draft/ProblemQueue';
import {
  listApprovedProblems,
  listProblemDrafts,
  listRetiredProblems,
} from '@/features/battles/approve-draft/problem-queue';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { getIdentity } from '@/infra/auth';
import { OPERATOR_NAV } from '@/lib/nav';

/**
 * Operator console: the battle problem-bank queue. Drafts are machine-verified
 * already (their reference solution passed its own hidden tests in Judge0) —
 * the operator's job here is the human-approval half of "AI-drafted,
 * machine-verified, human-approved". Non-operators get a 404; the real
 * enforcement lives in the server actions, which re-check on every call.
 */
export default async function OperatorProblemsPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (!isOperator(identity.email, parseOperatorEmails(process.env.OPERATOR_EMAILS))) notFound();

  const [drafts, approved, retired] = await Promise.all([
    listProblemDrafts(),
    listApprovedProblems(),
    listRetiredProblems(),
  ]);

  return (
    <AppShell
      items={OPERATOR_NAV}
      currentPath="/operator/problems"
      right={
        <>
          <span className="hidden font-mono text-xs text-fg-subtle sm:inline">
            {identity.email}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </>
      }
    >
      <PageShell>
        <PageHeader
          title="Battle problem bank"
          description="Drafts here are machine-verified — the reference solution already passed its own hidden tests in Judge0. Approving makes a problem playable in live battles; retiring rotates a leaked or stale problem out."
          actions={<Badge variant="volt">{drafts.length} awaiting</Badge>}
        />
        <ProblemQueue drafts={drafts} approved={approved} retired={retired} />
      </PageShell>
    </AppShell>
  );
}
