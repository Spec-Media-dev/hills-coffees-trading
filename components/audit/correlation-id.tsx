/**
 * Feature 012 RUN C (T014) — a correlation ID, rendered monospaced and left-to-right (it is an
 * identifier, not prose) and allowed to wrap anywhere so a 36-character UUID never forces horizontal
 * overflow at 390px. Display only: no copy button, no link, no handler (FR-011).
 */
export function CorrelationId({ value }: { value: string }) {
  return (
    <span data-slot="correlation-id" dir="ltr" translate="no" className="font-mono text-[length:var(--text-micro)] break-all text-foreground">
      {value}
    </span>
  );
}
