import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Card, CardContent } from "@/components/ui/card";

type SettingsFoundationShellProps = {
  children: ReactNode;
  description: ReactNode;
  dir?: "ltr" | "rtl";
  title: ReactNode;
};

/**
 * Synchronous presentation shell for the Foundation settings proof. Keeping authorization and
 * data loading in page.tsx lets the same rendered surface be exercised by Vitest without mocking
 * an async Server Component.
 *
 * ── CONVERGED ONTO THE APPLICATION SHELL AND GLOBAL TYPE TOKENS (Phase 5.5, UIF-036) ────────────
 *
 * The header is now `PageHeader` (`components/app/page-header.tsx`) — the same breadcrumb + `h1` +
 * description primitive every other Member/Admin page uses — rather than a bespoke `CardTitle`
 * wrapping a redundant nested `<h1>`. `Card` (UIF-009) still wraps the form region itself, unchanged
 * in kind, just no longer duplicating the page's own heading inside it. `data-testid`s are
 * preserved exactly, so nothing that inspects this surface's markup needs to change.
 */
export function SettingsFoundationShell({
  children,
  description,
  dir,
  title,
}: SettingsFoundationShellProps) {
  return (
    <section data-testid="hills-settings-proof" dir={dir} className="flex w-full max-w-2xl min-w-0 flex-col gap-6 text-start">
      <PageHeader
        title={title}
        description={description}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.settings} /> },
        ]}
      />
      <Card data-testid="hills-settings-card" className="min-w-0 border-border bg-card text-card-foreground shadow-sm">
        <CardContent className="min-w-0 pt-6">{children}</CardContent>
      </Card>
    </section>
  );
}
