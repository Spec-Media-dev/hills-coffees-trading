import { z } from "zod";

/** Feature 003 T009 — a TOTP code is always exactly 6 digits. Used for both enrollment confirmation and challenge verification. */
export const MfaCodeInput = z.object({
  factorId: z.string({ error: "Missing factor id." }).min(1),
  code: z
    .string({ error: "Enter the 6-digit code." })
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
});
export type MfaCodeInput = z.infer<typeof MfaCodeInput>;
