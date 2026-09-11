import { z } from "zod";

/**
 * Feature 003 T010a — Sign-Up. Password confirmation only; no personal/company/KYB fields — those
 * belong to onboarding (T011), reached only after a verified session exists. Same minimum length as
 * `lib/validation/reset-password.ts`'s new-password schema (this repo's one password-strength
 * baseline — Supabase Auth itself enforces whatever stricter policy the project is configured with,
 * which this schema does not attempt to duplicate or second-guess).
 */
/**
 * `fullName` (RUN A UX refinement) identifies the PERSON creating the account, not the organization
 * — `lib/validation/membership-application.ts`'s `legalName`/`displayName` are the company's own
 * identity, captured later in onboarding. Persisted via `supabase.auth.signUp`'s own `options.data`
 * (Supabase's approved user-metadata mechanism — the same one `scripts/seed-test-fixtures.ts` already
 * uses), never via a new table write: `public.profiles` has no approved INSERT path for an ordinary
 * user's own row (no trigger creates it, and RLS grants no member INSERT/UPDATE — only the existing
 * `update_my_profile()` UPDATE-only RPC, which cannot create a row that does not yet exist). See
 * `src/app/(auth)/sign-up/actions.ts`'s doc comment for the full reasoning.
 */
export const SignUpInput = z
  .object({
    fullName: z
      .string({ error: "Enter your full name." })
      .trim()
      .min(1, "Enter your full name.")
      .max(120, "Keep this under 120 characters."),
    email: z.string({ error: "Enter your email address." }).trim().min(1).max(254).email("Enter a valid email address."),
    password: z.string({ error: "Enter a password." }).min(8, "Use at least 8 characters."),
    confirmPassword: z.string({ error: "Confirm your password." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Those passwords don't match.",
    path: ["confirmPassword"],
  });
export type SignUpInput = z.infer<typeof SignUpInput>;

/**
 * The single generic response for every Sign-Up outcome that must not disclose account existence —
 * mirrors `SIGN_IN_GENERIC_ERROR` (`lib/validation/sign-in.ts`) and the reset-password acknowledgement
 * pattern (`lib/validation/reset-password.ts`'s companion action). Supabase's own `signUp` behavior
 * already varies by provider configuration (email confirmations required or not, an existing
 * confirmed account vs. a brand-new one), so the application adds nothing on top that could leak
 * that distinction back to the caller.
 */
export const SIGN_UP_GENERIC_ACKNOWLEDGEMENT =
  "Check your email to confirm your account and continue." as const;
