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
      <div className="mx-auto grid w-full max-w-4xl gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <OnboardingProgress currentStep="businessProfile" />
        <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card p-6 shadow-[var(--shadow-md)] sm:p-9">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-primary" />
          <div className="mb-7 flex flex-col gap-2 pt-1">
            <h1 className="font-heading text-[length:var(--text-h3)] font-semibold tracking-[-0.015em] text-foreground text-balance">
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
