"use client";

import { startTransition, useActionState } from "react";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { mapCommerceError } from "@/lib/commerce/errors";
import { removeDestination, setDefaultDestination } from "@/src/app/dashboard/destinations/actions";

export function DestinationActions({ id, isDefault }: { id: string; isDefault: boolean }) {
  const { locale, tApp } = useLocale();
  const copy = tApp.commerce.destinationsUi;
  const [defaultState, makeDefault, settingDefault] = useActionState(setDefaultDestination, undefined);
  const [removeState, remove, removing] = useActionState(removeDestination, undefined);
  const dispatch = (action: (data: FormData) => void) => {
    const data = new FormData();
    data.set("id", id);
    startTransition(() => action(data));
  };
  const failure = defaultState && !defaultState.ok ? defaultState.code : removeState && !removeState.ok ? removeState.code : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isDefault ? <Button type="button" variant="outline" className="min-h-11" disabled={settingDefault || removing} onClick={() => dispatch(makeDefault)}>{copy.makeDefault}</Button> : null}
      <Button type="button" variant="text" className="min-h-11 text-destructive" disabled={settingDefault || removing} onClick={() => dispatch(remove)}>{removing ? copy.retiring : copy.retire}</Button>
      {defaultState?.ok ? <p role="status" className="w-full text-[length:var(--text-small)]">{copy.saved}</p> : null}
      {removeState?.ok ? <p role="status" className="w-full text-[length:var(--text-small)]">{copy.retired}</p> : null}
      {failure ? <p role="alert" className="w-full text-[length:var(--text-small)] text-destructive">{failure === "validation_error" ? copy.validation : mapCommerceError(failure, locale).message}</p> : null}
    </div>
  );
}
