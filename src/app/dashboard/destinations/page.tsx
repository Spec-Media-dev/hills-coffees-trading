import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { DestinationActions } from "@/components/commerce/destination-actions";
import { DestinationForm } from "@/components/commerce/destination-form";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";
import { readDestinations } from "@/lib/commerce/destinations";

export const metadata: Metadata = { title: "Delivery destinations" };

export default async function DestinationsPage() {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.organization) return <StateScreen kind="unauthorized" />;
  if (!identity.isAuthorizedMember || !identity.organization.canBuy || identity.requiresMfaStepUp) return <StateScreen kind="forbidden" />;
  const destinations = await readDestinations(identity.organization.organizationId);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.commerce.destinationsUi.title} />} description={<AppBilingual pick={(c) => c.commerce.destinationsUi.description} />} />
      <details className="rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6">
        <summary className="min-h-11 cursor-pointer font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"><AppBilingual pick={(c) => c.commerce.destinationsUi.add} /></summary>
        <div className="pt-4"><DestinationForm /></div>
      </details>
      {destinations.length === 0 ? <p className="rounded-[var(--radius-md)] border border-dashed border-border p-5 text-muted-foreground"><AppBilingual pick={(c) => c.commerce.destinationsUi.empty} /></p> : null}
      <ul className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {destinations.map((destination) => (
          <li key={destination.id} className="min-w-0 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="break-words text-lg font-semibold">{destination.label}</h2>
              {destination.isDefault ? <span className="rounded-full bg-muted px-3 py-1 text-[length:var(--text-micro)]"><AppBilingual pick={(c) => c.commerce.destinationsUi.default} /></span> : null}
            </div>
            <address className="mt-3 break-words text-[length:var(--text-small)] not-italic text-muted-foreground">
              {destination.addressLine1}{destination.addressLine2 ? `, ${destination.addressLine2}` : ""}<br />
              {destination.city}, <span dir="ltr">{destination.countryCode}</span><br />
              {destination.contactName} · <span dir="ltr">{destination.contactPhone}</span>
            </address>
            <div className="mt-4"><DestinationActions id={destination.id} isDefault={destination.isDefault} /></div>
            <details className="mt-4 border-t border-border pt-4">
              <summary className="min-h-11 cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"><AppBilingual pick={(c) => c.commerce.destinationsUi.edit} /></summary>
              <div className="pt-4"><DestinationForm destination={destination} /></div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
