import { z } from "zod";

/**
 * Shared sign-in schema (Feature 003 T005). One schema for the client form (UX only) and the
 * Server Action (the enforced gate). Deliberately minimal: format-only checks. The schema itself
 * MUST NEVER be the source of an "email doesn't exist"/"password wrong" distinction — that
 * decision is Supabase Auth's own generic `Invalid login credentials` response (spec FR-002,
 * SC-005), never something this schema or the action layers on top of it.
 */
export const SignInInput = z.object({
  email: z.string({ error: "Enter your email address." }).trim().min(1).max(254).email("Enter a valid email address."),
  password: z.string({ error: "Enter your password." }).min(1, "Enter your password."),
});

export type SignInInput = z.infer<typeof SignInInput>;

/**
 * The sentinel `signIn` returns for every authentication failure, regardless of cause (spec SC-005
 * — no distinct error per failure reason). The client resolves it to one fixed, localized message.
 */
export const SIGN_IN_GENERIC_ERROR = "generic" as const;
