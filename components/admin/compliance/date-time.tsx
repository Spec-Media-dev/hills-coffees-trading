/**
 * Feature 010 RUN B — a server-rendered, bilingual date-time (the same dual-span technique as
 * `AppBilingual`, using the locale formatters the account/KYB rows already use). `null` renders
 * the caller's fallback, never a fabricated date.
 */
const EN = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const AR = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const EN_DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
const AR_DATE = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeZone: "UTC" });

export function AdminDateTime({ value, dateOnly = false, fallback }: { value: string | null; dateOnly?: boolean; fallback: React.ReactNode }) {
  if (!value) return <>{fallback}</>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>{fallback}</>;
  const en = (dateOnly ? EN_DATE : EN).format(date);
  const ar = (dateOnly ? AR_DATE : AR).format(date);
  return (
    <time dateTime={value} className="tabular-nums">
      <span lang="en" className="hc-lang-en">{en}</span>
      <span lang="ar" className="hc-lang-ar">{ar}</span>
    </time>
  );
}
