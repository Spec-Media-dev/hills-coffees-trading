import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MfaChallengeForm } from "@/components/account/mfa-challenge-form";
import { MfaEnrollForm } from "@/components/account/mfa-enroll-form";
import { Bilingual } from "@/components/locale/bilingual";
import { copy } from "@/lib/public/copy";
import { createClient } from "@/lib/supabase/server";

/**
 * MFA page (Feature 003 T009 — spec FR-001, SEC-005). Server Component resolving which of three
 * honest states applies, using Supabase Auth's own factor/AAL APIs — never a client-side gate:
 *
 * 1. A session that must step up (`currentLevel !== nextLevel === "aal2"`) → CHALLENGE. Reached
 *    from `(auth)/sign-in/actions.ts` after a correct password when a verified factor exists.
 * 2. No step-up pending, but a verified factor already exists → the honest "already enrolled" state.
 * 3. Otherwise → ENROLLMENT. `mfa.enroll()` is called exactly once, here, per page render — the
 *    resulting QR/secret and factor id are handed to the one client form that verifies them, so a
 *    page refresh never silently produces a second unverified factor mid-flow without the user
 *    noticing (they'd simply see a fresh QR code, which is the correct, honest behaviour).
 *
 * No session is required to have already reached `aal2` to VIEW this page — a user with no
 * protected-data access yet is exactly who needs to reach it — but every protected read/RPC beyond
 * this page still enforces its own `aal2` requirement at the database/RLS level where current
 * policy requires it (spec T009 Verify: the challenge gates data, not merely this screen).
 */
export const metadata: Metadata = {
  title: copy.auth.mfa.metaTitleChallenge,
};

export default async function MfaPage() {
  const supabase = await createClient();

  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) redirect("/sign-in/");

  if (aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel && aal.currentAuthenticationMethods.length > 0) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factorId = factors?.totp[0]?.id;
    if (!factorId) redirect("/sign-in/");

    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3 text-center">
          <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.auth.mfa.challengeEyebrow} />
          </span>
          <h1 className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
            <Bilingual pick={(c) => c.auth.mfa.challengeTitle} />
          </h1>
          <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
            <Bilingual pick={(c) => c.auth.mfa.challengeLead} />
          </p>
        </div>
        <div className="rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
          <MfaChallengeForm factorId={factorId} />
        </div>
      </div>
    );
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors && factors.totp.length > 0) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
          <Bilingual pick={(c) => c.auth.mfa.enrollTitle} />
        </h1>
        <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
          <Bilingual pick={(c) => c.auth.mfa.alreadyEnrolled} />
        </p>
      </div>
    );
  }

  const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (enrollError || !enrollment) redirect("/dashboard/");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 text-center">
        <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
          <Bilingual pick={(c) => c.auth.mfa.enrollEyebrow} />
        </span>
        <h1 className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
          <Bilingual pick={(c) => c.auth.mfa.enrollTitle} />
        </h1>
        <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
          <Bilingual pick={(c) => c.auth.mfa.enrollLead} />
        </p>
      </div>
      <div className="rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <MfaEnrollForm
          factorId={enrollment.id}
          qrCodeSvgDataUri={`data:image/svg+xml;utf-8,${enrollment.totp.qr_code}`}
          secret={enrollment.totp.secret}
        />
      </div>
    </div>
  );
}
