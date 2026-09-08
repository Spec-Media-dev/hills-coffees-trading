# Contract: Server Action Convention

Governs FR-011–FR-013, FR-018; Platform Story 3. Every sensitive Server Action in this codebase —
starting with this feature's `updateMyProfile` proof — follows this shape. A future agent adding a
new mutation copies this file's pattern rather than inventing one.

## The six steps, in order

```ts
"use server"

export async function myAction(
  prevState: ServerActionResult<Out> | undefined,
  formData: FormData
): Promise<ServerActionResult<Out>> {
  // 1. VALIDATE — Zod parses FormData into a typed shape. Return field errors immediately;
  //    never touch auth or the database on invalid input.
  const parsed = MyInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors }
  }

  // 2. AUTHENTICATE — resolve identity fresh, this request. Never trust a client-supplied user id.
  const identity = await getRequestIdentity()
  if (identity.kind !== "authenticated") {
    return { ok: false, error: "You need to sign in to do that." }
  }

  // 3. AUTHORIZE — check whatever this specific action requires (capability/role/org state).
  //    For updateMyProfile: no further check — every authenticated user may update their own profile.
  //    A seller-only action would check `identity.organization?.canSell` here instead.

  // 4. CONTROLLED DATA ACCESS — call an approved DB function/RPC via the request-scoped server
  //    client. Never construct raw SQL from user input. Never use a privileged/service-role client.
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc("update_my_profile", { p_full_name: parsed.data.fullName, /* ... */ })

  // 5. SAFE ERROR MAPPING — never return `error.message` from Supabase/Postgres verbatim.
  if (error) {
    return { ok: false, error: "That didn't save — please try again." }
  }

  // 6. REVALIDATE — invalidate only the affected, non-shared cache entries (never a public/shared
  //    cache key for this user-scoped write).
  revalidatePath("/dashboard/settings")
  return { ok: true, data: /* minimal DTO, not the raw row */ }
}
```

## Rules

- Steps run in this order, every time. A later step never runs after an earlier one fails.
- The return type is always `ServerActionResult<T>` (data-model.md) — never a thrown error surfaced
  to the client, never `undefined` on failure.
- No step logs a password, token, service-role key, or raw database error (FR-013, FR-027).
- No Server Action in this feature touches inventory, listings, orders, payments, settlement, or
  KYB tables — those are later features' Server Actions, following this same shape.
- A Server Action never re-implements a check the database already enforces (e.g., it does not
  hand-roll "is this org active" when `organization_can_buy`/`organization_can_sell` already answer
  that) — it calls the approved function and trusts its answer.
