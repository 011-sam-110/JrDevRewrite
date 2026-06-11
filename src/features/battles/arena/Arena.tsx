'use client';

import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Badge, Button, Logo } from '@/components';
import {
  BATTLE_LANGUAGES,
  SUBMISSION_COOLDOWN_SECONDS,
  type BattleLanguage,
} from '@/domain/battles';
import type { TelemetryKind } from '@/lib/match-events';
import {
  describeResult,
  formatClock,
  initialArenaState,
  reduceArena,
  type ArenaState,
} from './arena-state';
import { CodeEditor, LANGUAGE_LABELS } from './CodeEditor';
import { connectArenaSocket, type ArenaDriver } from './connection';
import { createMockArena, type MockOpponentControls } from './mock-room';
import type { FeedItem, SubmitSolution } from './types';

/**
 * The battle arena — the client of the M13 realtime contract. All match state
 * the UI renders comes out of the pure `reduceArena` fold; this component owns
 * only wiring: the driver, the local clock ticks, telemetry listeners, and the
 * submission seam. It decides NOTHING authoritative — a battle settles when
 * (and only when) a `battle-status` event says so.
 */

export type ArenaProps =
  | { mode: 'mock'; battleId: string }
  | { mode: 'ws'; battleId: string; url: string; token: string };

export function Arena(props: ArenaProps) {
  const [state, dispatch] = useReducer(reduceArena, undefined, initialArenaState);
  const driverRef = useRef<ArenaDriver | null>(null);
  const submitRef = useRef<SubmitSolution | null>(null);
  const opponentRef = useRef<MockOpponentControls | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(SUBMISSION_COOLDOWN_SECONDS);

  /* ----------------------------------------------------- driver lifecycle */
  useEffect(() => {
    if (props.mode === 'mock') {
      const mock = createMockArena(dispatch);
      driverRef.current = mock.driver;
      submitRef.current = mock.submit;
      opponentRef.current = mock.opponent;
      setCooldownSeconds(mock.cooldownSeconds);
      return () => mock.driver.close();
    }
    const driver = connectArenaSocket({
      url: props.url,
      token: props.token,
      battleId: props.battleId,
      onEvent: dispatch,
    });
    driverRef.current = driver;
    submitRef.current = null; // the real judge path lands with M15's submit-solution slice
    return () => driver.close();
    // The connection params are fixed for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------- local clock */
  // One coarse tick drives the countdown digits and the match timer. The
  // instants themselves (goAt/endsAt) are server-authoritative; ticking is
  // pure display.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (state.phase !== 'countdown' && state.phase !== 'live') return;
    // Snap immediately on phase entry — a stale mount-time `nowMs` would
    // otherwise inflate the first countdown frame (rendering 6 on a 5s fuse).
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(interval);
  }, [state.phase]);

  /* ------------------------------------------------------------ telemetry */
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const feedIdRef = useRef(0);
  const elapsedClock = useCallback((): string => {
    if (!state.goAt) return '00:00';
    return formatClock((Date.now() - new Date(state.goAt).getTime()) / 1000);
  }, [state.goAt]);

  const pushNotice = useCallback(
    (text: string) => {
      feedIdRef.current += 1;
      setFeed((prev) => [
        { kind: 'notice', id: feedIdRef.current, atClock: elapsedClock(), text },
        ...prev,
      ]);
    },
    [elapsedClock],
  );

  const sendTelemetry = useCallback((kind: TelemetryKind) => {
    driverRef.current?.send({ type: 'telemetry', kind });
  }, []);

  // Tab/window focus telemetry — armed only while live (the only phase where
  // leaving the arena means anything to the post-match heuristics).
  const live = state.phase === 'live';
  useEffect(() => {
    if (!live) return;
    const onBlur = () => {
      sendTelemetry('focus-lost');
      pushNotice('Focus left the arena — recorded');
    };
    const onFocus = () => sendTelemetry('focus-regained');
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [live, sendTelemetry, pushNotice]);

  const onPasteBlocked = useCallback(() => {
    sendTelemetry('paste-blocked');
    pushNotice('Paste blocked — recorded');
  }, [sendTelemetry, pushNotice]);

  /* ----------------------------------------------------------- submitting */
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState<BattleLanguage>('python');
  const [judging, setJudging] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [bestTestsTotal, setBestTestsTotal] = useState<number | null>(null);

  const cooldownRemaining =
    cooldownUntil !== null ? Math.max(0, Math.ceil((cooldownUntil - nowMs) / 1000)) : 0;

  async function handleSubmit() {
    const submit = submitRef.current;
    if (!submit || judging || cooldownRemaining > 0 || code.trim() === '') return;
    setJudging(true);
    try {
      const outcome = await submit(code, language);
      feedIdRef.current += 1;
      setFeed((prev) => [
        { kind: 'submission', id: feedIdRef.current, atClock: elapsedClock(), ...outcome },
        ...prev,
      ]);
      setBestTestsTotal(outcome.testsTotal);
      // Tell the opponent how far we are (count only — never the code).
      driverRef.current?.send({ type: 'progress', testsPassed: outcome.testsPassed });
      setCooldownUntil(Date.now() + cooldownSeconds * 1000);
    } finally {
      setJudging(false);
    }
  }

  /* -------------------------------------------------------------- derived */
  const result = describeResult(state);
  const remainingSeconds = state.endsAt ? (new Date(state.endsAt).getTime() - nowMs) / 1000 : null;
  const countdownLeft = state.goAt
    ? Math.ceil((new Date(state.goAt).getTime() - nowMs) / 1000)
    : null;

  return (
    <div className="bg-grid flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-edge-subtle bg-surface/80 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Logo />
          <Badge variant="elo">Battle</Badge>
          <span className="font-mono text-xs text-fg-subtle">{props.battleId}</span>
        </div>
        <div className="flex items-center gap-3">
          {state.connectionLost && <Badge variant="danger">Connection lost</Badge>}
          {live && remainingSeconds !== null && (
            <span
              className={`font-mono text-lg font-bold tabular-nums ${
                remainingSeconds < 60 ? 'text-danger' : 'text-volt'
              }`}
              data-testid="match-timer"
              aria-label="Match time remaining"
            >
              {formatClock(remainingSeconds)}
            </span>
          )}
          <Link href="/dashboard" className="text-xs text-fg-muted uppercase hover:text-fg">
            Exit
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {(state.phase === 'connecting' || state.phase === 'lobby') && (
          <Lobby
            state={state}
            onReady={() => driverRef.current?.send({ type: 'ready' })}
            onQuit={() => driverRef.current?.send({ type: 'quit' })}
          />
        )}
        {state.phase === 'countdown' && <Countdown secondsLeft={countdownLeft ?? 0} />}
        {state.phase === 'live' && state.problem && (
          <LiveMatch
            state={state}
            code={code}
            language={language}
            judging={judging}
            cooldownRemaining={cooldownRemaining}
            canSubmit={submitRef.current !== null}
            feed={feed}
            bestTestsTotal={bestTestsTotal}
            onCode={setCode}
            onLanguage={setLanguage}
            onPasteBlocked={onPasteBlocked}
            onSubmit={() => void handleSubmit()}
            onQuit={() => driverRef.current?.send({ type: 'quit' })}
          />
        )}
        {state.phase === 'settled' && result && (
          <Settled
            tone={result.tone}
            headline={result.headline}
            detail={result.detail}
            feed={feed}
          />
        )}
      </main>

      {props.mode === 'mock' && <MockControls opponent={opponentRef} phase={state.phase} />}
    </div>
  );
}

/* ================================================================== lobby */

function SeatChip({ label, present, ready }: { label: string; present: boolean; ready: boolean }) {
  return (
    <div className="clip-corner-sm flex items-center justify-between gap-6 border border-edge bg-raised px-4 py-3">
      <span className="font-display text-sm tracking-wide">{label}</span>
      <span className="flex items-center gap-2">
        <Badge variant={present ? 'info' : 'outline'}>{present ? 'Connected' : 'Waiting…'}</Badge>
        <Badge variant={ready ? 'volt' : 'outline'}>{ready ? 'Ready' : 'Not ready'}</Badge>
      </span>
    </div>
  );
}

function Lobby({
  state,
  onReady,
  onQuit,
}: {
  state: ArenaState;
  onReady: () => void;
  onQuit: () => void;
}) {
  const me = state.side;
  const opp = me === 'a' ? 'b' : 'a';
  const iAmReady = me !== null && state.ready[me];
  const connecting = state.phase === 'connecting';

  return (
    <section className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <h1 className="font-display text-2xl tracking-wide">Battle lobby</h1>
      <p className="text-center text-sm text-fg-muted">
        Both players must signal ready. The problem is revealed to both of you at the exact same
        instant — get set.
      </p>
      {connecting ? (
        <p className="font-mono text-sm text-fg-subtle" data-testid="connecting">
          Connecting to the arena…
        </p>
      ) : (
        <>
          <div className="flex w-full flex-col gap-2">
            <SeatChip label="You" present={me !== null && state.presence[me]} ready={iAmReady} />
            <SeatChip
              label="Opponent"
              present={me !== null && state.presence[opp]}
              ready={me !== null && state.ready[opp]}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button size="lg" onClick={onReady} disabled={iAmReady}>
              {iAmReady ? 'Waiting for opponent…' : "I'm ready"}
            </Button>
            <Button variant="ghost" size="lg" onClick={onQuit}>
              Leave
            </Button>
          </div>
          <p className="text-xs text-fg-subtle">
            No-shows void the match — nothing is rated until the problem is revealed.
          </p>
        </>
      )}
    </section>
  );
}

/* ============================================================== countdown */

function Countdown({ secondsLeft }: { secondsLeft: number }) {
  return (
    <section
      className="flex flex-1 flex-col items-center justify-center gap-4"
      data-testid="countdown"
    >
      <p className="font-display text-sm tracking-[0.3em] text-fg-muted uppercase">Get ready</p>
      <p className="text-glow font-display text-[9rem] leading-none text-volt tabular-nums">
        {Math.max(0, secondsLeft)}
      </p>
      <p className="text-sm text-fg-subtle">Problem reveals for both players simultaneously</p>
    </section>
  );
}

/* =================================================================== live */

function LiveMatch({
  state,
  code,
  language,
  judging,
  cooldownRemaining,
  canSubmit,
  feed,
  bestTestsTotal,
  onCode,
  onLanguage,
  onPasteBlocked,
  onSubmit,
  onQuit,
}: {
  state: ArenaState;
  code: string;
  language: BattleLanguage;
  judging: boolean;
  cooldownRemaining: number;
  canSubmit: boolean;
  feed: FeedItem[];
  bestTestsTotal: number | null;
  onCode: (code: string) => void;
  onLanguage: (language: BattleLanguage) => void;
  onPasteBlocked: () => void;
  onSubmit: () => void;
  onQuit: () => void;
}) {
  const problem = state.problem!;
  const submitLabel = judging
    ? 'Judging…'
    : cooldownRemaining > 0
      ? `Cooldown ${cooldownRemaining}s`
      : 'Submit solution';

  return (
    <div className="grid flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[2fr_3fr]">
      {/* ------------------------------------------------ problem pane */}
      <section className="clip-corner flex min-h-0 flex-col border border-edge bg-surface shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-edge-subtle px-4 py-3">
          <h1 className="font-display text-lg tracking-wide">{problem.title}</h1>
          <Badge
            variant={
              problem.tier === 'hard' ? 'danger' : problem.tier === 'medium' ? 'gold' : 'volt'
            }
          >
            {problem.tier}
          </Badge>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <p className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">
            {problem.statementMd}
          </p>
        </div>
        <div className="border-t border-edge-subtle px-4 py-2.5">
          <OpponentProgress testsPassed={state.opponentTestsPassed} testsTotal={bestTestsTotal} />
        </div>
      </section>

      {/* ------------------------------------------------- editor side */}
      <section className="flex min-h-0 flex-col gap-3">
        <div className="clip-corner flex min-h-[320px] flex-1 flex-col border border-edge bg-surface shadow-card">
          <div className="flex items-center justify-between gap-2 border-b border-edge-subtle px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-fg-muted uppercase">
              Language
              <select
                value={language}
                onChange={(e) => onLanguage(e.target.value as BattleLanguage)}
                className="rounded-sm border border-edge bg-raised px-2 py-1 font-mono text-xs text-fg"
              >
                {BATTLE_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {LANGUAGE_LABELS[lang]}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-warning" data-testid="anticheat-notice">
              Paste disabled · focus changes recorded
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <CodeEditor
              value={code}
              language={language}
              onChange={onCode}
              onPasteBlocked={onPasteBlocked}
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-edge-subtle px-3 py-2.5">
            <Button variant="ghost" size="sm" onClick={onQuit}>
              Forfeit
            </Button>
            <Button
              onClick={onSubmit}
              loading={judging}
              disabled={!canSubmit || cooldownRemaining > 0 || code.trim() === ''}
              data-testid="submit-solution"
            >
              {submitLabel}
            </Button>
          </div>
        </div>

        <VerdictFeed feed={feed} />
      </section>
    </div>
  );
}

function OpponentProgress({
  testsPassed,
  testsTotal,
}: {
  testsPassed: number;
  testsTotal: number | null;
}) {
  const total = testsTotal !== null ? Math.max(testsTotal, testsPassed) : null;
  return (
    <div className="flex items-center gap-3" data-testid="opponent-progress">
      <span className="text-xs tracking-wide text-fg-muted uppercase">Opponent</span>
      {total !== null ? (
        <span
          className="flex items-center gap-1"
          aria-label={`Opponent: ${testsPassed} of ${total} tests passed`}
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-5 rounded-xs ${i < testsPassed ? 'bg-elo' : 'bg-edge'}`}
            />
          ))}
        </span>
      ) : null}
      <span className="font-mono text-sm text-elo tabular-nums">
        {testsPassed} {total !== null ? `/ ${total}` : ''} tests
      </span>
    </div>
  );
}

/* =========================================================== verdict feed */

function VerdictFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <section
      className="clip-corner-sm max-h-56 overflow-y-auto border border-edge bg-surface shadow-card"
      data-testid="verdict-feed"
      aria-live="polite"
      aria-label="Submission verdicts"
    >
      <h2 className="border-b border-edge-subtle px-3 py-2 text-xs tracking-wide text-fg-muted uppercase">
        Verdict feed
      </h2>
      {feed.length === 0 ? (
        <p className="px-3 py-3 text-xs text-fg-subtle">
          No submissions yet — first fully-correct solution wins.
        </p>
      ) : (
        <ul className="divide-y divide-edge-subtle">
          {feed.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2 font-mono text-xs">
              <span className="text-fg-subtle tabular-nums">{item.atClock}</span>
              {item.kind === 'submission' ? (
                <>
                  <Badge
                    variant={
                      item.status === 'accepted'
                        ? 'volt'
                        : item.status === 'rejected'
                          ? 'danger'
                          : 'outline'
                    }
                  >
                    {item.status}
                  </Badge>
                  <span className="text-fg-muted">
                    {item.testsPassed}/{item.testsTotal} hidden tests passed
                  </span>
                </>
              ) : (
                <>
                  <Badge variant="danger">recorded</Badge>
                  <span className="text-warning">{item.text}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================================================================ settled */

function Settled({
  tone,
  headline,
  detail,
  feed,
}: {
  tone: 'won' | 'lost' | 'draw' | 'void';
  headline: string;
  detail: string | null;
  feed: FeedItem[];
}) {
  const toneClass =
    tone === 'won' ? 'text-volt text-glow' : tone === 'lost' ? 'text-danger' : 'text-fg-muted';
  return (
    <section
      className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 px-4 py-10"
      data-testid="settled"
    >
      <p className="font-display text-sm tracking-[0.3em] text-fg-muted uppercase">Match over</p>
      <h1 className={`font-display text-6xl tracking-wide ${toneClass}`}>{headline}</h1>
      {detail && <p className="text-sm text-fg-muted">{detail}</p>}
      {tone === 'won' && (
        <p className="text-sm text-fg-muted">Elo and XP land with the match record.</p>
      )}
      {feed.length > 0 && <VerdictFeed feed={feed} />}
      <Link href="/dashboard">
        <Button variant="secondary">Back to dashboard</Button>
      </Link>
    </section>
  );
}

/* ========================================================== mock controls */

/**
 * Dev-only strip driving the phantom opponent of the mocked room — this is
 * how the e2e walks the countdown → reveal → live flow. Never rendered
 * outside mock mode (which the page gates out of production).
 */
function MockControls({
  opponent,
  phase,
}: {
  opponent: React.RefObject<MockOpponentControls | null>;
  phase: ArenaState['phase'];
}) {
  const [oppTests, setOppTests] = useState(0);
  return (
    <aside className="fixed right-3 bottom-3 flex flex-col gap-2 rounded-md border border-warning/40 bg-raised/95 p-3 shadow-card">
      <p className="text-xs font-bold tracking-wide text-warning uppercase">Dev mock controls</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => opponent.current?.join()}>
          Opponent joins
        </Button>
        <Button size="sm" variant="secondary" onClick={() => opponent.current?.ready()}>
          Opponent ready
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={phase !== 'live'}
          onClick={() => {
            const next = oppTests + 1;
            setOppTests(next);
            opponent.current?.progress(next);
          }}
        >
          Opponent +1 test
        </Button>
        <Button size="sm" variant="danger" onClick={() => opponent.current?.quit()}>
          Opponent quits
        </Button>
      </div>
    </aside>
  );
}
