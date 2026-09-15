import { AdminAccessDenied } from "@/components/admin/access-denied";
import { checkRoleFunctionAccess } from "@/lib/admin/guards";

/**
 * Feature 010 T004 — the SUPER_ADMIN-only slice of the System group. `(system)/layout.tsx` already
 * requires `is_platform_admin()` (the RLS truth for `payment_accounts`); platform admins,
 * commission, tax rules and shipping rules are stricter — `platform_admins_admin`,
 * `commission_admin`/`tiers_admin`, `tax_admin`, `shipping_admin` are all `is_super_admin()` — so
 * this nested layout calls `is_super_admin()` live and refuses a plain ADMIN by direct URL.
 */
export default async function SuperAdminAreaLayout({ children }: { children: React.ReactNode }) {
  const access = await checkRoleFunctionAccess("is_super_admin");
  if (!access.ok) {
    return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  }
  return children;
}
