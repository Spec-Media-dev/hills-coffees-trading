import { readFileSync } from "node:fs";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KybDocumentRow } from "@/components/account/kyb-document-row";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { KYB_EVIDENCE_ALLOWED_MIME_TYPES, KYB_EVIDENCE_MAX_SIZE_BYTES } from "@/lib/kyb/limits";
import { KYB_DOCUMENT_TYPE_VALUES } from "@/lib/validation/kyb-application";

/**
 * Real-browser bugfix regression: a KYB file above 1 MiB but within the approved
 * `KYB_EVIDENCE_MAX_SIZE_BYTES` (10 MiB) previously crashed with the raw Next.js Runtime Error
 * "Body exceeded 1 MB limit." — the default Server Action transport limit, not the approved
 * per-file limit. Two independent fixes are proven here:
 *   1. `next.config.ts` raises the Server Action transport ceiling above the canonical file max
 *      (never the reverse — the FILE limit itself is unchanged).
 *   2. `KybDocumentRow` pre-validates a selection against the SAME canonical contract before it can
 *      ever be submitted, so an oversized/invalid file never reaches the Server Action's request
 *      body in the first place, and the field-specific error renders inline — never a global toast,
 *      never the dev Runtime Error overlay.
 */

vi.mock("@/src/app/dashboard/kyb/actions", () => ({
  uploadKybDocument: vi.fn(async () => ({ ok: true, data: undefined, code: "kyb_upload_succeeded" })),
}));

afterEach(cleanup);

function withLocale(children: React.ReactNode) {
  return <LocaleProvider>{children}</LocaleProvider>;
}

/** A `File` whose `.size` is stubbed without allocating real bytes. */
function fakeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

describe("next.config.ts — KYB upload transport limit", () => {
  const source = readFileSync("next.config.ts", "utf8");

  it("raises the Server Action body size limit above the canonical KYB file max, sourced from the canonical constant", () => {
    expect(source).toMatch(/import\s*\{\s*KYB_EVIDENCE_MAX_SIZE_BYTES\s*\}\s*from\s*["']\.\/lib\/kyb\/limits["']/);
    expect(source).toMatch(/bodySizeLimit:\s*KYB_EVIDENCE_MAX_SIZE_BYTES\s*\+/);
    // No magic number duplicating the 10 MiB file limit itself.
    expect(source).not.toMatch(/bodySizeLimit:\s*["']?\d/);
  });

  it("never weakens the canonical per-file KYB limit itself", () => {
    const limitsSource = readFileSync("lib/kyb/limits.ts", "utf8");
    expect(limitsSource).toContain("KYB_EVIDENCE_MAX_SIZE_BYTES = 10 * 1024 * 1024");
  });
});

describe("KybDocumentRow — client-side field-specific pre-validation", () => {
  const documentType = KYB_DOCUMENT_TYPE_VALUES[0];

  it("rejects a file over the canonical KYB max inline, at the exact document row — never a toast, never a submit", () => {
    render(
      withLocale(
        <KybDocumentRow documentType={documentType} currentDocument={undefined} review={undefined} />
      )
    );

    const input = document.querySelector('input[name="file"]') as HTMLInputElement;
    const oversized = fakeFile("evidence.pdf", "application/pdf", KYB_EVIDENCE_MAX_SIZE_BYTES + 1);
    fireEvent.change(input, { target: { files: [oversized] } });

    expect(screen.getByRole("alert").textContent).toMatch(/10 ?MB|10 ?ميجابايت/i);
    const submit = screen.getByRole("button", { name: /upload|replace/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("rejects an unsupported MIME type inline at the exact document row", () => {
    render(
      withLocale(
        <KybDocumentRow documentType={documentType} currentDocument={undefined} review={undefined} />
      )
    );

    const input = document.querySelector('input[name="file"]') as HTMLInputElement;
    const wrongType = fakeFile("evidence.gif", "image/gif", 1024);
    fireEvent.change(input, { target: { files: [wrongType] } });

    expect(screen.getByRole("alert")).toBeTruthy();
    const submit = screen.getByRole("button", { name: /upload|replace/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("accepts a valid file over 1 MiB but within the canonical KYB max — no inline error, submit enabled", () => {
    render(
      withLocale(
        <KybDocumentRow documentType={documentType} currentDocument={undefined} review={undefined} />
      )
    );

    const input = document.querySelector('input[name="file"]') as HTMLInputElement;
    const validLargeFile = fakeFile("evidence.pdf", "application/pdf", 5 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [validLargeFile] } });

    expect(screen.queryByRole("alert")).toBeNull();
    const submit = screen.getByRole("button", { name: /upload|replace/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("derives the accepted MIME list from the same canonical registry the Server Action enforces — never a second hard-coded list", () => {
    const source = readFileSync("components/account/kyb-document-row.tsx", "utf8");
    expect(source).toMatch(/KYB_EVIDENCE_ALLOWED_MIME_TYPES\.join\(","\)/);
    expect(source).not.toMatch(/"application\/pdf,image\/jpeg,image\/png"/);
    expect(KYB_EVIDENCE_ALLOWED_MIME_TYPES.length).toBeGreaterThan(0);
  });
});
