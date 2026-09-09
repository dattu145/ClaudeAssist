/**
 * Single choke point for "what time is it" (UTC ISO-8601), so domain code
 * never calls `new Date().toISOString()` ad hoc — keeps timestamp
 * generation consistent and, if ever needed, mockable from one place.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
