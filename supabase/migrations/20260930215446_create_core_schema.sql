-- NORTH & FORM — Phase 2: core database schema.

-- ------------------------------------------------------------------
-- Shared helper: maintain updated_at automatically.
-- search_path is pinned (empty) so the function cannot be hijacked.
-- ------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ------------------------------------------------------------------
-- profiles — application-level profile data.
-- Supabase Auth (auth.users) remains the authoritative identity;
-- profiles.email is a convenience copy only.
-- ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application-level user profile. Supabase Auth (auth.users) is the authoritative identity; profiles.email is a convenience copy.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile row automatically when an auth user signs up.
-- security definer so it can write despite RLS on profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name',
                           new.raw_user_meta_data ->> 'name')), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------
-- categories — public catalogue taxonomy.
-- ------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- order_status — constrained lifecycle for an order.
-- To add a status later: ALTER TYPE public.order_status ADD VALUE '...'
-- in its own migration (a value added in a transaction cannot be used
-- by that same transaction).
-- ------------------------------------------------------------------
create type public.order_status as enum (
  'awaiting_payment',
  'payment_confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled'
);

-- ------------------------------------------------------------------
-- products — public catalogue.
-- price is numeric (exact arithmetic, never float), in naira.
-- sizes / images are ordered lists of text.
-- ------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null check (btrim(description) <> ''),
  price numeric(12, 2) not null check (price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  sizes text[] not null default '{}',
  images text[] not null default '{}',
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_id_idx on public.products (category_id);
create index products_featured_idx on public.products (featured) where featured;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- orders — a placed order awaiting bank transfer.
-- Order rows are business records: deleting an auth user sets user_id
-- to null (history preserved) instead of cascading a delete.
-- ------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  order_number text not null unique check (btrim(order_number) <> ''),
  status public.order_status not null default 'awaiting_payment',
  customer_name text not null check (btrim(customer_name) <> ''),
  customer_email text not null check (btrim(customer_email) <> ''),
  customer_phone text not null check (btrim(customer_phone) <> ''),
  delivery_address text not null check (btrim(delivery_address) <> ''),
  delivery_city text not null check (btrim(delivery_city) <> ''),
  delivery_state text not null check (btrim(delivery_state) <> ''),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  delivery_fee numeric(12, 2) not null check (delivery_fee >= 0),
  total numeric(12, 2) not null check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_matches_subtotal_delivery check (total = subtotal + delivery_fee)
);

-- Leading user_id also serves the foreign key lookup; created_at desc
-- serves "my orders, newest first".
create index orders_user_id_created_at_idx on public.orders (user_id, created_at desc);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- order_items — line items of an order.
-- product_name and unit_price are historical snapshots: an old order
-- must stay readable even if the catalogue changes. product_id is on
-- delete restrict, so a product with order history is never silently
-- removed from the catalogue.
-- ------------------------------------------------------------------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null check (btrim(product_name) <> ''),
  quantity integer not null check (quantity > 0),
  size text not null check (btrim(size) <> ''),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);