import { z } from "zod";

/**
 * Feature 010 RUN F010-ACCOUNT-MEDIA — self-service account-security schemas, shared by the
 * in-session `changeMyPassword` form (every role) and the ADMIN/SUPER_ADMIN-only `changeMyEmail`
 * form. Same "one schema file, imported by both the client form and the Server Action" contract
 * `lib/validation/my-profile.ts`/`reset-password.ts` already establish.
 */
export const ChangeMyPasswordInput = z
  .object({
    password: z.string({ error: "Enter a new password." }).min(8, "Use at least 8 characters."),
    confirmPassword: z.string({ error: "Confirm your new password." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Those passwords don't match.",
    path: ["confirmPassword"],
  });
export type ChangeMyPasswordInput = z.infer<typeof ChangeMyPasswordInput>;

/** ADMIN/SUPER_ADMIN own-email change only — see `changeMyEmail`'s own authorization check. */
export const ChangeMyEmailInput = z.object({
  newEmail: z.string({ error: "Enter a new email address." }).trim().min(1).max(254).email("Enter a valid email address."),
});
export type ChangeMyEmailInput = z.infer<typeof ChangeMyEmailInput>;

/**
 * Shared image-upload limits — the SAME values the `public-assets`/`listing-media` Storage buckets
 * themselves enforce (`file_size_limit`/`allowed_mime_types` in the migration), duplicated here ONLY
 * so client-side and Server Action validation can give an immediate, specific error before ever
 * reaching Storage — Storage's own limit is still the enforced boundary regardless of this check.
 */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const LISTING_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
