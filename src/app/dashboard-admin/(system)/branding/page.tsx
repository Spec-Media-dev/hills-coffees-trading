import { AdminAccessDenied } from "@/components/admin/access-denied";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { getPlatformLogoPath } from "@/lib/admin/branding";

import { LogoUploadField } from "./logo-upload-field";

/**
 * Feature 010 T047 (RUN F010-ACCOUNT-MEDIA, 2026-09-22) — platform-ADMIN-controlled site logo.
 * Reuses `getPlatformLogoPath()` (the SAME read the public site header uses) so the admin preview and
 * the real public rendering can never drift. `is_platform_admin()`-only, live-reverified via
 * `checkAreaAccess("branding")`. Deliberately limited to the one logo value — no general CMS.
 */
export default async function BrandingPage() {
  const access = await checkAreaAccess("branding");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;

  const logoPath = await getPlatformLogoPath();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.branding.title} />}
        description={<AppBilingual pick={(c) => c.admin.branding.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.groups.system} /> }, { label: <AppBilingual pick={(c) => c.admin.areas.branding} /> }]}
      />

      <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5" data-branding-section="logo">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
            <AppBilingual pick={(c) => c.admin.branding.logo.title} />
          </h2>
          <p className="max-w-[62ch] text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.branding.logo.lead} />
          </p>
        </div>
        <LogoUploadField logoPath={logoPath} />
      </section>
    </div>
  );
}
