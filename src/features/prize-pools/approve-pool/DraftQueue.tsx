import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components';
import { JOB_ROLES, type JobRole } from '@/domain/identity';
import { approvePoolAction, rejectPoolAction } from './approve-pool.action';
import type { DraftQueueItem } from './draft-queue';

function roleLabel(role: JobRole): string {
  return JOB_ROLES.find((r) => r.id === role)?.label ?? role;
}

/** "72h" → "3d"; sub-day windows stay in hours. */
function windowLabel(hours: number): string {
  return hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`;
}

const DIFFICULTY_BADGE = { beginner: 'volt', intermediate: 'info', advanced: 'gold' } as const;

export function DraftQueue({ drafts }: { drafts: DraftQueueItem[] }) {
  if (drafts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Queue clear</CardTitle>
          <CardDescription>
            No drafts waiting. Import specs with <code>npm run pools:import</code> — AI-generated
            drafts land here too from M17.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {drafts.map((draft) => (
        <Card key={draft.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{draft.title}</CardTitle>
              <Badge variant={DIFFICULTY_BADGE[draft.difficulty]}>{draft.difficulty}</Badge>
              <Badge variant="neutral">{roleLabel(draft.role)}</Badge>
              <Badge variant="outline">{draft.source}</Badge>
            </div>
            <CardDescription>
              <span className="font-mono text-xs">
                {draft.slug} · join {windowLabel(draft.joinWindowHours)} · build{' '}
                {windowLabel(draft.buildWindowHours)} · judge{' '}
                {windowLabel(draft.judgingWindowHours)} · cap {draft.entrantCap}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm whitespace-pre-line text-fg-muted">{draft.brief}</p>
            <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-fg-muted">
              {draft.requirements.map((req) => (
                <li key={req}>{req}</li>
              ))}
            </ul>
            <div className="flex gap-3">
              <form action={approvePoolAction}>
                <input type="hidden" name="poolId" value={draft.id} />
                <Button type="submit" size="sm">
                  Approve &amp; publish
                </Button>
              </form>
              <form action={rejectPoolAction}>
                <input type="hidden" name="poolId" value={draft.id} />
                <Button type="submit" size="sm" variant="danger">
                  Reject
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
