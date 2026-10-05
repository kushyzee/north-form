-- NORTH & FORM — Phase 5B-1 verification: the trusted order function.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_phase5b.sql
--   (pure SQL — it can also be pasted into the Supabase SQL editor or passed to
--    an MCP `execute_sql` call)
--
-- Everything runs inside one transaction that ends in ROLLBACK, so the auth
-- user created here and every order never persist. Behavioural checks run as
-- the real `authenticated` role with simulated JWT claims, which is the path
-- Phase 5B-2 will take. Every assertion raises on failure, aborting the script.

begin;

-- ------------------------------------------------------------------
-- Assertion helpers (temporary — removed by the rollback)
-- ------------------------------------------------------------------
create function pg_temp.nf_assert(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'FAILED: %', label;
  end if;
  raise notice 'ok - %', label;
end;
$$;

create function pg_temp.nf_assert_denied(statement text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception when others then
    raise notice 'ok - % [blocked: %]', label, sqlerrm;
    return;
  end;
  raise exception 'FAILED: % -- statement was allowed: %', label, statement;
end;
$$;

-- Simulate the JWT claims a signed-in user would send.
create function pg_temp.nf_claims(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', user_id::text, true);
end;
$$;

-- One cart line, built from the catalogue so the tests never hardcode a UUID.
create function pg_temp.nf_item(p_slug text, p_qty numeric, p_size text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(
           jsonb_build_object('product_id', id, 'quantity', p_qty, 'size', p_size)
         )
    from public.products where slug = p_slug
$$;

-- Assert that a call fails with a specific business code, and that the message
-- is the code itself (which is how Phase 5B-2 will map errors).
create function pg_temp.nf_rejects(p_cart jsonb, p_state text, p_code text, p_label text)
returns void
language plpgsql
as $$
declare
  v_got text;
begin
  begin
    perform private.place_order(
      p_cart, 'Ade Okafor', 'ade@example.test', '0801 234 5678',
      '14 Adeniyi Jones Avenue', 'Ikeja', p_state
    );
    v_got := 'NO_ERROR';
  exception when others then
    v_got := sqlerrm;
  end;

  if v_got <> p_code then
    raise exception 'FAILED: % -- expected %, got %', p_label, p_code, v_got;
  end if;
  raise notice 'ok - % [%]', p_label, p_code;
end;
$$;

grant execute on function pg_temp.nf_assert(boolean, text) to anon, authenticated;
grant execute on function pg_temp.nf_assert_denied(text, text) to anon, authenticated;
grant execute on function pg_temp.nf_claims(uuid) to anon, authenticated;
grant execute on function pg_temp.nf_item(text, numeric, text) to anon, authenticated;
grant execute on function pg_temp.nf_rejects(jsonb, text, text, text) to anon, authenticated;

-- ==================================================================
-- 1. Structure and privileges, inspected as the owner
-- ==================================================================
select pg_temp.nf_assert(
  (select count(*) from pg_namespace where nspname = 'private') = 1,
  'the private schema exists');

select pg_temp.nf_assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'place_order') = 1,
  'place_order lives in private, not public');

select pg_temp.nf_assert(
  (select p.prosecdef
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'place_order'),
  'place_order is SECURITY DEFINER (it is what performs the inserts)');

select pg_temp.nf_assert(
  (select exists (select 1 from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace,
     unnest(p.proconfig) as cfg
    where n.nspname = 'private' and p.proname = 'place_order'
      and cfg = 'search_path=""')),
  'place_order pins an empty search_path');

select pg_temp.nf_assert(
  (select p.provolatile = 'v'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'place_order'),
  'place_order is VOLATILE — it writes');

select pg_temp.nf_assert(
  (select pg_get_userbyid(p.proowner) = 'postgres'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'place_order'),
  'place_order is owned by postgres, which holds the table privileges');

-- The privilege matrix, stated exactly.
select pg_temp.nf_assert(
  not has_function_privilege('anon', 'private.place_order(jsonb,text,text,text,text,text,text)'::regprocedure, 'execute'),
  'anon cannot execute place_order');

select pg_temp.nf_assert(
  has_function_privilege('authenticated', 'private.place_order(jsonb,text,text,text,text,text,text)'::regprocedure, 'execute'),
  'authenticated can execute place_order');

select pg_temp.nf_assert(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anon has no USAGE on the private schema');

select pg_temp.nf_assert(
  has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated has USAGE on the private schema');

-- The direct write path must still be closed.
select pg_temp.nf_assert(
  (select count(*) from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'
      and table_name in ('orders','order_items')
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) = 0,
  'authenticated still holds no write privilege on orders or order_items');

-- Scoped to the five Phase 2 tables: later phases add their own tables and
-- policies, and this assertion is about the order write-path still being
-- closed, not about the total number of policies in the schema.
select pg_temp.nf_assert(
  (select count(*) from pg_policies
     where schemaname = 'public'
       and tablename in ('profiles','categories','products','orders','order_items')) = 6
  and (select count(*) from pg_policies
        where schemaname = 'public' and tablename in ('orders','order_items')
          and cmd <> 'SELECT') = 0,
  'the six original RLS policies are intact and still SELECT-only on orders');

-- `cart_items` was added after this phase and brings its own four policies, so
-- this counts the Phase 2 tables rather than the whole schema.
select pg_temp.nf_assert(
  (select count(*) from pg_tables where schemaname = 'public'
     and tablename in ('profiles','categories','products','orders','order_items')) = 5,
  'the five Phase 2 tables are the only ones this phase created');

select pg_temp.nf_assert(
  (select rolconfig::text like '%private%'
     from pg_roles where rolname = 'authenticator'),
  'the private schema is listed in PostgREST''s exposed schemas');

-- ==================================================================
-- 2. Fixtures — all rolled back at the end
-- ==================================================================
insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-4111-8111-111111111111', 'order.user.a@example.test', 'authenticated',
        'authenticated', '{"full_name":"Order User A"}'::jsonb, now(), now());

create temporary table nf_stock_baseline as
  select slug, stock_quantity from public.products;

-- ==================================================================
-- 3. Unauthenticated — checked before any claim is set, so auth.uid()
--    is genuinely null here and the only reason to fail is the identity
-- ==================================================================
do $$
declare v_got text;
begin
  begin
    perform private.place_order(
      (select jsonb_build_array(jsonb_build_object('product_id', id, 'quantity', 1, 'size', 'M'))
         from public.products where slug = 'essential-oxford'),
      'No Session', 'none@example.test', '08000000000', '1 Test Street', 'Ikeja', 'Lagos'
    );
    v_got := 'NO_ERROR';
  exception when others then
    v_got := sqlerrm;
  end;
  perform pg_temp.nf_assert(v_got = 'UNAUTHENTICATED',
    'an unauthenticated caller is rejected with UNAUTHENTICATED');
end;
$$;

-- ==================================================================
-- 4. Everything else runs as the real `authenticated` role
-- ==================================================================
set local role authenticated;
select pg_temp.nf_claims('11111111-1111-4111-8111-111111111111');

-- ------------------------------------------------------------------
-- 4a. Happy path: 2 x Essential Oxford (M) + 1 x Plain T-Shirt (L)
-- ------------------------------------------------------------------
do $$
declare
  v_cart   jsonb;
  v_result jsonb;
  v_order  uuid;
begin
  select jsonb_build_array(
           jsonb_build_object('product_id', ox.id, 'quantity', 2, 'size', 'M'),
           jsonb_build_object('product_id', ts.id, 'quantity', 1, 'size', 'L')
         )
    into v_cart
    from public.products ox, public.products ts
   where ox.slug = 'essential-oxford' and ts.slug = 'plain-t-shirt';

  v_result := private.place_order(
    v_cart, 'Ade Okafor', 'ade@example.test', '0801 234 5678',
    '14 Adeniyi Jones Avenue', 'Ikeja', 'Lagos'
  );
  v_order := (v_result ->> 'order_id')::uuid;

  perform pg_temp.nf_assert(
    (v_result ->> 'order_number') ~ '^NF-[0-9A-F]{16}$',
    'the order number is generated server-side as NF- plus 16 hex characters');

  perform pg_temp.nf_assert(
    (select count(*) from public.orders) = 1,
    'exactly one order was created');

  perform pg_temp.nf_assert(
    (select o.user_id = '11111111-1111-4111-8111-111111111111'::uuid
       and o.status = 'awaiting_payment'
       and o.customer_name = 'Ade Okafor'
     from public.orders o where o.id = v_order),
    'the order belongs to the caller and always starts awaiting_payment');

  perform pg_temp.nf_assert(
    (v_result ->> 'subtotal')::numeric = 78000.00
    and (v_result ->> 'delivery_fee')::numeric = 2000.00
    and (v_result ->> 'total')::numeric = 80000.00,
    'subtotal is the sum of catalogue prices x quantity (2x28000 + 1x22000)');

  perform pg_temp.nf_assert(
    (select o.subtotal = 78000.00 and o.delivery_fee = 2000.00 and o.total = 80000.00
       from public.orders o where o.id = v_order),
    'the stored totals match the returned totals and total = subtotal + delivery');

  perform pg_temp.nf_assert(
    (select count(*) from public.order_items where order_id = v_order) = 2,
    'two line items were created');

  perform pg_temp.nf_assert(
    (select count(*) = 2
       from public.order_items oi
       join public.products p on p.id = oi.product_id
      where oi.order_id = v_order
        and ((p.slug = 'essential-oxford' and oi.product_name = p.name
              and oi.unit_price = p.price and oi.quantity = 2 and oi.size = 'M')
          or (p.slug = 'plain-t-shirt' and oi.product_name = p.name
              and oi.unit_price = p.price and oi.quantity = 1 and oi.size = 'L'))),
    'each line snapshots the catalogue product_name and unit_price');
end;
$$;

-- ------------------------------------------------------------------
-- 4b. Price authority — forged keys in the payload must be inert
-- ------------------------------------------------------------------
do $$
declare
  v_cart   jsonb;
  v_order  uuid;
begin
  select jsonb_build_array(
           jsonb_build_object(
             'product_id', id, 'quantity', 2, 'size', 'M',
             'unit_price', 1, 'product_name', 'Free', 'line_total', 2,
             'subtotal', 1, 'delivery_fee', 0, 'total', 1, 'status', 'delivered')
         )
    into v_cart
    from public.products where slug = 'essential-oxford';

  select (private.place_order(
    v_cart, 'Ade Okafor', 'ade@example.test', '0801 234 5678',
    '14 Adeniyi Jones Avenue', 'Ikeja', 'Lagos'
  ) ->> 'order_id')::uuid
    into v_order;

  perform pg_temp.nf_assert(
    (select o.subtotal = 56000.00 and o.delivery_fee = 2000.00 and o.total = 58000.00
       from public.orders o where o.id = v_order),
    'forged subtotal/delivery_fee/total keys have no effect on the order');

  perform pg_temp.nf_assert(
    (select oi.unit_price = 28000.00 and oi.product_name = 'Essential Oxford'
       from public.order_items oi where oi.order_id = v_order),
    'forged unit_price and product_name never reach order_items');

  perform pg_temp.nf_assert(
    (select o.status = 'awaiting_payment' from public.orders o where o.id = v_order),
    'a forged status key cannot skip the order lifecycle');
end;
$$;

-- ------------------------------------------------------------------
-- 4c. Delivery fees by destination
-- ------------------------------------------------------------------
do $$
declare
  v_cart   jsonb := pg_temp.nf_item('plain-t-shirt', 1, 'L');
  v_result jsonb;
begin
  v_result := private.place_order(v_cart, 'A', 'a@example.test', '0801', '1 St', 'Ikeja', 'Lagos');
  perform pg_temp.nf_assert((v_result ->> 'delivery_fee')::numeric = 2000.00, 'Lagos pays 2000');

  v_result := private.place_order(v_cart, 'A', 'a@example.test', '0801', '1 St', 'Gwagwalada', 'Federal Capital Territory');
  perform pg_temp.nf_assert((v_result ->> 'delivery_fee')::numeric = 2500.00, 'the Federal Capital Territory pays the Abuja rate of 2500');

  v_result := private.place_order(v_cart, 'A', 'a@example.test', '0801', '1 St', 'Port Harcourt', 'Rivers');
  perform pg_temp.nf_assert((v_result ->> 'delivery_fee')::numeric = 3000.00, 'Rivers pays the Port Harcourt rate of 3000');

  v_result := private.place_order(v_cart, 'A', 'a@example.test', '0801', '1 St', 'Benin City', 'Edo');
  perform pg_temp.nf_assert((v_result ->> 'delivery_fee')::numeric = 4000.00, 'any other state pays 4000');

  perform pg_temp.nf_assert(
    (v_result ->> 'total')::numeric
      = (v_result ->> 'subtotal')::numeric + (v_result ->> 'delivery_fee')::numeric,
    'total is always subtotal + delivery fee');
end;
$$;

-- ------------------------------------------------------------------
-- 4d. Rejected input, each with no partial write
-- ------------------------------------------------------------------
select pg_temp.nf_rejects(null, 'Lagos', 'INVALID_CART', 'a null cart is rejected');
select pg_temp.nf_rejects('{}'::jsonb, 'Lagos', 'INVALID_CART', 'a cart that is not an array is rejected');
select pg_temp.nf_rejects('[]'::jsonb, 'Lagos', 'EMPTY_CART', 'an empty cart is rejected');
select pg_temp.nf_rejects('[1,2]'::jsonb, 'Lagos', 'INVALID_CART_ITEM', 'a non-object cart item is rejected');
select pg_temp.nf_rejects('[{"quantity":1,"size":"M"}]'::jsonb, 'Lagos', 'INVALID_CART_ITEM', 'a cart item with no product_id is rejected');
select pg_temp.nf_rejects('[{"product_id":"not-a-uuid","quantity":1,"size":"M"}]'::jsonb, 'Lagos',
  'INVALID_CART_ITEM', 'a malformed product_id is a business error, not a raw cast failure');
select pg_temp.nf_rejects(
  (select jsonb_build_array(jsonb_build_object('product_id', id, 'quantity', 1))
     from public.products where slug = 'essential-oxford'),
  'Lagos', 'INVALID_CART_ITEM', 'a cart item with no size is rejected');
select pg_temp.nf_rejects(
  (select jsonb_build_array(jsonb_build_object('product_id', id, 'quantity', 0, 'size', 'M'))
     from public.products where slug = 'essential-oxford'),
  'Lagos', 'INVALID_CART_ITEM', 'a zero quantity is rejected');
select pg_temp.nf_rejects(
  (select jsonb_build_array(jsonb_build_object('product_id', id, 'quantity', '2', 'size', 'M'))
     from public.products where slug = 'essential-oxford'),
  'Lagos', 'INVALID_CART_ITEM', 'a string quantity is rejected — it must be a JSON number');
select pg_temp.nf_rejects(
  (select jsonb_build_array(
      jsonb_build_object('product_id', id, 'quantity', 1, 'size', 'M'),
      jsonb_build_object('product_id', id, 'quantity', 2, 'size', 'M'))
     from public.products where slug = 'essential-oxford'),
  'Lagos', 'INVALID_CART_ITEM', 'duplicate product+size lines are rejected');
select pg_temp.nf_rejects(
  '[{"product_id":"00000000-0000-4000-8000-000000000000","quantity":1,"size":"M"}]'::jsonb,
  'Lagos', 'PRODUCT_NOT_FOUND', 'an unknown product id aborts the whole order');
select pg_temp.nf_rejects(pg_temp.nf_item('essential-oxford', 1, 'XXXL'), 'Lagos',
  'INVALID_SIZE', 'a size the product does not offer is rejected');
select pg_temp.nf_rejects(pg_temp.nf_item('essential-oxford', 9999, 'M'), 'Lagos',
  'INSUFFICIENT_STOCK', 'a quantity beyond stock is rejected');
select pg_temp.nf_rejects(pg_temp.nf_item('everyday-slide', 1, 'M'), 'Lagos',
  'INVALID_SIZE', 'a size from a different product is rejected');
select pg_temp.nf_rejects(pg_temp.nf_item('essential-oxford', 1, 'M'), 'Abuja',
  'INVALID_STATE', 'a city name is not a valid state');
select pg_temp.nf_rejects(pg_temp.nf_item('essential-oxford', 1, 'M'), 'Lagos State',
  'INVALID_STATE', 'a non-canonical state name is rejected');
select pg_temp.nf_rejects(pg_temp.nf_item('essential-oxford', 1, 'M'), '',
  'INVALID_STATE', 'an empty state is rejected');

do $$
declare v_got text;
begin
  begin
    perform private.place_order(
      pg_temp.nf_item('essential-oxford', 1, 'M'),
      '', 'a@example.test', '0801', '1 St', 'Ikeja', 'Lagos'
    );
    v_got := 'NO_ERROR';
  exception when others then
    v_got := sqlerrm;
  end;
  perform pg_temp.nf_assert(v_got = 'INVALID_CUSTOMER', 'a blank customer name is rejected');
end;
$$;

-- ------------------------------------------------------------------
-- 4e. The direct write path is still closed for a signed-in user
-- ------------------------------------------------------------------
select pg_temp.nf_assert_denied(
  $q$insert into public.orders (user_id, order_number, customer_name, customer_email,
       customer_phone, delivery_address, delivery_city, delivery_state,
       subtotal, delivery_fee, total)
     values ('11111111-1111-4111-8111-111111111111', 'NF-FORGED-BYPASS', 'Forged',
             'f@example.test', '08000000000', 'x', 'Ikeja', 'Lagos', 1, 0, 1)$q$,
  'a signed-in user still cannot insert an order directly');

select pg_temp.nf_assert_denied(
  $q$insert into public.order_items (order_id, product_id, product_name, quantity, size, unit_price)
     select (select id from public.orders limit 1), id, 'Forged', 1, 'M', 1
       from public.products limit 1$q$,
  'a signed-in user still cannot insert order items directly');

-- ------------------------------------------------------------------
-- 4f. Only the intended orders exist: every rejection wrote nothing
-- ------------------------------------------------------------------
select pg_temp.nf_assert(
  (select count(*) from public.orders) = 6,
  'exactly the six intended orders exist — no rejected call left a row behind');

select pg_temp.nf_assert(
  (select count(*) from public.order_items) = 7,
  'exactly seven line items exist — rejected calls never wrote partial items');

select pg_temp.nf_assert(
  (select count(distinct order_number) = count(*) from public.orders),
  'every order number is unique');

select pg_temp.nf_assert(
  (select count(*) from public.orders o
    where o.total <> o.subtotal + o.delivery_fee) = 0,
  'the total check constraint holds on every order');

reset role;

-- ==================================================================
-- 5. Nothing was mutated, and no orphan rows exist
-- ==================================================================
select pg_temp.nf_assert(
  not exists (
    select 1 from public.products p
      join pg_temp.nf_stock_baseline b on b.slug = p.slug
     where p.stock_quantity <> b.stock_quantity
  ),
  'stock is validated but never decremented or reserved');

select pg_temp.nf_assert(
  (select count(*) from public.orders o
    where not exists (select 1 from public.order_items i where i.order_id = o.id)) = 0,
  'no order exists without its line items');

do $$
begin
  raise notice 'ALL PHASE 5B-1 CHECKS PASSED — rolling back fixtures';
end;
$$;

rollback;
