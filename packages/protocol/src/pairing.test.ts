import { describe, expect, it } from "vitest";
import { ExchangePairingCodeRequestSchema, PairingTokenResponseSchema } from "./pairing.js";

describe("ExchangePairingCodeRequestSchema", () => {
  it("accepts a valid code", () => {
    expect(ExchangePairingCodeRequestSchema.safeParse({ code: "ABCD2345" }).success).toBe(true);
  });

  it("rejects an empty code", () => {
    expect(ExchangePairingCodeRequestSchema.safeParse({ code: "" }).success).toBe(false);
  });
});

describe("PairingTokenResponseSchema", () => {
  it("accepts a valid response", () => {
    expect(
      PairingTokenResponseSchema.safeParse({
        token: "abc123",
        expiresAt: new Date().toISOString(),
      }).success
    ).toBe(true);
  });

  it("rejects a missing expiresAt", () => {
    expect(PairingTokenResponseSchema.safeParse({ token: "abc123" }).success).toBe(false);
  });
});
