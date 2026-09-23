import { readFileSync } from "node:fs";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Pre-Stripe hardening run — navigation shape, admin bilingual editing, tag translations, remaining
 * localization fixes and the admin media ordering fix. Source-level where the contract is a code
 * shape; rendered where it is behaviour.
 */
afterEach(cleanup);

const read = (path: string) => readFileSync(path, "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("public header — arch frame, not a pill; smaller logo", () => {
  const header = read("components/public/site-header.tsx");
  it("rounded top corners, square bottom corners — never rounded-full", () => {
    expect(header).toMatch(/hc-header-frame[^"]*rounded-t-\[1\.375rem\] rounded-b-none/);
    expect(header).not.toMatch(/hc-header-frame[^"]*rounded-full/);
  });
  it("the frame's base is drawn with a single gold rule", () => {
    expect(read("src/app/globals.css")).toMatch(/\.hc-header-frame \{[\s\S]*?border-bottom: 1px solid rgba\(206, 138, 57, 0\.62\);/);
  });
  it("the logo is smaller at every breakpoint (was 118/132/142px)", () => {
    expect(header).toContain('const LOGO_CLASS = "block h-auto w-[102px] lg:w-[112px] 2xl:w-[120px]";');
  });
});

describe("BilingualEditor — explicit EN/AR tabs with unsaved state", () => {
  async function renderEditor() {
    const { LocaleProvider } = await import("@/components/locale/locale-provider");
    const { BilingualEditor } = await import("@/components/admin/catalogue/bilingual-editor");
    return render(
      <LocaleProvider>
        <BilingualEditor
          english={
            <section data-testid="en-form">
              <input aria-label="english-name" />
            </section>
          }
          arabic={
            <section data-testid="ar-form">
              <input aria-label="arabic-name" dir="rtl" lang="ar" />
            </section>
          }
        />
      </LocaleProvider>,
    );
  }

  it("is a real tablist; both panels stay mounted (switching never discards typing)", async () => {
    const { container } = await renderEditor();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("lang"))).toEqual(["en", "ar"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[data-language-panel="ar"]')?.hasAttribute("hidden")).toBe(true);
    await act(async () => {
      fireEvent.click(tabs[1]!);
    });
    expect(container.querySelector('[data-language-panel="ar"]')?.hasAttribute("hidden")).toBe(false);
    expect(screen.getByLabelText("english-name")).toBeDefined(); // still mounted
  });

  it("typing marks ONLY that language unsaved; the form's save event clears it", async () => {
    const { container } = await renderEditor();
    const english = screen.getByLabelText("english-name");
    await act(async () => {
      fireEvent.input(english, { target: { value: "Guji" } });
    });
    expect(container.querySelector('[data-language-tab="en"]')?.getAttribute("data-dirty")).toBe("true");
    expect(container.querySelector('[data-language-tab="ar"]')?.getAttribute("data-dirty")).toBe("false");
    expect(container.querySelector("[data-unsaved-note]")).not.toBeNull();
    await act(async () => {
      screen.getByTestId("en-form").dispatchEvent(new CustomEvent("hc:content-saved", { bubbles: true }));
    });
    expect(container.querySelector('[data-language-tab="en"]')?.getAttribute("data-dirty")).toBe("false");
  });

  it("Arrow keys move between the two tabs", async () => {
    await renderEditor();
    const [en, ar] = screen.getAllByRole("tab");
    en!.focus();
    await act(async () => {
      fireEvent.keyDown(en!, { key: "ArrowRight" });
    });
    expect(document.activeElement).toBe(ar);
    expect(ar!.getAttribute("aria-selected")).toBe("true");
  });

  it("both record forms announce a successful save; every catalogue detail page uses the tabs", () => {
    expect(read("components/admin/catalogue/record-form.tsx")).toContain('new CustomEvent("hc:content-saved", { bubbles: true })');
    expect(read("components/admin/catalogue/arabic-content-panel.tsx")).toContain('new CustomEvent("hc:content-saved", { bubbles: true })');
    for (const page of ["coffees/[coffeeId]", "origins/[originId]", "regions/[regionId]", "taxonomy/[kind]/[entryId]"]) {
      expect(read(`src/app/dashboard-admin/(catalogue)/${page}/page.tsx`), page).toContain("<BilingualEditor");
    }
  });
});

describe("bilingual CREATE — Arabic in the same step, written as its own row after the English record", () => {
  it("create forms add RTL Arabic fields", async () => {
    const { arabicCreateFields } = await import("@/components/admin/catalogue/arabic-fields");
    expect(arabicCreateFields(true).map((field) => [field.name, field.rtl])).toEqual([
      ["nameAr", true],
      ["descriptionAr", true],
    ]);
    expect(arabicCreateFields(false).map((field) => field.name)).toEqual(["nameAr"]);
    for (const page of ["coffees/new", "origins/new", "regions/new", "taxonomy/[kind]/new"]) {
      expect(read(`src/app/dashboard-admin/(catalogue)/${page}/page.tsx`), page).toContain("arabicCreateFields(");
    }
  });

  it("RecordForm renders an rtl field as lang=ar dir=rtl", () => {
    const form = read("components/admin/catalogue/record-form.tsx");
    expect(form).toContain('const direction = arabicContent ? "rtl" : field.ltr || englishContent ? "ltr" : undefined;');
    expect(form).toContain('const language = arabicContent ? "ar" : englishContent ? "en" : undefined;');
  });

  it("each create action writes Arabic ONLY after its English create succeeded (never on update)", () => {
    const actions = strip(read("src/app/dashboard-admin/(catalogue)/actions.ts"));
    for (const [kind, id] of [["coffee", "coffeeId"], ["origin", "originId"], ["region", "regionId"]] as const) {
      expect(actions).toContain(`if (result.ok && !input.${id}) await saveArabicOnCreate("${kind}", result.data.id, input);`);
    }
    expect(actions).toContain("if (result.ok && !input.entryId && taxonomyTranslationKind) await saveArabicOnCreate(taxonomyTranslationKind, result.data.id, input);");
  });
});

describe("tag translations", () => {
  it("tags map to the `tag` translation kind; name only (a description is refused)", async () => {
    const { translationKindForTaxonomy, CatalogueTranslationInput } = await import("@/lib/admin/catalogue-validation");
    expect(translationKindForTaxonomy("tags")).toBe("tag");
    const id = "11111111-1111-4111-8111-111111111111";
    expect(CatalogueTranslationInput.safeParse({ kind: "tag", entityId: id, name: "فاكهي" }).success).toBe(true);
    expect(CatalogueTranslationInput.safeParse({ kind: "tag", entityId: id, name: "فاكهي", description: "x" }).success).toBe(false);
    expect(read("lib/admin/catalogue.ts")).toContain('tag: { table: "tag_translations", key: "tag_id", hasDescription: false },');
  });

  it("the public DTO reads tag Arabic in its OWN tolerant query (a missing table degrades only tags)", () => {
    const source = read("lib/public/coffees.ts");
    expect(source).toContain("coffee_tags ( tags ( slug, tag_translations ( locale, name ) ) )");
    expect(source).toContain("if (!tags.error && tags.data) {");
  });

  it("migration 20260924120000: guarded, table select-only, writer re-declared with ONLY a `tag` branch added; rollback restores the previous writer", () => {
    const sql = read("supabase/migrations/20260924120000_tag_translations.sql");
    const rollback = read("supabase/rollback/20260924120000_tag_translations.rollback.sql");
    const previous = read("supabase/migrations/20260923120000_catalogue_media_and_translations.sql");
    expect(sql).toMatch(/raise exception 'tag_translations preflight failed/);
    expect(sql).toMatch(/grant select on table public\.tag_translations to anon, authenticated;/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*tag_translations/i);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/not public\.is_platform_admin\(\)/);
    expect(sql).toMatch(/revoke all on function public\.set_catalogue_translation\(text, uuid, text, text, text\) from anon;/);
    expect(sql).toContain("p_kind = 'tag'");
    // the re-declared writer equals the previous one plus exactly the tag branch
    const prevFn = previous.slice(previous.indexOf("create or replace function public.set_catalogue_translation("), previous.indexOf("revoke all on function public.set_catalogue_translation"));
    const newFn = sql.slice(sql.indexOf("create or replace function public.set_catalogue_translation("), sql.indexOf("revoke all on function public.set_catalogue_translation"));
    const tagBranch = newFn.slice(newFn.indexOf("  elsif p_kind = 'tag' then"), newFn.indexOf("  else\n    raise exception 'translation_kind_invalid';"));
    expect(newFn.replace(tagBranch, "").trim()).toBe(prevFn.trim());
    expect(rollback).not.toContain("p_kind = 'tag'");
    expect(rollback).toMatch(/drop table if exists public\.tag_translations;/);
    expect(read("supabase/maintenance/20260924_tag_translations_postflight.sql")).toMatch(/anon cannot execute the writer/);
  });
});

describe("remaining localization fixes", () => {
  it("member shipment custody records render the localized storage status badge, never the raw enum", () => {
    const page = read("src/app/dashboard/deliveries/[shipmentId]/page.tsx");
    expect(page).toContain("<StorageStatusBadge status={allocation.status} />");
    expect(page).not.toContain("{allocation.status}</span>");
  });
  it("error boundaries' retry button is localized", () => {
    for (const file of ["src/app/dashboard/error.tsx", "src/app/dashboard-admin/error.tsx"]) {
      expect(read(file), file).toContain("useOptionalLocale()?.tApp.tryAgain ?? appCopy.tryAgain");
      expect(read(file), file).not.toContain(">Try again<");
    }
  });
  it("admin listing review labels the seller type (the raw code stays as a secondary mono value)", () => {
    expect(read("src/app/dashboard-admin/(compliance)/listings/[offerId]/page.tsx")).toContain("c.marketplace.card.sellerType as Record<string, string>)[listing.sellerType] ?? listing.sellerType");
  });
});

describe("admin catalogue media ordering fix", () => {
  it("the sort-order input is keyed by the current sort order so a move never shows (or re-saves) a stale value", () => {
    expect(read("components/admin/catalogue/coffee-media-panel.tsx")).toContain("key={`sort-${row.id}-${row.sortOrder}`}");
  });
});
