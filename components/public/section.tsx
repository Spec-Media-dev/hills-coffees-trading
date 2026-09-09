import type { ReactNode } from "react";

/**
 * The shared public section scaffold (Feature 002, Phases 3–4).
 *
 * Mirrors the `Section` primitive in the approved public-website kit
 * in the approved public website reference: an optional eyebrow, an editorial
 * heading, an optional lead paragraph, then the section body — inside one container, on one of three
 * brand grounds.
 *
 * The three tones are the Hills surface ramp as Feature 001 mapped it into tokens, so this
 * introduces no second colour system (FR-030):
 *
 *   page   → `bg-background`  (sand-200 #EEE4D1) — the default page ground
 *   cream  → `bg-secondary`   (sand-100 #F7F1E6) — the quieter alternating band
 *   forest → `bg-sidebar`     (forest-700 #173C32) — the dark editorial ground, cream text on it
 *
 * Alternating bands, rather than a wall of cards, are what give the public site its editorial
 * rhythm. Vertical rhythm follows the kit's `--section-y` (clamp 48–120px); the container matches the
 * one `PublicShell`'s header and footer already use, so every band lines up with the chrome.
 *
 * Server Component. Logical CSS properties only, so the same markup holds under `dir="rtl"`.
 */

export type SectionTone = "page" | "cream" | "forest";

const TONE_GROUND: Record<SectionTone, string> = {
  page: "bg-background text-foreground",
  cream: "bg-secondary text-foreground",
  forest: "bg-sidebar text-sidebar-foreground",
};

/** Gold reads differently on the two grounds — the brand ramp keeps a lighter gold for dark. */
const TONE_EYEBROW: Record<SectionTone, string> = {
  page: "text-[var(--gold-on-light)]",
  cream: "text-[var(--gold-on-light)]",
  forest: "text-[var(--gold-on-dark)]",
};

const TONE_LEAD: Record<SectionTone, string> = {
  page: "text-muted-foreground",
  cream: "text-muted-foreground",
  forest: "text-sidebar-foreground/80",
};

/** Container shared with `PublicShell`'s header and footer so every band aligns. */
export const CONTAINER = "hc-container";

/** Uppercase tracked eyebrow — the kit's `hc-eyebrow`, at `--text-meta` / `--tracking-label`. */
export const EYEBROW =
  "hc-eyebrow";

/** `--text-h2`: clamp(28px, 1.35rem + 1.9vw, 52px) at `--lh-heading` / `--tracking-display`. */
export const HEADING_2 =
  "hc-heading-2 font-semibold";

/** `--text-h3`: clamp(21px, 1.15rem + 0.8vw, 32px). */
export const HEADING_3 =
  "hc-heading-3 font-semibold";

/** `--text-body-lg` at `--lh-body`, held under ~70 characters for comfortable reading. */
export const LEAD = "hc-body-lg max-w-[62ch]";

export type SectionProps = {
  eyebrow?: string;
  title?: string;
  lead?: string;
  tone?: SectionTone;
  /**
   * Heading level for `title`. An index page's own title is the document's `h1`; a section inside a
   * composed page is an `h2`. Getting this wrong breaks heading order for screen-reader navigation.
   */
  titleAs?: "h1" | "h2";
  /** Optional trailing element in the header row — typically a link to the full index. */
  action?: ReactNode;
  children?: ReactNode;
};

export function Section({
  eyebrow,
  title,
  lead,
  tone = "page",
  titleAs: Title = "h2",
  action,
  children,
}: SectionProps) {
  const hasHeader = Boolean(eyebrow || title || lead);

  return (
    <section className={`${TONE_GROUND[tone]} py-[clamp(3.5rem,7vw,7.5rem)]`}>
      <div className={`${CONTAINER} flex flex-col gap-12`}>
        {hasHeader ? (
          <div className="flex flex-col gap-6 border-s-2 border-accent/70 ps-5 sm:flex-row sm:items-end sm:justify-between sm:ps-7">
            <div className="flex max-w-[50rem] flex-col gap-3">
              {eyebrow ? (
                <span className={`${EYEBROW} ${TONE_EYEBROW[tone]}`}>
                  {eyebrow}
                </span>
              ) : null}
              {title ? <Title className={HEADING_2}>{title}</Title> : null}
              {lead ? (
                <p className={`${LEAD} ${TONE_LEAD[tone]}`}>{lead}</p>
              ) : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/** An inline text link for "see everything" affordances beside a section heading. */
export const LINK_QUIET =
  "inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 decoration-accent decoration-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
