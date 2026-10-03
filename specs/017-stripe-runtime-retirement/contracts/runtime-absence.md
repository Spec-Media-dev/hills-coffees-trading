# Runtime Absence Contract

## Production Runtime Scope

The following scopes must contain no active Stripe/provider capability after Feature 017:

- `src/`
- `lib/`
- `components/`
- `supabase/functions/`
- `package.json` and the dependency lockfile

Static checks must strip comments where appropriate and distinguish production capability from preserved historical evidence.

## Required Absences

| Category | Must be absent from production/runtime scope |
|---|---|
| Buyer funding | Stripe/card controls, Payment Element, funding request seam, provider funding route/invocation |
| Server/provider runtime | Stripe config, adapter, webhook verifier, provider settlement wrapper, Stripe SDK imports |
| Configuration | Runtime reads of `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and confirmed obsolete provider configuration |
| Deployable Edge source | `stripe-create-payment-intent`, `stripe-webhook`, `stripe-release-transfer` directories |
| Packages | `stripe` and `@stripe/stripe-js` dependency and lockfile entries |

## Required Preservations

The following are explicitly excluded from absence scans and must remain intact:

- Historical migrations, rollback scripts, maintenance/postflight scripts, specifications, and version-control history that document Stripe/provider behavior.
- Historical provider-related database schema/data, if present.
- Feature 013–016 tests, live harnesses, target pinning, direct PostgreSQL runner, and active test/ops variables.
- Bank-transfer payment detail/history reads and the active checkout, proforma, proof, finance-review, invoice, ownership, fulfillment, notification, and idempotency paths.

## Payment Detail Route Contract

`src/app/dashboard/payments/[orderId]/page.tsx` remains authenticated and RLS-scoped. It may display permitted payment, financial, proforma, invoice, payout, and seller-safe history data. It must not request funding, read provider configuration, render a provider/card control, or imply provider availability.

## Acceptance Evidence

1. Static absence tests pass over the production scope with the stated exclusions.
2. Package manifest and lockfile contain neither Stripe SDK package.
3. Payment detail UI tests prove bank-transfer/history behavior and provider-control absence.
4. Existing bank-transfer/finance and Feature 009–016 compatibility suites pass.
5. Remote inventory confirms no deployed `stripe-*` function and no Stripe/provider secret name without revealing secret values.
