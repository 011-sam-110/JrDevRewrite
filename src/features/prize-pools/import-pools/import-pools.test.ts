import { describe, expect, it, vi } from 'vitest';
import { importPools, type ImportDeps } from './import-pools';

function entry(slug: string, role = 'frontend'): string {
  return `---
slug: ${slug}
title: Pool ${slug}
role: ${role}
difficulty: beginner
window:
  joinDays: 3
  buildDays: 7
  judgeDays: 3
requirements:
  - Do the thing
---
Build it.
`;
}

function makeDeps(overrides: Partial<ImportDeps> = {}): ImportDeps {
  return {
    loadSpecFiles: vi.fn().mockResolvedValue([{ file: 'frontend.md', content: entry('a') }]),
    existingSlugs: vi.fn().mockResolvedValue(new Set<string>()),
    insertDrafts: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('importPools', () => {
  it('creates drafts for every valid entry across files', async () => {
    const deps = makeDeps({
      loadSpecFiles: vi.fn().mockResolvedValue([
        { file: 'frontend.md', content: entry('a') },
        { file: 'backend.md', content: entry('b', 'backend') },
      ]),
    });

    const report = await importPools(deps);

    expect(report).toEqual({ created: ['a', 'b'], skipped: [], errors: [] });
    expect(deps.insertDrafts).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ slug: 'a' }),
      expect.objectContaining({ slug: 'b' }),
    ]);
  });

  it('skips slugs that already exist in the database (idempotent re-import)', async () => {
    const deps = makeDeps({
      loadSpecFiles: vi
        .fn()
        .mockResolvedValue([{ file: 'frontend.md', content: entry('a') + '\n' + entry('fresh') }]),
      existingSlugs: vi.fn().mockResolvedValue(new Set(['a'])),
    });

    const report = await importPools(deps);

    expect(report.created).toEqual(['fresh']);
    expect(report.skipped).toEqual([{ slug: 'a', reason: 'already-exists' }]);
    expect(deps.insertDrafts).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ slug: 'fresh' }),
    ]);
  });

  it('reports malformed entries but still imports the valid ones', async () => {
    const deps = makeDeps({
      loadSpecFiles: vi.fn().mockResolvedValue([
        { file: 'frontend.md', content: entry('good') + '\nnot frontmatter' },
        { file: 'ml.md', content: 'prose only' },
      ]),
    });

    const report = await importPools(deps);

    expect(report.created).toEqual(['good']);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]!.file).toBe('ml.md');
  });

  it('rejects a slug duplicated across files (first occurrence wins)', async () => {
    const deps = makeDeps({
      loadSpecFiles: vi.fn().mockResolvedValue([
        { file: 'frontend.md', content: entry('a') },
        { file: 'backend.md', content: entry('a', 'backend') },
      ]),
    });

    const report = await importPools(deps);

    expect(report.created).toEqual(['a']);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ file: 'backend.md' });
    expect(report.errors[0]!.problems[0]).toContain('duplicate slug');
  });

  it('does not touch the database when nothing valid is left to insert', async () => {
    const deps = makeDeps({
      loadSpecFiles: vi.fn().mockResolvedValue([{ file: 'frontend.md', content: entry('a') }]),
      existingSlugs: vi.fn().mockResolvedValue(new Set(['a'])),
    });

    const report = await importPools(deps);

    expect(report.created).toEqual([]);
    expect(deps.insertDrafts).not.toHaveBeenCalled();
  });
});
