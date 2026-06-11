import { describe, expect, it } from 'vitest';
import {
  assessAuthorship,
  assessBattleIntegrity,
  assessCadence,
  assessPlagiarism,
  DEFAULT_BATTLE_INTEGRITY_THRESHOLDS,
  focusLossSeconds,
  isTelemetryKind,
  TELEMETRY_KINDS,
  type BattleSimilarityComparison,
  type MatchTelemetryRecord,
} from './anti-cheat';

/**
 * Post-match battle anti-cheat (CLAUDE.md → Anti-cheat / battles, post-match):
 * pure predicates over the persisted evidence — submission history, the
 * server-stamped telemetry log, and similarity SCORES computed by infra (the
 * M7 split: infra compares, the kernel judges). Three signal families, pinned
 * by the roadmap: plagiarism (vs bank solutions and the opponent), AI-likelihood
 * (paste-blocking makes implausible authoring speed the tell), and cadence
 * anomalies. The numeric thresholds are tunable dials; the SHAPE of each rule
 * is the tested part.
 */

const T = DEFAULT_BATTLE_INTEGRITY_THRESHOLDS;

function tel(
  side: 'a' | 'b',
  kind: MatchTelemetryRecord['kind'],
  atSeconds: number,
): MatchTelemetryRecord {
  return { side, kind, atSeconds };
}

describe('telemetry vocabulary', () => {
  it('names exactly the three in-match signals the arena captures', () => {
    expect(TELEMETRY_KINDS).toEqual(['paste-blocked', 'focus-lost', 'focus-regained']);
  });

  it('isTelemetryKind accepts members and rejects everything else', () => {
    expect(isTelemetryKind('paste-blocked')).toBe(true);
    expect(isTelemetryKind('focus-lost')).toBe(true);
    expect(isTelemetryKind('keylogger')).toBe(false);
    expect(isTelemetryKind(42)).toBe(false);
    expect(isTelemetryKind(null)).toBe(false);
  });
});

describe('assessPlagiarism', () => {
  const bank = (score: number, ref = 'prob-1'): BattleSimilarityComparison => ({
    kind: 'bank-solution',
    ref,
    score,
  });
  const opp = (score: number, ref = 'sub-9'): BattleSimilarityComparison => ({
    kind: 'opponent-code',
    ref,
    score,
  });

  it('passes clean code (every score below the threshold)', () => {
    expect(assessPlagiarism([bank(0.4), opp(0.79)])).toEqual([]);
  });

  it('flags a bank-solution match at or above the threshold (inclusive)', () => {
    const signals = assessPlagiarism([bank(T.plagiarism)]);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ reason: 'bank-plagiarism', ref: 'prob-1', value: 0.8 });
  });

  it('flags an opponent-code match with its own reason', () => {
    const signals = assessPlagiarism([opp(0.95)]);
    expect(signals[0]).toMatchObject({ reason: 'opponent-plagiarism', ref: 'sub-9', value: 0.95 });
  });

  it('reports every offending match, worst first (the operator sees all evidence)', () => {
    const signals = assessPlagiarism([opp(0.85, 'sub-1'), bank(0.99), opp(0.92, 'sub-2')]);
    expect(signals.map((s) => s.value)).toEqual([0.99, 0.92, 0.85]);
  });

  it('threshold is tunable per call', () => {
    expect(assessPlagiarism([bank(0.5)], { ...T, plagiarism: 0.5 })).toHaveLength(1);
  });

  it('throws on a score outside [0,1] — corrupt input must not silently pass', () => {
    expect(() => assessPlagiarism([bank(1.2)])).toThrow(RangeError);
    expect(() => assessPlagiarism([bank(-0.1)])).toThrow(RangeError);
  });

  it('no comparisons → no signals (a forfeit win with no code compares nothing)', () => {
    expect(assessPlagiarism([])).toEqual([]);
  });
});

describe('assessAuthorship (AI-likelihood)', () => {
  it('passes a humanly-typed solution', () => {
    // 300 chars over 5 minutes — entirely ordinary.
    expect(assessAuthorship({ codeLength: 300, atSeconds: 300, pasteBlockedAttempts: 0 })).toEqual(
      [],
    );
  });

  it('flags implausible sustained authoring speed (paste is blocked, so typing is the bound)', () => {
    // 2000 chars in 60s = 33 cps — nobody types that.
    const signals = assessAuthorship({ codeLength: 2000, atSeconds: 60, pasteBlockedAttempts: 0 });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ reason: 'ai-likelihood' });
    expect(signals[0]!.detail).toMatch(/chars\/s/);
  });

  it('the speed bound is exclusive: exactly at the limit is still plausible', () => {
    const limit = T.maxCharsPerSecond;
    expect(
      assessAuthorship({ codeLength: limit * 100, atSeconds: 100, pasteBlockedAttempts: 0 }),
    ).toEqual([]);
  });

  it('guards atSeconds 0 (a submission stamped at the go cannot divide by zero)', () => {
    const signals = assessAuthorship({ codeLength: 500, atSeconds: 0, pasteBlockedAttempts: 0 });
    expect(signals).toHaveLength(1); // 500 chars in ≤1s is flagrant
  });

  it('flags repeated paste attempts (trying to bring external code in)', () => {
    const signals = assessAuthorship({
      codeLength: 100,
      atSeconds: 600,
      pasteBlockedAttempts: T.pasteAttempts,
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ reason: 'ai-likelihood', value: T.pasteAttempts });
  });

  it('a stray paste attempt below the threshold is not a signal (fat fingers happen)', () => {
    expect(assessAuthorship({ codeLength: 100, atSeconds: 600, pasteBlockedAttempts: 1 })).toEqual(
      [],
    );
  });
});

describe('focusLossSeconds', () => {
  it('sums closed focus-lost → focus-regained intervals for one side only', () => {
    const log = [
      tel('a', 'focus-lost', 10),
      tel('b', 'focus-lost', 12), // the opponent's blur is not ours
      tel('a', 'focus-regained', 40),
      tel('a', 'focus-lost', 100),
      tel('a', 'focus-regained', 110),
    ];
    expect(focusLossSeconds(log, 'a', 600)).toBe(40);
  });

  it('an unclosed loss runs to the cap (they never came back before solving)', () => {
    expect(focusLossSeconds([tel('a', 'focus-lost', 50)], 'a', 200)).toBe(150);
  });

  it('ignores events after the cap and clamps a straddling interval', () => {
    const log = [tel('a', 'focus-lost', 90), tel('a', 'focus-regained', 150)];
    expect(focusLossSeconds(log, 'a', 100)).toBe(10);
  });

  it('a regained without a lost is ignored (tolerant of partial logs)', () => {
    expect(focusLossSeconds([tel('a', 'focus-regained', 30)], 'a', 100)).toBe(0);
    expect(focusLossSeconds([], 'a', 100)).toBe(0);
  });

  it('paste-blocked events never count as absence', () => {
    expect(focusLossSeconds([tel('a', 'paste-blocked', 10)], 'a', 100)).toBe(0);
  });
});

describe('assessCadence', () => {
  it('passes a normal solve', () => {
    expect(
      assessCadence({ side: 'a', solvedAtSeconds: 400, passedAll: true, telemetry: [] }),
    ).toEqual([]);
  });

  it('flags a full solve faster than a human can even read the statement', () => {
    const signals = assessCadence({
      side: 'a',
      solvedAtSeconds: T.minSolveSeconds - 1,
      passedAll: true,
      telemetry: [],
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ reason: 'cadence-anomaly' });
    expect(signals[0]!.detail).toMatch(/solve/i);
  });

  it('the instant-solve rule only applies to FULL solves (a quick partial probe is normal)', () => {
    expect(
      assessCadence({ side: 'a', solvedAtSeconds: 5, passedAll: false, telemetry: [] }),
    ).toEqual([]);
  });

  it('flags an absent author: unfocused for most of the time before their winning submission', () => {
    // Lost focus at 10s, back at 110s, solved at 120s — 100/120 ≥ 50% absent.
    const signals = assessCadence({
      side: 'a',
      solvedAtSeconds: 120,
      passedAll: true,
      telemetry: [tel('a', 'focus-lost', 10), tel('a', 'focus-regained', 110)],
    });
    expect(signals.some((s) => s.detail.match(/unfocused/i))).toBe(true);
  });

  it('absence needs enough elapsed time to mean anything (no flag in the first minute)', () => {
    const signals = assessCadence({
      side: 'a',
      solvedAtSeconds: T.minSecondsForAbsence - 1,
      passedAll: false,
      telemetry: [tel('a', 'focus-lost', 0)],
    });
    expect(signals).toEqual([]);
  });

  it("the opponent's focus loss never flags ME", () => {
    expect(
      assessCadence({
        side: 'a',
        solvedAtSeconds: 300,
        passedAll: true,
        telemetry: [tel('b', 'focus-lost', 0)],
      }),
    ).toEqual([]);
  });
});

describe('assessBattleIntegrity (the composed verdict)', () => {
  const cleanInput = {
    comparisons: [] as BattleSimilarityComparison[],
    winnerSide: 'a' as const,
    winningCodeLength: 400,
    winningAtSeconds: 600,
    winningPassedAll: true,
    telemetry: [] as MatchTelemetryRecord[],
  };

  it('a clean win is ok', () => {
    expect(assessBattleIntegrity(cleanInput)).toEqual({ ok: true });
  });

  it('collects signals from EVERY family at once (layered, like checkJoin)', () => {
    const verdict = assessBattleIntegrity({
      comparisons: [{ kind: 'bank-solution', ref: 'prob-1', score: 0.9 }],
      winnerSide: 'a',
      winningCodeLength: 5000,
      winningAtSeconds: 30, // implausible speed AND instant solve
      winningPassedAll: true,
      telemetry: [
        tel('a', 'paste-blocked', 5),
        tel('a', 'paste-blocked', 6),
        tel('a', 'paste-blocked', 7),
      ],
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      const reasons = new Set(verdict.signals.map((s) => s.reason));
      expect(reasons).toContain('bank-plagiarism');
      expect(reasons).toContain('ai-likelihood');
      expect(reasons).toContain('cadence-anomaly');
    }
  });

  it("derives the winner's paste attempts from the telemetry, ignoring the opponent's", () => {
    const pastes = Array.from({ length: 5 }, (_, i) => tel('b', 'paste-blocked', i));
    expect(assessBattleIntegrity({ ...cleanInput, telemetry: pastes })).toEqual({ ok: true });
  });

  it('a clean record stays ok with benign telemetry present', () => {
    expect(
      assessBattleIntegrity({
        ...cleanInput,
        telemetry: [tel('a', 'focus-lost', 10), tel('a', 'focus-regained', 15)],
      }),
    ).toEqual({ ok: true });
  });
});
