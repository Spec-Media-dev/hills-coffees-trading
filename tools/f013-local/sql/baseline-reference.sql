-- F013 local schema-only restore baseline. Synthetic configuration rows only.
-- Run only against the fixed F013 loopback database after the approved schema dump.
insert into public.commerce_settings
  (id, proforma_validity_hours, bank_transfer_checkout_enabled, proof_submission_enabled, pilot_organization_ids)
values (true, 24, false, true, '{}'::uuid[]);

insert into public.platform_settings (id) values (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kyb-evidence', 'kyb-evidence', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']),
  ('public-assets', 'public-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('listing-media', 'listing-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']);
