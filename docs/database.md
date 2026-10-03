# Database (Phase 2 — applied and verified)

The schema is **live** in the Supabase project. Source of truth is
`supabase/migrations/`; those files are byte-identical to the migrations
recorded in `supabase_migrations.schema_migrations`, so a `supabase db push`
is a no-op rather than a re-apply. Never make schema changes through the
dashboard — add a migration.

| Migration | Contents |
| --------- | -------- |
| `20260930215446_create_core_schema.sql` | `set_updated_at()`, `order_status` enum, all five tables, constraints, indexes, triggers, `handle_new_user()` + `on_auth_user_created` |
| `20260930215842_enable_rls_and_policies.sql` | RLS on all five tables, six policies, initial grants/revokes |
| `20260930220047_seed_categories.sql` | 4 categories |
| `20260930220104_seed_products.sql` | 12 fictional products |
| `20260930220536_tighten_anon_grants.sql` | anonymous callers lose the default `SELECT` on orders/order_items |
| `20260930220757_tighten_client_grants.sql` | final least-privilege grant matrix |
| `20261001181519_create_place_order_function.sql` | `private` schema + `private.place_order()` (Phase 5B-1) |
| `20261001182454_fix_place_order_size_membership.sql` | size membership `all` → `any` (subtotal and stock were broken) |
| `20261001182848_fix_place_order_missing_json_keys.sql` | explicit `is null` on every cart-item key |
| `20261001183202_fix_place_order_zero_quantity.sql` | explicit `quantity >= 1` lower bound |

The last three are append-only corrections to the same function. Each was found
by `verify_phase5b.sql`, applied as its own migration, and its header explains
the bug — do not edit an already-recorded migration to "tidy" it.

`supabase/tests/verify_phase2.sql` re-runs every structural, RLS and
constraint assertion against a live database. It creates fixtures inside a
transaction that ends in `ROLLBACK`, so nothing it creates persists. Run it
with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_phase2.sql`.

## Tables

`profiles`, `categories`, `products`, `orders`, `order_items`.

Key decisions that are **not** obvious from the column list:

- **Money is `numeric(12,2)`**, never float. All monetary columns are
  `not null` with `>= 0` checks, and `orders` enforces
  `total = subtotal + delivery_fee`. Adding discounts later means relaxing
  that check.
- **`order_status` is a Postgres enum**, not text. Adding a value later
  requires its own migration (`ALTER TYPE ... ADD VALUE`) because a value
  added in a transaction cannot be used by that same transaction.
- **`sizes` and `images` are `text[]`**, deliberately — an ordered short
  list does not need a join table or `jsonb`.
- **`profiles` rows are created by the `on_auth_user_created` trigger**
  (`security definer`), copying `full_name`/`phone` from
  `raw_user_meta_data` and falling back to the email local part for
  `full_name`. Do not add a client-side profile insert path.
- **`profiles.email` is a convenience copy.** `auth.users` remains the
  authoritative identity.
- `updated_at` is maintained by trigger on `profiles`, `products`, `orders`.
  Trigger functions pin `search_path = ''`.

## Delete behaviour — order history is protected

| Relationship | Action | Why |
| ------------ | ------ | --- |
| `profiles.id → auth.users.id` | `CASCADE` | profile is user data with no business value |
| `orders.user_id → auth.users.id` | `SET NULL` (column is nullable) | deleting an account must **not** destroy order history |
| `order_items.order_id → orders.id` | `CASCADE` | items are part of that one order |
| `order_items.product_id → products.id` | `RESTRICT` | a product that was ever ordered cannot be deleted |
| `products.category_id → categories.id` | `RESTRICT` | never silently orphan a product |

`order_items.product_name` and `unit_price` are **historical snapshots**. An
old order must stay readable even if the catalogue changes. "Retire" a
product (stock 0, `featured = false`) rather than deleting it.

## RLS

Enabled on all five tables; deny by default. Six policies:

- `categories`, `products` — `SELECT` to `anon, authenticated` (public
  catalogue). **No write policy exists**: catalogue management is out of
  application scope.
- `profiles` — `SELECT`/`UPDATE` own row only, via `(select auth.uid()) = id`.
  No insert (the auth trigger owns that), no delete.
- `orders` — `SELECT` own orders only. **No insert/update/delete policy.**
- `order_items` — `SELECT` only through an order the caller owns
  (`exists` against `public.orders`), so swapping `order_id` widens nothing.

Policies use `(select auth.uid())` (initplan-cached), not a bare
`auth.uid()` call.

## Client grant matrix

Supabase's default privileges grant **ALL** on new `public` tables to `anon`
and `authenticated`, including `TRUNCATE`/`REFERENCES`/`TRIGGER`, which RLS
does **not** cover. That was revoked and restated explicitly:

| Role | Access |
| ---- | ------ |
| `anon` | `SELECT` on `categories`, `products` — nothing else |
| `authenticated` | `SELECT` on all five tables; `UPDATE` on `profiles` only |
| `service_role` | `ALL` (bypasses RLS; server-side only, never in the browser) |

## Order creation — the trusted function (Phase 5B-1)

There is **no client write path to `orders` or `order_items`**, and that is
still the rule. Checkout creates orders through `private.place_order()`, which
re-reads products, prices and stock and computes the total itself. Never trust
client-submitted prices, totals, product names, user ids or stock, and never
add a permissive client insert policy to "make checkout work".

**No service-role secret is involved, and none is needed.** `POST /api/orders`
calls the function with the *caller's own* session, so the request runs as the
customer and is subject to exactly the RLS policies any other client request
would face, and `auth.uid()` inside the function decides the order's owner.
Reaching for a service-role key here would *lose* that property, not add one.

The function itself, its error contract and its verification script are covered
in [`orders.md`](./orders.md).