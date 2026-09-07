# Hills Coffee Database Baseline

## Status

Database design baseline approved on 2026-09-07.

Final database audit result:

- DATABASE GO / NO-GO: PASS
- Issues: 0

## Source of Truth

The implementation must respect:

1. `database-schema-report.json`
   - Current Supabase database structure
   - Tables
   - Columns
   - Relations
   - Constraints
   - Indexes
   - RLS policies
   - Functions
   - Triggers
   - Grants

2. `database-final-audit.json`
   - Final approved database audit
   - All audited checks passed

3. `/supabase`
   - SQL schema and database implementation files

## Core Business Rules

- Buyer organizations can buy only.
- Seller organizations can buy and sell.
- Trading requires an ACTIVE organization with approved KYB.
- Private marketplace listings are not public/anonymous.
- Member resale listings must originate from inventory previously purchased through Hills.
- Tradable inventory must remain in a Hills-approved warehouse.
- Checkout creates an atomic inventory reservation.
- Offer reservation and inventory-position reservation must remain synchronized.
- Reservations expire after the configured hold period.
- Settlement confirmation transfers ownership.
- Ownership events are append-only.
- Partial fills are supported.
- Purchased inventory may remain stored in Hills custody.
- Operational responsibilities are separated between Compliance, Warehouse, Finance, Admin, and Auditor roles.
- Sensitive workflows must use controlled database functions and RLS.
- Agreement acceptance, correlation IDs, idempotency, disputes, and audit history are part of the approved model.

## Important

Do not redesign or simplify the database model during frontend/backend implementation unless a new explicitly approved requirement requires a schema change.

The SRS defines business requirements.
The Claude Design files define visual/UI direction.
The approved database baseline defines data integrity and authorization rules.