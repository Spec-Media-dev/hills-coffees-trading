# Storage Security and Authorization Contract: Feature 015

**Status:** Corrected authoritative contract. Bucket identity and file-size limit are formally approved by the owner.

## 1. Owner-approved configuration parameters

The owner has formally approved both authoritative configuration parameters for Feature 015:

1. **Dedicated Private Bucket Identifier**: `payment-proofs` (`public = false`, dedicated to payment proofs only; may not reuse `kyb-evidence`).
2. **Maximum Proof Upload Size**: `10485760` bytes (10 MB).
3. **Allowed MIME Types**: `application/pdf`, `image/jpeg`, `image/png`.

These approved values are authoritative across the migration, upload intent, Storage configuration, UI validation, tests, and database contracts.

## 2. Exact object identity

The database persists an upload intent before any browser upload. Its exact `bucket_id` and `object_path` are the only valid proof-object identity:

```text
org/<buyer-organization-id>/orders/<order-id>/<upload-intent-id>/proof
```

The path has exactly six components. The opaque terminal `proof` is constant. A user-selected filename is display metadata held in the intent only; it cannot alter the object path, object lookup, or cleanup target.

## 3. Storage authorization helper

`payment_proof_storage_object_authorized(p_object_name text, p_for_write boolean)` is `SECURITY DEFINER`, fixed to `pg_catalog, public, auth`, grants only `authenticated`, and rejects null or blocked users. It must parse an exact canonical path, load the matching intent by exact bucket/path, and derive all access from the locked order and intent rather than from path components alone.

For writes it requires all of: authenticated, MFA-satisfied authorized buyer with `organization_can_buy`, `intent.status = 'PREPARED'`, caller authorized for the intent order, and an active unexpired `HOLD` reservation. It allows only INSERT to the intent's exact path.

For reads it allows only: an authorized buyer with buying capability for the intent order, platform admin, or finance operator. Sellers, warehouse users, unrelated organizations, anonymous users, and buyer-organization members without buying capability are denied. The helper never grants writes to staff.

## 4. Coordinated RLS and grants

The implementation must add proof-specific access controls without widening generic file access:

| Surface | Required policy |
|---|---|
| `storage.objects` | SELECT and INSERT only for the exact intent-authorized path. No client UPDATE or DELETE. |
| `public.payment_proofs` | SELECT only for buyers satisfying `organization_can_buy` on the proof's order, Finance/Admin. No direct client mutation grants. |
| `public.file_assets` | Add a narrow proof-asset rule or protected view that grants the same audience only when the asset is linked to `payment_proofs`; retain existing non-proof asset policies for their own use. |
| upload intents | No browser table grant or direct RLS mutation path; access only through protected RPCs/helpers. |

The migration must revoke any broad proof-table grant that would bypass these rules and must not rely on the generic `is_order_buyer_member` predicate because it does not enforce buying capability. Tests must query Storage, `payment_proofs`, and proof-linked `file_assets` directly under every role in the matrix.

## 5. Access matrix

| Principal | Upload | Read bytes and proof metadata |
|---|---:|---:|
| Authorized buyer with buying capability | Exact prepared intent only | Own order only |
| Buyer-org member without buying capability | Deny | Deny |
| Seller or warehouse user | Deny | Deny |
| Unrelated organization | Deny | Deny |
| Finance operator / platform admin | Deny | Allow |
| Anonymous | Deny | Deny |

## 6. Object validation and cleanup

At finalize the database checks the exact intent object exists in the approved bucket and validates actual Storage metadata against the owner-approved MIME and size limits. Client declarations are advisory only.

Cleanup uses a protected internal helper and a locked intent; it may delete only the exact object of an unfinalized, same-tenant intent. It cannot accept a raw object path or filename and cannot delete a finalized proof.
