-- NORTH & FORM — Phase 2: explicit, minimal client grant matrix.
--
-- Supabase's default privileges grant ALL on new public tables to `anon`
-- and `authenticated` — that includes TRUNCATE, REFERENCES and TRIGGER,
-- which Row Level Security does not cover. Restate table access as a
-- least-privilege matrix:
--
--   anon          -> SELECT on categories, products
--   authenticated -> SELECT on all five tables, UPDATE on profiles
--   service_role  -> ALL (bypasses RLS; server-side only)
--
-- RLS remains the actual boundary for row-level access.

revoke all privileges on public.profiles, public.categories, public.products,
  public.orders, public.order_items from anon, authenticated;

grant select on public.categories, public.products to anon, authenticated;

grant select on public.profiles, public.orders, public.order_items to authenticated;
grant update on public.profiles to authenticated;

grant all on public.profiles, public.categories, public.products,
  public.orders, public.order_items to service_role;