import Link from "next/link";
import type { ReactNode } from "react";

import type { Destination } from "@/lib/commerce/destination-validation";

/**
 * Feature 013 T084 — a plain, server-rendered list of the buyer's own saved destinations (US1-AS2).
 * Deliberately a link list, not a client-controlled radio group: selecting a destination is a real
 * navigation (`?destinationId=…`), which re-runs the owning server page (estimate at checkout,
 * or identifier-only replacement issuance on an expired proforma). No client-side price logic.
 */
export function DestinationPicker({ destinations, selectedId, href, pickLabel, addHref, addLabel }: {
  destinations: readonly Destination[];
  selectedId: string | null;
  href: (destinationId: string) => string;
  pickLabel: ReactNode;
  addHref: string;
  addLabel: ReactNode;
}) {
  if (destinations.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-muted p-4 text-[length:var(--text-small)]">
        <Link href={addHref} className="font-medium text-primary underline underline-offset-4">
          {addLabel}
        </Link>
      </div>
    );
  }
  return (
    <fieldset className="flex flex-col gap-2" data-slot="destination-picker">
      <legend className="sr-only">{pickLabel}</legend>
      {destinations.map((destination) => {
        const selected = destination.id === selectedId;
        return (
          <Link
            key={destination.id}
            href={href(destination.id)}
            aria-current={selected ? "true" : undefined}
            data-selected={selected || undefined}
            className="flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] border border-border bg-[var(--surface-card)] px-4 py-3 text-[length:var(--text-small)] transition-colors data-[selected]:border-primary data-[selected]:bg-[var(--surface-subtle)]"
          >
            <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full border border-input data-[selected]:border-primary data-[selected]:bg-primary" data-selected={selected || undefined}>
              {selected ? <span className="size-2 rounded-full bg-primary-foreground" /> : null}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-medium text-foreground">{destination.label}</span>
              <span className="truncate text-muted-foreground">
                {destination.city}, {destination.countryCode}
              </span>
            </span>
          </Link>
        );
      })}
      <Link href={addHref} className="text-[length:var(--text-small)] font-medium text-primary underline underline-offset-4">
        {addLabel}
      </Link>
    </fieldset>
  );
}
