import { z } from "zod";

/**
 * Feature 010 RUN B — compliance decision input contracts. Vocabularies are the database's own
 * CHECK constraints, verbatim (`kyb_reviews_decision_check`, `listing_reviews_decision_check`,
 * `organizations_status_check`), never a console-invented synonym.
 */

export const KYB_DECISIONS = ["APPROVED", "REJECTED", "RESUBMISSION_REQUIRED", "SUSPENDED"] as const;
export type KybDecision = (typeof KYB_DECISIONS)[number];

/** Decisions that MUST carry an operator-entered reason (spec PS2 scenario 4). */
export const KYB_DECISIONS_REQUIRING_REASON: readonly KybDecision[] = ["REJECTED", "RESUBMISSION_REQUIRED", "SUSPENDED"];

export const LISTING_DECISIONS = ["APPROVED", "REJECTED", "SUSPENDED"] as const;
export type ListingDecision = (typeof LISTING_DECISIONS)[number];
export const LISTING_DECISIONS_REQUIRING_REASON: readonly ListingDecision[] = ["REJECTED", "SUSPENDED"];

export const ORGANIZATION_STATUS_TARGETS = ["SUSPENDED", "ACTIVE"] as const;
export type OrganizationStatusTarget = (typeof ORGANIZATION_STATUS_TARGETS)[number];

export const REASON_MIN_LENGTH = 5;
export const REASON_MAX_LENGTH = 2000;

const uuid = z.string().uuid();
const reason = z
  .string()
  .trim()
  .max(REASON_MAX_LENGTH, "REASON_TOO_LONG")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

function requireReasonFor<T extends string>(required: readonly T[]) {
  return (input: { decision: T; reason?: string }, ctx: z.RefinementCtx) => {
    if (required.includes(input.decision) && (!input.reason || input.reason.length < REASON_MIN_LENGTH)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "REASON_REQUIRED" });
    }
  };
}

export const KybDecisionInput = z
  .object({ applicationId: uuid, decision: z.enum(KYB_DECISIONS), reason })
  .superRefine(requireReasonFor(KYB_DECISIONS_REQUIRING_REASON));
export type KybDecisionInput = z.infer<typeof KybDecisionInput>;

export const KybStartReviewInput = z.object({ applicationId: uuid });

export const ListingDecisionInput = z
  .object({ offerId: uuid, decision: z.enum(LISTING_DECISIONS), reason })
  .superRefine(requireReasonFor(LISTING_DECISIONS_REQUIRING_REASON));
export type ListingDecisionInput = z.infer<typeof ListingDecisionInput>;

export const OrganizationStatusInput = z
  .object({ organizationId: uuid, status: z.enum(ORGANIZATION_STATUS_TARGETS), reason })
  .superRefine((input, ctx) => {
    if (!input.reason || input.reason.length < REASON_MIN_LENGTH) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "REASON_REQUIRED" });
    }
  });
export type OrganizationStatusInput = z.infer<typeof OrganizationStatusInput>;

/**
 * Feature 010 RUN E — document-level review through Feature 003's `create_kyb_review` RPC. The
 * decision vocabulary is `kyb_review_items.decision`'s own CHECK (`ACCEPTED` / `REJECTED`); a
 * rejection requires a reason (the RPC itself raises `reason_required_for_rejection` otherwise).
 */
export const KYB_DOCUMENT_DECISIONS = ["ACCEPTED", "REJECTED"] as const;
export type KybDocumentDecision = (typeof KYB_DOCUMENT_DECISIONS)[number];

export const KybDocumentReviewInput = z
  .object({ applicationId: uuid, documentId: uuid, decision: z.enum(KYB_DOCUMENT_DECISIONS), reason })
  .superRefine((input, ctx) => {
    if (input.decision === "REJECTED" && (!input.reason || input.reason.length < REASON_MIN_LENGTH)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "REASON_REQUIRED" });
    }
  });
export type KybDocumentReviewInput = z.infer<typeof KybDocumentReviewInput>;
