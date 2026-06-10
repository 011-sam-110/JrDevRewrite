/**
 * Launch job roles (CLAUDE.md → "pool for their job role"). The chosen role
 * drives pool filtering from M5 on, and per-role results are captured from
 * day one — so the ids here are durable, persisted identifiers: never rename.
 */

export const JOB_ROLES = [
  { id: 'frontend', label: 'Front-end' },
  { id: 'backend', label: 'Backend' },
  { id: 'fullstack', label: 'Full-stack' },
  { id: 'ml', label: 'ML / AI' },
  { id: 'mobile', label: 'Mobile' },
] as const;

export type JobRole = (typeof JOB_ROLES)[number]['id'];

export function isJobRole(value: string): value is JobRole {
  return JOB_ROLES.some((r) => r.id === value);
}
