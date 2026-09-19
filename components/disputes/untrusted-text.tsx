import { cn } from "cn";

/**
 * Feature 012 RUN B (T008/T022) — THE one rendering path for member- and operator-entered free text
 * in the dispute domain: dispute reasons, compliance resolutions and evidence notes (SEC-004).
 *
 * Inert by construction: the value is rendered as a single React TEXT child — React escapes it — and
 * this component accepts no HTML/markdown mode and never uses `dangerouslySetInnerHTML`. `dir="auto"`
 * lets an Arabic note read right-to-left inside an English page (and vice versa); `whitespace-pre-wrap`
 * keeps the author's line breaks without interpreting anything else. Role-agnostic: the member dispute
 * page renders it today, and Feature 010's console can reuse it unchanged.
 */
export function UntrustedText({ value, className, slot }: { value: string; className?: string; slot?: string }) {
  return (
    <p data-slot={slot ?? "untrusted-text"} dir="auto" className={cn("text-[length:var(--text-small)] break-words whitespace-pre-wrap text-foreground", className)}>
      {value}
    </p>
  );
}
