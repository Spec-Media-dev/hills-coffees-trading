"use server";

import { revalidatePath } from "next/cache";

import { checkAreaAccess } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_IMAGE_MIME_TYPES, AVATAR_MAX_BYTES } from "@/lib/validation/account-security";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 T047 — platform logo upload/remove. `is_platform_admin()`-only, re-verified live via
 * `checkAreaAccess("branding")` (the SAME per-area guard every other Operations Console write already
 * uses — never a client-supplied role). Genuinely blocked on the unapplied migration this run
 * (`set_platform_logo`/`remove_platform_logo` do not exist in the live database yet) — real, correct
 * code, honest `AVATAR_UPDATE_FAILED`-class failure until then, never a fabricated success. Same
 * DB-writes/Storage-I/O split as `uploadMyAvatar` (`src/app/dashboard/settings/actions.ts`): the RPC
 * only updates `platform_settings.logo_object_path` and returns the OLD path; this action performs
 * the Storage upload and old-object cleanup.
 */
export async function uploadPlatformLogo(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  const access = await checkAreaAccess("branding");
  if (!access.ok) {
    return { ok: false, code: ACTION_FEEDBACK.ADMIN_FORBIDDEN };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { logo: ["Required"] } };
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number]) || file.size > AVATAR_MAX_BYTES) {
    return { ok: false, code: ACTION_FEEDBACK.AVATAR_INVALID_FILE };
  }

  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const objectPath = `branding/logo-${Date.now()}${extension}`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage.from("public-assets").upload(objectPath, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { ok: false, code: ACTION_FEEDBACK.AVATAR_UPDATE_FAILED };
  }

  const { data: oldPath, error: rpcError } = await supabase.rpc("set_platform_logo", { p_object_path: objectPath });
  if (rpcError) {
    await supabase.storage.from("public-assets").remove([objectPath]).catch(() => undefined);
    return { ok: false, code: ACTION_FEEDBACK.AVATAR_UPDATE_FAILED };
  }
  if (typeof oldPath === "string" && oldPath.length > 0 && oldPath !== objectPath) {
    await supabase.storage.from("public-assets").remove([oldPath]).catch(() => undefined);
  }

  revalidatePath("/dashboard-admin/branding");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.AVATAR_UPDATED };
}

/** Takes no real input — `useActionState` still requires the (prevState, formData) signature. */
export async function removePlatformLogo(prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  void prevState;
  void formData;
  const access = await checkAreaAccess("branding");
  if (!access.ok) {
    return { ok: false, code: ACTION_FEEDBACK.ADMIN_FORBIDDEN };
  }

  const supabase = await createClient();
  const { data: oldPath, error } = await supabase.rpc("remove_platform_logo");
  if (error) {
    return { ok: false, code: ACTION_FEEDBACK.AVATAR_UPDATE_FAILED };
  }
  if (typeof oldPath === "string" && oldPath.length > 0) {
    await supabase.storage.from("public-assets").remove([oldPath]).catch(() => undefined);
  }

  revalidatePath("/dashboard-admin/branding");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.AVATAR_REMOVED };
}
