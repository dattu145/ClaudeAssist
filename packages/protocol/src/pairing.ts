import { z } from "zod";

export const ExchangePairingCodeRequestSchema = z.object({
  code: z.string().min(1),
});
export type ExchangePairingCodeRequest = z.infer<typeof ExchangePairingCodeRequestSchema>;

export const PairingTokenResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
});
export type PairingTokenResponse = z.infer<typeof PairingTokenResponseSchema>;
