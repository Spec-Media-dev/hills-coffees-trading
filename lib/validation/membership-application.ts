import { z } from "zod";

/**
 * Feature 003 T011 — membership application / onboarding input. Captures company identity, contact
 * information, intended activity, and consent — nothing else. `accountType` maps directly to the
 * two values `start_organization_onboarding` accepts (`lib/kyb/mutations.ts`); every
 * server/DB-owned field (status, ACTIVE, APPROVED, can_buy, can_sell, created_by, user_id,
 * member_role, any platform/compliance role) is deliberately NOT a field on this schema at all —
 * there is no client-facing input path for any of them.
 */

export const ONBOARDING_ACCOUNT_TYPES = ["BUYER", "SELLER"] as const;
export type OnboardingAccountType = (typeof ONBOARDING_ACCOUNT_TYPES)[number];

const OnboardingConsent = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.literal(true, { error: "You must confirm this before continuing." })
);

export const MembershipApplicationInput = z.object({
  legalName: z
    .string({ error: "Enter your company's legal name." })
    .trim()
    .min(1, "Enter your company's legal name.")
    .max(200, "Keep this under 200 characters."),

  displayName: z.string().trim().max(200, "Keep this under 200 characters.").optional().or(z.literal("")),

  accountType: z.enum(ONBOARDING_ACCOUNT_TYPES, {
    error: "Choose Buy Coffee or Buy & Sell Coffee.",
  }),

  countryCode: z
    .string({ error: "Choose your country." })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Choose a valid country."),

  taxNumber: z.string().trim().max(120, "Keep this under 120 characters.").optional().or(z.literal("")),
  registrationNumber: z.string().trim().max(120, "Keep this under 120 characters.").optional().or(z.literal("")),

  contactEmail: z
    .string()
    .trim()
    .max(254, "Email is too long.")
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("")),
  contactPhone: z.string().trim().max(40, "Keep this under 40 characters.").optional().or(z.literal("")),

  consent: OnboardingConsent,
});
export type MembershipApplicationInput = z.infer<typeof MembershipApplicationInput>;
export type MembershipApplicationFormInput = z.input<typeof MembershipApplicationInput>;
