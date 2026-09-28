import { AdminAccessDenied } from "@/components/admin/access-denied";
import { HighRiskNotice } from "@/components/admin/system/notices";
import { systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { getCommerceSettings } from "@/lib/admin/commerce-settings";

import { CommerceSettingsForm } from "./commerce-settings-form";

/**
 * Feature 013 T101 — the global bank-transfer commerce switch, proforma validity window and pilot
 * organizations. `is_platform_admin()`-only (READ policy `commerce_settings_staff_read` — see
 * `checkAreaAccess`), write requires MFA (re-checked live by `update_commerce_settings` itself, never
 * trusted from this page). Owner scope reduction, 2026-09-28: no proof-submission switch is shown —
 * it governs the now-cancelled M5a workflow.
 */
export default async function CommerceSettingsPage() {
  const access = await checkAreaAccess("commerceSettings");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;

  const settings = await getCommerceSettings();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.system.commerceSettings.title} />}
        description={<AppBilingual pick={(c) => c.admin.system.commerceSettings.description} />}
        trail={systemTrail((c) => c.admin.system.commerceSettings.breadcrumb)}
      />
      <HighRiskNotice />
      {settings === null ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/5 p-4 text-[length:var(--text-small)] text-destructive">
          <AppBilingual pick={(c) => c.admin.system.commerceSettings.loadError} />
        </p>
      ) : (
        <CommerceSettingsForm settings={settings} />
      )}
    </div>
  );
}
