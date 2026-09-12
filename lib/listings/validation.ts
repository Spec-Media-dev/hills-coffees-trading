import { z } from "zod";

/**
 * Feature 006 T006 — Zod schemas for listing create/edit, following the SAME convention
 * `lib/validation/kyb-application.ts` already established (per-field safe error messages, `.trim()`,
 * bounded lengths, no raw DB/type errors reaching the caller).
 *
 * SCHEMA PREFLIGHT (2026-09-12, against the live `coffee_offers` CHECK constraints) — every field
 * below validates a REAL, existing column; nothing here is speculative:
 *
 *   - `coffee_offers_quantity_kg_check`: `quantity_kg > 0`
 *   - `coffee_offers_price_per_kg_check`: `price_per_kg >= 0` (this schema requires STRICTLY positive
 *     — a free listing is not a real commercial offer, and the run directive asks for "positive
 *     price"; the DB itself is more permissive at `>= 0`, so this is a stricter, safe, defense-in-depth
 *     application rule, never a WEAKER one than the database).
 *   - `coffee_offers_currency_check`: `currency = 'USD'` — literally the ONLY value the live schema
 *     currently allows. `LISTING_CURRENCIES` is a closed one-element vocabulary for exactly that
 *     reason — not an arbitrary narrowing, a reflection of the actual CHECK constraint. Do not add a
 *     second currency here without confirming the constraint has actually changed.
 *   - `title`: nullable in the schema (`coffee_offers.title` is nullable), bounded when present.
 *   - `coffee_id`/`lot_id`/`warehouse_id`/`warehouse_location_id`: UUID shape only — VALIDATION IS NOT
 *     AUTHORIZATION (this file's own rule, restated): a well-formed UUID here proves nothing about
 *     ownership/eligibility. `lib/listings/eligibility.ts` is the ONLY place that decides whether a
 *     given reference may actually be used, and `validate_offer_transition` is the final authority
 *     regardless of what this schema accepts.
 *
 * FORM-STANDARD COMPATIBILITY: these schemas are written to be usable directly with React Hook Form's
 * `zodResolver` (the project's established form stack — see `components/account/kyb-draft-form.tsx`
 * for the existing pattern this will follow once Phase 4 builds the actual form), even though RUN A
 * builds no form UI itself.
 */

export const LISTING_CURRENCIES = ["USD"] as const;
export type ListingCurrency = (typeof LISTING_CURRENCIES)[number];

const uuid = (fieldLabel: string) => z.uuid({ error: `Choose a valid ${fieldLabel}.` });

/**
 * Feature 006 RUN B (T013/T014) — the FORM-FACING schema the seller's create page actually collects.
 * Deliberately narrower than `ListingCreateInput` below: it carries `positionId` (which inventory
 * position the seller picked) instead of `coffeeId`/`lotId`/`warehouseId`/`warehouseLocationId`
 * directly — those provenance fields are NEVER client-supplied (the run directive's own explicit
 * rule); the Server Action re-reads them server-side from the position itself via
 * `getInventoryPositionById`, so this schema does not even offer a field for the client to submit
 * them in. `zodResolver`-compatible (React Hook Form), matching `KybDraftInput`'s established pattern.
 */
export const ListingCreateFormInput = z.object({
  positionId: uuid("inventory position"),
  // Deliberately NOT `.transform()`-ed to `string | null` here (unlike `ListingCreateInput` below) —
  // the transform's INPUT/OUTPUT type split does not play well with `useForm`'s single generic; the
  // component itself already treats an empty string as "omit the field" when building `FormData`.
  title: z.string().trim().max(200, "Keep the title under 200 characters.").optional(),
  quantityKg: z.coerce
    .number({ error: "Enter a quantity." })
    .positive("Quantity must be greater than zero.")
    .finite("Enter a valid quantity."),
  pricePerKg: z.coerce
    .number({ error: "Enter a price per kg." })
    .positive("Price per kg must be greater than zero.")
    .finite("Enter a valid price."),
  currency: z.enum(LISTING_CURRENCIES, { error: "Choose a supported currency." }),
});
export type ListingCreateFormInput = z.infer<typeof ListingCreateFormInput>;

export const ListingCreateInput = z.object({
  title: z
    .string()
    .trim()
    .max(200, "Keep the title under 200 characters.")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),

  coffeeId: uuid("coffee"),
  lotId: uuid("lot"),
  warehouseId: uuid("warehouse"),
  warehouseLocationId: uuid("warehouse location").optional().nullable(),

  quantityKg: z.coerce
    .number({ error: "Enter a quantity." })
    .positive("Quantity must be greater than zero.")
    .finite("Enter a valid quantity."),

  pricePerKg: z.coerce
    .number({ error: "Enter a price per kg." })
    .positive("Price per kg must be greater than zero.")
    .finite("Enter a valid price."),

  currency: z.enum(LISTING_CURRENCIES, { error: "Choose a supported currency." }),

  sensoryNotes: z
    .object({
      aroma: z.string().trim().max(500).optional().nullable(),
      flavor: z.string().trim().max(500).optional().nullable(),
      acidity: z.string().trim().max(500).optional().nullable(),
      body: z.string().trim().max(500).optional().nullable(),
      finish: z.string().trim().max(500).optional().nullable(),
      notes: z.string().trim().max(2000).optional().nullable(),
    })
    .optional(),
});
export type ListingCreateInput = z.infer<typeof ListingCreateInput>;

/**
 * Edit input is deliberately NARROWER than create: `validate_offer_transition`'s own
 * `listing_provenance_is_locked` rule forbids changing `lot_id`/`coffee_id`/`seller_organization_id`/
 * `warehouse_id`/`warehouse_location_id`/`source_purchase_order_item_id` once a listing has left
 * `DRAFT` — this schema does not even offer those fields for edit, so a future form built against it
 * cannot accidentally submit a provenance change the database would refuse anyway.
 */
export const ListingEditInput = z.object({
  title: z
    .string()
    .trim()
    .max(200, "Keep the title under 200 characters.")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),

  quantityKg: z.coerce.number({ error: "Enter a quantity." }).positive("Quantity must be greater than zero.").finite("Enter a valid quantity."),

  pricePerKg: z.coerce.number({ error: "Enter a price per kg." }).positive("Price per kg must be greater than zero.").finite("Enter a valid price."),

  currency: z.enum(LISTING_CURRENCIES, { error: "Choose a supported currency." }),
});
export type ListingEditInput = z.infer<typeof ListingEditInput>;
