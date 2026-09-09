import type { Logger } from "@claudeops/logging";
import { PairingCodeInvalidError } from "../errors.js";
import {
  createPairingCodeRecord,
  createPairingTokenRecord,
  generatePairingCode,
  generatePairingToken,
  hashToken,
} from "./entity.js";
import type { PairingRepository } from "./repository.js";

export interface IssuedToken {
  token: string;
  expiresAt: string;
}

/**
 * Wraps PairingRepository — pairing code issuance/exchange and token
 * verification/revocation. Never exposes a raw token or code after the
 * moment it's generated; every persisted form is hashed (tokens) or
 * single-use (codes).
 */
export class PairingRegistry {
  constructor(
    private readonly repository: PairingRepository,
    private readonly logger: Logger,
    private readonly tokenTtlSeconds: number
  ) {}

  /** Called once at controller startup. Invalidates any code left over
   * from a previous run before issuing a fresh one. */
  async issueStartupCode(): Promise<string> {
    await this.repository.invalidateAllCodes();
    const code = generatePairingCode();
    await this.repository.createCode(createPairingCodeRecord(code));
    this.logger.info("pairing code ready", { code, ttlMinutes: 10 });
    return code;
  }

  async exchangeCode(code: string): Promise<IssuedToken> {
    const record = await this.repository.findActiveCodeByValue(code);
    if (!record) {
      throw new PairingCodeInvalidError();
    }
    await this.repository.consumeCode(record.id);

    const rawToken = generatePairingToken();
    const tokenRecord = createPairingTokenRecord(hashToken(rawToken), this.tokenTtlSeconds);
    await this.repository.createToken(tokenRecord);

    return { token: rawToken, expiresAt: tokenRecord.expiresAt };
  }

  async verifyToken(rawToken: string): Promise<boolean> {
    const record = await this.repository.findActiveTokenByHash(hashToken(rawToken));
    if (!record) {
      return false;
    }
    await this.repository.touchTokenLastUsed(record.id);
    return true;
  }

  async revokeToken(rawToken: string): Promise<void> {
    const record = await this.repository.findActiveTokenByHash(hashToken(rawToken));
    if (record) {
      await this.repository.revokeToken(record.id);
    }
  }
}
