import Database from "better-sqlite3";
import { createLogger } from "@claudeops/logging";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../db/migrate.js";
import { SqlitePairingRepository } from "../../adapters/persistence/sqlite/pairing-repository.js";
import { PairingCodeInvalidError } from "../errors.js";
import { PairingRegistry } from "./registry.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

describe("PairingRegistry", () => {
  let db: Database.Database;
  let registry: PairingRegistry;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    registry = new PairingRegistry(new SqlitePairingRepository(db), silentLogger(), 3600);
  });

  afterEach(() => {
    db.close();
  });

  it("issueStartupCode returns a code that can be exchanged", async () => {
    const code = await registry.issueStartupCode();

    const issued = await registry.exchangeCode(code);
    expect(issued.token).toBeTruthy();
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("issueStartupCode invalidates a code from a previous run", async () => {
    const staleCode = await registry.issueStartupCode();
    await registry.issueStartupCode(); // simulates a restart

    await expect(registry.exchangeCode(staleCode)).rejects.toBeInstanceOf(PairingCodeInvalidError);
  });

  it("exchangeCode throws for an unknown code", async () => {
    await expect(registry.exchangeCode("NOSUCHCODE")).rejects.toBeInstanceOf(
      PairingCodeInvalidError
    );
  });

  it("exchangeCode is single-use", async () => {
    const code = await registry.issueStartupCode();
    await registry.exchangeCode(code);

    await expect(registry.exchangeCode(code)).rejects.toBeInstanceOf(PairingCodeInvalidError);
  });

  it("verifyToken returns true for a freshly issued token", async () => {
    const code = await registry.issueStartupCode();
    const { token } = await registry.exchangeCode(code);

    expect(await registry.verifyToken(token)).toBe(true);
  });

  it("verifyToken returns false for an unknown token", async () => {
    expect(await registry.verifyToken("not-a-real-token")).toBe(false);
  });

  it("verifyToken returns false after revocation", async () => {
    const code = await registry.issueStartupCode();
    const { token } = await registry.exchangeCode(code);

    await registry.revokeToken(token);

    expect(await registry.verifyToken(token)).toBe(false);
  });

  it("revokeToken on an unknown token is a safe no-op", async () => {
    await expect(registry.revokeToken("not-a-real-token")).resolves.toBeUndefined();
  });
});
