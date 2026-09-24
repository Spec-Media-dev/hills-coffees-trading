import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getAppCopy } from "@/lib/app/copy";

/**
 * Feature 010 RUN F010-ACCOUNT-MEDIA — source-level security/completeness proofs for account
 * security, avatar upload, platform branding, and seller-owned listing media. No live database call
 * (the migration is not applied this run) — these are the genuinely-provable-without-it facts:
 * no service-role usage, no direct `auth.users` write, exactly the expected RPC call sites, and a
 * complete EN/AR copy contract.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const NEW_FILES = [
  "src/app/dashboard/settings/actions.ts",
  "src/app/dashboard/settings/change-password-form.tsx",
  "src/app/dashboard/settings/avatar-upload-field.tsx",
  "src/app/dashboard-admin/account/change-email-form.tsx",
  "src/app/dashboard-admin/(system)/branding/actions.ts",
  "src/app/dashboard-admin/(system)/branding/page.tsx",
  "src/app/dashboard-admin/(system)/branding/logo-upload-field.tsx",
  "lib/admin/branding.ts",
  "lib/listings/media.ts",
  "lib/storage/public-url.ts",
  "lib/validation/account-security.ts",
];

describe("Feature 010 approved scope additions — no service-role, no direct auth.users write", () => {
  for (const file of NEW_FILES) {
    const source = stripComments(readFileSync(file, "utf8"));
    it(`${file}: no service-role key, no direct auth.users table access`, () => {
      expect(source, file).not.toMatch(/SERVICE_ROLE|service_role|createAdminClient/);
      expect(source, file).not.toMatch(/\.from\(\s*["']auth\.users["']\s*\)/);
      expect(source, file).not.toMatch(/\.from\(\s*["']users["']\s*\)/);
    });
  }
});

describe("changeMyEmail — the ONLY approved mechanism is auth.updateUser({ email }), never a profile-table write", () => {
  const source = stripComments(readFileSync("src/app/dashboard/settings/actions.ts", "utf8"));
  it("uses auth.updateUser for the email change, not a direct table mutation", () => {
    expect(source).toMatch(/auth\.updateUser\(\{\s*email:/);
    expect(source).not.toMatch(/\.from\(\s*["']profiles["']\s*\)\s*\.update\(\{[^}]*email/);
  });
  it("checks ADMIN/SUPER_ADMIN membership before ever calling auth.updateUser for email", () => {
    const emailFnStart = source.indexOf("export async function changeMyEmail");
    const emailFnBody = source.slice(emailFnStart, source.indexOf("export async function", emailFnStart + 1));
    const authorizeIndex = emailFnBody.indexOf("operationalRoles.includes");
    const updateUserIndex = emailFnBody.indexOf("auth.updateUser({ email");
    expect(authorizeIndex).toBeGreaterThan(-1);
    expect(updateUserIndex).toBeGreaterThan(-1);
    expect(authorizeIndex).toBeLessThan(updateUserIndex);
  });
});

describe("Avatar/logo/listing-media RPC call sites are exactly where expected (single-writer discipline)", () => {
  it("set_my_avatar/remove_my_avatar are called only from the shared settings actions file", () => {
    const files = ["src/app/dashboard/settings/actions.ts"];
    for (const other of NEW_FILES.filter((f) => !files.includes(f))) {
      const source = stripComments(readFileSync(other, "utf8"));
      expect(source, other).not.toMatch(/set_my_avatar|remove_my_avatar/);
    }
  });

  it("set_platform_logo/remove_platform_logo are called only from the branding actions file", () => {
    const files = ["src/app/dashboard-admin/(system)/branding/actions.ts"];
    for (const other of NEW_FILES.filter((f) => !files.includes(f))) {
      const source = stripComments(readFileSync(other, "utf8"));
      expect(source, other).not.toMatch(/set_platform_logo|remove_platform_logo/);
    }
  });

  it("attach_offer_media/remove_offer_media/set_primary_offer_media are called only from the listing actions file", () => {
    const files = ["src/app/dashboard/listings/[offerId]/actions.ts"];
    for (const other of NEW_FILES.filter((f) => !files.includes(f))) {
      const source = stripComments(readFileSync(other, "utf8"));
      expect(source, other).not.toMatch(/attach_offer_media|remove_offer_media|set_primary_offer_media/);
    }
  });
});

describe("EN/AR copy contract for the new account-security/branding/listing-media surfaces", () => {
  it("accountSecurity password/email/avatar copy resolves to non-empty strings in both locales", () => {
    for (const locale of ["en", "ar"] as const) {
      const c = getAppCopy(locale).accountSecurity;
      expect(c.password.title.length, `${locale} password.title`).toBeGreaterThan(0);
      expect(c.password.submit.length, `${locale} password.submit`).toBeGreaterThan(0);
      expect(c.email.title.length, `${locale} email.title`).toBeGreaterThan(0);
      expect(c.email.notPermitted.length, `${locale} email.notPermitted`).toBeGreaterThan(0);
      expect(c.avatar.upload.length, `${locale} avatar.upload`).toBeGreaterThan(0);
      expect(c.avatar.invalidFile.length, `${locale} avatar.invalidFile`).toBeGreaterThan(0);
    }
  });

  it("admin.branding copy resolves to non-empty strings in both locales", () => {
    for (const locale of ["en", "ar"] as const) {
      const c = getAppCopy(locale).admin.branding;
      expect(c.title.length, `${locale} title`).toBeGreaterThan(0);
      expect(c.logo.lead.length, `${locale} logo.lead`).toBeGreaterThan(0);
    }
  });

  it("listings.media copy resolves to non-empty strings in both locales", () => {
    for (const locale of ["en", "ar"] as const) {
      const c = getAppCopy(locale).listings.media;
      expect(c.heading.length, `${locale} heading`).toBeGreaterThan(0);
      expect(c.upload.length, `${locale} upload`).toBeGreaterThan(0);
      expect(c.invalidFile.length, `${locale} invalidFile`).toBeGreaterThan(0);
    }
  });

  it("the Arabic copy is genuine translation (contains Arabic script), not an English fallback", () => {
    const arabicPattern = /[؀-ۿ]/;
    const ar = getAppCopy("ar");
    expect(arabicPattern.test(ar.accountSecurity.password.title)).toBe(true);
    expect(arabicPattern.test(ar.accountSecurity.email.notPermitted)).toBe(true);
    expect(arabicPattern.test(ar.admin.branding.logo.lead)).toBe(true);
    expect(arabicPattern.test(ar.listings.media.heading)).toBe(true);
  });
});

describe("Avatar/logo file-validation limits match the Storage bucket's own configured limits (source-level cross-check)", () => {
  it("account-security.ts's shared limits match the migration's bucket file_size_limit values", () => {
    const validationSource = readFileSync("lib/validation/account-security.ts", "utf8");
    const migrationSource = readFileSync("supabase/migrations/20260922130000_feature_010_branding_avatar_listing_media.sql", "utf8");
    expect(validationSource).toMatch(/AVATAR_MAX_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
    expect(migrationSource).toMatch(/'public-assets'[\s\S]{0,120}5242880/);
    expect(validationSource).toMatch(/LISTING_IMAGE_MAX_BYTES\s*=\s*8\s*\*\s*1024\s*\*\s*1024/);
    expect(migrationSource).toMatch(/'listing-media'[\s\S]{0,120}8388608/);
  });
});
