-- NORTH & FORM — Phase 2: Row Level Security, policies and grants.
--
-- Design rules:
--   * RLS on every application table. Deny by default.
--   * The catalogue (categories, products) is world-readable, never
--     world-writable — catalogue management is out of application scope.
--   * Every policy uses `(select auth.uid())` (initplan-cached) rather
--     than a bare `auth.uid()` call.
--   * Orders and order items are READ-ONLY for clients. There is
--     deliberately no insert/update/delete policy: order creation is a
--     trusted server-side operation (Phase 3) that re-reads products,
--     prices and stock and computes the total itself. A permissive
--     client insert policy here would let anyone forge prices, totals
--     and user ids, so we do not add one.

-- ------------------------------------------------------------------
-- Enable RLS
-- ------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- ------------------------------------------------------------------
-- Public catalogue reads
-- ------------------------------------------------------------------
create policy "Categories are readable by everyone"
  on public.categories
  for select
  to anon, authenticated
  using (true);

create policy "Products are readable by everyone"
  on public.products
  for select
  to anon, authenticated
  using (true);

-- ------------------------------------------------------------------
-- profiles — own row only, no insert (rows are created by the
-- on_auth_user_created trigger), no delete.
-- ------------------------------------------------------------------
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ------------------------------------------------------------------
-- orders — own orders only. Read-only for clients.
-- ------------------------------------------------------------------
create policy "Users can read their own orders"
  on public.orders
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------
-- order_items — reachable only through an order the caller owns.
-- Changing order_id in a query cannot widen access.
-- ------------------------------------------------------------------
create policy "Users can read items of their own orders"
  on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

-- ------------------------------------------------------------------
-- Grants.
-- Supabase's default privileges grant ALL on new public tables to
-- anon/authenticated, so we state access explicitly: clients get the
-- narrowest useful set and can never write catalogue or order data at
-- the ACL level either (RLS already denies it — this is defence in
-- depth). service_role keeps full access; it bypasses RLS and must
-- only ever be used server-side.
-- ------------------------------------------------------------------
revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;

grant select on public.categories, public.products to anon, authenticated;

revoke insert, update, delete on public.categories, public.products from anon, authenticated;

grant select on public.orders, public.order_items to authenticated;
revoke insert, update, delete on public.orders, public.order_items from anon, authenticated;

grant all on public.profiles, public.categories, public.products,
  public.orders, public.order_items to service_role;