import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPairingCodeRecord, createPairingTokenRecord, hashToken } from "../../../domain/pairing/entity.js";
import { runMigrations } from "../../../db/migrate.js";
import { SqlitePairingRepository } from "./pairing-repository.js";

describe("SqlitePairingRepository", () => {
  let db: Database.Database;
  let repo: SqlitePairingRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    repo = new SqlitePairingRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("codes", () => {
    it("finds an active code by value", async () => {
      const record = createPairingCodeRecord("ABCD2345");
      await repo.createCode(record);

      expect(await repo.findActiveCodeByValue("ABCD2345")).toEqual(record);
      expect(await repo.findActiveCodeByValue("NOPE0000")).toBeNull();
    });

    it("does not find a consumed code", async () => {
      const record = createPairingCodeRecord("ABCD2345");
      await repo.createCode(record);
      await repo.consumeCode(record.id);

      expect(await repo.findActiveCodeByValue("ABCD2345")).toBeNull();
    });

    it("does not find an expired code", async () => {
      const record = { ...createPairingCodeRecord("ABCD2345"), expiresAt: "2020-01-01T00:00:00.000Z" };
      await repo.createCode(record);

      expect(await repo.findActiveCodeByValue("ABCD2345")).toBeNull();
    });

    it("invalidateAllCodes consumes every unconsumed code", async () => {
      const a = createPairingCodeRecord("AAAA2222");
      const b = createPairingCodeRecord("BBBB3333");
      await repo.createCode(a);
      await repo.createCode(b);

      await repo.invalidateAllCodes();

      expect(await repo.findActiveCodeByValue("AAAA2222")).toBeNull();
      expect(await repo.findActiveCodeByValue("BBBB3333")).toBeNull();
    });
  });

  describe("tokens", () => {
    it("stores tokens hashed, never in plaintext", async () => {
      const rawToken = "super-secret-raw-token";
      const record = createPairingTokenRecord(hashToken(rawToken), 3600);
      await repo.createToken(record);

      const row = db.prepare("SELECT * FROM pairing_tokens").get() as { token_hash: string };
      expect(row.token_hash).not.toBe(rawToken);
      expect(row.token_hash).toBe(hashToken(rawToken));
    });

    it("finds an active token by hash", async () => {
      const record = createPairingTokenRecord("somehash", 3600);
      await repo.createToken(record);

      expect(await repo.findActiveTokenByHash("somehash")).toEqual(record);
    });

    it("does not find a revoked token", async () => {
      const record = createPairingTokenRecord("somehash", 3600);
      await repo.createToken(record);
      await repo.revokeToken(record.id);

      expect(await repo.findActiveTokenByHash("somehash")).toBeNull();
    });

    it("does not find an expired token", async () => {
      const record = { ...createPairingTokenRecord("somehash", 3600), expiresAt: "2020-01-01T00:00:00.000Z" };
      await repo.createToken(record);

      expect(await repo.findActiveTokenByHash("somehash")).toBeNull();
    });

    it("touchTokenLastUsed updates lastUsedAt", async () => {
      const record = createPairingTokenRecord("somehash", 3600);
      await repo.createToken(record);

      await repo.touchTokenLastUsed(record.id);

      const found = await repo.findActiveTokenByHash("somehash");
      expect(found?.lastUsedAt).not.toBeNull();
    });
  });
});
