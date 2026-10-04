/**
 * Feature 018 T059 - existing-bank RPC integration and future-versus-frozen snapshot regression against REAL PostgreSQL.
 * Opt in with F018_LOCAL_PG=1. LOCAL ONLY.
 *
 * Proves, on the existing Feature 013 `set_default_payment_account` routine and the Feature 018 selected-line checkout:
 *   - Platform Admin + MFA authority, request binding and the default-USD invariants;
 *   - a proforma issued earlier keeps the bank snapshot it was issued with - when the default changes AND when the source
 *     account row is later edited or retired;
 *   - NEW issuance reads the then-current default; with no usable default a checkout is refused atomically.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Operator, adminUser } from "../admin/f018-admin-helpers";
import { Actor, canonicalCart, inventoryConservation, lineFor, nextRequest, openBuyerA, stateDigest } from "./f018-checkout-helpers";
import { W, buildWorldTemplate } from "./f018-fixtures";
import { F018_LOCAL_PG_ENABLED, resetFromWorldTemplate, work, workJson, workScalar } from "./f018-local-pg";

const A = W.orgs.buyerA;
const dest = W.destinations.A;
const SECOND = "f0180007-0000-4000-8000-0000000000b2";
const OLD_INACTIVE = "f0180007-0000-4000-8000-0000000000d1";
const key = (n: number) => `f018000c-0000-4000-8000-${(0x1b00 + n).toString(16).padStart(12, "0")}`;

interface Bank { payment_account_id: string; bank_name: string; account_name: string; iban: string | null; account_number: string | null }
const bankOf = (childOrderId: string): Bank => workJson<Bank>(`
  select to_jsonb(b) from (select pbi.payment_account_id, pbi.bank_name, pbi.account_name, pbi.iban, pbi.account_number
    from public.proforma_bank_instructions pbi join public.proforma_invoices pi on pi.id = pbi.proforma_id where pi.order_id = '${childOrderId}') b`);
const defaults = () => workJson<string[]>(`select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.payment_accounts where is_default_for_currency`);

describe.skipIf(!F018_LOCAL_PG_ENABLED)("Feature 018 bank default and frozen snapshots (real PostgreSQL)", { timeout: 240_000 }, () => {
  const buyers: Actor[] = [];
  const operators: Operator[] = [];
  const buyer = async () => { const actor = await openBuyerA(); buyers.push(actor); return actor; };
  const operator = async (name: string, userId: string, aal: "aal1" | "aal2" = "aal2") => { const op = await Operator.open(name, userId, aal); operators.push(op); return op; };

  beforeAll(() => { buildWorldTemplate(); }, 240_000);
  beforeEach(() => {
    resetFromWorldTemplate();
    work(`insert into public.payment_accounts (id, account_name, bank_name, account_number, iban, swift_code, currency, is_active, is_default_for_currency, created_by) values
      ('${SECOND}', 'Hills Second LLC', 'Second Bank', '9999888877776666', 'AE990331999988887777666', 'F018AEBB', 'USD', true, false, '${adminUser}'),
      ('${OLD_INACTIVE}', 'Retired', 'Retired Bank', '5555', null, null, 'USD', false, false, '${adminUser}');`);
  });
  afterEach(async () => {
    await Promise.all(buyers.splice(0).map((actor) => actor.close()));
    await Promise.all(operators.splice(0).map((op) => op.close()));
  });

  describe("set_default_payment_account (existing routine)", () => {
    it("requires Platform Admin AND step-up: aal1 is refused, a Compliance operator and a buyer are forbidden, nothing changes", async () => {
      // `mfa_satisfied()` only gates accounts with a verified factor (Feature 003 T033), so enroll one for this operator.
      work(`insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), '${adminUser}', 'f018', 'totp', 'verified', now(), now())`);
      const before = defaults();
      const aal1 = await operator("adm1", adminUser, "aal1");
      const refused = await aal1.rpc("set_default_payment_account", SECOND, key(1));
      expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("mfa_step_up_required") });
      const compliance = await operator("cmp", W.users.compliance);
      expect(await compliance.rpc("set_default_payment_account", SECOND, key(2))).toMatchObject({ ok: false, error: expect.stringContaining("forbidden") });
      const buyerOp = await operator("byr", W.users.buyerA1);
      expect(await buyerOp.rpc("set_default_payment_account", SECOND, key(3))).toMatchObject({ ok: false, error: expect.stringContaining("forbidden") });
      expect(defaults()).toEqual(before);
    });

    it("a stepped-up Platform Admin moves the default atomically: exactly one default USD account at all times", async () => {
      expect(defaults()).toEqual([W.paymentAccount]);
      const admin = await operator("adm2", adminUser);
      const done = await admin.rpc("set_default_payment_account", SECOND, key(4));
      expect(done).toMatchObject({ ok: true, value: { payment_account_id: SECOND, currency: "USD" } });
      expect(defaults()).toEqual([SECOND]);
      expect(workScalar(`select is_default_for_currency::text from public.payment_accounts where id = '${W.paymentAccount}'`)).toBe("false");
    });

    it("only an ACTIVE account can become the default (the table itself admits USD only)", async () => {
      const admin = await operator("adm3", adminUser);
      for (const [index, id] of [OLD_INACTIVE, "f0180007-0000-4000-8000-0000000000ff"].entries()) {
        expect(await admin.rpc("set_default_payment_account", id, key(10 + index))).toMatchObject({ ok: false, error: expect.stringContaining("payment_account_not_found") });
      }
      expect(defaults()).toEqual([W.paymentAccount]);
    });

    it("is request-bound: the same key replays the stored result; the same key for another account conflicts", async () => {
      const admin = await operator("adm4", adminUser);
      const first = await admin.rpc("set_default_payment_account", SECOND, key(20));
      const replay = await admin.rpc("set_default_payment_account", SECOND, key(20));
      expect(replay).toEqual(first);
      const conflict = await admin.rpc("set_default_payment_account", W.paymentAccount, key(20));
      expect(conflict).toMatchObject({ ok: false, error: expect.stringContaining("request_id_conflict") });
      expect(defaults()).toEqual([SECOND]);
    });

    it("retiring the default leaves NO default (the readiness gap the console reports) and checkout then refuses atomically", async () => {
      work(`update public.payment_accounts set is_active = false where id = '${W.paymentAccount}'`);
      expect(workScalar(`select count(*) from public.payment_accounts where is_default_for_currency and is_active`)).toBe("0");
      const a = await buyer();
      expect((await a.addLine(W.offers.A, 20)).ok).toBe(true);
      const cart = canonicalCart(A)!;
      const digest = stateDigest();
      const refused = await a.checkout({ cartId: cart.id, itemId: lineFor(cart, W.offers.A).id, offerId: W.offers.A, quantity: 20, destinationId: dest, requestId: nextRequest() });
      expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("bank_account_missing") });
      expect(stateDigest()).toEqual(digest); // nothing leaked: no order, reservation or receipt
      expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
    });
  });

  describe("future versus frozen bank snapshots", () => {
    it("an issued proforma keeps its bank when the default changes; the NEXT issuance uses the new default", async () => {
      const a = await buyer();
      expect((await a.addLine(W.offers.A, 20)).ok).toBe(true);
      expect((await a.addLine(W.offers.B, 20)).ok).toBe(true);
      const cart = canonicalCart(A)!;

      const first = await a.checkout({ cartId: cart.id, itemId: lineFor(cart, W.offers.A).id, offerId: W.offers.A, quantity: 20, destinationId: dest, requestId: nextRequest() });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const frozen = bankOf(first.value.child_order_id);
      expect(frozen).toMatchObject({ payment_account_id: W.paymentAccount, bank_name: "F018 Bank", iban: "AE070331234567890123456" });

      const admin = await operator("adm5", adminUser);
      expect((await admin.rpc("set_default_payment_account", SECOND, key(30))).ok).toBe(true);

      const rest = canonicalCart(A)!;
      const second = await a.checkout({ cartId: rest.id, itemId: lineFor(rest, W.offers.B).id, offerId: W.offers.B, quantity: 20, destinationId: dest, requestId: nextRequest() });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(bankOf(second.value.child_order_id)).toMatchObject({ payment_account_id: SECOND, bank_name: "Second Bank", iban: "AE990331999988887777666" });
      expect(bankOf(first.value.child_order_id)).toEqual(frozen); // unchanged
    });

    it("editing or retiring the source account never rewrites an issued snapshot", async () => {
      const a = await buyer();
      expect((await a.addLine(W.offers.A, 20)).ok).toBe(true);
      const cart = canonicalCart(A)!;
      const issued = await a.checkout({ cartId: cart.id, itemId: lineFor(cart, W.offers.A).id, offerId: W.offers.A, quantity: 20, destinationId: dest, requestId: nextRequest() });
      expect(issued.ok).toBe(true);
      if (!issued.ok) return;
      const frozen = bankOf(issued.value.child_order_id);

      work(`update public.payment_accounts set bank_name = 'Renamed Bank', iban = 'AE000000000000000000000', account_number = '0000', is_active = false where id = '${W.paymentAccount}'`);
      expect(bankOf(issued.value.child_order_id)).toEqual(frozen);
      expect(frozen.bank_name).toBe("F018 Bank");
    });

    it("the buyer-visible instructions come from the snapshot and never expose another account's details", async () => {
      const a = await buyer();
      expect((await a.addLine(W.offers.A, 20)).ok).toBe(true);
      const cart = canonicalCart(A)!;
      const issued = await a.checkout({ cartId: cart.id, itemId: lineFor(cart, W.offers.A).id, offerId: W.offers.A, quantity: 20, destinationId: dest, requestId: nextRequest() });
      expect(issued.ok).toBe(true);
      if (!issued.ok) return;
      const text = JSON.stringify(issued.value);
      expect(text).not.toContain("Second Bank");
      expect(text).not.toContain("9999888877776666");
    });
  });
});
