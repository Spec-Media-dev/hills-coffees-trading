"use client";

import Image from "next/image";
import { startTransition, useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import { publicAssetUrl } from "@/lib/storage/public-url";

import { removePlatformLogo, uploadPlatformLogo } from "./actions";

/** Feature 010 T047 — admin logo upload/replace/remove. Same shape as `AvatarUploadField`, admin-only. */
export function LogoUploadField({ logoPath }: { logoPath: string | null }) {
  const { tApp } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, uploadDispatch, isUploading] = useActionState(uploadPlatformLogo, undefined);
  const [removeState, removeDispatch, isRemoving] = useActionState(removePlatformLogo, undefined);

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
    formData.set("logo", file);
    startTransition(() => uploadDispatch(formData));
    event.target.value = "";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-24 w-48 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)]">
        {logoPath ? (
          <Image src={publicAssetUrl(logoPath)} alt="" width={160} height={64} className="max-h-16 w-auto object-contain" unoptimized />
        ) : (
          <span className="text-[length:var(--text-small)] text-muted-foreground">{tApp.admin.branding.logo.defaultLogoNote}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFileChosen} aria-label={tApp.accountSecurity.avatar.upload} />
        <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
          {isUploading ? tApp.accountSecurity.avatar.uploading : logoPath ? tApp.accountSecurity.avatar.replace : tApp.accountSecurity.avatar.upload}
        </Button>
        {logoPath ? (
          <Button type="button" variant="text" size="sm" disabled={isRemoving} onClick={() => startTransition(() => removeDispatch(new FormData()))}>
            {isRemoving ? tApp.accountSecurity.avatar.removing : tApp.accountSecurity.avatar.remove}
          </Button>
        ) : null}
      </div>
      <p className="text-[length:var(--text-small)] text-muted-foreground">{tApp.accountSecurity.avatar.hint}</p>
    </div>
  );
}
