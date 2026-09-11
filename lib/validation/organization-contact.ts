import { z } from "zod";

/**
 * Feature 003 T026 — shared Zod schema for `update_organization_contact`. Field names/types map 1:1
 * to the RPC's three editable parameters: `p_display_name`, `p_email`, `p_phone` (confirmed against
 * the live schema report; `p_organization_id` is never client-supplied — the Server Action derives
 * it from the fresh acting organization). No field this schema does not name is ever sent to the RPC
 * — in particular, `status`/`account_type`/`can_buy`/`can_sell`/`is_hills_internal`/`created_by` have
 * no field here at all, because the RPC itself accepts no such parameter to receive them through.
 */
export const OrganizationContactInput = z.object({
  displayName: z.string().max(200, "Keep this under 200 characters.").optional().or(z.literal("")),
  email: z.string().trim().max(254, "Email is too long.").email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().max(40, "Keep this under 40 characters.").optional().or(z.literal("")),
});

export type OrganizationContactInput = z.infer<typeof OrganizationContactInput>;
