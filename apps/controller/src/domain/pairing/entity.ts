import { createHash, randomBytes, randomInt } from "node:crypto";
import { generateId, nowIso } from "@claudeops/shared";

/** No env var for this — unlike the token TTL, there's no reason a human
 * would want to configure how long they have to type a code they just saw
 * in the log. */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

// Excludes 0/O and 1/I — a pairing code is meant to be typed by a human.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;
const TOKEN_BYTES = 32;

export interface PairingCodeRecord {
  id: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface PairingTokenRecord {
  id: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export function generatePairingCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** The raw secret — returned to the caller exactly once (at exchange
 * time). Never persisted in this form; see hashToken. */
export function generatePairingToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256 of the raw token, used both for at-rest storage and for
 * lookup — a DB leak must not directly expose a usable secret. */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function createPairingCodeRecord(code: string): PairingCodeRecord {
  return {
    id: generateId("pairing_code"),
    code,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString(),
    consumedAt: null,
  };
}

export function createPairingTokenRecord(
  tokenHash: string,
  ttlSeconds: number
): PairingTokenRecord {
  return {
    id: generateId("pairing_token"),
    tokenHash,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    revokedAt: null,
    lastUsedAt: null,
  };
}
