import type { Metadata } from "next";

import { SignInForm } from "@/components/account/sign-in-form";
import { Bilingual } from "@/components/locale/bilingual";
import { copy } from "@/lib/public/copy";

/**
 * Sign-in page (Feature 003 T005). Server Component; the only client island is `SignInForm`.
 * `robots: { index: false, follow: false }` is set on the enclosing `(auth)/layout.tsx` already,
 * so this file adds only the page's own title.
 */
export const metadata: Metadata = {
  title: copy.auth.signIn.metaTitle,
};

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 text-center">
        <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
          <Bilingual pick={(c) => c.auth.signIn.eyebrow} />
        </span>
        <h1 className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
          <Bilingual pick={(c) => c.auth.signIn.title} />
        </h1>
        <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
          <Bilingual pick={(c) => c.auth.signIn.lead} />
        </p>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <SignInForm />
      </div>
    </div>
  );
}
