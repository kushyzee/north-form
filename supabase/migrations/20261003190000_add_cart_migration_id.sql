-- NORTH & FORM — cart migration idempotency hook.
--
-- RECONSTRUCTED MIGRATION. Not committed when first applied; rebuilt from the
-- live catalog so the recorded version (`20261003190000`) and the file on disk
-- agree again. The live schema is the authority this reproduces.
--
-- Adds `cart_items.migration_id` and the matching `p_migration_id` parameter to
-- private.add_cart_item(). Together they make one-time bulk work idempotent:
--
--   A client about to migrate its anonymous localStorage cart into the server
--   cart generates one migration id, then adds each line with that id. If the
--   request is retried — flaky network, double-tapped button — replaying the
--   same line must not double the quantity. Passing the id that is *already on
--   the line* means "this migration has been applied here", so the increment is
--   skipped and the existing quantity is returned instead.
--
-- `migration_id` is deliberately NOT part of the Phase 1 public API: ordinary
-- adds pass null, which always increments. It is dormant Phase 2 machinery, and
-- application code must never read or write the column directly. See
-- docs/cart.md.
--
-- Append-only: 20261003101200 and 20261003101300 are recorded in
-- supabase_migrations.schema_migrations and are left untouched.

alter table public.cart_items
  add column migration_id uuid;

-- ------------------------------------------------------------------
-- The function is replaced wholesale because the parameter list changes.
-- `create or replace` cannot add a parameter, and dropping first would
-- momentarily remove the grant.
-- ------------------------------------------------------------------
drop function if exists private.add_cart_item(uuid, text, integer);

create or replace function private.add_cart_item(
  p_product_id uuid,
  p_size text,
  p_quantity integer,
  p_migration_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Everything below is derived from verified claims or from the catalogue.
  -- There is no user_id, price, stock or name parameter.
  v_user_id uuid := auth.uid();
  v_size    text := btrim(coalesce(p_size, ''));
  v_stock   integer;
  v_sizes   text[];

  -- The line as it stands, including which migration last touched it.
  v_current    integer;
  v_current_id uuid;
  v_current_row uuid;

  v_total   integer;
  v_line_id uuid;
  v_stored  integer;
begin
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
  -- 2. The catalogue is the authority on existence, size and stock. Nothing
  --    the caller said about any of them is read above.
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
  select ci.quantity, ci.migration_id, ci.id
    into v_current, v_current_id, v_current_row
    from public.cart_items ci
   where ci.user_id = v_user_id
     and ci.product_id = p_product_id
     and ci.size = v_size;

  -- ------------------------------------------------------------------
  -- 4. Replay: this migration has already been applied to this line.
  --
  --    Returns the quantity that is already there and writes nothing. It is
  --    checked *before* the stock test below, because a replay must not be
  --    refused for exceeding stock: the units are in the cart already, and
  --    refusing would leave a migration permanently stuck. The upsert in step 6
  --    carries the same guard, and that one is what makes this correct under
  --    concurrency — this read only avoids a spurious rejection.
  --
  --    `=` rather than `is not distinct from` is deliberate and load-bearing:
  --    with no key on either side the comparison is NULL, not true, so an
  --    ordinary add falls straight through to incrementing.
  -- ------------------------------------------------------------------
  if p_migration_id is not null and v_current_id = p_migration_id then
    return jsonb_build_object('line_id', v_current_row, 'quantity', v_current);
  end if;

  -- ------------------------------------------------------------------
  -- 5. Stock is checked against the quantity the line would *end up* at,
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
  -- 6. Merge into the existing line, or start one. `cart_items_line_unique`
  --    makes this the only outcome: a second row for the same product+size
  --    is impossible, so neither an add nor a migration can duplicate a line.
  --
  --    The increment is computed in SQL rather than from `v_total` above, so a
  --    concurrent write committed between the two statements is folded in
  --    instead of overwritten. Under READ COMMITTED, ON CONFLICT DO UPDATE
  --    re-reads the row the other transaction committed, so two *identical*
  --    migrations racing each other serialise here: the first applies and
  --    records the key, the second re-reads, sees its own key, and adds
  --    nothing. That is the whole guarantee, and it needs nothing from the
  --    browser.
  -- ------------------------------------------------------------------
  insert into public.cart_items (user_id, product_id, size, quantity, migration_id)
  values (v_user_id, p_product_id, v_size, p_quantity, p_migration_id)
  on conflict (user_id, product_id, size) do update
    set quantity = case
                     when public.cart_items.migration_id = excluded.migration_id
                       then public.cart_items.quantity
                     else public.cart_items.quantity + excluded.quantity
                   end,
        migration_id = excluded.migration_id
  returning id, quantity into v_line_id, v_stored;

  return jsonb_build_object(
    'line_id',  v_line_id,
    -- The quantity the line now holds, not the amount that was added. A caller
    -- that asks "what did the cart end up at" gets a truthful answer, and a
    -- replay gets the same number as the call that applied it.
    'quantity', v_stored
  );
end;
$$;

comment on function private.add_cart_item(uuid, text, integer, uuid) is
  'Adds p_quantity units of p_product_id in p_size to the caller''s cart, merging into the existing line when one is already there. The owner is auth.uid(); the increment happens inside the conflicting statement so concurrent adds do not lose each other. Product existence, size and stock are re-read from the catalogue. Takes no price and no stock figure from the caller. p_migration_id makes the operation idempotent: pass the id of an anonymous-cart migration and the increment is skipped if that migration has already been applied to this line. Leave it null for an ordinary add, which always increments.';

revoke all on function private.add_cart_item(uuid, text, integer, uuid) from public, anon;
grant execute on function private.add_cart_item(uuid, text, integer, uuid) to authenticated;
