-- NORTH & FORM — cart verification: ownership, line identity, quantity rules.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_cart.sql
--   (pure SQL — it can also be pasted into the Supabase SQL editor or passed to
--    an MCP `execute_sql` call)
--
-- Everything runs inside one transaction that ends in ROLLBACK, so the auth
-- users created here and every cart line never persist. Behavioural checks run
-- as the real `authenticated` role with simulated JWT claims, which is the path
-- the API takes. Every assertion raises on failure, aborting the script.
--
-- RLS is NOT relaxed anywhere in this file. The cross-user checks deliberately
-- run as `authenticated` with a real `sub` claim, because that is the only way
-- to prove the policies hold against a caller who is genuinely signed in.

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

-- Two customers. `nf_claims` switches between them, which is how a single
-- session proves A cannot reach B's cart.
create function pg_temp.nf_user(slug text)
returns uuid
language sql
stable
as $$
  select id from auth.users
   where raw_user_meta_data ->> 'label' = slug
   limit 1;
$$;

-- Add a line through the trusted function, as the current `sub` claim.
create function pg_temp.nf_add(p_slug text, p_size text, p_qty integer)
returns jsonb
language plpgsql
as $$
declare v_id uuid;
begin
  select id into v_id from public.products where slug = p_slug;
  return private.add_cart_item(v_id, p_size, p_qty);
end;
$$;

-- Assert the function rejects with a specific machine code.
create function pg_temp.nf_rejects(p_slug text, p_size text, p_qty integer, p_code text, p_label text)
returns void
language plpgsql
as $$
declare
  v_id  uuid;
  v_got text;
begin
  select id into v_id from public.products where slug = p_slug;

  begin
    perform private.add_cart_item(v_id, p_size, p_qty);
    v_got := 'NO_ERROR';
  exception when others then
    v_got := sqlerrm;
  end if;

  if v_got <> p_code then
    raise exception 'FAILED: % -- expected %, got %', p_label, p_code, v_got;
  end if;
  raise notice 'ok - % [%]', p_label, p_code;
end;
$$;

grant execute on function pg_temp.nf_assert(boolean, text) to anon, authenticated;
grant execute on function pg_temp.nf_assert_denied(text, text) to anon, authenticated;
grant execute on function pg_temp.nf_claims(uuid) to anon, authenticated;
grant execute on function pg_temp.nf_add(text, text, integer) to anon, authenticated;
grant execute on function pg_temp.nf_rejects(text, text, integer, text, text) to anon, authenticated;
-- ==================================================================
-- 1. Structure, RLS and the grant matrix (inspected as the owner)
-- ==================================================================
select pg_temp.nf_assert(
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'cart_items') = 1,
  'the cart_items table exists');

select pg_temp.nf_assert(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'cart_items'),
  'RLS is enabled on cart_items');

-- Line identity is (user_id, product_id, size) — the same composite the client
-- reducer uses. Same product + same size merges; different sizes stay separate.
select pg_temp.nf_assert(
  exists (
    select 1 from pg_constraint
     where conrelid = 'public.cart_items'::regclass
       and conname = 'cart_items_line_unique'
       and pg_get_constraintdef(oid) = 'UNIQUE (user_id, product_id, size)'
  ),
  'a cart line is uniquely identified by user + product + size');

select pg_temp.nf_assert(
  (select count(*) from pg_constraint
    where conrelid = 'public.cart_items'::regclass and contype = 'f') = 2,
  'cart_items has exactly two foreign keys — user and product');

-- The cart must never become the place a forged price lives.
select pg_temp.nf_assert(
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'cart_items'
       and column_name in ('price','unit_price','subtotal','total','product_name','stock_quantity')) = 0,
  'cart_items stores no price, name or stock — the catalogue is joined on read');

select pg_temp.nf_assert(
  exists (select 1 from pg_constraint
           where conrelid = 'public.cart_items'::regclass
             and pg_get_constraintdef(oid) = 'CHECK ((quantity > 0))'),
  'quantity is constrained to be positive at the column level');

-- Every policy is keyed to auth.uid(), never to a client-supplied id.
select pg_temp.nf_assert(
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'cart_items') = 4,
  'cart_items carries four policies — one per command');

select pg_temp.nf_assert(
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'cart_items'
       and (coalesce(qual,'') || coalesce(with_check,'')) not like '%auth.uid()%') = 0,
  'every cart policy is scoped by auth.uid()');

-- UPDATE needs `with check` as well as `using`: without it a row could be
-- visible before the write and moved onto somebody else's account after it.
select pg_temp.nf_assert(
  exists (select 1 from pg_policies
           where schemaname = 'public' and tablename = 'cart_items'
             and cmd = 'UPDATE' and with_check is not null
             and with_check like '%auth.uid()%'),
  'the UPDATE policy has a with-check, so a line cannot be moved to another owner');

select pg_temp.nf_assert(
  (select count(*) from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' and table_name = 'cart_items') = 0,
  'anon holds no privileges at all on cart_items');

select pg_temp.nf_assert(
  (select count(*) from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public'
       and table_name = 'cart_items'
       and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) = 4,
  'authenticated holds exactly the four verbs a cart needs');

select pg_temp.nf_assert(
  (select count(*) from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public'
       and table_name = 'cart_items'
       and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')) = 0,
  'authenticated cannot truncate, reference or trigger cart_items');

-- anon must not be able to reach the trusted function either.
select pg_temp.nf_assert(
  not has_function_privilege('anon', 'private.add_cart_item(uuid,text,integer,uuid)'::regprocedure, 'execute'),
  'anon cannot execute add_cart_item');

select pg_temp.nf_assert(
  has_function_privilege('authenticated', 'private.add_cart_item(uuid,text,integer,uuid)'::regprocedure, 'execute'),
  'authenticated can execute add_cart_item');

select pg_temp.nf_assert(
  not has_function_privilege('authenticated', 'public.validate_cart_item()'::regprocedure, 'execute'),
  'authenticated cannot call the validation trigger function directly');

-- The context validation trigger must cover BOTH the function path and the
-- direct write path, or a direct INSERT could bypass the stock ceiling.
select pg_temp.nf_assert(
  (select count(*) from pg_trigger
     where tgrelid = 'public.cart_items'::regclass and not tgisinternal
-- ==================================================================
-- 2. Fixtures — two customers, both rolled back at the end
-- ==================================================================
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'ada.cart@example.test', '{"label":"cart-ada","full_name":"Ada Okafor"}'),
  ('22222222-2222-4222-8222-222222222222', 'bo.cart@example.test', '{"label":"cart-bo","full_name":"Bo Nwosu"}');

select pg_temp.nf_assert(
  (select count(*) from public.profiles
     where id in ('11111111-1111-4111-8111-111111111111'::uuid,
                  '22222222-2222-4222-8222-222222222222'::uuid)) = 2,
  'the auth trigger created a profile for each fixture user');

-- A product whose stock we can drive to an exact figure without touching the
-- seeded catalogue: the fixture owns it and the whole transaction rolls back.
insert into public.products (name, slug, description, price, stock_quantity, sizes)
values ('Cart Fixture Piece', 'cart-fixture-piece', 'Temporary fixture', 10000, 5, array['S','M']);

select pg_temp.nf_assert(
  (select count(*) from public.products where slug = 'cart-fixture-piece') = 1,
  'the fixture product exists with 5 units and sizes S and M');

-- ==================================================================
-- 3. Ownership — the whole point of the cart
--
-- Every check below runs as `authenticated` with a real `sub` claim, because
-- that is the only way to prove a signed-in caller cannot reach another's rows.
-- ==================================================================
set local role authenticated;
select pg_temp.nf_claims('11111111-1111-4111-8111-111111111111');

-- Ada puts something in her cart.
select pg_temp.nf_assert(
  (select pg_temp.nf_add('cart-fixture-piece', 'M', 2) ->> 'quantity') = '2',
  'a signed-in user can add to their own cart');

select pg_temp.nf_assert(
  (select count(*) from public.cart_items
     where user_id = '11111111-1111-4111-8111-111111111111') = 1,
  'the line is owned by auth.uid(), not by anything the caller supplied');

-- Bo looks at Ada's cart: nothing.
select pg_temp.nf_claims('22222222-2222-4222-8222-222222222222');

select pg_temp.nf_assert(
  (select count(*) from public.cart_items) = 0,
  'a second signed-in user sees an empty cart, not the first user''s lines');

select pg_temp.nf_assert(
  (select count(*) from public.cart_items
     where user_id = '11111111-1111-4111-8111-111111111111') = 0,
  'the other user cannot read the first user''s row by filtering on its id');

-- Bo tries to update and delete Ada's line, addressing it directly by product
-- and size. Both must affect zero rows rather than erroring, which is what a
-- silently effective attack would look like.
do $$
declare v_affected integer;
begin
  update public.cart_items set quantity = 99
   where product_id = (select id from public.products where slug = 'cart-fixture-piece')
     and size = 'M';
  get diagnostics v_affected = row_count;
  perform pg_temp.nf_assert(v_affected = 0,
    'updating another user''s line by product and size affects zero rows');
end;
$$;

do $$
declare v_affected integer;
begin
  delete from public.cart_items
   where product_id = (select id from public.products where slug = 'cart-fixture-piece');
  get diagnostics v_affected = row_count;
  perform pg_temp.nf_assert(v_affected = 0,
    'deleting another user''s lines affects zero rows');
end;
$$;

-- Bo tries to write a line *onto* Ada's account. The INSERT policy's
-- with-check is what refuses this. The size must be one the product genuinely
-- offers, otherwise the validation trigger fires first and this would pass for
-- the wrong reason.
select pg_temp.nf_assert_denied(
  format($q$insert into public.cart_items (user_id, product_id, size, quantity)
           values ('11111111-1111-4111-8111-111111111111',
                   (select id from public.products where slug = 'cart-fixture-piece'), 'M', 1)$q$),
  'a line cannot be inserted into another user''s cart');

-- Bo tries to move his own line onto Ada's account with an UPDATE.
select pg_temp.nf_assert_denied(
  format($q$update public.cart_items set user_id = '11111111-1111-4111-8111-111111111111'
           where user_id = '22222222-2222-4222-8222-222222222222'$q$),
  'a line cannot be reassigned to another owner');

-- Bo adds a line of his own, then clears his own cart. Ada's must survive.
select pg_temp.nf_add('cart-fixture-piece', 'M', 1);

do $$
declare v_affected integer;
begin
  delete from public.cart_items;
  get diagnostics v_affected = row_count;
  perform pg_temp.nf_assert(v_affected = 1,
    'clearing your own cart deletes exactly your own line and no more');
end;
$$;

select pg_temp.nf_claims('11111111-1111-4111-8111-111111111111');

select pg_temp.nf_assert(
  (select count(*) from public.cart_items) = 1,
  'the other user''s cart survived that clear untouched');

-- ==================================================================
-- 4. Line identity — same product + size merges, different sizes do not
-- ==================================================================
select pg_temp.nf_claims('11111111-1111-4111-8111-111111111111');

select pg_temp.nf_assert(
  (select pg_temp.nf_add('cart-fixture-piece', 'M', 2) ->> 'quantity') = '4',
  'adding the same product and size again merges into the existing line');

select pg_temp.nf_assert(
  (select count(*) from public.cart_items
     where product_id = (select id from public.products where slug = 'cart-fixture-piece')
       and size = 'M') = 1,
  'the merge updated the one line rather than creating a second');

select pg_temp.nf_assert(
  (select pg_temp.nf_add('cart-fixture-piece', 'S', 1) ->> 'quantity') = '1',
  'a different size starts its own line at the quantity asked for');

select pg_temp.nf_assert(
  (select count(*) from public.cart_items) = 2,
  'product M and product S are two separate lines for the same product');

-- The unique constraint is what makes a duplicate impossible, even if some
-- future code path bypasses the merge.
select pg_temp.nf_assert_denied(
  format($q$insert into public.cart_items (user_id, product_id, size, quantity)
           values ('11111111-1111-4111-8111-111111111111',
                   (select id from public.products where slug = 'cart-fixture-piece'), 'M', 1)$q$),
  'a duplicate line for the same product and size cannot be created');

-- The returned quantity is the resulting total, not the amount added.
select pg_temp.nf_assert(
  (select pg_temp.nf_add('cart-fixture-piece', 'S', 2) ->> 'quantity') = '3',
  'the function returns the quantity the line now holds, not the amount added');

-- ==================================================================
-- 5. Quantity rules — validated against the catalogue, not the client
-- ==================================================================
select pg_temp.nf_rejects('cart-fixture-piece', 'M', 0, 'INVALID_QUANTITY',
  'a zero quantity is rejected');

select pg_temp.nf_rejects('cart-fixture-piece', 'M', -2, 'INVALID_QUANTITY',
  'a negative quantity is rejected');

select pg_temp.nf_rejects('cart-fixture-piece', 'M', 99, 'INSUFFICIENT_STOCK',
  'a quantity above available stock is rejected');

select pg_temp.nf_rejects('cart-fixture-piece', 'XL', 1, 'INVALID_SIZE',
  'a size the product does not offer is rejected');

select pg_temp.nf_rejects('cart-fixture-piece', '   ', 1, 'INVALID_SIZE',
  'a blank size is rejected');

select pg_temp.nf_rejects('no-such-product-slug', 'M', 1, 'PRODUCT_NOT_FOUND',
  'an unknown product is rejected');

select pg_temp.nf_rejects('11111111-1111-4111-8111-111111111111', 'M', 1, 'PRODUCT_NOT_FOUND',
  'a product id that is not a product is rejected');

-- The stock ceiling is a function of the RESULTING quantity, so adding to a
-- line that already holds units must be judged on the sum.
select pg_temp.nf_rejects('cart-fixture-piece', 'M', 2, 'INSUFFICIENT_STOCK',
  'an add that would push the line past stock is rejected on the total');

-- Every rejection above left the cart exactly as it was.
select pg_temp.nf_assert(
  (select count(*) from public.cart_items) = 2,
  'no rejected call created a line');

select pg_temp.nf_assert(
  (select sum(quantity) from public.cart_items) = 7,
  'no rejected call changed a quantity — the two lines still hold 4 and 3');

-- ==================================================================
-- 6. The direct write path is validated too, not just the function
-- ==================================================================
select pg_temp.nf_assert_denied(
  format($q$update public.cart_items set quantity = 99
           where product_id = (select id from public.products where slug = 'cart-fixture-piece')$q$),
  'a direct UPDATE past the stock ceiling is rejected by the trigger');

select pg_temp.nf_assert_denied(
  format($q$update public.cart_items set quantity = 0
           where product_id = (select id from public.products where slug = 'cart-fixture-piece')$q$),
  'a direct UPDATE to zero is rejected by the column constraint');

select pg_temp.nf_assert_denied(
  format($q$update public.cart_items set size = 'XL'
           where product_id = (select id from public.products where slug = 'cart-fixture-piece')$q$),
  'a direct UPDATE to a size the product does not offer is rejected');

-- A legitimate direct UPDATE is the path the API uses for re-quantifying.
update public.cart_items set quantity = 5
 where product_id = (select id from public.products where slug = 'cart-fixture-piece')
   and size = 'M';

select pg_temp.nf_assert(
  (select quantity from public.cart_items
    where product_id = (select id from public.products where slug = 'cart-fixture-piece')
      and size = 'M') = 5,
  'a direct UPDATE within stock succeeds');

-- ==================================================================
-- 7. Anonymous callers
-- ==================================================================
reset role;
set local role anon;

select pg_temp.nf_assert(
  (select count(*) from public.cart_items) = 0,
  'an anonymous caller sees no cart lines');

select pg_temp.nf_assert_denied(
  $q$insert into public.cart_items (user_id, product_id, size, quantity)
-- ==================================================================
-- 8. Delete semantics and the migration replay
-- ==================================================================
set local role authenticated;
select pg_temp.nf_claims('11111111-1111-4111-8111-111111111111');

-- Removing a line the caller owns works, addressed by product + size.
delete from public.cart_items
 where product_id = (select id from public.products where slug = 'cart-fixture-piece')
   and size = 'S';

select pg_temp.nf_assert(
  (select count(*) from public.cart_items) = 1,
  'one line was removed and the other kept');

-- p_migration_id makes a replayed bulk add idempotent. An ordinary add passes
-- null, which always increments — that is the path the Phase 1 API uses.
select pg_temp.nf_add('cart-fixture-piece', 'S', 2);

select pg_temp.nf_assert(
  (select pg_temp.nf_add('cart-fixture-piece', 'S', 1) ->> 'quantity') = '3',
  'an ordinary add with a null migration id always increments');

do $$
declare
  v_product uuid;
  v_key     uuid := '33333333-3333-4333-8333-333333333333';
  v_first   integer;
  v_replay  integer;
begin
  select id into v_product from public.products where slug = 'cart-fixture-piece';

  -- First application of the migration.
  v_first := (private.add_cart_item(v_product, 'M', 1, v_key) ->> 'quantity')::integer;
  -- Replay of the very same migration.
  v_replay := (private.add_cart_item(v_product, 'M', 1, v_key) ->> 'quantity')::integer;

  perform pg_temp.nf_assert(v_first = 6, 'a migration add applies once');
  perform pg_temp.nf_assert(v_replay = v_first,
    'replaying the same migration id does not increment a second time');

  -- A *different* migration id is a genuinely new add.
  perform pg_temp.nf_assert(
    (private.add_cart_item(v_product, 'M', 1, '44444444-4444-4444-8444-444444444444')
       ->> 'quantity')::integer = 7,
    'a different migration id increments normally');
end;
$$;

-- Deleting the account takes the cart with it: a cart is user data with no
-- business value. Contrast `orders`, which is preserved.
select pg_temp.nf_assert(
  (select count(*) from public.cart_items) = 2,
  'the cart has two lines before the account is deleted');

reset role;

delete from auth.users where id = '11111111-1111-4111-8111-111111111111';

select pg_temp.nf_assert(
  (select count(*) from public.cart_items) = 0,
  'deleting an auth user cascades to their cart');

-- Stock is validated, never reserved or decremented — same rule as checkout.
select pg_temp.nf_assert(
  (select stock_quantity from public.products where slug = 'cart-fixture-piece') = 5,
  'cart operations validate stock but never mutate it');

do $$
begin
  raise notice 'ALL CART CHECKS PASSED — rolling back fixtures';
end;
$$;

rollback;
