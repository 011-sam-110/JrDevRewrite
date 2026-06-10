import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components';
import { scanSubmissionsAction } from '../scan-submissions/scan-submissions.action';
import type { FlagQueueItem } from './flag-queue';
import { FLAG_LABELS } from './flag-labels';
import { clearFlagAction, upholdFlagAction } from './review-flag.action';

/** "0.97" — keep the operator's eye on how strong the similarity was. */
function pct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function ScanButton() {
  return (
    <form action={scanSubmissionsAction}>
      <Button type="submit" size="sm">
        Run anti-cheat scan
      </Button>
    </form>
  );
}

export function FlagQueue({ items }: { items: FlagQueueItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No open flags</CardTitle>
          <CardDescription>
            Nothing is awaiting review. Run a scan to check submitted entries for duplicates and
            reuse — it also runs on a schedule via <code>npm run pools:scan</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScanButton />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <ScanButton />
      </div>
      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.entryId}>
            <Card accent>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{item.poolTitle}</CardTitle>
                  {item.reasons.map((reason) => (
                    <Badge key={reason} variant="gold">
                      {FLAG_LABELS[reason]}
                    </Badge>
                  ))}
                </div>
                <CardDescription>
                  <span className="font-mono text-xs">entrant {item.entrantLabel}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {item.repoUrl && (
                  <p className="mb-3 text-sm break-words text-fg-muted">
                    Repo:{' '}
                    <a
                      href={item.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-volt-dim underline underline-offset-2"
                    >
                      {item.repoUrl}
                    </a>
                  </p>
                )}
                {item.matches.length > 0 && (
                  <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-fg-muted">
                    {item.matches.map((m) => (
                      <li key={`${m.kind}:${m.ref}`}>
                        {m.kind === 'co-entry' ? 'matches entry' : 'matches own prior entry'}{' '}
                        <span className="font-mono text-xs">{m.ref}</span> at {pct(m.score)}{' '}
                        similarity
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-3">
                  <form action={upholdFlagAction}>
                    <input type="hidden" name="entryId" value={item.entryId} />
                    <Button type="submit" size="sm" variant="danger">
                      Uphold (disqualify)
                    </Button>
                  </form>
                  <form action={clearFlagAction}>
                    <input type="hidden" name="entryId" value={item.entryId} />
                    <Button type="submit" size="sm" variant="ghost">
                      Clear (false positive)
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
