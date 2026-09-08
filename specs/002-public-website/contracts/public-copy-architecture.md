# Contract: Public Copy & Server-Safe i18n Architecture

Governs FR-018, FR-030; SC-012. Extends — never replaces — Feature 001's i18n foundation.

## 0. The problem this solves

Feature 001's `lib/i18n/config.ts` is, as implemented:

- marked **`"use client"`**, and
- initialised with an **empty** dictionary (`resources.en.translation = {}`), and
- wired only as a client `I18nextProvider` in `src/app/layout.tsx`.

Two consequences follow, and both are load-bearing for Feature 002:

1. **A Server Component cannot read copy from it.** Importing a `"use client"` module from a Server
   Component pulls that module into the client boundary — which would convert 002's
   Server-Component-by-default public pages (FR-020) into client components. That is the opposite of
   what this feature requires.
2. **No copy exists yet.** 001 wired the *mechanism*, deliberately, and left the dictionary empty.
   002 is the first feature that actually needs public copy.

So Feature 002 must add a copy **source** that is safe for Server Components — **without** creating a
second i18n system.

## 1. The architecture

**One dictionary. Plain TypeScript. No framework coupling.**

```
lib/public/copy/
├── en.ts        # the single English public copy dictionary — plain `.ts`, NO "use client",
│                #   no i18next import, no React import
└── index.ts     # typed accessor + exported types
```

`en.ts` exports a deeply-readonly object literal (`as const`), and `index.ts` derives the type from
it so **a missing or misspelled key is a compile error**, not a runtime `undefined`.

Because the module imports nothing from React or i18next and carries no `"use client"` directive, it
is a **neutral module**: importable from a Server Component, a Client Component, a Route Handler,
`generateMetadata`, `sitemap.ts`, or a test — with identical results and no boundary change.

| Consumer | How it reads copy | Client JS added |
|---|---|---|
| **Server Component** (default for this feature) | direct `import { copy } from "@/lib/public/copy"` | **none** — the strings are inlined into the server-rendered HTML |
| **Client Component** (only where genuine interaction requires it — RFQ form, recompute-style controls) | the **same** direct import | only the strings that component actually references |
| `generateMetadata`, `sitemap.ts`, Route Handlers | same direct import | n/a |

## 2. Where i18next stays

**Untouched, exactly where Feature 001 put it**: `lib/i18n/config.ts`, `"use client"`, initialised
once, provided from the root layout.

Feature 002:

- does **not** add a second i18next initialisation;
- does **not** add a second i18n library;
- does **not** move or re-mark 001's module;
- does **not** route its copy through `useTranslation()`.

Feature 002 is English-first with **no locale routing and no locale switcher** (001 Clarify). Runtime
language *switching* is the only thing `useTranslation()` would buy, and it is out of scope. Reading
a typed constant is therefore the correct mechanism today, and it is strictly simpler and
server-safer.

**When a later feature does introduce locale switching**, it feeds i18next's `en.translation`
namespace **from this same `lib/public/copy/en.ts` module**. There is one dictionary either way — no
second copy store is ever created, and no drift is possible.

## 3. Rules

1. **One dictionary.** No component, page, layout or route handler defines its own copy object.
2. **No duplication into i18next.** Until locale switching is approved, the copy is not also declared
   as an i18next resource. If it ever is, it is *referenced* from this module, never retyped.
3. **English-first runtime.** `en` is the only dictionary this feature ships.
4. **RTL-ready, not RTL-implemented.** Copy carries no directional assumption (no "left"/"right" in
   user-facing strings, no baked-in punctuation direction). Direction is a CSS concern handled by
   logical properties (FR-018).
5. **No locale routing or switcher** unless separately approved. No `/en`, no `/ar`, no selector.
6. **Everything user-facing lives here** — headings, body copy, CTA labels, navigation labels, form
   labels, error and state messages, empty-state text, the skip-link label, `aria-label`s and other
   accessible names.
7. **Technical constants stay in code.** Route paths, cache tags, HTML `id`s, `data-*` attributes,
   test ids, class names, header names and enum-like keys are **not** copy and must not be moved
   here. The distinction is: *would a translator or a content owner ever change this string?* If no,
   it is a constant.

## 4. Closure verification (SC-012)

At closure, a check must show that public UI copy does not bypass this architecture:

- No user-facing string literal appears directly in JSX text, `alt`, `title`, `placeholder`,
  `aria-label`, or a state/error message under `src/app/(public)/`, `src/app/page.tsx`, or
  `components/public/` — each such string resolves through `lib/public/copy`.
- Technical constants (§3.7) are explicitly out of scope for this check and must not be forced into
  the dictionary to make it pass.
- The dictionary contains no unused key (dead copy) and no key referenced but undefined (the latter
  is already a compile error by construction).
- `lib/public/copy/**` contains **no** `"use client"` directive and imports neither `react` nor
  `i18next` — the property that keeps it server-safe.
- No second i18n initialisation exists: `grep -rn "initReactI18next\|i18next.init" lib src` matches
  only Feature 001's `lib/i18n/config.ts`.

This check runs at closure, not at the task that creates the dictionary — most consuming components
do not exist until later phases, so an earlier sweep could not be honest.
