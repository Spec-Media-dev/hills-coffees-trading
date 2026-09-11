import type { Metadata } from "next";

import { AdminSignInForm } from "@/components/account/admin-sign-in-form";
import { Bilingual } from "@/components/locale/bilingual";
import { copy } from "@/lib/public/copy";

/**
 * Admin sign-in page (admin-auth correction pass). Server Component; the only client island is
 * `AdminSignInForm`. `robots: { index: false, follow: false }` comes from the enclosing
 * `admin/layout.tsx` already.
 *
 * Deliberately renders NO "Don't have an account? Create account" footer — unlike
 * `(auth)/sign-in/page.tsx`, which links to `/sign-up/`. There is no public admin registration
 * (run directive §1, §5); this file has no such link to omit-by-mistake because it was never
 * written in the first place.
 */
export const metadata: Metadata = {
  title: copy.auth.adminSignIn.metaTitle,
};

export default function AdminSignInPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 text-center">
        <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
          <Bilingual pick={(c) => c.auth.adminSignIn.eyebrow} />
        </span>
        <h1 className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
          <Bilingual pick={(c) => c.auth.adminSignIn.title} />
        </h1>
        <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
          <Bilingual pick={(c) => c.auth.adminSignIn.lead} />
        </p>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <AdminSignInForm />
      </div>
    </div>
  );
}
