import { AppBilingual } from "@/components/locale/app-bilingual";
import { OnboardingProgress } from "@/components/account/onboarding-progress";

/**
 * The truthful "business profile complete, KYB verification next" state (Feature 003 T012/T013
 * post-onboarding routing). Rendered inline by `src/app/dashboard/layout.tsx` for a signed-in member
 * whose organization exists but is not yet trading-authorized (`!identity.isAuthorizedMember` —
 * `PENDING_KYB`/`UNDER_REVIEW`/etc., resolved via `lib/auth/eligibility.ts`, never a raw status
 * string re-derived here).
 *
 * RUN A stops here deliberately: this is the smallest truthful transition state, not the real KYB
 * document form/upload experience (RUN B, T014+). No fake document fields, no fake upload control,
 * no invented completion metric, and no business/trading content of any kind.
 */
export function AwaitingKybState() {
  return (
    <main className="hc-container flex min-h-[60vh] flex-1 items-center py-12">
      <div className="mx-auto grid w-full max-w-3xl gap-8 sm:grid-cols-[14rem_1fr]">
        <OnboardingProgress currentStep="kyb" />
        <div className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
          <h1 className="font-heading text-[length:var(--text-h3)] font-semibold text-foreground">
            <AppBilingual pick={(c) => c.onboarding.awaitingKyb.title} />
          </h1>
          <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
            <AppBilingual pick={(c) => c.onboarding.awaitingKyb.description} />
          </p>
        </div>
      </div>
    </main>
  );
}
