"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { CoffeeCard, COFFEE_GRID } from "@/components/public/coffee-card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import type { PublicCoffeeSummary } from "@/lib/public/coffees";

/**
 * In-catalogue filter over the already-fetched public coffee index (Phase 5.5, UIF-030 — plan §10).
 *
 * ── WHAT MAKES THIS HONEST ───────────────────────────────────────────────────────────────────────
 *
 * It filters the array the server already rendered. There is **no** new route, **no** new query,
 * **no** database call and **no** additional field: the component receives `PublicCoffeeSummary[]`,
 * the same DTO the page just used, and narrows it in memory. Nothing reaches the browser that was
 * not already on the page.
 *
 * The facets are therefore exactly the public taxonomy the DTO carries — origin, processing method
 * and coffee type — plus a text match over name, description and origin name. There is deliberately
 * no warehouse, availability, quantity, MOQ, grade, cup score, seller or price facet: those are
 * private trading data, and none of them exists on this DTO to filter by even by accident.
 *
 * **Tag is not a facet here**, although plan §10 lists it. `tags` lives on `PublicCoffeeDetail`, not
 * on `PublicCoffeeSummary`, and adding it to the index DTO would widen the allowlist — which
 * UIF-027 explicitly forbids. Filtering by a field the catalogue does not publish would also be
 * filtering by something the visitor cannot see. Tag filtering belongs with whichever feature
 * legitimately publishes tags on the index.
 *
 * ── NO INDEXABLE FILTER PERMUTATIONS ─────────────────────────────────────────────────────────────
 *
 * Filter state lives in React state only. It is never written to the URL, so this route keeps
 * exactly one indexable address and cannot generate the thin near-duplicate permutations the SEO
 * contract warns about. The page also stays **statically prerendered**: reading `searchParams` on
 * the server would have made `/coffee/` dynamic and damaged the Feature-001 cache architecture, so
 * the incoming `?q=` from the header search control is read through `useSyncExternalStore` instead —
 * a starting value, never a stored one, and never a hydration mismatch.
 *
 * ── SEPARABLE BY DESIGN ──────────────────────────────────────────────────────────────────────────
 *
 * plan §10 requires this to be droppable without breaking the header search control. It is: the page
 * renders the same grid through this component, and deleting it leaves `CoffeeCard` + `COFFEE_GRID`
 * rendering the unfiltered list.
 */

type Facet = { key: string; label: string };

/** Collects the distinct values actually present, so a facet can never offer an empty result. */
function facetsOf(
  coffees: readonly PublicCoffeeSummary[],
  pick: (c: PublicCoffeeSummary) => { name: string; slug: string } | null | undefined,
): Facet[] {
  const seen = new Map<string, string>();
  for (const coffee of coffees) {
    const value = pick(coffee);
    if (value) seen.set(value.slug, value.name);
  }
  return [...seen.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The `?q=` the header search control may have sent, read as **external state**.
 *
 * It cannot be a `useState` initialiser: that runs during the first client render, so with `?q=` in
 * the URL the client would render a filtered grid while the server rendered the full one — a
 * hydration mismatch. `useSyncExternalStore` gives the server snapshot on that first render and the
 * real value immediately after, which is the same pattern the theme and locale controls use.
 */
function subscribeToNothing(): () => void {
  // The query string cannot change without a navigation, which remounts this component.
  return () => {};
}

function readIncomingQuery(): string {
  try {
    return new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
  } catch {
    return "";
  }
}

const NO_INCOMING_QUERY = "";

export function CatalogueFilter({ coffees }: { coffees: PublicCoffeeSummary[] }) {
  const incomingQuery = useSyncExternalStore(
    subscribeToNothing,
    readIncomingQuery,
    () => NO_INCOMING_QUERY,
  );
  // `null` means "the visitor has not typed yet", so the incoming `?q=` still applies. Once they
  // type — including clearing the field — their value wins for the rest of the visit.
  const [typed, setTyped] = useState<string | null>(null);
  const query = typed ?? incomingQuery;
  const setQuery = setTyped;

  const [origin, setOrigin] = useState("");
  const [process, setProcess] = useState("");
  const [type, setType] = useState("");

  const originFacets = useMemo(() => facetsOf(coffees, (c) => c.origin), [coffees]);
  const processFacets = useMemo(() => facetsOf(coffees, (c) => c.processingMethod), [coffees]);
  const typeFacets = useMemo(() => facetsOf(coffees, (c) => c.coffeeType), [coffees]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return coffees.filter((coffee) => {
      if (origin && coffee.origin?.slug !== origin) return false;
      if (process && coffee.processingMethod?.slug !== process) return false;
      if (type && coffee.coffeeType?.slug !== type) return false;
      if (!needle) return true;
      const haystack = [coffee.name, coffee.description ?? "", coffee.origin?.name ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [coffees, query, origin, process, type]);

  const isFiltered = Boolean(query.trim() || origin || process || type);
  // The island reads the active locale's dictionary, so the Arabic overlay applies here too.
  const { t } = useLocale();
  const labels = t.coffee.index.filter;

  const clear = () => {
    setTyped("");
    setOrigin("");
    setProcess("");
    setType("");
  };

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border px-4 text-[length:var(--text-meta)] font-medium transition-colors duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:border-[var(--border-strong)] hover:text-foreground"
    }`;

  const facetRow = (
    legend: string,
    facets: Facet[],
    value: string,
    setValue: (next: string) => void,
  ) =>
    facets.length > 1 ? (
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="hc-eyebrow me-3 text-muted-foreground">{legend}</legend>
        <button type="button" onClick={() => setValue("")} aria-pressed={value === ""} className={chip(value === "")}>
          {labels.all}
        </button>
        {facets.map((facet) => (
          <button
            key={facet.key}
            type="button"
            onClick={() => setValue(value === facet.key ? "" : facet.key)}
            aria-pressed={value === facet.key}
            className={chip(value === facet.key)}
          >
            {facet.label}
          </button>
        ))}
      </fieldset>
    ) : null;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-subtle)] p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex w-full items-center sm:max-w-md">
            <span className="sr-only">{labels.searchLabel}</span>
            <Icon
              name="search"
              className="pointer-events-none absolute start-0 ms-4 size-4 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
              autoComplete="off"
              className="h-[var(--control-h)] rounded-[var(--radius-pill)] ps-11"
            />
          </label>

          {isFiltered ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 decoration-[var(--gold-on-light)] hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] dark:decoration-[var(--gold-on-dark)]"
            >
              <Icon name="x" className="size-4" />
              {labels.clear}
            </button>
          ) : null}
        </div>

        {originFacets.length > 1 || processFacets.length > 1 || typeFacets.length > 1 ? (
          <div className="flex flex-col gap-4 border-t border-border pt-5">
            {facetRow(labels.originFacet, originFacets, origin, setOrigin)}
            {facetRow(labels.processFacet, processFacets, process, setProcess)}
            {facetRow(labels.typeFacet, typeFacets, type, setType)}
          </div>
        ) : null}
      </div>

      {/* The count is derived from the real arrays — never an invented figure. */}
      <p className="hc-small text-muted-foreground" aria-live="polite">
        {labels.resultCount
          .replace("{shown}", String(shown.length))
          .replace("{total}", String(coffees.length))}
      </p>

      {shown.length > 0 ? (
        <ul className={COFFEE_GRID}>
          {shown.map((coffee) => (
            <CoffeeCard key={coffee.slug} coffee={coffee} headingLevel={2} />
          ))}
        </ul>
      ) : (
        <p className="max-w-[52ch] hc-body text-muted-foreground">{labels.noResults}</p>
      )}
    </div>
  );
}
