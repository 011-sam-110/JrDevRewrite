import { describe, expect, it } from 'vitest';
import { parsePoolSpecFile } from './spec-format';

const VALID_ENTRY = `---
slug: component-library
title: Build a Component Library
role: frontend
difficulty: beginner
window:
  joinDays: 3
  buildDays: 7
  judgeDays: 3
requirements:
  - At least 5 documented components
  - Storybook or equivalent demo page
---
Ship a small, polished component library.
`;

describe('parsePoolSpecFile', () => {
  it('parses a single valid entry into a draft spec', () => {
    const { specs, errors } = parsePoolSpecFile('frontend.md', VALID_ENTRY);

    expect(errors).toEqual([]);
    expect(specs).toEqual([
      {
        slug: 'component-library',
        title: 'Build a Component Library',
        role: 'frontend',
        difficulty: 'beginner',
        windows: { joinHours: 72, buildHours: 168, judgingHours: 72 },
        requirements: ['At least 5 documented components', 'Storybook or equivalent demo page'],
        entrantCap: 30,
        brief: 'Ship a small, polished component library.',
      },
    ]);
  });

  it('parses multiple entries delimited by frontmatter blocks', () => {
    const second = VALID_ENTRY.replace('component-library', 'second-pool');
    const { specs, errors } = parsePoolSpecFile('frontend.md', `${VALID_ENTRY}\n${second}`);

    expect(errors).toEqual([]);
    expect(specs.map((s) => s.slug)).toEqual(['component-library', 'second-pool']);
  });

  it('honours an explicit entrantCap', () => {
    const { specs } = parsePoolSpecFile(
      'frontend.md',
      VALID_ENTRY.replace('---\nShip', 'entrantCap: 12\n---\nShip'),
    );
    expect(specs[0]?.entrantCap).toBe(12);
  });

  it('collects ALL problems for a broken entry, keyed by file and entry', () => {
    const broken = `---
slug: Bad Slug!
title: ""
role: astronaut
difficulty: impossible
window:
  joinDays: 0
  buildDays: 7
requirements: []
---
`;
    const { specs, errors } = parsePoolSpecFile('frontend.md', broken);

    expect(specs).toEqual([]);
    expect(errors).toHaveLength(1);
    const error = errors[0]!;
    expect(error.file).toBe('frontend.md');
    expect(error.entry).toBe('entry 1');
    expect(error.problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('slug'),
        expect.stringContaining('title'),
        expect.stringContaining('role'),
        expect.stringContaining('difficulty'),
        expect.stringContaining('judgeDays'),
        expect.stringContaining('joinDays'),
        expect.stringContaining('requirements'),
        expect.stringContaining('brief'),
      ]),
    );
  });

  it('keeps valid entries when a sibling entry is broken', () => {
    const broken = VALID_ENTRY.replace('slug: component-library', 'slug: NOPE').replace(
      'second',
      'x',
    );
    const { specs, errors } = parsePoolSpecFile('frontend.md', `${VALID_ENTRY}\n${broken}`);

    expect(specs.map((s) => s.slug)).toEqual(['component-library']);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.entry).toBe('entry 2');
  });

  it('rejects entrant caps below the kernel minimum of 6', () => {
    const { specs, errors } = parsePoolSpecFile(
      'frontend.md',
      VALID_ENTRY.replace('---\nShip', 'entrantCap: 4\n---\nShip'),
    );
    expect(specs).toEqual([]);
    expect(errors[0]!.problems).toEqual([expect.stringContaining('entrantCap')]);
  });

  it('flags unknown frontmatter keys (catches typos instead of ignoring them)', () => {
    const { errors } = parsePoolSpecFile(
      'frontend.md',
      VALID_ENTRY.replace('---\nShip', 'judgedays: 3\n---\nShip'),
    );
    expect(errors[0]!.problems).toEqual([expect.stringContaining('judgedays')]);
  });

  it('rejects duplicate slugs within a file', () => {
    const { specs, errors } = parsePoolSpecFile('frontend.md', `${VALID_ENTRY}\n${VALID_ENTRY}`);
    expect(specs).toHaveLength(1);
    expect(errors[0]!.problems).toEqual([expect.stringContaining('duplicate slug')]);
  });

  it('reports unparseable YAML as an entry error, not a crash', () => {
    const { specs, errors } = parsePoolSpecFile('frontend.md', '---\n[:::\n---\nbody\n');
    expect(specs).toEqual([]);
    expect(errors[0]!.problems).toEqual([expect.stringContaining('YAML')]);
  });

  it('rejects a file that does not start with frontmatter', () => {
    const { errors } = parsePoolSpecFile('frontend.md', 'just some prose\n');
    expect(errors[0]!.problems).toEqual([expect.stringContaining('frontmatter')]);
  });

  it('rejects an empty file', () => {
    const { errors } = parsePoolSpecFile('frontend.md', '\n\n');
    expect(errors[0]!.problems).toEqual([expect.stringContaining('no entries')]);
  });

  it('rejects an unterminated frontmatter block', () => {
    const { errors } = parsePoolSpecFile('frontend.md', '---\nslug: x\n');
    expect(errors[0]!.problems).toEqual([expect.stringContaining('unterminated')]);
  });

  it('errors on fractional days that round below one hour', () => {
    const { errors } = parsePoolSpecFile(
      'frontend.md',
      VALID_ENTRY.replace('joinDays: 3', 'joinDays: 0.01'),
    );
    expect(errors[0]!.problems).toEqual([expect.stringContaining('joinDays')]);
  });
});
