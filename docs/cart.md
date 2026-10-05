# The cart backend (Phase 6)

The server-backed cart: `cart_items`, `private.add_cart_item`, and the
`/api/cart` boundary. The **web UI still uses `localStorage`** — this phase
built the backend only. See [Remaining work](#remaining-work) below.

| File                          | Role                                                  |
| ----------------------------- | ----------------------------------------------------- |
| `lib/cart/reducer.ts`         | Client-side UX snapshot + pure reducer (**Phase 3**)   |
| `lib/cart/storage.ts`         | `localStorage` adapter (**Phase 3**, still in use)     |
| `lib/cart/schema.ts`          | Zod request contract for `/api/cart`                   |
| `lib/cart/errors.ts`          | `P0001` machine code → HTTP status                     |
| `lib/cart/handle-cart.ts`     | Request decisions, effects injected (testable)         |
| `lib/cart/queries.ts`         | `server-only` read, joins the catalogue                |
| `lib/cart/mutations.ts`       | `server-only` writes (RPC + RLS-scoped statements)     |
| `app/api/cart/route.ts`       | `GET` read · `DELETE` clear                            |
| `app/api/cart/items/route.ts` | `POST` add · `PATCH` quantity · `DELETE` remove        |

## The API

```
GET    /api/cart           → 200 { items, itemCount, subtotal }
POST   /api/cart/items     → 201 { items, itemCount, subtotal }
PATCH  /api/cart/items     → 200 { items, itemCount, subtotal }
DELETE /api/cart/items     → 200 { items, itemCount, subtotal }
DELETE /api/cart           → 200 { items, itemCount, subtotal }
```

Every body is `{ productId, size }` (plus `quantity` on POST/PATCH). Lines are
addressed by **product + size** — the same `productId::size` composite
`lib/cart/reducer.ts` already uses — not by a server row id, so a web client
and an Expo client address a line the way they already think about one.

**Every success returns the whole cart**, not just an ack. An add of 2 into a
line already holding 1 leaves 3, and the client cannot know that; returning the
cart means both clients share one render path and one response type instead of
each following a mutation with a GET.

Failures use the orders envelope, `{ error: { code, message } }`:

| Code                  | Status | When                                             |
| --------------------- | ------ | ------------------------------------------------ |
| `UNAUTHENTICATED`     | 401    | no session                                       |
| `INVALID_REQUEST`     | 400    | malformed body or failed Zod validation          |
| `INVALID_QUANTITY`    | 400    | quantity below 1                                 |
| `INVALID_SIZE`        | 400    | product does not offer that size                 |
| `PRODUCT_NOT_FOUND`   | 404    | no such product                                  |
| `CART_ITEM_NOT_FOUND` | 404    | no such line in **your** cart                    |
| `INSUFFICIENT_STOCK`  | 409    | quantity exceeds what remains                    |
| `CART_FAILED`         | 500    | anything unexpected (never leaks the DB message) |

## Decisions worth knowing before changing anything here

- **Two carts exist on purpose.** The browser cart is `localStorage` and stays
  that way until Phase 7. Nothing in `components/cart/` calls `/api/cart` yet.
  Do not "unify" them by making the client the source of truth — the server one
  is the one that has to be right for a second device.
- **The cart stores no price, name or stock.** Those are joined from `products`
  on read, so a repriced product shows its current price on the next load. This
  is the opposite of `order_items`, which *deliberately* snapshots — an order is
  a historical record, a cart is not.
- **Adds go through `private.add_cart_item`, not a direct INSERT.** The unique
  constraint makes duplicates impossible, but a plain INSERT of an existing line
  raises `23505` rather than incrementing. The merge, the atomic increment and
  the resulting-quantity stock ceiling are all properties of the upsert.
- **Quantity, remove and clear are direct statements under RLS.** There is no
  money and no owner in them, so a `SECURITY DEFINER` function would buy
  nothing. `cart_items_validate` still re-checks product, size and the stock
  ceiling on every one of them.
- **Quantity 0 is a 400, not a delete.** The client reducer treats a requested 0
  as "remove this line"; the server has an explicit `DELETE` for that, so
  writing 0 would be ambiguous. The Phase 7 client must translate one into the
  other.
- **`getCart()` takes no `userId`.** RLS decides what is visible, exactly as in
  `lib/orders/queries.ts`. Where a write needs an owner in its `WHERE` clause it
  is passed the *verified session* id from `getAuthUser()` — defence in depth
  so a destructive statement is never issued without naming its owner.
## Known wart: the direct INSERT grant

`authenticated` holds `INSERT` on `cart_items`. It is safe on its own terms —
RLS pins the row to the caller and the trigger re-validates product, size and
stock — but it does **not** merge, so a client that bypassed the API would get a
raw `23505` on a repeat add instead of an increment.

Revoking it would make the RPC the only add path and cost nothing at runtime.
That was not done in this phase because it changes the deployed grant matrix,
and the API does not use the direct path. Tightening it is a one-line migration
whenever you want it.

## Verification

`supabase/tests/verify_cart.sql` proves the security model against a live
database: ownership isolation (A cannot read, update, delete, insert into, or
reassign B's lines), line identity and the merge, every quantity rejection, the
direct write path, and the anonymous case. It runs inside one transaction that
ends in `ROLLBACK`, and it never relaxes RLS to make a check pass.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_cart.sql
```

The pure request logic is covered by `lib/cart/*.test.ts` (no DOM, no Supabase
client), following the same injected-effects pattern as `lib/orders/`.

## Remaining work

- **Phase 7** — point the web cart at these routes and retire `localStorage`.
  This is where `migration_id` becomes useful.
- **Mobile** — an Expo client can call these routes as-is; no mobile-specific
  work is needed here.
- The cart is **not** wired into checkout yet. `POST /api/orders` still takes
  its cart in the request body, which remains authoritative and re-validated.
- **`CART_ITEM_NOT_FOUND` is 404, never 403.** Under RLS "not there" and "not
  yours" are the same answer; a 403 would confirm the line exists.
- **`migration_id` is dormant.** It is Phase 7 machinery for making the
  localStorage → server migration idempotent. Phase 6 always passes
  `p_migration_id: null`, which always increments, and the API rejects a
  client-supplied `migrationId` as an unknown key.