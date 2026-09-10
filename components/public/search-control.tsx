"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The public Search control (Phase 5.5, UIF-019 — plan §10).
 *
 * ── WHAT THIS IS, AND DELIBERATELY IS NOT ────────────────────────────────────────────────────────
 *
 * This is the search **control architecture**: the header affordance, the dialog shell, the field,
 * and the full keyboard contract. It is **not** global search.
 *
 * Feature 002's route contract (FR-002) contains no search-results route, and no task `T000`–`T057`
 * owns one. A results page would be new public surface and new scope, so it is explicitly deferred
 * (plan §10). Submitting therefore resolves to the surface that genuinely exists today — the public
 * coffee catalogue at `/coffee/` — carrying the term as `?q=`, which is exactly the input `UIF-030`
 * consumes when it adds honest client-side filtering over the already-fetched public index.
 *
 * ── THE HONESTY BOUNDARY ─────────────────────────────────────────────────────────────────────────
 *
 * NO RESULT LIST IS RENDERED. Not a real one, not a placeholder, not a "no results yet" shell. A
 * suggestion list here would either fabricate data or require a query this feature is not allowed to
 * make, and both are prohibited.
 *
 * NOTHING PRIVATE IS SEARCHABLE — ever, not merely "not yet". The live Hills site searches warehouse,
 * availability, quantity, grade and sensory profiles; every one of those is denylisted private data
 * under Principle VII and the public DTO allowlist. This component issues no query at all: it reads
 * no table, calls no server action, and touches no DTO. It navigates.
 *
 * NOT A DECORATIVE CONTROL. It opens, traps focus, closes on Escape, restores focus to the trigger,
 * and navigates on submit. A search icon that did nothing would be exactly the deception this task
 * exists to prevent.
 *
 * ── KEYBOARD AND FOCUS ───────────────────────────────────────────────────────────────────────────
 *
 * Focus trap, Escape-to-close and focus restoration come from the UIF-A `Dialog` (Base UI), so this
 * file adds no bespoke focus logic. It adds one thing the primitive cannot know: moving focus into
 * the field when the dialog opens, which is what makes a search dialog usable rather than merely
 * accessible.
 */
export function SearchControl({ className }: { className?: string }) {
  const router = useRouter();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const fieldRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  const labels = t.controls;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = term.trim();
    setOpen(false);
    // A real navigation to a route that really exists. `?q=` is omitted when empty so the plain
    // catalogue URL stays clean.
    router.push(query ? `/coffee/?q=${encodeURIComponent(query)}` : "/coffee/");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            /*
             * A STABLE id, not the generated one. Base UI derives its default id from React's
             * `useId`, which encodes the element's position in the tree — and the homepage composes
             * `PublicShell` from `src/app/page.tsx` while every other public route composes it from
             * the `(public)` layout, so the two trees differ and the generated ids diverge. That
             * would make the header markup differ between `/` and `/coffee/` for no semantic reason,
             * which is exactly the shell drift `UIF-023` exists to catch. Pinning the id keeps the
             * chrome byte-identical on every public route.
             */
            id="hc-search-trigger"
            aria-label={labels.openSearch}
            /*
             * Reads as a search FIELD on desktop (public convergence pass): a long pill with the icon
             * at the inline-start and the field label as its placeholder-like text, left-aligned at a
             * deliberate width. It is still a button that opens the dialog — the field itself lives
             * inside, with the full keyboard contract — so nothing here fakes an inline search.
             * Below `xl` it collapses to the compact icon control so the bar keeps its rhythm.
             */
            className={cn(
              "gap-2.5 rounded-[var(--radius-pill)] px-4 font-medium text-muted-foreground xl:w-[15.5rem] xl:justify-start xl:ps-4 xl:pe-5",
              className,
            )}
          />
        }
      >
        <Icon name="search" className="size-4 shrink-0" />
        {/* The label is visible on desktop and decorative beside the icon elsewhere; the accessible
            name always comes from `aria-label` above, so meaning is never carried by the icon alone. */}
        <span className="hidden truncate text-[length:var(--text-small)] font-normal xl:inline">
          {labels.searchFieldLabel}
        </span>
      </DialogTrigger>

      <DialogContent
        className="top-[12vh] max-w-xl translate-y-0 gap-5 p-6 sm:p-7"
        // Base UI restores focus to the trigger on close; this places it usefully on open, so the
        // visitor can type immediately rather than tabbing into the field.
        initialFocus={fieldRef}
      >
        <DialogHeader>
          <DialogTitle>{labels.searchTitle}</DialogTitle>
          <DialogDescription>{labels.searchHint}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" role="search">
          <label htmlFor={fieldId} className="sr-only">
            {labels.searchTitle}
          </label>
          <div className="relative flex items-center">
            <Icon
              name="search"
              className="pointer-events-none absolute start-0 ms-4 size-4 text-muted-foreground"
            />
            <Input
              ref={fieldRef}
              id={fieldId}
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={labels.searchPlaceholder}
              autoComplete="off"
              className="h-[var(--control-h)] rounded-[var(--radius-pill)] ps-11"
            />
          </div>
          <Button type="submit" size="default" className="self-stretch sm:self-end">
            {labels.searchSubmit}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
