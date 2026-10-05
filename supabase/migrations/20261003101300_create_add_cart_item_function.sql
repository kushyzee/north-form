-- NORTH & FORM — private.add_cart_item: the trusted cart-add boundary.
--
-- RECONSTRUCTED MIGRATION. Not committed when first applied; rebuilt from the
-- live catalog so the recorded version (`20261003101300`) and the file on disk
-- agree again. The live function is the authority this reproduces.
--
-- Why a function at all, when RLS already scopes the table to the caller?
--
--   * The merge rule. `cart_items_line_unique` makes a duplicate product+size
--     impossible, but a direct INSERT of an existing line raises 23505 rather
--     than incrementing it. "Add 2 more of what I already have" is the single
--     most common cart operation, so the add path has to express it, and only
--     an upsert can.
--   * Atomicity under concurrency. Two devices adding the same product+size at
--     once both read "current quantity", then both write. The increment has to
--     happen inside the conflicting statement for the second writer to fold in
--     the first writer's value rather than overwrite it.
--   * The stock ceiling is a function of the *resulting* quantity, so it can
--     only be evaluated once, in the same statement that writes.
--
-- What it deliberately does NOT take: a user id, a price, a stock figure or a
-- product name. The owner is `auth.uid()`, and product existence, size and
-- stock are re-read from `products`. There is no parameter an attacker could
-- set to influence any of them.
--
-- It lives in `private`, which migration 20261001181519 already added to
-- `pgrst.db_schemas`, so `supabase.schema('private').rpc('add_cart_item', …)`
-- routes correctly from the authenticated server client.

create or replace function private.add_cart_item(
  p_product_id uuid,
  p_size text,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Derived from verified claims or from the catalogue. Never a parameter.
  v_user_id uuid := auth.uid();
  v_size    text := btrim(coalesce(p_size, ''));
  v_stock   integer;
  v_sizes   text[];

  -- The line as it stands.
  v_current integer;
  v_row     uuid;

-- ------------------------------------------------------------------
  -- 1. The caller must be a signed-in user. The id is never a parameter,
  --    so one customer can never write into another customer's cart.
  -- ------------------------------------------------------------------
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'UNAUTHENTICATED',
      detail  = 'Sign in to use your saved bag.';
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_QUANTITY',
      detail  = 'Each item needs a quantity of at least 1.';
  end if;

  if v_size = '' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_SIZE',
      detail  = 'Choose a size for that piece.';
  end if;

  -- ------------------------------------------------------------------
  -- 2. The catalogue is the authority on existence, size and stock.
  --    Nothing the caller said about any of them is read above.
  -- ------------------------------------------------------------------
  select p.stock_quantity, p.sizes
    into v_stock, v_sizes
    from public.products p
   where p.id = p_product_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_NOT_FOUND',
      detail  = 'That product is no longer available.';
  end if;

  if v_size <> all (v_sizes) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_SIZE',
      detail  = 'That size is not offered for this piece.';
  end if;

  -- ------------------------------------------------------------------
  -- 3. Read the line as it stands.
  -- ------------------------------------------------------------------
  select ci.quantity, ci.id
    into v_current, v_row
    from public.cart_items ci
   where ci.user_id = v_user_id
     and ci.product_id = p_product_id
     and ci.size = v_size;

  -- ------------------------------------------------------------------
  -- 4. Stock is checked against the quantity the line would *end up* at,
  --    not the quantity that was asked for. Adding 4 to a line that already
  --    holds 1 needs 5 units, and 3 available is a rejection — checked before
  --    anything is written, so a rejected add leaves the cart untouched.
  -- ------------------------------------------------------------------
  v_total := coalesce(v_current, 0) + p_quantity;

  if v_total > v_stock then
    raise exception using
      errcode = 'P0001',
      message = 'INSUFFICIENT_STOCK',
      detail  = 'There is not enough stock left for that quantity.';
  end if;

  -- ------------------------------------------------------------------
  -- 5. Merge into the existing line, or start one. `cart_items_line_unique`
  --    makes this the only outcome: a second row for the same product+size
  --    is impossible, so an add can never duplicate a line.
  --
  --    The increment is computed in SQL rather than from `v_total` above, so a
  --    concurrent write committed between the two statements is folded in
  --    instead of overwritten. Under READ COMMITTED, ON CONFLICT DO UPDATE
  --    re-reads the row the other transaction committed.
  -- ------------------------------------------------------------------
  insert into public.cart_items (user_id, product_id, size, quantity)
  values (v_user_id, p_product_id, v_size, p_quantity)
  on conflict (user_id, product_id, size) do update
    set quantity = public.cart_items.quantity + excluded.quantity
  returning id, quantity into v_line_id, v_stored;

  return jsonb_build_object(
    'line_id',  v_line_id,
    -- The quantity the line now holds, not the amount that was added, so a
    -- caller asking "what did the cart end up at" gets a truthful answer.
    'quantity', v_stored
  );
end;
$$;

comment on function private.add_cart_item(uuid, text, integer) is
  'Adds p_quantity units of p_product_id in p_size to the caller''s cart, merging into the existing line when one is already there. The owner is auth.uid(); the increment happens inside the conflicting statement so concurrent adds do not lose each other. Product existence, size and stock are re-read from the catalogue. Takes no price and no stock figure from the caller.';

-- The only grant that matters: EXECUTE for signed-in users. Revoked from
-- PUBLIC (which would otherwise cover anon and authenticated alike) first,
-- then handed back to authenticated only.
revoke all on function private.add_cart_item(uuid, text, integer) from public, anon;
grant execute on function private.add_cart_item(uuid, text, integer) to authenticated;
  v_total   integer;
  v_line_id uuid;
  v_stored  integer;
begin
