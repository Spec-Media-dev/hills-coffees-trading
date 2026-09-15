import { AdminAccessDenied } from "@/components/admin/access-denied";
import { ADMIN_GROUP_ROLE_FUNCTIONS } from "@/lib/admin/areas";
import { checkGroupAccess } from "@/lib/admin/guards";

/**
 * Feature 010 T004 — the `(catalogue)` route group's OWN server-side guard. Every route under this
 * group is refused here, on every request, unless `is_platform_admin()` is true for the operator's own
 * session (`lib/admin/guards.ts`). This is independent of the root `/dashboard-admin` shell guard
 * (which only proves SOME operational role) and of navigation (which merely hides entries): a
 * direct URL into this group with the wrong role renders the forbidden state, never the page.
 * Pages beneath additionally re-verify their own area's function (segments render in parallel).
 */
export default async function CatalogueAreaLayout({ children }: { children: React.ReactNode }) {
  const access = await checkGroupAccess("catalogue");
  if (!access.ok) {
    return <AdminAccessDenied denial={access.denial} requiredFunction={ADMIN_GROUP_ROLE_FUNCTIONS.catalogue} />;
  }
  return children;
}
