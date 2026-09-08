/**
 * `ServerActionResult<T>` — data-model.md's shared return shape for every Server Action in this
 * codebase (contracts/server-action-contract.md). A Server Action never throws a raw error to the
 * client and never returns `undefined` on failure; it always resolves to one of these two shapes.
 *
 * `error` is always a safe, human-readable string — never a raw Postgres/Supabase error message,
 * a stack trace, or a credential (FR-013, FR-027). `fieldErrors` is present only for validation
 * failures and mirrors Zod's `flatten().fieldErrors` shape.
 */
export type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
