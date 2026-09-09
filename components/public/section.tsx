import type { ReactNode } from "react";

/**
 * The shared public section scaffold (Feature 002, Phases 3–4).
 *
 * Mirrors the `Section` primitive in the approved public-website kit
 * (`docs/claude-design/ui_kits/public_website/chrome.jsx`): an optional eyebrow, an editorial
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
  page: "text-accent",
  cream: "text-accent",
  forest: "text-sidebar-ring",
};

const TONE_LEAD: Record<SectionTone, string> = {
  page: "text-muted-foreground",
  cream: "text-muted-foreground",
  forest: "text-sidebar-foreground/80",
};

/** Container shared with `PublicShell`'s header and footer so every band aligns. */
export const CONTAINER = "mx-auto w-full max-w-6xl px-6";

/** Uppercase tracked eyebrow — the kit's `hc-eyebrow`, at `--text-meta` / `--tracking-label`. */
export const EYEBROW =
  "text-[0.8125rem] font-semibold uppercase tracking-[0.14em]";

/** `--text-h2`: clamp(28px, 1.35rem + 1.9vw, 52px) at `--lh-heading` / `--tracking-display`. */
export const HEADING_2 =
  "text-[clamp(1.75rem,calc(1.35rem+1.9vw),3.25rem)] font-semibold leading-[1.14] tracking-[-0.025em]";

/** `--text-h3`: clamp(21px, 1.15rem + 0.8vw, 32px). */
export const HEADING_3 =
  "text-[clamp(1.3125rem,calc(1.15rem+0.8vw),2rem)] font-semibold leading-[1.2] tracking-[-0.015em]";

/** `--text-body-lg` at `--lh-body`, held under ~70 characters for comfortable reading. */
export const LEAD = "text-[1.0625rem] leading-[1.6] max-w-[62ch]";

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
    <section className={`${TONE_GROUND[tone]} py-[clamp(3rem,7vw,7.5rem)]`}>
      <div className={`${CONTAINER} flex flex-col gap-10`}>
        {hasHeader ? (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex max-w-[46rem] flex-col gap-3">
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

/**
 * Call-to-action treatments, shared so the same action never appears in two different shapes.
 *
 * The hierarchy is deliberate and used sparingly: one filled primary action per band at most, with
 * everything else quieter. All four carry a visible focus ring, since the public site is fully
 * keyboard-operable (FR-017).
 */
const CTA_BASE =
  "inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2";

/** The single strongest action on a light ground. */
export const CTA_PRIMARY = `${CTA_BASE} bg-primary text-primary-foreground focus-visible:outline-ring`;

/** Quieter action on a light ground — a bordered surface, not a second filled button. */
export const CTA_SECONDARY = `${CTA_BASE} border border-border bg-card text-foreground focus-visible:outline-ring`;

/** On the dark editorial ground the cream surface becomes the strongest action. */
export const CTA_ON_FOREST = `${CTA_BASE} bg-sidebar-foreground text-sidebar focus-visible:outline-sidebar-ring`;

/** Its companion on dark: outline only, so the pair reads as primary + secondary. */
export const CTA_OUTLINE_ON_FOREST = `${CTA_BASE} border border-sidebar-foreground/40 text-sidebar-foreground hover:border-sidebar-foreground/70 focus-visible:outline-sidebar-ring`;

/** An inline text link for "see everything" affordances beside a section heading. */
export const LINK_QUIET =
  "text-sm font-medium text-foreground underline underline-offset-4 decoration-accent decoration-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
