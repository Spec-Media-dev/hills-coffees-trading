"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { cn } from "@/lib/utils";

/**
 * Pre-Stripe hardening run — the catalogue record's two languages as TABS: "English (canonical)" and
 * "العربية". Chosen over a long vertical stack (the admin never loses track of which language they
 * are editing) and over side-by-side columns (the English form has many non-text fields — slug,
 * references, status — so two columns would be badly unbalanced and cramped on tablets).
 *
 * - Both panels stay MOUNTED (inactive one is `hidden`), so switching tabs never discards typing.
 * - Each panel is its own form with its own Server Action and its own row/columns in the database —
 *   there is no shared submit that could write one language over the other.
 * - Unsaved state: any input inside a panel marks that tab (a dot + an sr-only "unsaved" label); the
 *   form's own `hc:content-saved` event clears it after a successful save. Leaving the page with
 *   unsaved edits triggers the browser's own confirmation.
 * - Keyboard: a real WAI-ARIA tablist — Arrow keys (reading-direction aware), Home/End.
 */
type Language = "en" | "ar";

export function BilingualEditor({ english, arabic }: { english: React.ReactNode; arabic: React.ReactNode }) {
  const { tApp, direction } = useLocale();
  const copy = tApp.admin.catalogue.arabic;
  const [active, setActive] = useState<Language>("en");
  const [dirty, setDirty] = useState<Record<Language, boolean>>({ en: false, ar: false });
  const baseId = useId();
  const panelRefs = { en: useRef<HTMLDivElement>(null), ar: useRef<HTMLDivElement>(null) };
  const tabRefs = { en: useRef<HTMLButtonElement>(null), ar: useRef<HTMLButtonElement>(null) };

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const language of ["en", "ar"] as const) {
      const node = panelRefs[language].current;
      if (!node) continue;
      const onSaved = () => setDirty((previous) => ({ ...previous, [language]: false }));
      node.addEventListener("hc:content-saved", onSaved);
      cleanups.push(() => node.removeEventListener("hc:content-saved", onSaved));
    }
    return () => cleanups.forEach((cleanup) => cleanup());
    // The refs are stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyDirty = dirty.en || dirty.ar;
  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  const tabs: readonly { language: Language; label: string }[] = [
    { language: "en", label: copy.tabEnglish },
    { language: "ar", label: copy.tabArabic },
  ];

  const focusTab = (language: Language) => {
    setActive(language);
    tabRefs[language].current?.focus();
  };

  return (
    <div className="flex flex-col gap-4" data-bilingual-editor data-active-language={active}>
      <div role="tablist" aria-label={copy.tabsLabel} className="inline-flex w-full max-w-md self-start rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] p-1">
        {tabs.map(({ language, label }) => (
          <button
            key={language}
            ref={tabRefs[language]}
            type="button"
            role="tab"
            id={`${baseId}-tab-${language}`}
            aria-selected={active === language}
            aria-controls={`${baseId}-panel-${language}`}
            tabIndex={active === language ? 0 : -1}
            lang={language}
            dir={language === "ar" ? "rtl" : "ltr"}
            data-language-tab={language}
            data-dirty={dirty[language] ? "true" : "false"}
            onClick={() => setActive(language)}
            onKeyDown={(event) => {
              const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
              const back = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
              if (event.key === forward || event.key === back) {
                event.preventDefault();
                focusTab(language === "en" ? "ar" : "en");
              } else if (event.key === "Home") {
                event.preventDefault();
                focusTab("en");
              } else if (event.key === "End") {
                event.preventDefault();
                focusTab("ar");
              }
            }}
            className={cn(
              "relative inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 text-[length:var(--text-small)] font-semibold transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transition-none",
              active === language ? "bg-card text-foreground shadow-[var(--shadow-sm)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {dirty[language] ? (
              <>
                <span aria-hidden="true" className="size-2 rounded-full bg-[var(--status-warning,#c47a17)]" />
                <span className="sr-only">{copy.unsaved}</span>
              </>
            ) : null}
          </button>
        ))}
      </div>

      {anyDirty ? (
        <p className="text-[length:var(--text-micro)] text-muted-foreground" role="status" data-unsaved-note>
          {copy.unsavedNote}
        </p>
      ) : null}

      {(["en", "ar"] as const).map((language) => (
        <div
          key={language}
          ref={panelRefs[language]}
          role="tabpanel"
          id={`${baseId}-panel-${language}`}
          aria-labelledby={`${baseId}-tab-${language}`}
          hidden={active !== language}
          data-language-panel={language}
          onInput={() => setDirty((previous) => (previous[language] ? previous : { ...previous, [language]: true }))}
          onChange={() => setDirty((previous) => (previous[language] ? previous : { ...previous, [language]: true }))}
        >
          {language === "en" ? english : arabic}
        </div>
      ))}
    </div>
  );
}
