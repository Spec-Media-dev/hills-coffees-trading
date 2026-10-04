import { AdminAccessDenied } from "@/components/admin/access-denied";
import { CreateCoffeeForm } from "@/components/admin/catalogue/coffee-content-steps";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";

/**
 * Feature 018 — create a Coffee. The first confirmed save creates ONE draft for this intent (a retry can never create a
 * second), then continues in the resumable stepper on the saved Coffee. Publication is a separate, readiness-gated step.
 */
export default async function NewCoffeePage() {
  const access = await checkAreaAccess("coffees");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.catalogue.workflow.newTitle} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.catalogue.coffees.breadcrumb} />, href: "/dashboard-admin/coffees" },
          { label: <AppBilingual pick={(c) => c.admin.catalogue.workflow.newTitle} /> },
        ]}
      />
      <CreateCoffeeForm />
    </div>
  );
}
