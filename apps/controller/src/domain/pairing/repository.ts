import type { PairingCodeRecord, PairingTokenRecord } from "./entity.js";

export interface PairingRepository {
  createCode(record: PairingCodeRecord): Promise<void>;
  /** Only a code that is neither expired nor already consumed. */
  findActiveCodeByValue(code: string): Promise<PairingCodeRecord | null>;
  consumeCode(id: string): Promise<void>;
  /** Called on controller startup — a code from a previous run must never
   * remain usable. */
  invalidateAllCodes(): Promise<void>;

  createToken(record: PairingTokenRecord): Promise<void>;
  /** Only a token that is neither expired nor revoked. */
  findActiveTokenByHash(tokenHash: string): Promise<PairingTokenRecord | null>;
  touchTokenLastUsed(id: string): Promise<void>;
  revokeToken(id: string): Promise<void>;
}
