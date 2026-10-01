-- NORTH & FORM — Phase 5B-1 correction: a zero quantity was not rejected.
--
-- The quantity shape check was `(v_item ->> 'quantity') !~ '^[0-9]{1,6}$'`.
-- "0" matches that pattern, so a zero-quantity line passed validation, passed
-- the stock comparison, contributed 0 to the subtotal, and only failed at the
-- order_items insert with a raw `order_items_quantity_check` violation.
--
-- The lower bound is now explicit. The cast is safe because the regex has
-- already proved the value is digits, and the order_items column has a
-- `quantity > 0` check, so this keeps a malformed request from reaching a
-- constraint violation instead of a stable business code.
--
-- This is the fourth and final statement of private.place_order. Three earlier
-- corrections are folded in, and their rationale belongs here because the
-- section comments in the body are deliberately short:
--
--   * 20261001182454 — size membership used `l.size = all (p.sizes)`. ALL means
--     "equals every element", not "is a member", so the subtotal filter matched
--     no rows (every order would have been stored with subtotal 0 and total =
--     delivery fee only) and the insufficient-stock filter matched no rows, so
--     the stock check was not enforced at all. Both are now `= any (array)`.
--     The "not a member" test is `l.size <> all (p.sizes)`, which was already
--     correct and is unchanged.
--
--   * 20261001182848 — each cart-item key was guarded with
--     `jsonb_typeof(v_item -> 'k') <> 'string'`. For a *missing* key that is SQL
--     NULL, and `NULL or NULL` is still NULL, so the IF never fired. A missing
--     product_id was misreported as PRODUCT_NOT_FOUND, and a missing size or
--     quantity reached the order_items insert as NULL and would have surfaced
--     as a raw 23502. Each key is now checked for presence first.
--
--   * this migration — the explicit `quantity >= 1` lower bound.
--
-- Membership notes, so this is not "corrected" a fifth time: `x = any (arr)` is
-- "is a member"; `x = all (arr)` is true only for a one-element array.
--
-- Append-only: 20261001181519, 20261001182454 and 20261001182848 are recorded
-- in supabase_migrations.schema_migrations and are left untouched.

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
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED',
      detail = 'Sign in before placing an order.';
  end if;

  if v_name = '' or v_email = '' or v_phone = '' or v_address = '' or v_city = '' then
    raise exception using errcode = 'P0001', message = 'INVALID_CUSTOMER',
      detail = 'Name, email, phone, delivery address and city are all required.';
  end if;

  if length(v_name) > 120 or length(v_email) > 254 or length(v_phone) > 32
     or length(v_address) > 300 or length(v_city) > 120 then
    raise exception using errcode = 'P0001', message = 'INVALID_CUSTOMER',
      detail = 'One or more contact or delivery fields is longer than allowed.';
  end if;

  if v_state <> all (array[
       'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa',
       'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti',
       'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
       'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
       'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe',
       'Zamfara', 'Federal Capital Territory'
     ]) then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE',
      detail = 'Delivery state must be one of the 36 states or the Federal Capital Territory.';
  end if;

  if p_cart is null or jsonb_typeof(p_cart) <> 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_CART',
      detail = 'The cart must be a JSON array of items.';
  end if;

  if jsonb_array_length(p_cart) = 0 then
    raise exception using errcode = 'P0001', message = 'EMPTY_CART',
      detail = 'The cart is empty.';
  end if;

  for v_item in select jsonb_array_elements(p_cart) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = 'P0001', message = 'INVALID_CART_ITEM',
        detail = 'Each cart item must be an object.';
    end if;

    if (v_item -> 'product_id') is null
       or jsonb_typeof(v_item -> 'product_id') <> 'string'
       or (v_item ->> 'product_id')
          !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = 'P0001', message = 'INVALID_CART_ITEM',
        detail = 'Each cart item needs a product_id that is a UUID.';
    end if;

    if (v_item -> 'size') is null
       or jsonb_typeof(v_item -> 'size') <> 'string'
       or btrim(v_item ->> 'size') = '' then
      raise exception using errcode = 'P0001', message = 'INVALID_CART_ITEM',
        detail = 'Each cart item needs a size.';
    end if;

    if (v_item -> 'quantity') is null
       or jsonb_typeof(v_item -> 'quantity') <> 'number'
       or (v_item ->> 'quantity') !~ '^[0-9]{1,6}$'
       or (v_item ->> 'quantity')::numeric < 1 then
      raise exception using errcode = 'P0001', message = 'INVALID_CART_ITEM',
        detail = 'Each cart item needs a whole quantity of at least 1.';
    end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_cart) as a(el)
    group by (el ->> 'product_id'), btrim(el ->> 'size') having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_CART_ITEM',
      detail = 'The same product and size may appear only once.';
  end if;

  with lines as (
    select (e ->> 'product_id')::uuid as product_id,
           btrim(e ->> 'size') as size,
           (e ->> 'quantity')::numeric as quantity
    from jsonb_array_elements(p_cart) as a(e)
  )
  select
    count(*) filter (where p.id is null)::integer,
    count(*) filter (where p.id is not null and l.size <> all (p.sizes))::integer,
    count(*) filter (where p.id is not null and l.size = any (p.sizes)
                       and l.quantity > p.stock_quantity)::integer,
    coalesce(sum(p.price * l.quantity) filter (where p.id is not null
               and l.size = any (p.sizes) and l.quantity <= p.stock_quantity), 0)
  into v_missing, v_sizes, v_stock, v_subtotal
  from lines l left join public.products p on p.id = l.product_id;

  if v_missing > 0 then
    raise exception using errcode = 'P0001', message = 'PRODUCT_NOT_FOUND',
      detail = 'One or more items in the cart is no longer available.';
  end if;

  if v_sizes > 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_SIZE',
      detail = 'One or more items are not offered in the requested size.';
  end if;

  if v_stock > 0 then
    raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK',
      detail = 'One or more items do not have enough stock left for that quantity.';
  end if;

  v_delivery_fee := case
    when v_state = 'Lagos' then 2000
    when v_state = 'Federal Capital Territory' then 2500
    when v_state = 'Rivers' then 3000
    else 4000
  end;

  v_total := v_subtotal + v_delivery_fee;

  for v_try in 1 .. 3 loop
    v_order_number := 'NF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    begin
      insert into public.orders (
        user_id, order_number, status, customer_name, customer_email, customer_phone,
        delivery_address, delivery_city, delivery_state, subtotal, delivery_fee, total
      )
      values (
        v_user_id, v_order_number, 'awaiting_payment', v_name, v_email, v_phone,
        v_address, v_city, v_state, v_subtotal, v_delivery_fee, v_total
      )
      returning id into v_order_id;
      exit;
    exception
      when unique_violation then
        if v_try = 3 then
          raise exception using errcode = 'P0001', message = 'ORDER_CREATION_FAILED',
            detail = 'Could not allocate a unique order number. Please try again.';
        end if;
    end;
  end loop;

  insert into public.order_items (
    order_id, product_id, product_name, quantity, size, unit_price
  )
  select v_order_id, p.id, p.name, (a.e ->> 'quantity')::integer, btrim(a.e ->> 'size'), p.price
  from jsonb_array_elements(p_cart) as a(e)
  join public.products p on p.id = (a.e ->> 'product_id')::uuid;

  return jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number,
    'subtotal', v_subtotal, 'delivery_fee', v_delivery_fee, 'total', v_total
  );
end;
$$;
