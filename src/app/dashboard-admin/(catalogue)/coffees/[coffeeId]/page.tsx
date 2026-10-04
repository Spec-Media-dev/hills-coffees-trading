import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { CoffeePublicationPanel } from "@/components/admin/catalogue/coffee-publication-panel";
import { CoffeeStepper } from "@/components/admin/catalogue/coffee-stepper";
import { CoffeeStatusBadge } from "@/components/admin/catalogue/status-badges";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { readCoffeeWorkflow } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";

/**
 * Feature 010 RUN E (T021/T023/T024) — one coffee: editable content fields (status excluded), the
 * publication panel (named, confirmed, compare-and-set operations that revalidate Feature 002's
 * tags) and the catalogue image manager (upload / primary / order / replace / remove — hardening run).
 * The page re-verifies
 * `is_platform_admin()` itself.
 */
export default async function CoffeeDetailPage({ params, searchParams }: { params: Promise<{ coffeeId: string }>; searchParams?: Promise<{ step?: string }> }) {
  const access = await checkAreaAccess("coffees");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;

  const { coffeeId } = await params;
  const { step } = (await searchParams) ?? {};
  const workflow = /^[0-9a-f-]{36}$/i.test(coffeeId) ? await readCoffeeWorkflow(coffeeId) : null;
  const coffee = workflow?.coffee ?? null;
  const trail = [
    { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
    { label: <AppBilingual pick={(c) => c.admin.catalogue.coffees.breadcrumb} />, href: "/dashboard-admin/coffees" },
    { label: <AppBilingual pick={(c) => c.admin.catalogue.coffees.form.editTitle} /> },
  ];
  if (!workflow || !coffee) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.coffees.form.editTitle} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.description} />}>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin/coffees" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.common.back} />
          </Button>
        </AdminStateCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={coffee.name}
        description={
          <span className="flex flex-wrap items-center gap-3 text-[length:var(--text-micro)]">
            <span className="font-mono" dir="ltr">
              {coffee.id}
            </span>
            <span>
              <AppBilingual pick={(c) => c.admin.catalogue.coffees.form.publicUrl} />:{" "}
              <span className="font-mono" dir="ltr" data-public-path>
                /coffee/{coffee.slug}/
              </span>{" "}
              (<AppBilingual pick={(c) => c.admin.catalogue.coffees.form.publicUrlHint} />)
            </span>
          </span>
        }
        trail={trail}
        actions={<CoffeeStatusBadge status={coffee.status} />}
      />

      <CoffeeStepper workflow={workflow} initialStep={step} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Publish is owned by the stepper (readiness-gated, revisioned). Unpublish/archive/restore stay available for live or archived Coffees. */}
          {coffee.status !== "DRAFT" ? <CoffeePublicationPanel coffeeId={coffee.id} status={coffee.status} /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 text-[length:var(--text-small)]" data-coffee-meta>
            <dl className="divide-y divide-border">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.admin.catalogue.common.created} />
                </dt>
                <dd>
                  <AdminDateTime value={coffee.createdAt} fallback="—" />
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.admin.catalogue.common.updated} />
                </dt>
                <dd>
                  <AdminDateTime value={coffee.updatedAt} fallback="—" />
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[length:var(--text-micro)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.catalogue.common.noDeleteNote} />
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
