import type { Metadata } from "next";

import { ResendVerificationButton } from "@/components/account/resend-verification-button";
import { Bilingual } from "@/components/locale/bilingual";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";

/**
 * Email verification page (Feature 003 T007 — spec FR-001, PS7). Server Component; the only
 * client island is `ResendVerificationButton`. Reached either directly after sign-in (when
 * `identity.isEmailVerified` is false — see `(auth)/sign-in/actions.ts`) or from the gated-action
 * prompt on a protected surface (`src/app/dashboard/layout.tsx`).
 */
export const metadata: Metadata = {
  title: copy.auth.verifyEmail.metaTitle,
};

export default function VerifyEmailPage() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-[var(--surface-subtle)] text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
        <Icon name="mail" className="size-6" />
      </span>
      <div className="flex flex-col gap-3">
        <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
          <Bilingual pick={(c) => c.auth.verifyEmail.eyebrow} />
        </span>
        <h1 className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
          <Bilingual pick={(c) => c.auth.verifyEmail.title} />
        </h1>
        <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
          <Bilingual pick={(c) => c.auth.verifyEmail.lead} />
        </p>
      </div>
      <ResendVerificationButton />
    </div>
  );
}
