import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components';
import type { ProblemTier } from '@/domain/battles';
import {
  approveProblemAction,
  rejectProblemAction,
  retireProblemAction,
} from './approve-draft.action';
import type { ProblemRow } from './problem-queue';

const TIER_BADGE: Record<ProblemTier, 'volt' | 'info' | 'gold'> = {
  easy: 'volt',
  medium: 'info',
  hard: 'gold',
};

function ProblemCard({ problem, children }: { problem: ProblemRow; children: React.ReactNode }) {
  return (
    <Card key={problem.id}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{problem.title}</CardTitle>
          <Badge variant={TIER_BADGE[problem.tier]}>{problem.tier}</Badge>
          <Badge variant="neutral">{problem.referenceLanguage}</Badge>
          <Badge variant="outline">{problem.source}</Badge>
          {problem.verifiedAt && <Badge variant="volt">verified</Badge>}
        </div>
        <CardDescription>
          <span className="font-mono text-xs">
            {problem.slug} · {problem.hiddenTests.length} hidden tests
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm whitespace-pre-line text-fg-muted">{problem.statementMd}</p>
        <details className="mb-4">
          <summary className="cursor-pointer text-xs text-fg-subtle">Reference solution</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-surface-2 p-3 font-mono text-xs">
            {problem.referenceSolution}
          </pre>
        </details>
        <div className="flex gap-3">{children}</div>
      </CardContent>
    </Card>
  );
}

export function ProblemQueue({
  drafts,
  approved,
  retired,
}: {
  drafts: ProblemRow[];
  approved: ProblemRow[];
  retired: ProblemRow[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg">Awaiting approval ({drafts.length})</h2>
        {drafts.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Queue clear</CardTitle>
              <CardDescription>
                No verified drafts waiting. Seed the bank with <code>npm run problems:seed</code>.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          drafts.map((p) => (
            <ProblemCard key={p.id} problem={p}>
              <form action={approveProblemAction}>
                <input type="hidden" name="problemId" value={p.id} />
                <Button type="submit" size="sm">
                  Approve into bank
                </Button>
              </form>
              <form action={rejectProblemAction}>
                <input type="hidden" name="problemId" value={p.id} />
                <Button type="submit" size="sm" variant="danger">
                  Reject
                </Button>
              </form>
            </ProblemCard>
          ))
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg">In the bank ({approved.length})</h2>
        {approved.length === 0 ? (
          <p className="text-sm text-fg-subtle">No approved problems yet.</p>
        ) : (
          approved.map((p) => (
            <ProblemCard key={p.id} problem={p}>
              <form action={retireProblemAction}>
                <input type="hidden" name="problemId" value={p.id} />
                <Button type="submit" size="sm" variant="ghost">
                  Retire (rotate out)
                </Button>
              </form>
            </ProblemCard>
          ))
        )}
      </section>

      {retired.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">Retired ({retired.length})</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-fg-subtle">
            {retired.map((p) => (
              <li key={p.id}>
                <span className="font-mono text-xs">{p.slug}</span> — {p.title} ({p.tier})
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
