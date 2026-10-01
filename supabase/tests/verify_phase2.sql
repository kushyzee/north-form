-- NORTH & FORM — Phase 2 database verification.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_phase2.sql
--   (the file is pure SQL — it can also be pasted into the Supabase SQL
--    editor or passed to an MCP `execute_sql` call)
--
-- Everything runs inside one transaction that ends in ROLLBACK, so the
-- fixtures created here (three auth users, their profiles, two orders
-- and two line items) never persist. Every assertion raises an
-- exception on failure, which aborts the script immediately.
--
-- Row-level security is exercised by switching to the `anon` and
-- `authenticated` roles and setting the JWT claims that auth.uid()
-- reads, then switching back with `reset role`.

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

-- Asserts that `statement` raises an error for the current role.
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

grant execute on function pg_temp.nf_assert(boolean, text) to anon, authenticated;
grant execute on function pg_temp.nf_assert_denied(text, text) to anon, authenticated;
grant execute on function pg_temp.nf_claims(uuid) to anon, authenticated;

-- ==================================================================
-- 1. Structure: tables, RLS, keys, indexes, types, triggers
-- ==================================================================
select pg_temp.nf_assert(
  (select count(*) from information_schema.tables
     where table_schema = 'public'
       and table_name in ('profiles','categories','products','orders','order_items')) = 5,
  'all five application tables exist');

select pg_temp.nf_assert(
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname in ('profiles','categories','products','orders','order_items')) = 5,
  'RLS enabled on all five tables');

select pg_temp.nf_assert(
  (select count(*) from pg_constraint
    where contype = 'f'
      and conrelid in ('public.profiles'::regclass, 'public.products'::regclass,
                       'public.orders'::regclass, 'public.order_items'::regclass)) = 5,
  'five foreign keys across the application tables');

select pg_temp.nf_assert(
  (select count(*) from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace
      and confdeltype = 'c') = 2
  and (select count(*) from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace
      and confdeltype = 'n') = 1
  and (select count(*) from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace
      and confdeltype = 'r') = 2,
  'delete actions are 2 cascade, 1 set null, 2 restrict — order history is protected');

select pg_temp.nf_assert(
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname in ('products_category_id_idx','products_featured_idx',
                        'orders_user_id_created_at_idx','order_items_order_id_idx',
                        'order_items_product_id_idx')) = 5,
  'five explicit indexes exist (every FK is indexed)');

select pg_temp.nf_assert(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
     from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'order_status')
  = array['awaiting_payment','payment_confirmed','processing','shipped','delivered','cancelled'],
  'order_status enum holds exactly the six planned statuses');

select pg_temp.nf_assert(
  (select count(*) from pg_trigger
    where not tgisinternal
      and tgname in ('profiles_set_updated_at','products_set_updated_at',
                     'orders_set_updated_at','on_auth_user_created')) = 4,
  'four triggers exist (three updated_at, one on auth.users)');

select pg_temp.nf_assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_updated_at','handle_new_user')
      and coalesce(p.proconfig::text, '') like '%search_path=%') = 2,
  'both trigger functions pin an empty search_path');

-- ==================================================================
-- 2. Policies and grants
-- ==================================================================
select pg_temp.nf_assert(
  (select count(*) from pg_policies where schemaname = 'public') = 6,
  'six RLS policies exist');

select pg_temp.nf_assert(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename in ('orders','order_items')
      and cmd <> 'SELECT') = 0,
  'orders and order_items carry SELECT-only policies — no client write path');

select pg_temp.nf_assert(
  (select count(*) from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and privilege_type <> 'SELECT') = 0,
  'anon holds SELECT privileges and nothing else');

select pg_temp.nf_assert(
  (select count(*) from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and table_name in ('profiles','orders','order_items')) = 0,
  'anon has no privileges at all on profiles, orders or order_items');

select pg_temp.nf_assert(
  (select count(*) from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'
      and privilege_type = 'SELECT') = 5,
  'authenticated can select all five tables');

select pg_temp.nf_assert(
  (select count(*) from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) = 1,
  'authenticated holds exactly one write privilege: UPDATE on profiles');

select pg_temp.nf_assert(
  (select count(*) from information_schema.role_table_grants
    where grantee = 'service_role' and table_schema = 'public'
      and table_name in ('profiles','categories','products','orders','order_items')
      and privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) = 35,
  'service_role retains full access on all five tables for the trusted server-side path');

-- ==================================================================
-- 3. Seed data
-- ==================================================================
select pg_temp.nf_assert((select count(*) from public.categories) = 4, 'four categories seeded');

select pg_temp.nf_assert((select count(*) from public.products) = 12, 'twelve products seeded');

select pg_temp.nf_assert(
  (select count(*) from (values
      ('shirts','essential-oxford'), ('shirts','graphic-t-shirt'), ('shirts','plain-t-shirt'),
      ('jeans','baggy-jeans'), ('jeans','washed-black-denim'), ('jeans','straight-stone-denim'),
      ('shoes','classic-court-sneaker'), ('shoes','everyday-loafer'), ('shoes','everyday-slide'),
      ('hoodies','studio-heavyweight-hoodie'), ('hoodies','olive-essential-hoodie'), ('hoodies','studio-hoodie')
    ) as t(cat, prod)
    join public.products p on p.slug = t.prod
    join public.categories c on c.id = p.category_id and c.slug = t.cat) = 12,
  'every seeded product sits in the correct category');

select pg_temp.nf_assert(
  (select count(*) from (values
      ('essential-oxford',28000.00), ('graphic-t-shirt',25000.00), ('plain-t-shirt',22000.00),
      ('baggy-jeans',35000.00), ('washed-black-denim',38000.00), ('straight-stone-denim',36000.00),
      ('classic-court-sneaker',55000.00), ('everyday-loafer',62000.00), ('everyday-slide',25000.00),
      ('studio-heavyweight-hoodie',45000.00), ('olive-essential-hoodie',40000.00), ('studio-hoodie',35000.00)
    ) as t(slug, price)
    join public.products p on p.slug = t.slug and p.price = t.price) = 12,
  'seeded prices match the documented catalogue');

select pg_temp.nf_assert(
  (select count(*) from public.products
    where cardinality(sizes) > 0 and cardinality(images) > 0 and stock_quantity > 0) = 12,
  'every seeded product has sizes, images and stock');

-- ==================================================================
-- 4. Fixtures — all of this is rolled back at the end of the script
-- ==================================================================
insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'rls.user.a@example.test', 'authenticated',
   'authenticated', '{"full_name":"Rls User A","phone":"08000000001"}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'rls.user.b@example.test', 'authenticated',
   'authenticated', '{"full_name":"Rls User B"}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'rls.user.c@example.test', 'authenticated',
   'authenticated', '{}'::jsonb, now(), now());

insert into public.orders (id, user_id, order_number, customer_name, customer_email, customer_phone,
                           delivery_address, delivery_city, delivery_state,
                           subtotal, delivery_fee, total)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'NF-TEST-A',
   'Rls User A', 'rls.user.a@example.test', '08000000001', '1 Test Street, Victoria Island',
   'Lagos', 'Lagos', 56000.00, 2000.00, 58000.00),
  ('aaaaaaaa-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'NF-TEST-B',
   'Rls User B', 'rls.user.b@example.test', '08000000002', '2 Test Street, Wuse',
   'Abuja', 'FCT', 62000.00, 2500.00, 64500.00);

insert into public.order_items (order_id, product_id, product_name, quantity, size, unit_price)
select 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, id, 'Essential Oxford', 2, 'L', 28000.00
  from public.products where slug = 'essential-oxford';

insert into public.order_items (order_id, product_id, product_name, quantity, size, unit_price)
select 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, id, 'Everyday Loafer', 1, '42', 62000.00
  from public.products where slug = 'everyday-loafer';

-- ==================================================================
-- 5. Behaviour as the table owner: triggers and constraints
-- ==================================================================
select pg_temp.nf_assert(
  (select count(*) from public.profiles) = 3,
  'auth.users insert trigger created one profile per new user');

select pg_temp.nf_assert(
  (select full_name from public.profiles
    where id = '11111111-1111-4111-8111-111111111111') = 'Rls User A'
  and (select phone from public.profiles
    where id = '11111111-1111-4111-8111-111111111111') = '08000000001',
  'profile copies full_name and phone from user metadata');

select pg_temp.nf_assert(
  (select full_name from public.profiles
    where id = '33333333-3333-4333-8333-333333333333') = 'rls.user.c',
  'profile full_name falls back to the email local part when metadata has no name');

select pg_temp.nf_assert(
  (select count(*) from public.orders) = 2
  and (select count(*) from public.order_items) = 2
  and (select status from public.orders where order_number = 'NF-TEST-A') = 'awaiting_payment',
  'order fixtures exist and default to awaiting_payment');

update public.products set featured = featured where slug = 'plain-t-shirt';
select pg_temp.nf_assert(
  (select updated_at > created_at from public.products where slug = 'plain-t-shirt'),
  'updated_at is maintained automatically by trigger');

select pg_temp.nf_assert_denied(
  $q$insert into public.products (category_id, name, slug, description, price)
    select id, 'Bad', 'bad-price', 'x', -1 from public.categories limit 1$q$,
  'products.price rejects a negative value');

select pg_temp.nf_assert_denied(
  $q$insert into public.products (category_id, name, slug, description, price, stock_quantity)
    select id, 'Bad', 'bad-stock', 'x', 100, -5 from public.categories limit 1$q$,
  'products.stock_quantity rejects a negative value');

select pg_temp.nf_assert_denied(
  $q$insert into public.products (category_id, name, slug, description, price)
    select id, 'Bad', 'essential-oxford', 'x', 100 from public.categories limit 1$q$,
  'products.slug rejects a duplicate value');

select pg_temp.nf_assert_denied(
  $q$insert into public.orders (user_id, order_number, customer_name, customer_email,
       customer_phone, delivery_address, delivery_city, delivery_state,
       subtotal, delivery_fee, total)
     select null, 'NF-TEST-B', 'x', 'x@x.test', '080', 'x', 'x', 'x', 100, 0, 100$q$,
  'orders.order_number rejects a duplicate value');

select pg_temp.nf_assert_denied(
  $q$insert into public.orders (user_id, order_number, customer_name, customer_email,
       customer_phone, delivery_address, delivery_city, delivery_state,
       subtotal, delivery_fee, total)
     select null, 'NF-TEST-C', 'x', 'x@x.test', '080', 'x', 'x', 'x', 100, 50, 100$q$,
  'orders.total must equal subtotal + delivery_fee');

select pg_temp.nf_assert_denied(
  $q$insert into public.order_items (order_id, product_id, product_name, quantity, size, unit_price)
     select o.id, (select id from public.products limit 1), 'x', 0, 'L', 100
     from public.orders o limit 1$q$,
  'order_items.quantity rejects zero');

select pg_temp.nf_assert_denied(
  $q$insert into public.order_items (order_id, product_id, product_name, quantity, size, unit_price)
     select o.id, (select id from public.products limit 1), 'x', 1, 'L', -5
     from public.orders o limit 1$q$,
  'order_items.unit_price rejects a negative value');

select pg_temp.nf_assert_denied(
  $q$delete from public.products where slug = 'essential-oxford'$q$,
  'a product referenced by an order cannot be deleted (on delete restrict)');

-- ==================================================================
-- 6. Anonymous access
-- ==================================================================
set local role anon;

select pg_temp.nf_assert(
  (select count(*) from public.categories) = 4,
  'anon reads all four categories');

select pg_temp.nf_assert(
  (select count(*) from public.products) = 12,
  'anon reads all twelve products');

select pg_temp.nf_assert_denied('select * from public.profiles', 'anon cannot read profiles');
select pg_temp.nf_assert_denied('select * from public.orders', 'anon cannot read orders');
select pg_temp.nf_assert_denied('select * from public.order_items', 'anon cannot read order items');

select pg_temp.nf_assert_denied(
  $q$insert into public.products (category_id, name, slug, description, price)
    select id, 'Anon', 'anon-product', 'x', 1 from public.categories limit 1$q$,
  'anon cannot insert a product');

select pg_temp.nf_assert_denied(
  'update public.products set price = 1', 'anon cannot update a product');

select pg_temp.nf_assert_denied(
  'delete from public.products', 'anon cannot delete a product');

select pg_temp.nf_assert_denied(
  'truncate public.products', 'anon cannot truncate products');

select pg_temp.nf_assert_denied(
  $q$insert into public.categories (name, slug) values ('Anon', 'anon-category')$q$,
  'anon cannot insert a category');

select pg_temp.nf_assert_denied(
  'update public.categories set name = ''x''', 'anon cannot update a category');

select pg_temp.nf_assert_denied(
  'delete from public.categories', 'anon cannot delete a category');

reset role;

-- ==================================================================
-- 7. Authenticated access — simulating user A
-- ==================================================================
set local role authenticated;
select pg_temp.nf_claims('11111111-1111-4111-8111-111111111111');

select pg_temp.nf_assert(
  (select auth.uid() = '11111111-1111-4111-8111-111111111111'::uuid),
  'auth.uid() resolves to the simulated session user');

select pg_temp.nf_assert(
  (select count(*) from public.categories) = 4 and (select count(*) from public.products) = 12,
  'user A still reads the public catalogue');

select pg_temp.nf_assert(
  (select count(*) from public.profiles) = 1,
  'user A sees exactly one profile — their own');

select pg_temp.nf_assert(
  (select count(*) from public.profiles
    where id = '22222222-2222-4222-8222-222222222222') = 0,
  'user A cannot read user B profile');

select pg_temp.nf_assert(
  (select count(*) from public.orders) = 1,
  'user A sees exactly one order — their own');

select pg_temp.nf_assert(
  (select count(*) from public.orders
    where id = 'aaaaaaaa-0000-4000-8000-000000000002') = 0,
  'user A cannot read user B order by swapping the id');

select pg_temp.nf_assert(
  (select count(*) from public.order_items) = 1,
  'user A sees only the items of their own order');

select pg_temp.nf_assert(
  (select count(*) from public.order_items
    where order_id = 'aaaaaaaa-0000-4000-8000-000000000002') = 0,
  'user A cannot read user B order items by swapping order_id');

do $$
declare affected integer;
begin
  update public.profiles set full_name = 'Rls User A Renamed'
    where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics affected = row_count;
  perform pg_temp.nf_assert(affected = 1, 'user A can update their own profile');
end;
$$;

do $$
declare affected integer;
begin
  update public.profiles set full_name = 'Hijacked'
    where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  perform pg_temp.nf_assert(affected = 0, 'user A cannot update user B profile');
end;
$$;

-- `authenticated` holds no DELETE grant on profiles at all, so this is
-- refused outright (stronger than a policy quietly matching zero rows).
select pg_temp.nf_assert_denied(
  'delete from public.profiles where id = ''22222222-2222-4222-8222-222222222222''',
  'user A cannot delete user B profile — DELETE is not granted at all');

select pg_temp.nf_assert_denied(
  $q$insert into public.orders (user_id, order_number, customer_name, customer_email,
       customer_phone, delivery_address, delivery_city, delivery_state,
       subtotal, delivery_fee, total)
     select '11111111-1111-4111-8111-111111111111'::uuid, 'NF-FORGED', 'Forged',
            'a@example.test', '08000000001', 'x', 'x', 'x', 1, 0, 1$q$,
  'a signed-in user cannot create an order through the client (no grant, no policy)');

select pg_temp.nf_assert_denied(
  'update public.orders set status = ''shipped''',
  'a signed-in user cannot update orders');

select pg_temp.nf_assert_denied(
  'delete from public.orders',
  'a signed-in user cannot delete orders');

reset role;

-- ==================================================================
-- 8. RLS itself is the gate, not merely the table grants
--
-- Grants are temporarily widened inside this rolled-back transaction
-- to prove that the policies reject writes even when the database
-- would otherwise allow them.
-- ==================================================================
grant insert, update, delete on public.products, public.orders, public.order_items to authenticated;
grant insert, update, delete on public.profiles, public.categories to authenticated;

set local role authenticated;
select pg_temp.nf_claims('11111111-1111-4111-8111-111111111111');

select pg_temp.nf_assert_denied(
  $q$insert into public.products (category_id, name, slug, description, price)
    select id, 'Rls', 'rls-product', 'x', 1 from public.categories limit 1$q$,
  'RLS blocks product inserts even when INSERT is granted');

select pg_temp.nf_assert_denied(
  $q$insert into public.categories (name, slug) values ('Rls', 'rls-category')$q$,
  'RLS blocks category inserts even when INSERT is granted');

select pg_temp.nf_assert_denied(
  $q$insert into public.order_items (order_id, product_id, product_name, quantity, size, unit_price)
    values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid,
            (select id from public.products limit 1), 'Forged', 1, 'L', 1)$q$,
  'RLS blocks order-item inserts even when INSERT is granted');

do $$
declare affected integer;
begin
  update public.products set price = 1;
  get diagnostics affected = row_count;
  perform pg_temp.nf_assert(affected = 0, 'RLS makes product updates affect zero rows');
end;
$$;

select pg_temp.nf_assert_denied(
  $q$insert into public.orders (user_id, order_number, customer_name, customer_email,
       customer_phone, delivery_address, delivery_city, delivery_state,
       subtotal, delivery_fee, total)
     select '11111111-1111-4111-8111-111111111111'::uuid, 'NF-FORGED-A', 'Forged',
            'a@example.test', '08000000001', 'x', 'x', 'x', 1, 0, 1$q$,
  'RLS blocks order inserts even when INSERT is granted');

do $$
declare affected integer;
begin
  update public.orders set status = 'shipped';
  get diagnostics affected = row_count;
  perform pg_temp.nf_assert(affected = 0, 'RLS makes order updates affect zero rows');
end;
$$;

do $$
declare affected integer;
begin
  delete from public.orders;
  get diagnostics affected = row_count;
  perform pg_temp.nf_assert(affected = 0, 'RLS makes order deletes affect zero rows');
end;
$$;

select pg_temp.nf_assert_denied(
  $q$insert into public.order_items (order_id, product_id, product_name, quantity, size, unit_price)
     values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid,
             (select id from public.products limit 1), 'Forged', 1, 'L', 1)$q$,
  'RLS blocks order-item inserts even when INSERT is granted');

select pg_temp.nf_assert_denied(
  $q$insert into public.profiles (id, full_name, email)
     values ('22222222-2222-4222-8222-222222222222', 'Hijack', 'x@example.test')$q$,
  'RLS blocks profile inserts — profiles are created by the auth trigger only');

reset role;

-- ==================================================================
-- 9. Delete semantics: order history is never silently destroyed
-- ==================================================================
select pg_temp.nf_assert_denied(
  'delete from public.products where slug = ''everyday-loafer''',
  'a product referenced by an order still cannot be deleted');

delete from auth.users where id = '22222222-2222-4222-8222-222222222222';

select pg_temp.nf_assert(
  (select count(*) from public.profiles
    where id = '22222222-2222-4222-8222-222222222222') = 0,
  'deleting an auth user cascades to their profile');

select pg_temp.nf_assert(
  (select user_id is null from public.orders
    where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  'deleting an auth user keeps the order and nulls user_id — no cascade destroy');

select pg_temp.nf_assert(
  (select count(*) from public.order_items
    where order_id = 'aaaaaaaa-0000-4000-8000-000000000002') = 1
  and (select product_name from public.order_items
    where order_id = 'aaaaaaaa-0000-4000-8000-000000000002') = 'Everyday Loafer',
  'order items and their product snapshot survive the deletion of the owner account');

delete from public.orders where id = 'aaaaaaaa-0000-4000-8000-000000000002';

select pg_temp.nf_assert(
  (select count(*) from public.order_items
    where order_id = 'aaaaaaaa-0000-4000-8000-000000000002') = 0,
  'deleting an order cascades to its line items');

select pg_temp.nf_assert(
  (select count(*) from public.orders) = 1 and (select count(*) from public.order_items) = 1,
  'the remaining order and its line item are untouched');

do $$
begin
  raise notice 'ALL PHASE 2 CHECKS PASSED — rolling back fixtures';
end;
$$;

rollback;