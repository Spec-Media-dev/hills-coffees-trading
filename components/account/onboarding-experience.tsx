import { AppBilingual } from "@/components/locale/app-bilingual";
import { MembershipApplicationForm } from "@/components/account/membership-application-form";
import { OnboardingProgress } from "@/components/account/onboarding-progress";

/**
 * The real "no organization yet" onboarding experience (Feature 003 T012) — rendered INLINE by
 * `src/app/dashboard/layout.tsx` for a verified, unattached user, the same way that layout already
 * renders `OrganizationSelector` inline rather than as a separate route. Server Component; the only
 * client island is `MembershipApplicationForm`.
 */
export function OnboardingExperience() {
  return (
    // A plain `<div>`: rendered only inline in `dashboard/layout.tsx`'s `organization === null`
    // branch, which already supplies the page's `<main>` landmark.
    <div className="hc-container flex min-h-[60vh] flex-1 items-center py-12">
      <div className="mx-auto grid w-full max-w-3xl gap-8 sm:grid-cols-[14rem_1fr]">
        <OnboardingProgress currentStep="businessProfile" />
        <div className="rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="font-heading text-[length:var(--text-h3)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.onboarding.form.title} />
            </h1>
            <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
              <AppBilingual pick={(c) => c.onboarding.form.lead} />
            </p>
          </div>
          <MembershipApplicationForm />
        </div>
      </div>
    </div>
  );
}
