/**
 * Join class names, dropping falsy entries — the standard pattern for
 * conditional Tailwind classes without pulling in a dependency.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
