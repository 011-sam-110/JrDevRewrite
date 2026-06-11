import { describe, expect, it } from 'vitest';
import {
  parseClientEvent,
  serializeServerEvent,
  type ClientEvent,
  type ServerEvent,
} from './match-events';

const parse = (value: unknown): ClientEvent | null => parseClientEvent(JSON.stringify(value));

describe('parseClientEvent — accepts every client event shape', () => {
  it('parses hello', () => {
    expect(parse({ type: 'hello', token: 'dev:u1' })).toEqual({ type: 'hello', token: 'dev:u1' });
  });

  it('parses join', () => {
    expect(parse({ type: 'join', battleId: 'b1' })).toEqual({ type: 'join', battleId: 'b1' });
  });

  it('parses ready / quit (no payload)', () => {
    expect(parse({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parse({ type: 'quit' })).toEqual({ type: 'quit' });
  });

  it('parses progress with a non-negative integer testsPassed', () => {
    expect(parse({ type: 'progress', testsPassed: 3 })).toEqual({
      type: 'progress',
      testsPassed: 3,
    });
    expect(parse({ type: 'progress', testsPassed: 0 })).toEqual({
      type: 'progress',
      testsPassed: 0,
    });
  });

  it('ignores unknown extra fields rather than rejecting (forward compatibility)', () => {
    expect(parse({ type: 'ready', later: true })).toEqual({ type: 'ready' });
  });
});

describe('parseClientEvent — rejects everything else (wire input is untrusted)', () => {
  it('rejects non-JSON frames', () => {
    expect(parseClientEvent('not json {')).toBeNull();
  });

  it('rejects JSON that is not an object', () => {
    expect(parse('hello')).toBeNull();
    expect(parse(42)).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse([{ type: 'ready' }])).toBeNull();
  });

  it('rejects a missing or unknown type', () => {
    expect(parse({})).toBeNull();
    expect(parse({ type: 'evil' })).toBeNull();
    expect(parse({ type: 7 })).toBeNull();
  });

  it('rejects hello without a string token', () => {
    expect(parse({ type: 'hello' })).toBeNull();
    expect(parse({ type: 'hello', token: 9 })).toBeNull();
    expect(parse({ type: 'hello', token: '' })).toBeNull();
  });

  it('rejects join without a string battleId', () => {
    expect(parse({ type: 'join' })).toBeNull();
    expect(parse({ type: 'join', battleId: '' })).toBeNull();
    expect(parse({ type: 'join', battleId: { id: 'b1' } })).toBeNull();
  });

  it('rejects progress with a negative, fractional, or non-numeric testsPassed', () => {
    expect(parse({ type: 'progress' })).toBeNull();
    expect(parse({ type: 'progress', testsPassed: -1 })).toBeNull();
    expect(parse({ type: 'progress', testsPassed: 1.5 })).toBeNull();
    expect(parse({ type: 'progress', testsPassed: 'many' })).toBeNull();
    expect(parse({ type: 'progress', testsPassed: Number.NaN })).toBeNull();
    expect(parse({ type: 'progress', testsPassed: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('serializeServerEvent', () => {
  it('round-trips a server event through JSON', () => {
    const event: ServerEvent = {
      type: 'countdown',
      goAt: '2026-06-11T12:00:05.000Z',
    };
    expect(JSON.parse(serializeServerEvent(event))).toEqual(event);
  });

  it('serializes the go event with the revealed problem payload', () => {
    const event: ServerEvent = {
      type: 'go',
      endsAt: '2026-06-11T12:30:05.000Z',
      problem: {
        id: 'p1',
        slug: 'sum-two-integers',
        title: 'Sum of Two Integers',
        statementMd: 'Read two integers…',
        tier: 'easy',
        timeLimitSeconds: 1800,
      },
    };
    expect(JSON.parse(serializeServerEvent(event))).toEqual(event);
  });
});
