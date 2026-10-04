"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { InlineAlert } from "@/components/ui/inline-alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { CoffeeWorkflowState } from "@/lib/admin/catalogue";
import { attachMediaAction, removeMediaAction, setPrimaryMediaAction } from "@/src/app/dashboard-admin/(catalogue)/coffees/workflow-actions";

import { fieldMessage, StepSection, useWorkflowAction, WorkflowNotice } from "./workflow-shared";

/**
 * Feature 018 — catalogue images. Every operation carries the Coffee revision and its own stable intent key. The
 * upload is one intent: the stored object path derives from the key, so a retry after an uncertain result targets the same
 * object and the same database row instead of creating a second image. A recorded image whose stored file is missing is
 * shown as broken (and blocks publication) rather than hidden.
 */
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 12;

export function MediaStep({ workflow, onSaved }: { workflow: CoffeeWorkflowState; onSaved: () => void }) {
  const { coffee, media } = workflow;
  const { tApp } = useLocale();
  const fileInput = useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const attach = useWorkflowAction({ action: attachMediaAction, success: (result, c) => (result.cleanup === "PENDING" ? c.media.cleanupPending : c.toasts.mediaAdded), onSuccess: () => { if (fileInput.current) fileInput.current.value = ""; onSaved(); } });
  const primary = useWorkflowAction({ action: setPrimaryMediaAction, success: (_r, c) => c.toasts.primarySet, onSuccess: onSaved });
  const remove = useWorkflowAction({ action: removeMediaAction, success: (result, c) => (result.cleanup === "PENDING" ? c.media.cleanupPending : c.toasts.mediaRemoved), onSuccess: onSaved });
  const copy = attach.copy;
  const m = copy.media;
  const full = media.length >= MAX_IMAGES;
  const hasPrimary = media.some((row) => row.isPrimary && row.imageUrl);

  const onPick = (file: File | undefined) => {
    setClientError(null);
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type) || file.size > MAX_BYTES || file.size === 0) {
      setClientError(copy.errors.MEDIA_INVALID);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    const data = new FormData();
    data.set("coffeeId", coffee.id);
    data.set("revision", String(coffee.revision));
    data.set("image", file);
    attach.submit(data);
  };

  const mediaAction = (kind: "primary" | "remove", mediaId: string) => {
    const data = new FormData();
    data.set("coffeeId", coffee.id);
    data.set("revision", String(coffee.revision));
    data.set("mediaId", mediaId);
    (kind === "primary" ? primary : remove).submit(data);
  };

  return (
    <StepSection heading={m.heading} lead={m.lead}>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileInput} id="coffee-media-input" type="file" accept={ACCEPT} className="sr-only" disabled={attach.pending || full} onChange={(event) => onPick(event.currentTarget.files?.[0])} aria-describedby="coffee-media-hint" />
        <Button type="button" variant="secondary" disabled={attach.pending || full} data-state={attach.pending ? "loading" : undefined} onClick={() => fileInput.current?.click()}>
          <Icon name="plus" aria-hidden="true" />
          {attach.pending ? m.uploading : m.upload}
        </Button>
        <p id="coffee-media-hint" className="text-[length:var(--text-micro)] text-muted-foreground">{m.uploadHint}</p>
      </div>
      {clientError || fieldMessage(copy, attach.state, "image") ? <p role="alert" className="hc-meta text-destructive">{clientError ?? fieldMessage(copy, attach.state, "image")}</p> : null}
      <WorkflowNotice result={attach.state} requestId={attach.requestId} coffeeId={coffee.id} />
      <WorkflowNotice result={primary.state} requestId={primary.requestId} coffeeId={coffee.id} />
      <WorkflowNotice result={remove.state} requestId={remove.requestId} coffeeId={coffee.id} />

      {media.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] px-6 py-10 text-center" data-media-empty>
          <Icon name="file" className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-heading text-[length:var(--text-h5)] font-semibold text-foreground">{m.empty}</p>
          <p className="max-w-[48ch] text-[length:var(--text-small)] text-muted-foreground">{m.emptyBody}</p>
        </div>
      ) : (
        <>
          {!hasPrimary ? <InlineAlert tone="warning" title={m.noPrimary} /> : null}
          <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3" data-media-grid>
            {media.map((row, index) => (
              <li key={row.id} className="group flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-[var(--surface-card)]" data-media-id={row.id}>
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--surface-subtle)]">
                  {row.imageUrl ? (
                    <Image src={row.imageUrl} alt={m.imageAlt.replace("{index}", String(index + 1))} fill sizes="(min-width: 1024px) 280px, (min-width: 420px) 45vw, 90vw" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground"><Icon name="alert-circle" className="size-6" aria-hidden="true" /></div>
                  )}
                  {row.isPrimary ? (
                    <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--status-paid-surface)] px-2 py-0.5 text-[length:var(--text-micro)] font-semibold text-[var(--status-paid)] shadow-[var(--shadow-sm)]" data-media-primary>
                      <Icon name="check" className="size-3" aria-hidden="true" />
                      {m.primary}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <p className="min-w-0 truncate text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">{row.file?.originalName ?? tApp.admin.catalogue.common.none}</p>
                  <div className="flex items-center gap-1">
                    {!row.isPrimary ? (
                      <Button type="button" size="sm" variant="outline" disabled={primary.pending} onClick={() => mediaAction("primary", row.id)}>{m.makePrimary}</Button>
                    ) : null}
                    <Button type="button" size="sm" variant="text" disabled={remove.pending} onClick={() => setRemoving(row.id)}>{m.remove}</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.removeTitle}</AlertDialogTitle>
            <AlertDialogDescription>{m.removeBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={remove.pending} onClick={(event) => { event.preventDefault(); if (removing) mediaAction("remove", removing); setRemoving(null); }}>{m.remove}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StepSection>
  );
}
