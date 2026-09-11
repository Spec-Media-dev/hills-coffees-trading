import type { Metadata } from "next";
import Link from "next/link";

import { SignUpForm } from "@/components/account/sign-up-form";
import { Bilingual } from "@/components/locale/bilingual";
import { copy } from "@/lib/public/copy";

/**
 * Sign-up page (Feature 003 T010a). Server Component; the only client island is `SignUpForm`.
 * `robots: { index: false, follow: false }` is set on the enclosing `(auth)/layout.tsx` already.
 */
export const metadata: Metadata = {
  title: copy.auth.signUp.metaTitle,
};

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 text-center">
        <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
          <Bilingual pick={(c) => c.auth.signUp.eyebrow} />
        </span>
        <h1 className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
          <Bilingual pick={(c) => c.auth.signUp.title} />
        </h1>
        <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
          <Bilingual pick={(c) => c.auth.signUp.lead} />
        </p>
        <p className="hc-meta text-muted-foreground/80">
          <Bilingual pick={(c) => c.auth.signUp.afterSignUpNote} />
        </p>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <SignUpForm />
      </div>

      <p className="text-center text-[length:var(--text-small)] text-muted-foreground">
        <Bilingual pick={(c) => c.auth.signUp.haveAccount} />{" "}
        <Link
          href="/sign-in/"
          className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Bilingual pick={(c) => c.auth.signIn.title} />
        </Link>
      </p>
    </div>
  );
}
