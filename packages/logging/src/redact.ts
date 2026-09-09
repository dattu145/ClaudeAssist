const SENSITIVE_KEY_PATTERN = /token|secret|key|password|credential/i;
const REDACTED = "[REDACTED]";

/**
 * Denylist-based redaction applied unconditionally by the logger so a
 * forgetful call site can't leak a secret. Imperfect by construction — a
 * secret in an unexpectedly-named field can still slip through; see
 * .claude/SECURITY.md.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(val);
    }
    return out;
  }
  return value;
}
