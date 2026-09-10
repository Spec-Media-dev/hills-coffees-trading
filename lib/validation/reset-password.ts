import { z } from "zod";

/** Feature 003 T008 — password reset request. Format-only; never a source of account-existence signal. */
export const ResetPasswordRequestInput = z.object({
  email: z.string({ error: "Enter your email address." }).trim().min(1).max(254).email("Enter a valid email address."),
});
export type ResetPasswordRequestInput = z.infer<typeof ResetPasswordRequestInput>;

/** Feature 003 T008 — password reset completion (new password + confirmation). */
export const ResetPasswordConfirmInput = z
  .object({
    password: z.string({ error: "Enter a new password." }).min(8, "Use at least 8 characters."),
    confirmPassword: z.string({ error: "Confirm your new password." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Those passwords don't match.",
    path: ["confirmPassword"],
  });
export type ResetPasswordConfirmInput = z.infer<typeof ResetPasswordConfirmInput>;
