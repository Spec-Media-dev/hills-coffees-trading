/** Pure Feature 018 read-only capture SQL contract shared by the runner and the capture script. No I/O. */
const F018_READ_ONLY_DENY = /\b(?:set_config|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|nextval|setval|dblink\w*|lo_\w+|pg_read_\w*file|pg_ls_\w+|pg_advisory\w*|pg_notify|pg_sleep\w*|txid_\w+|decrypted\w*|copy|vacuum|analyze|truncate|insert|update|delete|alter|create|drop|grant|revoke|call|do|listen|unlisten|lock)\b/i;

/** Exactly BEGIN READ ONLY; <one SELECT/WITH>; ROLLBACK; with no other statement, no semicolon inside the
 * statement and no side-effect function. */
export function assertF018ReadOnlyCaptureSql(sql) {
  const match = /^\s*begin transaction read only;\s*([^;]+);\s*rollback;\s*$/i.exec(String(sql));
  if (!match) throw new Error('F018 read-only capture requires: BEGIN TRANSACTION READ ONLY; <single statement>; ROLLBACK;');
  const statement = match[1].trim();
  if (!/^(?:select|with)\b/i.test(statement)) throw new Error('F018 read-only capture statement must be SELECT or WITH');
  const stripped = statement.replace(/'(?:[^']|'')*'/g, "''");
  if (F018_READ_ONLY_DENY.test(stripped)) throw new Error('F018 read-only capture statement contains a forbidden keyword or function');
}
