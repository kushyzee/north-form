-- NORTH & FORM — cart_items: the persistent, user-owned cart line.
--
-- RECONSTRUCTED MIGRATION. This file was not committed when the migration was
-- first applied; it has been rebuilt from the live catalog so that the recorded
-- version (`20261003101200`) and the file on disk agree again. The live schema
-- is the authority this reproduces. See docs/database.md.
--
-- Design:
--   * A cart line is `product_id + size`, exactly the `productId::size`
--     composite the client reducer already uses (lib/cart/reducer.ts), so the
--     server and the client agree on what a line is.
--   * NO price, product name or stock is stored. Those are joined from
--     `products` on read, so the catalogue stays the only source of truth and
--     a repriced product cannot leave a stale figure in somebody's cart.
--   * `quantity > 0` and a non-blank `size` are enforced by the column checks;
--     everything contextual (product exists, size is offered, quantity fits
--     within stock) is enforced by the `cart_items_validate` trigger below.
--   * `user_id` cascades on account deletion: a cart is user data with no
--     business value. Contrast `orders`, which is `set null` so that order
--     history survives.

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  size text not null check (btrim(size) <> ''),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cart_items is
  'A signed-in customer''s cart lines. One line per product+size pair. Carries no price, name or stock: those are joined from products on read so the catalogue stays the only source of truth. Owned through user_id and enforced by RLS.';

-- Line identity. Same product + same size merges into one row; different sizes
-- stay separate. This is the database half of the merge rule the reducer also
-- implements on the client.
alter table public.cart_items
  add constraint cart_items_line_unique unique (user_id, product_id, size);

-- product_id is indexed for the catalogue-join read path; the unique constraint
-- above already serves every query that filters on user_id.
create index cart_items_product_id_idx on public.cart_items (product_id);

create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();
-- ------------------------------------------------------------------
-- validate_cart_item — the contextual rules the column checks cannot
-- express. Runs BEFORE INSERT OR UPDATE, so it covers the direct write
-- path as well as private.add_cart_item(). search_path is pinned so the
-- function cannot be hijacked.
--
-- Raising P0001 with a machine code in `message` is the same contract
-- private.place_order() and private.add_cart_item() use, so the API maps
-- all three through one table.
-- ------------------------------------------------------------------
create or replace function public.validate_cart_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stock integer;
  v_sizes text[];
begin
  select p.stock_quantity, p.sizes
    into v_stock, v_sizes
    from public.products p
   where p.id = new.product_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_NOT_FOUND',
      detail  = 'That product is no longer available.';
  end if;

  -- Checked before the column constraint so this reports a stable business code
  -- rather than surfacing a raw 23514 for `cart_items_quantity_check`.
  if new.quantity < 1 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_QUANTITY',
      detail  = 'Each item needs a quantity of at least 1.';
  end if;

  -- `<> all (...)` is "is not a member". An empty sizes array therefore rejects
  -- every size, which is the intended answer for a product that offers none.
  if new.size <> all (v_sizes) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_SIZE',
      detail  = 'That size is not offered for this piece.';
  end if;

  if new.quantity > v_stock then
    raise exception using
      errcode = 'P0001',
      message = 'INSUFFICIENT_STOCK',
      detail  = 'There is not enough stock left for that quantity.';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_cart_item() from public, anon, authenticated;

create trigger cart_items_validate
  before insert or update on public.cart_items
  for each row execute function public.validate_cart_item();
-- ------------------------------------------------------------------
-- RLS — deny by default, own rows only, every policy keyed to
-- (select auth.uid()) rather than a bare auth.uid() call.
-- ------------------------------------------------------------------
alter table public.cart_items enable row level security;

create policy "Users can read their own cart items"
  on public.cart_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add to their own cart items"
  on public.cart_items
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- `with check` on UPDATE is what stops a user moving a line onto somebody
-- else's account: without it, the row would have to merely be visible
-- before the update.
create policy "Users can update their own cart items"
  on public.cart_items
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can remove their own cart items"
  on public.cart_items
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------
-- Grants, stated as a least-privilege matrix.
--
-- Supabase's default privileges grant ALL on new public tables to
-- anon/authenticated, including TRUNCATE/REFERENCES/TRIGGER, which RLS
-- does not cover. The revoke covers BOTH roles and runs first: without it
-- the default TRUNCATE/REFERENCES/TRIGGER grants survive a narrower `grant`
-- and `authenticated` ends up able to truncate the whole table.
--
-- Note the INSERT grant is what makes the direct write path possible
-- alongside private.add_cart_item(). It is safe on its own terms — RLS
-- pins the row to the caller and the validate trigger re-checks product,
-- size and stock — but it does NOT merge: a second INSERT of the same
-- product+size raises 23505 rather than incrementing. Application code
-- must therefore use the RPC for adds. See docs/cart.md.
-- ------------------------------------------------------------------
revoke all privileges on public.cart_items from anon, authenticated;

-- `anon` gets nothing at all. `authenticated` gets exactly the four verbs a
-- cart needs and not the three it does not.
grant select, insert, update, delete on public.cart_items to authenticated;

grant all on public.cart_items to service_role;
