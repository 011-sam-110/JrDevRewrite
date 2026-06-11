'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { lobbyPingAction } from './lobby-ping.action';

const PING_INTERVAL_MS = 4000;

/**
 * The lobby's only client JS: a heartbeat that (1) marks me online, (2)
 * bounces me into the arena the moment a battle involving me goes into
 * motion (challenge accepted, queue paired), and (3) refreshes the
 * server-rendered lobby when its fingerprint changes — so two players see
 * each other's challenges appear without anyone owning a websocket here.
 */
export function LobbyPoller({ initialStamp }: { initialStamp: string }) {
  const router = useRouter();
  const stampRef = useRef(initialStamp);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const ping = await lobbyPingAction();
        if (cancelled || !ping) return;
        if (ping.activeBattleId) {
          router.push(`/battles/${ping.activeBattleId}`);
          return;
        }
        if (ping.stamp !== stampRef.current) {
          stampRef.current = ping.stamp;
          router.refresh();
        }
      } catch {
        // Transient network noise — the next tick retries.
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
