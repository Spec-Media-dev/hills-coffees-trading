import { NextResponse } from "next/server";

import { contentDispositionInline, readKybDocumentFile } from "@/lib/admin/kyb-documents";

/**
 * Feature 010 RUN E — `GET /dashboard-admin/kyb/[applicationId]/documents/[documentId]/file`:
 * streams one KYB evidence file to an authorized reviewer through their own session
 * (`lib/admin/kyb-documents.ts`). Every request re-authorizes; nothing is cached anywhere; a refusal
 * is an empty 404 (never a distinguishable 403 that would confirm a document exists). Non-indexable.
 *
 * Response hardening (the bytes are member-uploaded, so they are treated as untrusted content):
 * `nosniff` + the stored MIME type (only PDF/JPEG/PNG are ever served — `readKybDocumentFile`
 * refuses anything else), a CSP that grants the document no script/plugin/frame capability and no
 * cross-origin framing, no referrer leakage of the route URL, and a same-origin resource policy.
 * The `sandbox` directive is deliberately NOT used: it would break Chrome's built-in PDF viewer.
 */
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'",
  "X-Frame-Options": "SAMEORIGIN",
} as const;

export async function GET(_request: Request, context: { params: Promise<{ applicationId: string; documentId: string }> }): Promise<Response> {
  const { applicationId, documentId } = await context.params;
  const file = await readKybDocumentFile({ applicationId, documentId });
  if (!file.ok) return new NextResponse(null, { status: 404, headers: PRIVATE_HEADERS });
  return new NextResponse(file.bytes.stream(), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": file.mimeType,
      "Content-Length": String(file.bytes.size),
      "Content-Disposition": contentDispositionInline(file.fileName),
    },
  });
}
