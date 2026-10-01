-- NORTH & FORM — Phase 5B-1: the trusted order-creation boundary.
--
-- The browser can never write an order: `authenticated` holds SELECT on
-- `orders` / `order_items` and nothing more, and RLS has no INSERT policy.
-- This function is the single write path, and it owns every value that must
-- not come from the client: the customer identity (`auth.uid()`), product
-- existence, size, stock, unit price, product name, delivery fee, subtotal,
-- total and the initial order status.
--
-- It lives in a non-public `private` schema. PostgREST only exposes
-- `public, graphql_public`, so the schema is added to the exposed list at the
-- bottom of this migration. That is what makes
-- `supabase.schema('private').rpc('place_order', ...)` work from the
-- authenticated server client in Phase 5B-2, without moving the function into
-- `public` and without granting any client a direct INSERT.

create schema if not exists private;

-- Nothing by default; the grants below are the whole story.
revoke all on schema private from public, anon, authenticated;

-- `authenticator` is the role PostgREST connects as and uses to build its
-- schema cache, so it needs USAGE for the schema to be discoverable at all.
grant usage on schema private to authenticator, authenticated;

create or replace function private.place_order(
  p_cart jsonb,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_city text,
  p_delivery_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Everything below is derived from verified claims or from the catalogue.
  -- There is no user_id, price, subtotal, fee, total or status parameter.
  v_user_id uuid := auth.uid();

  v_name    text := btrim(coalesce(p_customer_name, ''));
  v_email   text := btrim(coalesce(p_customer_email, ''));
  v_phone   text := btrim(coalesce(p_customer_phone, ''));
  v_address text := btrim(coalesce(p_delivery_address, ''));
  v_city    text := btrim(coalesce(p_delivery_city, ''));
  v_state   text := btrim(coalesce(p_delivery_state, ''));

  v_subtotal     numeric(12, 2) := 0;
  v_delivery_fee numeric(12, 2);
  v_total        numeric(12, 2);
  v_order_id     uuid;
  v_order_number text;

  v_missing integer;
  v_sizes   integer;
  v_stock   integer;
  v_item    jsonb;
  v_try     integer;
begin
  -- ------------------------------------------------------------------
  -- 1. The caller must be a signed-in user. The id is never a parameter,
  --    so one customer can never create an order owned by another.
  -- ------------------------------------------------------------------
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'UNAUTHENTICATED',
      detail  = 'Sign in before placing an order.';
  end if;

  -- ------------------------------------------------------------------
  -- 2. Customer and delivery text. The columns carry NOT NULL + non-blank
  --    checks, but a constraint violation would surface as a raw 23514,
  --    so the same rules are enforced here with a stable error code.
  -- ------------------------------------------------------------------
  if v_name = '' or v_email = '' or v_phone = ''
     or v_address = '' or v_city = '' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_CUSTOMER',
      detail  = 'Name, email, phone, delivery address and city are all required.';
  end if;

  if length(v_name) > 120 or length(v_email) > 254
     or length(v_phone) > 32 or length(v_address) > 300
     or length(v_city) > 120 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_CUSTOMER',
      detail  = 'One or more contact or delivery fields is longer than allowed.';
  end if;

  -- ------------------------------------------------------------------
  -- 3. Destination. Kept deliberately in step with the canonical list in
  --    lib/checkout/nigeria-states.ts: 36 states plus the FCT.
  -- ------------------------------------------------------------------
  if v_state <> all (array[
       'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa',
       'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti',
       'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
       'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
       'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe',
       'Zamfara', 'Federal Capital Territory'
     ]) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_STATE',
      detail  = 'Delivery state must be one of the 36 states or the Federal Capital Territory.';
  end if;

  -- ------------------------------------------------------------------
  -- 4. Cart shape. The payload is never trusted because the browser
  --    validated it — the Zod contract is a UX affordance, this is the
  --    boundary.
  -- ------------------------------------------------------------------
  if p_cart is null or jsonb_typeof(p_cart) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_CART',
      detail  = 'The cart must be a JSON array of items.';
  end if;

  if jsonb_array_length(p_cart) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'EMPTY_CART',
      detail  = 'The cart is empty.';
  end if;

  for v_item in select jsonb_array_elements(p_cart) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_CART_ITEM',
        detail  = 'Each cart item must be an object.';
    end if;

    -- Checked as text before casting, so a malformed id is a business error
    -- rather than a raw 22P02 from uuid_in().
    if jsonb_typeof(v_item -> 'product_id') <> 'string'
       or (v_item ->> 'product_id')
          !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_CART_ITEM',
        detail  = 'Each cart item needs a product_id that is a UUID.';
    end if;

    if jsonb_typeof(v_item -> 'size') <> 'string'
       or btrim(v_item ->> 'size') = '' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_CART_ITEM',
        detail  = 'Each cart item needs a size.';
    end if;

    -- A JSON number, not a string, and a whole one. Six digits is far more
    -- than any product holds and keeps the numeric parse bounded.
    if jsonb_typeof(v_item -> 'quantity') <> 'number'
       or (v_item ->> 'quantity') !~ '^[0-9]{1,6}$' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_CART_ITEM',
        detail  = 'Each cart item needs a whole quantity of at least 1.';
    end if;
  end loop;

  -- The cart model merges a product+size into one line, so a repeat is a
  -- forged or malformed payload rather than a legitimate second line.
  if exists (
    select 1
    from jsonb_array_elements(p_cart) as a(el)
    group by (el ->> 'product_id'), btrim(el ->> 'size')
    having count(*) > 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_CART_ITEM',
      detail  = 'The same product and size may appear only once.';
  end if;

  -- ------------------------------------------------------------------
  -- 5. Product existence, size and stock, plus the authoritative
  --    subtotal, resolved in one pass over the catalogue. The entire cart
  --    is validated before anything is written, so one bad line aborts the
  --    order instead of producing a partial one.
  --
  --    quantity is compared as numeric rather than cast to integer, so an
  --    absurd value fails the stock comparison instead of overflowing.
  -- ------------------------------------------------------------------
  with lines as (
    select
      (e ->> 'product_id')::uuid   as product_id,
      btrim(e ->> 'size')          as size,
      (e ->> 'quantity')::numeric  as quantity
    from jsonb_array_elements(p_cart) as a(e)
  )
  select
    count(*) filter (where p.id is null)::integer,
    count(*) filter (
      where p.id is not null and l.size <> all (p.sizes)
    )::integer,
    count(*) filter (
      where p.id is not null
        and l.size = all (p.sizes)
        and l.quantity > p.stock_quantity
    )::integer,
    coalesce(
      sum(p.price * l.quantity) filter (
        where p.id is not null
          and l.size = all (p.sizes)
          and l.quantity <= p.stock_quantity
      ),
      0
    )
  into v_missing, v_sizes, v_stock, v_subtotal
  from lines l
  left join public.products p on p.id = l.product_id;

  if v_missing > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_NOT_FOUND',
      detail  = 'One or more items in the cart is no longer available.';
  end if;

  if v_sizes > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_SIZE',
      detail  = 'One or more items are not offered in the requested size.';
  end if;

  if v_stock > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'INSUFFICIENT_STOCK',
      detail  = 'One or more items do not have enough stock left for that quantity.';
  end if;

  -- ------------------------------------------------------------------
  -- 6. Delivery fee, from the destination alone. Never a parameter.
  -- ------------------------------------------------------------------
  v_delivery_fee := case
    when v_state = 'Lagos' then 2000
    when v_state = 'Federal Capital Territory' then 2500
    when v_state = 'Rivers' then 3000
    else 4000
  end;

  v_total := v_subtotal + v_delivery_fee;

  -- ------------------------------------------------------------------
  -- 7. The order. 64 bits of hex from a CSPRNG; 48 would already be
  --    unguessable, 64 leaves a comfortable margin. The retry covers the
  --    astronomically unlikely collision so it never surfaces as a raw
  --    23505 unique_violation.
  -- ------------------------------------------------------------------
  for v_try in 1 .. 3 loop
    v_order_number := 'NF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

    begin
      insert into public.orders (
        user_id, order_number, status,
        customer_name, customer_email, customer_phone,
        delivery_address, delivery_city, delivery_state,
        subtotal, delivery_fee, total
      )
      values (
        v_user_id, v_order_number, 'awaiting_payment',
        v_name, v_email, v_phone,
        v_address, v_city, v_state,
        v_subtotal, v_delivery_fee, v_total
      )
      returning id into v_order_id;

      exit;
    exception
      when unique_violation then
        if v_try = 3 then
          raise exception using
            errcode = 'P0001',
            message = 'ORDER_CREATION_FAILED',
            detail  = 'Could not allocate a unique order number. Please try again.';
        end if;
    end;
  end loop;

  -- ------------------------------------------------------------------
  -- 8. Line items. product_name and unit_price are snapshots taken from
  --    the catalogue at this moment, so an old order stays readable after
  --    the product is renamed or repriced. Extra keys the client sent are
  --    never read, so forged prices cannot reach the table.
  -- ------------------------------------------------------------------
  insert into public.order_items (
    order_id, product_id, product_name, quantity, size, unit_price
  )
  select
    v_order_id,
    p.id,
    p.name,
    (a.e ->> 'quantity')::integer,
    btrim(a.e ->> 'size'),
    p.price
  from jsonb_array_elements(p_cart) as a(e)
  join public.products p on p.id = (a.e ->> 'product_id')::uuid;

  return jsonb_build_object(
    'order_id',     v_order_id,
    'order_number', v_order_number,
    'subtotal',     v_subtotal,
    'delivery_fee', v_delivery_fee,
    'total',        v_total
  );
end;
$$;

comment on function private.place_order(jsonb, text, text, text, text, text, text) is
'Creates an order for the caller (auth.uid()) from a cart of product ids, '
'quantities and sizes. Authoritative: product existence, size, stock, unit '
'price, product name, delivery fee, subtotal, total and the initial '
'awaiting_payment status. Phase 5B-1 validates current stock but does not '
'reserve or decrement inventory; inventory mutation requires an explicit '
'payment/order-lifecycle decision in a later phase.';

-- The only grant that matters: EXECUTE for signed-in users. Revoked from
-- PUBLIC (which would otherwise cover anon and authenticated alike) first,
-- then handed back to authenticated only. No table privileges are added, so
-- `authenticated` still cannot INSERT into orders or order_items directly.
revoke all on function private.place_order(jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function private.place_order(jsonb, text, text, text, text, text, text) to authenticated;

-- Make the schema reachable over PostgREST. The existing exposed schemas are
-- listed explicitly so nothing is lost: without this, `rpc()` cannot route to
-- a function in a schema PostgREST does not expose. Phase 5B-2 therefore calls
-- `supabase.schema('private').rpc('place_order', ...)`; `anon` has no EXECUTE,
-- so this adds no unauthenticated surface.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, private';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
