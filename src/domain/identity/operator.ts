/**
 * Operator gate — who may approve/reject pool drafts (and, from M12, battle
 * problems). v1 keeps the operator list in an env var (`OPERATOR_EMAILS`)
 * rather than a DB role: one campus, one or two operators, no admin UI to
 * build or secure yet. The *predicate* is pure so every operator-gated slice
 * shares one tested definition; only the env read lives at the edge.
 */

/** Parse the raw `OPERATOR_EMAILS` value (comma-separated) into a clean list. */
export function parseOperatorEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== '');
}

/** Deny by default: an empty list means nobody is an operator. */
export function isOperator(email: string, operators: readonly string[]): boolean {
  return operators.includes(email.trim().toLowerCase());
}
