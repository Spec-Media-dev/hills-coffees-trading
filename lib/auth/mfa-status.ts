import type { createClient } from "@/lib/supabase/server";

/**
 * Account two-factor status, read ONLY from Supabase Auth's own `mfa.listFactors()` for the caller's
 * own session — there is no parameter through which another user's factors could be listed, and no
 * TOTP secret is ever read, returned or stored here (Supabase never returns the secret after
 * enrollment; `listFactors` exposes only id / friendly name / status / timestamps).
 *
 * - `enabled`  — at least one VERIFIED TOTP factor (sign-in then requires the `aal2` challenge).
 * - `pending`  — only an UNVERIFIED factor exists (an enrollment was started and abandoned).
 * - `disabled` — no TOTP factor at all.
 * - `unknown`  — the Auth API could not be read; never guessed as enabled or disabled.
 */
export type MfaStatus = "enabled" | "pending" | "disabled" | "unknown";

export type MfaFactorSummary = {
  id: string;
  friendlyName: string | null;
  createdAt: string;
};

export type MfaAccountState = {
  status: MfaStatus;
  /** Verified TOTP factors only — the ones a user may manage/remove. */
  factors: MfaFactorSummary[];
};

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function readMfaAccountState(supabase: ServerClient): Promise<MfaAccountState> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return { status: "unknown", factors: [] };

  const totp = data.all.filter((factor) => factor.factor_type === "totp");
  const verified = totp.filter((factor) => factor.status === "verified");

  const status: MfaStatus = verified.length > 0 ? "enabled" : totp.length > 0 ? "pending" : "disabled";
  return {
    status,
    factors: verified.map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? null,
      createdAt: factor.created_at,
    })),
  };
}
