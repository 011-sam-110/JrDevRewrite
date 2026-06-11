import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components';
import type { BattleCheatReason } from '@/domain/battles';
import { scanBattlesAction } from '../resolve-battle/scan-battles.action';
import type { BattleFlagQueueItem } from './battle-flag-queue';
import { clearBattleFlagAction, upholdBattleFlagAction } from './review-battle-flag.action';

const REASON_LABELS: Record<BattleCheatReason, string> = {
  'bank-plagiarism': 'matches a bank solution',
  'opponent-plagiarism': "matches the opponent's code",
  'ai-likelihood': 'AI-assistance likelihood',
  'cadence-anomaly': 'cadence anomaly',
};

function ScanBattlesButton() {
  return (
    <form action={scanBattlesAction}>
      <Button type="submit" size="sm">
        Scan recent battles
      </Button>
    </form>
  );
}

/**
 * The battle half of the operator's anti-cheat console (the pool half is
 * M7's FlagQueue). Uphold = confirmed: the flagged winner forfeits, takes the
 * Elo penalty, a strike and the ladder ban; clear = false positive.
 */
export function BattleFlagQueue({ items }: { items: BattleFlagQueueItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No flagged battles</CardTitle>
          <CardDescription>
            Every settled battle is scanned automatically the moment it settles. The scan button
            re-checks the last week — safe to run any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScanBattlesButton />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <ScanBattlesButton />
      </div>
      <ul className="flex flex-col gap-4" data-testid="battle-flag-queue">
        {items.map((item) => (
          <li key={item.battleId}>
            <Card accent>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{item.problemTitle}</CardTitle>
                  {[...new Set(item.signals.map((s) => s.reason))].map((reason) => (
                    <Badge key={reason} variant="gold">
                      {REASON_LABELS[reason]}
                    </Badge>
                  ))}
                </div>
                <CardDescription>
                  <span className="font-mono text-xs">
                    flagged winner {item.flaggedLabel} · vs {item.opponentLabel}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-fg-muted">
                  {item.signals.map((s, i) => (
                    <li key={`${s.reason}:${s.ref ?? i}`}>{s.detail}</li>
                  ))}
                </ul>
                <div className="flex gap-3">
                  <form action={upholdBattleFlagAction}>
                    <input type="hidden" name="battleId" value={item.battleId} />
                    <Button type="submit" size="sm" variant="danger">
                      Uphold (forfeit + ban)
                    </Button>
                  </form>
                  <form action={clearBattleFlagAction}>
                    <input type="hidden" name="battleId" value={item.battleId} />
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
