import { z } from "zod";

/**
 * Shared Zod schema for the update_my_profile proof mutation. Used by both the client-side form
 * (React Hook Form + @hookform/resolvers/zod, for inline UX errors) and the Server Action itself
 * (the enforced gate). Field names/types map 1:1 to update_my_profile's four parameters:
 * p_full_name, p_phone, p_company_name, p_avatar_path (data-model.md, research.md §6).
 *
 * No field this schema does not name is ever sent to the RPC.
 */
export const MyProfileInput = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(40).optional(),
  companyName: z.string().max(200).optional(),
  avatarPath: z.string().max(500).optional(),
});

export type MyProfileInput = z.infer<typeof MyProfileInput>;
