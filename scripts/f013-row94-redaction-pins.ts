/** Feature 013 T081 row-94 LOCAL redaction: pinned file identity and the two executable variants (pure; no I/O). */
import { createHash } from "node:crypto";

export const ROW94_REDACTION_FILE = "tools/f013-local/sql/m4b-audit-row94-redaction.PROPOSED.sql";
/** SHA-256 of the reviewed file exactly as stored (the BEGIN … ROLLBACK dry run). */
export const ROW94_DRY_RUN_SHA256 = "abec591d2670f43b81b354c095ddb947d531ef2d624561300f2b03da3c8ab830";
/** SHA-256 of the apply variant: the same bytes with the single terminal `rollback;` replaced by `commit;`. */
export const ROW94_APPLY_SHA256 = "fe40b8dcb5f625daae85974b59b3b6696570c95a2a231b5591b458cfca6ce6d1";

export const ROW94_EXPECTED_NOTICES = [
  "leaks_before|1", "target_row_shape_pinned|t", "leak_is_fixture_order_copy|t", "only_forbidden_key_removed|t",
  "other_row94_fields_preserved|t", "unrelated_audit_rows_unchanged|t", "order_row_unchanged|t",
  "one_pii_free_correction_event|t", "leaks_after|0",
] as const;

export const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** Exactly one terminal `rollback;` statement (the dry run) and no COMMIT/END statement; otherwise the file is refused. */
export function row94Variants(text: string): { dryRun: string; apply: string } {
  if (/^\s*(?:commit|end)\s*(?:transaction|work)?\s*;/im.test(text)) throw new Error("row-94 redaction file must not contain a COMMIT statement");
  if ((text.match(/^rollback;\s*$/gim) ?? []).length !== 1 || !/\nrollback;\s*$/.test(text)) {
    throw new Error("row-94 redaction file must end in exactly one terminal ROLLBACK");
  }
  return { dryRun: text, apply: text.replace(/\nrollback;(\s*)$/, "\ncommit;$1") };
}

/** Fails closed unless the stored file and its apply variant match both pins. */
export function verifyRow94Pins(text: string): { dryRun: string; apply: string } {
  const variants = row94Variants(text);
  if (sha256(variants.dryRun) !== ROW94_DRY_RUN_SHA256) throw new Error("row-94 redaction file does not match its pinned SHA-256");
  if (sha256(variants.apply) !== ROW94_APPLY_SHA256) throw new Error("row-94 apply variant does not match its pinned SHA-256");
  return variants;
}
