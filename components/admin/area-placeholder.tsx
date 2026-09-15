import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { getAdminArea, type AdminAreaKey } from "@/lib/admin/areas";
import { checkAreaAccess } from "@/lib/admin/guards";

/**
 * Feature 010 RUN A — the honest destination for a declared console area whose workflow a LATER
 * phase owns (`availability: "planned"`) or that a recorded dependency blocks (`"blocked"`).
 *
 * It is a real, guarded route — never a fake working screen: the area's OWN role function is
 * re-verified here (`checkAreaAccess`), independently of the route-group layout above it, because
 * Next.js renders segments in parallel and no page may rely on an ancestor having refused. What
 * renders is a plain statement of which phase/dependency the area waits on, with no controls, no
 * sample rows and no KPI. When the owning phase lands, its real `page.tsx` replaces the caller of
 * this component.
 */
export async function AdminAreaPlaceholder({ areaKey }: { areaKey: AdminAreaKey }) {
  const area = getAdminArea(areaKey);
  const access = await checkAreaAccess(areaKey);
  if (!access.ok || !area) {
    return <AdminAccessDenied denial={access.ok ? "forbidden" : access.denial} requiredFunction={area?.roleFunction} />;
  }

  const phaseLabel = String(area.phase);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.areas[area.key]} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.groups[area.group]} /> },
          { label: <AppBilingual pick={(c) => c.admin.areas[area.key]} /> },
        ]}
      />
      {area.availability === "blocked" && area.blocker ? (
        <AdminStateCard
          kind="blocked"
          icon="clock"
          title={<AppBilingual pick={(c) => c.admin.states.blocked.title} />}
          description={<AppBilingual pick={(c) => c.admin.states.blocked.description} />}
        >
          <p className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-start text-[length:var(--text-small)] leading-[var(--lh-body)] text-foreground">
            <AppBilingual pick={(c) => c.admin.states.blockers[area.blocker!]} />
          </p>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin" />}>
            <AppBilingual pick={(c) => c.admin.states.backToOverview} />
          </Button>
        </AdminStateCard>
      ) : (
        <AdminStateCard
          kind="planned"
          icon="clock"
          title={<AppBilingual pick={(c) => c.admin.states.planned.title} />}
          description={<AppBilingual pick={(c) => c.admin.states.planned.description.replace("{phase}", phaseLabel)} />}
        >
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin" />}>
            <AppBilingual pick={(c) => c.admin.states.backToOverview} />
          </Button>
        </AdminStateCard>
      )}
    </div>
  );
}
