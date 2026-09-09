import { describe, expect, it } from "vitest";
import {
  createPairingCodeRecord,
  createPairingTokenRecord,
  generatePairingCode,
  generatePairingToken,
  hashToken,
} from "./entity.js";

describe("generatePairingCode", () => {
  it("generates an 8-char code excluding ambiguous characters", () => {
    const code = generatePairingCode();
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[01OI]/);
  });

  it("generates different codes across calls", () => {
    const a = generatePairingCode();
    const b = generatePairingCode();
    expect(a).not.toBe(b);
  });
});

describe("generatePairingToken / hashToken", () => {
  it("generates a long, unique raw token", () => {
    const a = generatePairingToken();
    const b = generatePairingToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it("hashes deterministically, never returning the raw value", () => {
    const token = generatePairingToken();
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(token);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/); // sha256 hex digest
  });
});

describe("createPairingCodeRecord", () => {
  it("creates a record with a future expiry and no consumedAt", () => {
    const record = createPairingCodeRecord("ABCD2345");
    expect(record.code).toBe("ABCD2345");
    expect(record.consumedAt).toBeNull();
    expect(new Date(record.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("createPairingTokenRecord", () => {
  it("creates a record whose expiry reflects the given TTL", () => {
    const record = createPairingTokenRecord("somehash", 60);
    const expiresInMs = new Date(record.expiresAt).getTime() - Date.now();
    expect(expiresInMs).toBeGreaterThan(50_000);
    expect(expiresInMs).toBeLessThan(70_000);
    expect(record.revokedAt).toBeNull();
    expect(record.lastUsedAt).toBeNull();
  });
});
