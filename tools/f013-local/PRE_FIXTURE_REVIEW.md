# F013 local pre-fixture review

## Restore SQL transport

The pinned local pre-schema ACL normalization runs first through `docker exec -i ... psql`. It removes the local schema-specific default grants for `postgres` in `public` before the schema dump creates application objects. The schema dump's explicit object `GRANT` statements then establish the source object ACLs, and its final `ALTER DEFAULT PRIVILEGES` statements establish the source defaults for future objects. PostgreSQL schema-specific revokes cannot cancel global default grants, so independent review must verify that the local broad grants are schema-specific before relying on this normalization.

The schema dump, baseline reference, Feature 003 auth trigger, M4a migration, and rendered identity SQL use the same pinned local psql stdin transport. The Docker executable pin and exact container identity are checked before each psql invocation. A non-zero psql exit stops the restore sequence.

The M4a role precheck, M4a postflight, and catalog parity check remain read-only Supabase CLI queries with JSON output. Their strict JSON result validators remain required. The role precheck runs immediately before M4a. The full step order is pre-schema ACL normalization, schema, baseline, auth trigger, role precheck, M4a, postflight, identity, then catalog parity.

Before preparing T071 fixtures, require reviewed, pinned proof that the restored local database passes the M3 postflight (all 24 rows) and M2e postflight (all 14 rows). Compare every public function MD5 with the approved production capture, accounting for expected M1–M4a changes. Compare policies with the approved capture. Require zero business rows in `orders`, `offers`, and `commerce_request_log` before fixture setup. These checks are follow-up work; this document does not authorize execution.

If a future restore fails mid-sequence, stop. Do not continue from the partial database. The local-only recovery procedure is `npx supabase stop --no-backup --workdir tools/f013-local`, followed by a restart using the reviewed local startup command. Review the reset before running it.

The Docker identity probe pins the operator-verified executable at `C:\Program Files\Docker\Docker\resources\bin\docker.exe` with SHA-256 `35cab8a5c3b5db69ef9a9ef80623ddbc7f465ee15e64c9829cec1990be3a1612`. Execution remains gated until independent review is complete.
