import type { Metadata } from "next";

import { ResetPasswordRequestForm } from "@/components/account/reset-password-request-form";
import { Bilingual } from "@/components/locale/bilingual";
import { copy } from "@/lib/public/copy";

export const metadata: Metadata = {
  title: copy.auth.resetPassword.metaTitle,
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 text-center">
        <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
          <Bilingual pick={(c) => c.auth.resetPassword.eyebrow} />
        </span>
        <h1 className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
          <Bilingual pick={(c) => c.auth.resetPassword.title} />
        </h1>
        <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
          <Bilingual pick={(c) => c.auth.resetPassword.lead} />
        </p>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <ResetPasswordRequestForm />
      </div>
    </div>
  );
}
