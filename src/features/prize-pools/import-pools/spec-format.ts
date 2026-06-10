import YAML from 'yaml';
import { isJobRole, JOB_ROLES, type JobRole } from '@/domain/identity';
import {
  DEFAULT_ENTRANT_CAP,
  isPoolDifficulty,
  MIN_ENTRANTS,
  POOL_DIFFICULTIES,
  type PoolDifficulty,
  type PoolWindows,
} from '@/domain/prize-pools';

/**
 * The manual pool-spec format (content/pools/*.md): one file per job role,
 * each entry a YAML frontmatter block followed by a markdown brief. Parsing
 * is pure (string in, data + errors out) so the whole format is testable
 * without touching the filesystem. Validation collects EVERY problem per
 * entry — same philosophy as the kernel's checkJoin: a spec author should
 * see the full repair list, not one error per round-trip.
 */

/** A validated spec entry, ready to become a `draft` pool row. */
export interface PoolSpecDraft {
  slug: string;
  title: string;
  role: JobRole;
  difficulty: PoolDifficulty;
  windows: PoolWindows;
  requirements: string[];
  entrantCap: number;
  brief: string;
}

export interface SpecError {
  file: string;
  /** "entry N" (1-based position in the file), plus the slug when it parsed. */
  entry: string;
  problems: string[];
}

export interface ParsedSpecFile {
  specs: PoolSpecDraft[];
  errors: SpecError[];
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KNOWN_KEYS = ['slug', 'title', 'role', 'difficulty', 'window', 'requirements', 'entrantCap'];
const WINDOW_KEYS = ['joinDays', 'buildDays', 'judgeDays'] as const;
const HOURS_PER_DAY = 24;

/** A `---` line on its own — both frontmatter fence and entry delimiter. */
const FENCE = /^---\s*$/;

interface RawEntry {
  index: number;
  yaml: string;
  body: string;
}

/**
 * Split a file into frontmatter/body pairs. The grammar is deliberately
 * line-based and strict: a `---` line always toggles structure, so briefs
 * must use `***` for horizontal rules (documented in content/pools/FORMAT.md).
 */
function splitEntries(file: string, content: string): { raw: RawEntry[]; errors: SpecError[] } {
  const lines = content.split(/\r?\n/);
  const raw: RawEntry[] = [];
  const errors: SpecError[] = [];

  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i++;

  if (i >= lines.length) {
    return { raw, errors: [{ file, entry: 'file', problems: ['no entries found'] }] };
  }
  if (!FENCE.test(lines[i]!)) {
    return {
      raw,
      errors: [
        { file, entry: 'file', problems: ['file must start with a YAML frontmatter block (---)'] },
      ],
    };
  }

  let index = 0;
  while (i < lines.length) {
    if (lines[i]!.trim() === '') {
      i++;
      continue;
    }
    // At a fence: consume frontmatter until the closing fence.
    index++;
    i++; // past the opening ---
    const yamlLines: string[] = [];
    while (i < lines.length && !FENCE.test(lines[i]!)) {
      yamlLines.push(lines[i]!);
      i++;
    }
    if (i >= lines.length) {
      errors.push({
        file,
        entry: `entry ${index}`,
        problems: ['unterminated frontmatter block (missing closing ---)'],
      });
      break;
    }
    i++; // past the closing ---
    const bodyLines: string[] = [];
    while (i < lines.length && !FENCE.test(lines[i]!)) {
      bodyLines.push(lines[i]!);
      i++;
    }
    raw.push({ index, yaml: yamlLines.join('\n'), body: bodyLines.join('\n') });
  }

  return { raw, errors };
}

function validateWindow(value: unknown, problems: string[]): PoolWindows | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`window must be a map with ${WINDOW_KEYS.join('/')}`);
    return null;
  }
  const record = value as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!WINDOW_KEYS.includes(key as (typeof WINDOW_KEYS)[number])) {
      problems.push(`unknown window field "${key}" — known fields: ${WINDOW_KEYS.join(', ')}`);
    }
  }

  const hours: number[] = [];
  for (const key of WINDOW_KEYS) {
    const days = record[key];
    if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) {
      problems.push(`window.${key} must be a positive number of days`);
      continue;
    }
    const h = Math.round(days * HOURS_PER_DAY);
    if (h < 1) {
      problems.push(`window.${key} is too short — it rounds to under one hour`);
      continue;
    }
    hours.push(h);
  }
  if (hours.length !== WINDOW_KEYS.length) return null;
  return { joinHours: hours[0]!, buildHours: hours[1]!, judgingHours: hours[2]! };
}

function validateEntry(
  file: string,
  entry: RawEntry,
  seenSlugs: Map<string, number>,
): { spec: PoolSpecDraft | null; error: SpecError | null } {
  const problems: string[] = [];

  let data: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = YAML.parse(entry.yaml);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      problems.push('frontmatter YAML must be a map of fields');
    } else {
      data = parsed as Record<string, unknown>;
    }
  } catch (e) {
    problems.push(`invalid YAML: ${e instanceof Error ? e.message : String(e)}`);
  }

  let slug: string | null = null;
  let spec: PoolSpecDraft | null = null;

  if (data) {
    for (const key of Object.keys(data)) {
      if (!KNOWN_KEYS.includes(key)) {
        problems.push(`unknown field "${key}" — known fields: ${KNOWN_KEYS.join(', ')}`);
      }
    }

    const rawSlug = data.slug;
    if (typeof rawSlug !== 'string' || !SLUG_PATTERN.test(rawSlug) || rawSlug.length > 64) {
      problems.push('slug must be kebab-case (lowercase letters/digits/hyphens, max 64 chars)');
    } else {
      slug = rawSlug;
      const firstSeen = seenSlugs.get(slug);
      if (firstSeen !== undefined) {
        problems.push(`duplicate slug "${slug}" — first defined in entry ${firstSeen}`);
      }
    }

    const title = data.title;
    if (typeof title !== 'string' || title.trim() === '' || title.length > 120) {
      problems.push('title must be a non-empty string (max 120 chars)');
    }

    const role = data.role;
    if (typeof role !== 'string' || !isJobRole(role)) {
      problems.push(`role must be one of: ${JOB_ROLES.map((r) => r.id).join(', ')}`);
    }

    const difficulty = data.difficulty;
    if (typeof difficulty !== 'string' || !isPoolDifficulty(difficulty)) {
      problems.push(`difficulty must be one of: ${POOL_DIFFICULTIES.map((d) => d.id).join(', ')}`);
    }

    const windows = validateWindow(data.window, problems);

    const requirements = data.requirements;
    const requirementsValid =
      Array.isArray(requirements) &&
      requirements.length > 0 &&
      requirements.every((r) => typeof r === 'string' && r.trim() !== '');
    if (!requirementsValid) {
      problems.push('requirements must be a non-empty list of non-empty strings');
    }

    let entrantCap = DEFAULT_ENTRANT_CAP;
    if (data.entrantCap !== undefined) {
      if (!Number.isInteger(data.entrantCap) || (data.entrantCap as number) < MIN_ENTRANTS) {
        problems.push(`entrantCap must be an integer ≥ ${MIN_ENTRANTS} (the kernel minimum)`);
      } else {
        entrantCap = data.entrantCap as number;
      }
    }

    const brief = entry.body.trim();
    if (brief === '') {
      problems.push('brief (the markdown body after the frontmatter) must not be empty');
    }

    if (problems.length === 0) {
      spec = {
        slug: slug!,
        title: (title as string).trim(),
        role: role as JobRole,
        difficulty: difficulty as PoolDifficulty,
        windows: windows!,
        requirements: (requirements as string[]).map((r) => r.trim()),
        entrantCap,
        brief,
      };
    }
  }

  if (slug !== null && !seenSlugs.has(slug)) seenSlugs.set(slug, entry.index);

  if (problems.length > 0) {
    const label = slug ? `entry ${entry.index} (${slug})` : `entry ${entry.index}`;
    return { spec: null, error: { file, entry: label, problems } };
  }
  return { spec, error: null };
}

export function parsePoolSpecFile(file: string, content: string): ParsedSpecFile {
  const { raw, errors } = splitEntries(file, content);
  const specs: PoolSpecDraft[] = [];
  const seenSlugs = new Map<string, number>();

  for (const entry of raw) {
    const { spec, error } = validateEntry(file, entry, seenSlugs);
    if (spec) specs.push(spec);
    if (error) errors.push(error);
  }

  return { specs, errors };
}
