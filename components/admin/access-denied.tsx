import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminStateCard } from "@/components/admin/state-card";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { ROLE_FUNCTION_ATTESTS, type AdminRoleFunction } from "@/lib/admin/areas";
import type { AdminDenial } from "@/lib/admin/guards";

/**
 * Feature 010 T002/T004 — the ONE place a console layout/page turns an `AdminDenial` into a
 * response, so every route group refuses in the same, truthful way:
 *
 * - `anonymous`   → the dedicated operator sign-in (`/admin/sign-in/`), never the member page
 *                    (same target the root layout and `src/proxy.ts` already use).
 * - `mfa-step-up` → `/mfa/` (same session-assurance gate as the root layout).
 * - `no-operational-role` → the existing "Operations access required" state (Feature 001's copy).
 * - `forbidden`   → "Not permitted for your role", naming the specific role the area requires —
 *                    the operator IS staff, just not for this area (least privilege, FR-002).
 *
 * `redirect()` throws, so the two redirect branches never return. Server Component.
 */
export function AdminAccessDenied({
  denial,
  requiredFunction,
}: {
  denial: AdminDenial;
  /** The approved function the refused area declares — rendered as its attested role label. */
  requiredFunction?: AdminRoleFunction;
}): ReactNode {
  if (denial === "anonymous") redirect("/admin/sign-in/");
  if (denial === "mfa-step-up") redirect("/mfa/");

  if (denial === "no-operational-role") {
    return (
      <AdminStateCard
        kind="no-operational-role"
        icon="shield"
        title={<AppBilingual pick={(c) => c.noOperationalRole.title} />}
        description={<AppBilingual pick={(c) => c.noOperationalRole.description} />}
      />
    );
  }

  const requiredRole = requiredFunction ? ROLE_FUNCTION_ATTESTS[requiredFunction] : null;

  return (
    <AdminStateCard
      kind="forbidden"
      icon="shield"
      title={<AppBilingual pick={(c) => c.admin.states.forbidden.title} />}
      description={<AppBilingual pick={(c) => c.admin.states.forbidden.description} />}
    >
      {requiredRole ? (
        <p className="text-[length:var(--text-small)] font-medium text-foreground">
          <AppBilingual pick={(c) => c.admin.states.forbidden.requiredRole.replace("{role}", c.admin.roles[requiredRole])} />
        </p>
      ) : null}
      <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin" />}>
        <AppBilingual pick={(c) => c.admin.states.backToOverview} />
      </Button>
    </AdminStateCard>
  );
}
