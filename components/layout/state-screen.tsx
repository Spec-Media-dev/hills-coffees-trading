import type { ReactNode } from "react";

/**
 * Shared full-page state shell (research.md §15; named `StateScreen` to match the approved Hills
 * design system component inventory).
 *
 * This is the single rendering target for every non-happy-path state in the platform. It is a
 * Server Component on purpose: the authorization guards in `/dashboard` and `/dashboard-admin`
 * render it, and those denials must work with JavaScript disabled (Platform Story 1).
 *
 * `kind` is an OPEN union (FR-024). Later features add their own domain states — suspended,
 * rejected, reserved, expired, partial fill, settlement — by passing a new `kind` plus copy, with no
 * need to fork this component or build a parallel state-handling system.
 */
export type StateScreenKind =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "empty"
  | "error"
  | "loading"
  // Open extension point: any later feature's domain state. The union above keeps editor
  // autocomplete for the known states without closing the set.
  | (string & {});

type StateScreenCopy = {
  title: string;
  description: string;
};

/**
 * Default copy, externalized from the markup (FR-021) so a later feature can swap these for i18n
 * `t()` lookups in one place rather than hunting inline JSX strings. Callers may override per
 * render via the `title`/`description` props.
 */
export const STATE_SCREEN_COPY: Record<string, StateScreenCopy> = {
  unauthorized: {
    title: "Sign in required",
    description:
      "You need to sign in with an authorized account to view this area.",
  },
  forbidden: {
    title: "You do not have access",
    description:
      "Your account is signed in, but it is not authorized for this area.",
  },
  "not-found": {
    title: "Not found",
    description: "The page you are looking for does not exist.",
  },
  empty: {
    title: "Nothing here yet",
    description: "There is no information to show in this area right now.",
  },
  error: {
    title: "Something went wrong",
    description: "That did not load correctly. Please try again.",
  },
  loading: {
    title: "Loading",
    description: "Fetching the latest information.",
  },
};

const FALLBACK_COPY: StateScreenCopy = {
  title: "Unavailable",
  description: "This area is not available right now.",
};

export type StateScreenProps = {
  kind: StateScreenKind;
  /** Overrides the default title for this `kind`. */
  title?: string;
  /** Overrides the default description for this `kind`. */
  description?: string;
  /** Optional action(s) — e.g. a link to the step that resolves the state. */
  children?: ReactNode;
};

export function StateScreen({
  kind,
  title,
  description,
  children,
}: StateScreenProps) {
  const copy = STATE_SCREEN_COPY[kind] ?? FALLBACK_COPY;
  const resolvedTitle = title ?? copy.title;
  const resolvedDescription = description ?? copy.description;

  return (
    <main
      data-state-screen={kind}
      className="flex min-h-[60vh] flex-1 items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {resolvedTitle}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {resolvedDescription}
        </p>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </main>
  );
}
