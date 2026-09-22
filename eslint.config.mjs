import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The exported Hills Coffee design system (`docs/claude-design/`, one baseline commit, never edited;
    // `CLAUDE.md` classes it as "exported ... design system and UI references"). It is reference material,
    // not application source: its UI-kit JSX files are standalone browser scripts that share components
    // through `window` globals (`Object.assign(window, { ... })`), so `react/jsx-no-undef` flags them by
    // design (121 of its 124 errors); it ships its own lint config (`_adherence.oxlintrc.json`) and a
    // generated bundle/manifest; and nothing in `lib/`, `src/`, `components/`, `tests/` or `scripts/`
    // imports it. It is the ONLY lintable content under `docs/`. Application and test code stays linted.
    "docs/claude-design/**",
    // Feature 008 RUN E (Stripe provider decision) — Deno/Supabase Edge Functions (`Deno.*` global,
    // `npm:`/`https://esm.sh` import specifiers). A separate runtime from this Next.js/Node project;
    // excluded from `tsconfig.json` for the same reason. Not application source under `src/`/`lib/`.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
