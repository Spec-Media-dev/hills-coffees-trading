import { z } from "zod";

/**
 * Shared RFQ / commercial-inquiry Zod schema (Feature 002 T019 — `contracts/rfq-contract.md` §2).
 *
 * ONE schema, imported by both the client form (`components/public/rfq-form.tsx`, for inline UX
 * errors via `@hookform/resolvers/zod`) and the Server Action (`src/app/(public)/contact/actions.ts`,
 * the enforced gate — client validation is UX only). Field set, required/optional state and every
 * length limit are copied verbatim from the contract's §2 table; nothing here is invented.
 *
 * Format validation only for `contactEmail` — the contract is explicit that no authoritative source
 * approves any stricter domain policy (§2 "Explicitly NOT specified").
 *
 * Length limits are part of the abuse posture (§4), not merely UI polish: the Server Action rejects
 * over-length input before any other processing, bounding the request body an anonymous endpoint
 * will parse.
 */

export const RFQ_BUYER_TYPES = ["roaster", "importer", "distributor", "other"] as const;
export type RfqBuyerType = (typeof RFQ_BUYER_TYPES)[number];

/**
 * The sentinel `submitRfq` returns for a genuinely valid submission (`contracts/rfq-contract.md`
 * §3). Lives here rather than in `actions.ts` because a `"use server"` file may export ONLY async
 * functions — any other export (a constant, a type) fails at request time with "A 'use server' file
 * can only export async functions, found string", not at build time, which is what makes this easy
 * to miss without a real end-to-end submission test.
 */
export const RFQ_UNAVAILABLE = "unavailable" as const;

/**
 * FormData delivers `"on"`/`"true"` for a checked checkbox and nothing at all for an unchecked one;
 * React Hook Form delivers a real boolean. `preprocess` normalises both to a strict `true`-or-fail
 * check so an unchecked/omitted box is always a validation failure, never a silently-accepted falsy.
 */
const RfqConsent = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.literal(true, { error: "You must consent before this request can be sent." })
);

export const RfqInput = z.object({
  companyName: z
    .string({ error: "Enter your company name." })
    .trim()
    .min(1, "Enter your company name.")
    .max(200, "Company name is too long."),

  buyerType: z.enum(RFQ_BUYER_TYPES, { error: "Choose the option closest to your business." }),

  countryCode: z
    .string({ error: "Choose your country." })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Choose a valid country."),

  estimatedVolumeKg: z.coerce
    .number({ error: "Enter an estimated volume in kilograms." })
    .positive("Enter an estimated volume greater than zero.")
    .max(100_000_000, "Enter a realistic estimated volume."),

  coffeePreference: z.string().trim().max(200, "Keep this under 200 characters.").optional().or(z.literal("")),
  timing: z.string().trim().max(120, "Keep this under 120 characters.").optional().or(z.literal("")),
  deliveryLocation: z
    .string()
    .trim()
    .max(200, "Keep this under 200 characters.")
    .optional()
    .or(z.literal("")),
  incoterm: z.string().trim().max(20, "Keep this under 20 characters.").optional().or(z.literal("")),

  contactName: z
    .string({ error: "Enter your name." })
    .trim()
    .min(1, "Enter your name.")
    .max(120, "Name is too long."),

  contactEmail: z
    .string({ error: "Enter a valid email address." })
    .trim()
    .max(254, "Email is too long.")
    .email("Enter a valid email address."),

  contactPhone: z.string().trim().max(40, "Keep this under 40 characters.").optional().or(z.literal("")),

  message: z.string().trim().max(2000, "Keep this under 2000 characters.").optional().or(z.literal("")),

  consent: RfqConsent,

  // Attribution (§2 "Attribution") — best-effort, never required, never used to identify or track an
  // individual beyond the submission itself. Captured client-side and carried in the payload shape
  // so an approved destination can consume it the day one exists (§1).
  referrer: z.string().trim().max(500).optional().or(z.literal("")),
  landingPath: z.string().trim().max(500).optional().or(z.literal("")),
  utmSource: z.string().trim().max(100).optional().or(z.literal("")),
  utmMedium: z.string().trim().max(100).optional().or(z.literal("")),
  utmCampaign: z.string().trim().max(100).optional().or(z.literal("")),
});

export type RfqInput = z.infer<typeof RfqInput>;

/**
 * The pre-transform (input) shape — what React Hook Form actually holds before `RfqInput.parse`
 * coerces `estimatedVolumeKg` to a number and normalises `consent`. `useForm` is typed against this,
 * not the output type, so register()'d DOM values (always strings/booleans) satisfy it.
 */
export type RfqFormInput = z.input<typeof RfqInput>;
