import { AppBilingual } from "@/components/locale/app-bilingual";

/**
 * Feature 010 T049 — small server-rendered parts shared by the reference-price admin pages. Presentation only:
 * nothing here decides authorization or visibility.
 */

/** Feature 011's display gate restated for orientation (APPROVED + active); the read layer, not this, enforces it. */
export function publicStateOf(source: { licenceStatus: string; isActive: boolean }): "shown" | "hidden" {
  return source.licenceStatus === "APPROVED" && source.isActive ? "shown" : "hidden";
}

/** An instant as its exact UTC wall-clock time (`YYYY-MM-DD HH:MM UTC`) — the zone Feature 011 publishes in. */
export function UtcInstant({ value }: { value: string }) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return <span dir="ltr">—</span>;
  const iso = new Date(time).toISOString();
  return (
    <time dateTime={iso} dir="ltr" className="font-mono tabular-nums">
      {`${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`}
    </time>
  );
}

export function YesNo({ value }: { value: boolean }) {
  return <AppBilingual pick={(c) => (value ? c.admin.catalogue.prices.yes : c.admin.catalogue.prices.no)} />;
}

export function PriceSection({ id, title, children }: { id: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

type PriceNoteKey = "noConversionNote" | "appendOnlyNote" | "noDeleteNote";

export function PriceNotes({ notes }: { notes: readonly PriceNoteKey[] }) {
  return (
    <ul className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-4 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" data-price-notes>
      {notes.map((key) => (
        <li key={key}>
          <AppBilingual pick={(c) => c.admin.catalogue.prices[key]} />
        </li>
      ))}
    </ul>
  );
}
