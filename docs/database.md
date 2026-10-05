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
| `20261003101200_create_cart_items.sql` | `cart_items`, `cart_items_line_unique`, `validate_cart_item()`, four RLS policies, grants (Phase 6) |
| `20261003101300_create_add_cart_item_function.sql` | `private.add_cart_item()` — the trusted merge/increment path |
| `20261003190000_add_cart_migration_id.sql` | `migration_id` column + the idempotent-replay parameter |

The last three of the Phase 5B group are append-only corrections to the same
function. Each was found by `verify_phase5b.sql`, applied as its own migration,
and its header explains the bug — do not edit an already-recorded migration to
"tidy" it.

> **The three `20261003…` cart migrations were applied to the live database but
> were never committed.** They have been reconstructed from the live catalog so
> the files and `supabase_migrations.schema_migrations` agree again, which is
> what makes `supabase db push` a no-op. They are faithful in *behaviour* — each
> was replayed against a live database and diffed — but the original authors'
> comments are unrecoverable, so treat these three files as a reconstruction
> rather than as the original text. The last two are documented in
> [`cart.md`](./cart.md).

`supabase/tests/verify_phase2.sql` re-runs every structural, RLS and
constraint assertion against a live database. It creates fixtures inside a
transaction that ends in `ROLLBACK`, so nothing it creates persists. Run it
with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_phase2.sql`.
`supabase/tests/verify_cart.sql` does the same for the cart — see
[`cart.md`](./cart.md).

**Its count assertions are scoped to the five Phase 2 tables**, not to the whole
`public` schema. `cart_items` adds a sixth table, four policies and four write
privileges, and a bare `count(*) … where schemaname = 'public'` would fail for a
correct schema. Scoping keeps the assertion about what it actually means — "the
Phase 2 least-privilege matrix is intact" — instead of "nothing was ever added
to this schema".

## Tables

`profiles`, `categories`, `products`, `orders`, `order_items`, `cart_items`.

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
- `updated_at` is maintained by trigger on `profiles`, `products`, `orders` and
  `cart_items`. Trigger functions pin `search_path = ''`.
- **`cart_items` stores no money.** No `price`, `unit_price`, `subtotal`,
  `total`, `product_name` or `stock_quantity` column exists — name, price and
  stock are joined from `products` on read. This is the opposite of
  `order_items`, on purpose: see below.

## Delete behaviour — order history is protected

| Relationship | Action | Why |
| ------------ | ------ | --- |
| `profiles.id → auth.users.id` | `CASCADE` | profile is user data with no business value |
| `cart_items.user_id → auth.users.id` | `CASCADE` | a cart is user data with no business value |
| `orders.user_id → auth.users.id` | `SET NULL` (column is nullable) | deleting an account must **not** destroy order history |
| `order_items.order_id → orders.id` | `CASCADE` | items are part of that one order |
| `order_items.product_id → products.id` | `RESTRICT` | a product that was ever ordered cannot be deleted |
| `cart_items.product_id → products.id` | `CASCADE` | deleting a product may clear it out of carts — it was never a promise to buy |
| `products.category_id → categories.id` | `RESTRICT` | never silently orphan a product |

`order_items.product_name` and `unit_price` are **historical snapshots**. An
old order must stay readable even if the catalogue changes. "Retire" a
product (stock 0, `featured = false`) rather than deleting it.

`cart_items` deliberately does **not** snapshot. A cart is not a record of
anything — it is a wish list — so a product that is repriced, renamed or
withdrawn should show its current state, not a stale copy of it.

## RLS

Enabled on all six tables; deny by default. Ten policies:

- `categories`, `products` — `SELECT` to `anon, authenticated` (public
  catalogue). **No write policy exists**: catalogue management is out of
  application scope.
- `profiles` — `SELECT`/`UPDATE` own row only, via `(select auth.uid()) = id`.
  No insert (the auth trigger owns that), no delete.
- `orders` — `SELECT` own orders only. **No insert/update/delete policy.**
- `order_items` — `SELECT` only through an order the caller owns
  (`exists` against `public.orders`), so swapping `order_id` widens nothing.
- `cart_items` — `SELECT`/`INSERT`/`UPDATE`/`DELETE` own rows only. `UPDATE`
  carries a `with check` as well as a `using`, so a line cannot be moved onto
  another account. Covered in [`cart.md`](./cart.md).

Policies use `(select auth.uid())` (initplan-cached), not a bare
`auth.uid()` call.

## Client grant matrix

Supabase's default privileges grant **ALL** on new `public` tables to `anon`
and `authenticated`, including `TRUNCATE`/`REFERENCES`/`TRIGGER`, which RLS
does **not** cover. That was revoked and restated explicitly:

| Role | Access |
| ---- | ------ |
| `anon` | `SELECT` on `categories`, `products` — nothing else |
| `authenticated` | `SELECT` on all six tables; `UPDATE` on `profiles`; `SELECT`/`INSERT`/`UPDATE`/`DELETE` on `cart_items` |
| `service_role` | `ALL` (bypasses RLS; server-side only, never in the browser) |

The `revoke` in the cart migration covers **both** roles and runs before the
narrower `grant`. Revoking only from `anon` leaves Supabase's default
`TRUNCATE`/`REFERENCES`/`TRIGGER` in place for `authenticated`, because a
`grant` only adds — it does not subtract.

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