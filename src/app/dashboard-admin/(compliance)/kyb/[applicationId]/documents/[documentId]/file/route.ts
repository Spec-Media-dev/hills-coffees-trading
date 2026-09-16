import { NextResponse } from "next/server";

import { contentDispositionInline, readKybDocumentFile } from "@/lib/admin/kyb-documents";

/**
 * Feature 010 RUN E — `GET /dashboard-admin/kyb/[applicationId]/documents/[documentId]/file`:
 * streams one KYB evidence file to an authorized reviewer through their own session
 * (`lib/admin/kyb-documents.ts`). Every request re-authorizes; nothing is cached anywhere; a refusal
 * is an empty 404 (never a distinguishable 403 that would confirm a document exists). Non-indexable.
 */
export const dynamic = "force-dynamic";

const NOT_FOUND_HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } as const;

export async function GET(_request: Request, context: { params: Promise<{ applicationId: string; documentId: string }> }): Promise<Response> {
  const { applicationId, documentId } = await context.params;
  const file = await readKybDocumentFile({ applicationId, documentId });
  if (!file.ok) return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
  return new NextResponse(file.bytes.stream(), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.bytes.size),
      "Content-Disposition": contentDispositionInline(file.fileName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
