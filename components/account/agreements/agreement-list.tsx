"use client";

import { AgreementRow } from "@/components/account/agreements/agreement-row";
import { useLocale } from "@/components/locale/locale-provider";
import { CURRENT_AGREEMENTS } from "@/lib/auth/agreements";
import type { AgreementAcceptanceRow } from "@/lib/agreements/acceptance-records";
import { latestAcceptanceForType } from "@/lib/agreements/acceptance-records";

/**
 * Feature 003 T023/T025 — the full agreement acceptance gate UI. Rendered by `/dashboard/page.tsx`
 * in place of the ordinary member overview whenever `eligibility.nextAction === "accept-agreements"`
 * — i.e. only for an organization that has ALREADY cleared KYB/authorization (`canReachTrading`
 * true); a PENDING_KYB/SUBMITTED/etc. organization never reaches this component at all (that
 * remains gated by `identity.isAuthorizedMember` in `dashboard/layout.tsx`, unchanged), so this
 * screen never implies "accept this and you can trade" while KYB is still open (run directive
 * "UNAPPROVED USERS").
 *
 * Client Component only because `useLocale()`/`AgreementRow`'s toast wiring needs it — the actual
 * acceptance HISTORY (`acceptances`) is resolved server-side by the caller and passed in as a prop,
 * never fetched here.
 */
export function AgreementList({ acceptances }: { acceptances: AgreementAcceptanceRow[] }) {
  const { tApp } = useLocale();
  const copy = tApp.agreements;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
      <div className="flex flex-col gap-2">
        <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">{copy.eyebrow}</span>
        <h1 className="font-heading text-[length:var(--text-h3)] font-semibold text-foreground">{copy.title}</h1>
        <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">{copy.lead}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {CURRENT_AGREEMENTS.map((agreement) => (
          <AgreementRow key={agreement.type} agreement={agreement} latestAcceptance={latestAcceptanceForType(acceptances, agreement.type)} />
        ))}
      </ul>
    </div>
  );
}
