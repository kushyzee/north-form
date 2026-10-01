-- NORTH & FORM — Phase 2: least-privilege follow-up.
--
-- Supabase's default privileges grant ALL on new public tables to
-- `anon`. The RLS policies already make orders / order_items unreadable
-- to anonymous callers (no policy => zero rows), but anonymous callers
-- should not hold the table grant at all. Profiles were already revoked
-- in full; this completes the picture for order data.

revoke select on public.orders, public.order_items from anon;