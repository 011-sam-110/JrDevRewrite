/**
 * The Next-app → realtime-service poke (infra seam, mockable like every other
 * adapter). When the submit-solution slice settles a battle DECISIVELY, the
 * authoritative result is already in the DB — this call only tells the live
 * room so it can broadcast `battle-status` to both arenas NOW instead of at
 * the time-limit tick. Fire-and-forget by design: if the realtime service is
 * down the result still stands (DB is the authority) and clients converge on
 * the next resync/tick.
 *
 * The response carries the room's in-memory telemetry log — the settle wrote
 * `telemetry: []` (it ran in the Next process, which never saw the signals),
 * so the caller persists what comes back. REALTIME_HTTP_URL overrides the
 * default same-host mapping of the ws port (M18 wires the real topology).
 */

import type { PlayerSide } from '../../domain/battles';
import type { MatchTelemetryRecord } from '../../lib/match-events';

export interface SettledAck {
  telemetry: MatchTelemetryRecord[];
}

function realtimeHttpBase(): string {
  if (process.env.REALTIME_HTTP_URL) return process.env.REALTIME_HTTP_URL;
  const port = process.env.REALTIME_PORT ?? '3001';
  return `http://localhost:${port}`;
}

export async function notifyBattleSettled(
  battleId: string,
  winner: PlayerSide | null,
): Promise<SettledAck | null> {
  try {
    const secret = process.env.REALTIME_INTERNAL_SECRET;
    const res = await fetch(
      `${realtimeHttpBase()}/internal/battles/${encodeURIComponent(battleId)}/settled`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(secret ? { 'x-internal-secret': secret } : {}),
        },
        body: JSON.stringify({ winner }),
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<SettledAck> | null;
    return { telemetry: Array.isArray(body?.telemetry) ? body.telemetry : [] };
  } catch {
    return null; // realtime down — the DB result stands, clients converge later
  }
}
