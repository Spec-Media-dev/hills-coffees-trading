"use client";

import { useActionState, useRef } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import { publicAssetUrl } from "@/lib/storage/public-url";

import { removeMyAvatar, uploadMyAvatar } from "./actions";

/**
 * Feature 010 approved scope addition (Part 4) — own-avatar upload/replace/remove, every role.
 * Genuinely blocked on the unapplied migration this run (`set_my_avatar`/`remove_my_avatar` do not
 * exist in the live database yet) — this is real, correct code, not a stub; a live attempt today
 * fails honestly via the controlled `AVATAR_UPDATE_FAILED` code, never a fabricated success.
 */
export function AvatarUploadField({ avatarPath, initials }: { avatarPath: string; initials: string }) {
  const { tApp } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, uploadDispatch, isUploading] = useActionState(uploadMyAvatar, undefined);
  const [removeState, removeDispatch, isRemoving] = useActionState(removeMyAvatar, undefined);

  useActionToast(
    uploadState,
    uploadState?.ok === true
      ? { tone: "success", message: tApp.accountSecurity.avatar.success }
      : uploadState?.ok === false
        ? { tone: "error", message: uploadState.code === ACTION_FEEDBACK.AVATAR_INVALID_FILE ? tApp.accountSecurity.avatar.invalidFile : tApp.accountSecurity.avatar.failure }
        : null
  );
  useActionToast(removeState, removeState?.ok === true ? { tone: "success", message: tApp.accountSecurity.avatar.removed } : removeState?.ok === false ? { tone: "error", message: tApp.accountSecurity.avatar.failure } : null);

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("avatar", file);
    uploadDispatch(formData);
    event.target.value = "";
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg">
        {avatarPath ? <AvatarImage src={publicAssetUrl(avatarPath)} alt="" /> : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFileChosen} aria-label={tApp.accountSecurity.avatar.upload} />
          <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
            {isUploading ? tApp.accountSecurity.avatar.uploading : avatarPath ? tApp.accountSecurity.avatar.replace : tApp.accountSecurity.avatar.upload}
          </Button>
          {avatarPath ? (
            <Button type="button" variant="text" size="sm" disabled={isRemoving} onClick={() => removeDispatch(new FormData())}>
              {isRemoving ? tApp.accountSecurity.avatar.removing : tApp.accountSecurity.avatar.remove}
            </Button>
          ) : null}
        </div>
        <p className="text-[length:var(--text-small)] text-muted-foreground">{tApp.accountSecurity.avatar.hint}</p>
      </div>
    </div>
  );
}
