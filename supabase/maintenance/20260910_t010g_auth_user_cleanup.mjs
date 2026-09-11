/**
 * T010g one-time Auth Admin cleanup.
 *
 * Run ONLY after `20260910_t010g_fixture_cleanup.sql` commits successfully, and before the final
 * read-only verification SQL. It bans the two immutable audit principals and deletes only the one
 * audit-unreferenced Auth identity. This file is outside every application/runtime import path.
 *
 * Required ambient environment variables (values are never logged):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   T010G_FIXTURE_CLEANUP_CONFIRM=t010g-verify-1789077219872
 *
 * This script accepts no arguments. Its two ban targets and sole delete target are hardcoded.
 * It has not been executed.
 */

import { createClient } from "@supabase/supabase-js";

const FIXTURE_TAG = "t010g-verify-1789077219872";
const RETAINED_AUDIT_PRINCIPALS = Object.freeze([
  Object.freeze({ id: "237cf526-339f-4063-bda8-a40f28364e2b", label: "retained audit principal 1" }),
  Object.freeze({ id: "b74ebe9f-080d-4b20-a509-22f841ec1736", label: "retained audit principal 2" }),
]);
const DELETE_TARGET = Object.freeze({
  id: "eb4dac8e-7fc3-4e0c-a090-17552046e536",
  label: "audit-unreferenced fixture user",
});
// Installed @supabase/auth-js documents this exact 100-year duration for admin user bans.
const BAN_DURATION = "876000h";

function requireEnvironment(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error("This maintenance script accepts no command-line arguments.");
  }

  const confirmation = requireEnvironment("T010G_FIXTURE_CLEANUP_CONFIRM");
  if (confirmation !== FIXTURE_TAG) {
    throw new Error("T010G_FIXTURE_CLEANUP_CONFIRM does not match the exact fixture tag.");
  }

  const supabaseUrl = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  // Complete every identity check before the first Auth mutation.
  for (const fixture of RETAINED_AUDIT_PRINCIPALS) {
    const { data, error } = await supabase.auth.admin.getUserById(fixture.id);
    if (error || data.user?.id !== fixture.id || !data.user.email?.startsWith(FIXTURE_TAG)) {
      throw new Error(`Identity preflight failed for ${fixture.label}; no Auth identities were changed.`);
    }
  }

  const deleteTargetLookup = await supabase.auth.admin.getUserById(DELETE_TARGET.id);
  const deleteTargetAlreadyAbsent = deleteTargetLookup.error?.status === 404;
  if (
    !deleteTargetAlreadyAbsent
    && (
      deleteTargetLookup.error
      || deleteTargetLookup.data.user?.id !== DELETE_TARGET.id
      || !deleteTargetLookup.data.user?.email?.startsWith(FIXTURE_TAG)
    )
  ) {
    throw new Error("Identity preflight failed for the sole delete target; no Auth identities were changed.");
  }

  let banned = 0;
  for (const fixture of RETAINED_AUDIT_PRINCIPALS) {
    const { data, error } = await supabase.auth.admin.updateUserById(fixture.id, {
      ban_duration: BAN_DURATION,
    });
    const bannedUntil = Date.parse(data.user?.banned_until ?? "");
    if (
      error
      || data.user?.id !== fixture.id
      || !Number.isFinite(bannedUntil)
      || bannedUntil <= Date.now()
    ) {
      throw new Error(
        `Auth Admin ban failed for ${fixture.label}; run final verification before retrying.`
      );
    }
    banned += 1;
    console.log(`Banned ${fixture.label}.`);
  }

  let deleted = 0;
  if (deleteTargetAlreadyAbsent) {
    console.log(`${DELETE_TARGET.label} is already absent.`);
  } else {
    const { error } = await supabase.auth.admin.deleteUser(DELETE_TARGET.id);
    if (error) {
      throw new Error("Auth Admin deletion failed for the sole delete target; run final verification before retrying.");
    }
    deleted = 1;
    console.log(`Deleted ${DELETE_TARGET.label}.`);
  }

  console.log(
    `T010g Auth cleanup complete: ${banned} audit principals banned; ${deleted} unreferenced user deleted.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "T010g Auth cleanup failed.");
  process.exitCode = 1;
});
