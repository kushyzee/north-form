# Orders — database function, API, confirmation & email

The order path in three parts:

1. **Phase 5B-1** — `private.place_order()`, the trusted database function and
   the only way an order is ever written.
2. **Phase 5B-2** — `POST /api/orders`, the thin application layer that calls it.
3. **Phase 5C** — the confirmation page and the Mailgun email.

Related: [`checkout.md`](./checkout.md) for the form, and
[`database.md`](./database.md) for the schema, RLS and grants.

## Order creation (Phase 5B-1 — the trusted database function)

`private.place_order()` is the **only** way an order is ever written.

```sql
private.place_order(
  p_cart jsonb,                 -- [{"product_id": uuid, "quantity": 1, "size": "M"}]
  p_customer_name text, p_customer_email text, p_customer_phone text,
  p_delivery_address text, p_delivery_city text, p_delivery_state text
) returns jsonb                 -- {order_id, order_number, subtotal, delivery_fee, total}
```

Decisions worth knowing before changing anything here:

- **The client never supplies a number.** There is no `user_id`, `unit_price`,
  `product_name`, `subtotal`, `delivery_fee`, `total` or `status` parameter. The
  caller is `auth.uid()`, the money comes from `products.price`, the name
  snapshot from `products.name`, and the status is the `awaiting_payment`
  column default. Extra keys in the cart JSON are simply never read, so forged
  prices are inert rather than rejected.
- **Why direct client inserts stay disabled.** A permissive INSERT policy on
  `orders` would let anyone forge prices, totals and user ids. The write
  boundary is the function, not a policy, and it derives every value itself.
  `authenticated` still holds `SELECT` on `orders` / `order_items` and nothing
  more.
- **`SECURITY DEFINER` is what makes it work** — it is the only reason the
  insert succeeds without granting clients anything. It is owned by `postgres`,
  pins `search_path = ''`, and fully qualifies every table.
- **Privileges.** `revoke all on schema private from public, anon,
  authenticated`, then `usage` to `authenticator` and `authenticated`, then
  `revoke all on the function from public, anon` and `grant execute ... to
  authenticated`. Verified: `anon` cannot execute it and has no `USAGE` on the
  schema, so PostgREST answers `42501`.
- **The `private` schema is exposed to PostgREST on purpose.** Supabase
  exposes only `public, graphql_public`, and `rpc()` cannot route to a function
  in a schema it does not expose — asking for `private` returns
  `PGRST106 Invalid schema`. The migration therefore runs
  `alter role authenticator set pgrst.db_schemas = 'public, graphql_public,
  private'`. Phase 5B-2 calls
  `supabase.schema('private').rpc('place_order', …)`; the function is *not* in
  `public`, and `anon` still has no access.
- **Errors are a stable contract.** Every business failure raises
  `errcode = 'P0001'` with the machine code as the **message** and the human
  text as `detail`: `UNAUTHENTICATED`, `INVALID_CART`, `EMPTY_CART`,
  `INVALID_CART_ITEM`, `PRODUCT_NOT_FOUND`, `INVALID_SIZE`,
  `INSUFFICIENT_STOCK`, `INVALID_CUSTOMER`, `INVALID_STATE`,
  `ORDER_CREATION_FAILED`. The API maps `code = P0001` to "expected business
  failure" and switches on the message; anything else is unexpected.
- **Stock is validated, never mutated.** There is no reservation, so two
  customers can both pass the check for the last unit. That is a deliberate,
  documented deferral: inventory mutation needs an explicit payment / order
  lifecycle decision, not a side effect of checkout.
- **Atomic by construction.** One function body is one transaction. The whole
  cart is validated before the order row is written, and a failure anywhere
  rolls the order and its items back together — there is no partial order.
- **The canonical state list is duplicated on purpose.** The 36 states plus the
  FCT are spelled out in SQL as well as in `lib/checkout/nigeria-states.ts`,
  because the database must reject `"Lagos State"` even if the request never
  passed through Zod. Keep the two lists in step.
- **Two SQL gotchas this phase was bitten by.** `x = all (array)` is *not* a
  membership test — it means "equals every element", so use `= any (array)` to
  test membership and `<> all (array)` to test non-membership. And
  `jsonb_typeof(missing_key)` is SQL `NULL`, and `NULL or NULL` is still
  `NULL`, so every key needs an explicit `is null` test or a missing key slips
  straight through the check.

`supabase/tests/verify_phase5b.sql` proves all of the above against a live
database: structure and privileges, the happy path, forged prices, every
rejection with an assertion that nothing was written, direct-insert denial, and
that stock is untouched. Like `verify_phase2.sql` it is pure SQL, runs inside
one transaction and ends in `ROLLBACK`, so it leaves nothing behind.

## Order API (Phase 5B-2 — the thin application layer)

`POST /api/orders` connects the checkout form to `private.place_order`. It is an
**adapter, not a second implementation** — it authenticates, validates,
forwards, and maps errors. It computes nothing.

| File | Kind | Role |
| ---- | ---- | ---- |
| `app/api/orders/route.ts` | route | Reads the body, resolves the caller, serialises the result |
| `lib/orders/schema.ts` | pure | `orderRequestSchema` + `toRpcParams()` |
| `lib/orders/errors.ts` | pure | DB code → HTTP status + safe message |
| `lib/orders/handle-place-order.ts` | pure | The whole request decision, with the RPC injected |
| `lib/orders/place-order.ts` | server-only | The only place the app calls the function |
| `lib/orders/queries.ts` | server-only | `getOrderByNumber()` for the confirmation page |

Decisions worth knowing before changing anything here:

- **The decision is separated from the effects.** `handlePlaceOrder` takes
  `placeOrder` as an argument, so the whole request path — anonymous, malformed
  JSON, every validation failure, every database error code — is unit tested
  with a stub in the project's existing Node-only Vitest setup. No jsdom, no
  mocking library. That split is the reason those three modules are *not*
  marked `server-only`: anything imported by a test cannot be.
- **One request contract, not two.** `orderRequestSchema` is
  `checkoutSchema.extend({ cart })`, so the API accepts exactly what the form
  validates. A second, looser server-side schema is how a value ends up
  accepted in one place and rejected in the other.
- **The schema is `strict`.** An unknown key is a `400`, not a silent strip, so
  a forged `total`, `unit_price`, `user_id` or `status` is refused at the edge.
- **The user id is never forwarded.** `handlePlaceOrder` uses it only to decide
  whether to answer `401`. The order's owner is `auth.uid()` inside the
  function, and there is no `p_user_id` parameter to pass it through.
- **Authentication is repeated in the route.** A Route Handler is a separate
  entry point a browser can call directly; it renders no page, so the
  `/checkout` page guard never runs for it.
- **Errors: `P0001` is business, everything else is a generic 500.**
  `mapPlaceOrderError` keeps the function's own code for a `P0001` and collapses
  any other SQLSTATE — a constraint violation, a timeout, a connection error —
  into one message, so no PostgreSQL text can reach the customer. The table is
  `UNAUTHENTICATED` 401, `EMPTY_CART` / `INVALID_CART` / `INVALID_CART_ITEM` /
  `INVALID_CUSTOMER` / `INVALID_SIZE` / `INVALID_STATE` 400, `PRODUCT_NOT_FOUND`
  404, `INSUFFICIENT_STOCK` 409, `ORDER_CREATION_FAILED` 500.
- **Logging never includes the request.** Only the SQLSTATE and the function's
  machine code are logged, because the arguments are the customer's name, email,
  phone and address. A rejected request logs the *path* of the first bad field,
  never its value.
- **No service-role key anywhere.** The route uses the ordinary authenticated
  server client, so the request runs as the customer under the same RLS as any
  other. It reaches the function via `supabase.schema('private').rpc(...)`,
  which is only routable because Phase 5B-1 added `private` to
  `pgrst.db_schemas`.
- **Duplicate submits are blocked in the UI, not the database.** The button is
  disabled while in flight and `inFlight` guards a second submit that never
  touches the button — pressing Enter in a field re-fires `submit`, and RHF does
  not serialise handlers itself. No idempotency key was invented; the function
  creates one order per successful call, and that is the documented behaviour.
- **The cart is cleared on success, and the confirmation page re-reads the
  order.** `CheckoutView` holds a `placed` flag purely so clearing the cart does
  not flash the empty state during the redirect.
  `/checkout/confirmation/[orderNumber]` is a Server Component that calls
  `getOrderByNumber(orderNumber)`, which takes **no user id**: RLS decides what
  may be read, so another customer's order number resolves to nothing and the
  page 404s. It shows the database's totals, not the form's, and it states that
  payment has not been received. **It must never get a `loading.tsx`** — same
  reason `/checkout` has none.

## Order confirmation & email (Phase 5C)

`/checkout/confirmation/[orderNumber]` shows a placed order, and a Mailgun email
tells the customer about it.

| File | Kind | Role |
| ---- | ---- | ---- |
| `app/checkout/confirmation/[orderNumber]/page.tsx` | RSC | Renders the order from the database |
| `lib/orders/queries.ts` | server-only | `getOrderByNumber()` — the only read |
| `lib/orders/payment-details.ts` | pure | `DEMO_BANK_TRANSFER`, `isAwaitingPayment()` |
| `lib/email/order-confirmation.ts` | pure | `buildOrderConfirmationEmail()` → subject/text/html |
| `lib/email/mailgun.ts` | pure | `readMailgunConfig()`, `buildMailgunRequest()` |
| `lib/email/mailgun-transport.ts` | server-only | `sendMailgunMessage()` — the only `fetch` |
| `lib/email/send-order-confirmation.ts` | server-only | Template → transport |
| `lib/email/notify-order-placed.ts` | pure | Load, render, send — swallowing every failure |

Decisions worth knowing before changing anything here:

- **The page renders database values only.** Totals, status, items and address
  all come from `getOrderByNumber`. Nothing is read from the URL except the
  order number used to address the row, and nothing from the checkout form
  survives the redirect.
- **Ownership is RLS, not application logic.** `getOrderByNumber()` takes **no
  user id**: `auth.uid()` in the `orders` policy decides what is readable, so
  another customer's order number resolves to nothing and the page 404s. That
  `404` is deliberately indistinguishable from a genuinely missing order —
  returning `403` for "exists but not yours" and `404` for "does not exist"
  would be an order-existence oracle.
- **`requireAuthUser` is given this page's own path**, so a signed-out visitor
  returns to *this* order after signing in rather than to `/checkout`.
- **The recipient is the verified account email, not the one typed in.** The
  route passes `getAuthUser().email` — the address Google proved — into
  `notifyOrderPlaced({ recipient })`, and the transport sends to that. It
  deliberately does **not** fall back to `order.customer_email`, which is only a
  snapshot of whatever the customer typed: falling back would let any account
  holder send an order's contents (name, phone, street address) to an arbitrary
  address using your sending domain as a relay. If the session carries no
  verified address the send is skipped with `no-verified-recipient` and logged;
  the order still succeeds. `orders.customer_email` keeps its own job as the
  business contact record.
- **The email is secondary to the order.** The route awaits
  `notifyOrderPlaced()` after a `201`, but the function cannot throw, is bounded
  by an 8-second timeout, and its result is discarded. Mailgun refusing a
  message, or the network dropping, can never turn a committed order into a
  failed request. Verified live: a `403` from Mailgun still returned `201`.
- **No email-log or idempotency table.** The trigger is one successful
  `POST /api/orders`, not a page render, so **refreshing the confirmation page
  sends nothing**. Retrying the POST after a network failure does create a
  second order and a second email — the function creates one row per call, and
  that is documented rather than papered over.
- **Mailgun is called over plain `fetch`**, not an SDK: the REST API is one
  authenticated form-encoded `POST`, and Node has had a global `fetch` since
  18, so the dependency list is unchanged. `mailgun.ts` is split from
  `mailgun-transport.ts` because a `server-only` module cannot be imported by a
  test, and the request construction is exactly what is worth testing.
- **Credentials never leave the transport.** The API key goes into an
  Authorization header and nowhere else — the form body is asserted not to
  contain it — and failure reasons are short tokens rather than Mailgun's
  response body, which can echo the recipient and the domain.
- **A missing configuration is not an error.** `readMailgunConfig()` returns
  `null` and the order is placed anyway; only the email is skipped. Local
  development and CI need no Mailgun account.
- **Mailgun free/sandbox domains only send to authorised recipients** and
  answer `403` otherwise. That is a Mailgun policy, not a bug: the identical
  request shape returns `200 Queued` for an authorised address. Expect the send
  to be skipped for any other address until the account is upgraded or the
  recipient is added.
- **Payment is never claimed.** The page and the email both say the payment is
  pending and not yet received, and a test asserts the strings "payment
  confirmed" / "payment received" / "order shipped" never appear. The order
  stays `awaiting_payment`; nothing moves it on.

## Payment model

**No payment gateway.** Customers place an order and receive bank-transfer
instructions. Initial order status: `awaiting_payment`.

Demo payment details — **fictional, for demo purposes only**:

| Field          | Value                 |
| -------------- | --------------------- |
| Bank           | HNG Microfinance Bank |
| Account Name   | North & Form Inc      |
| Account Number | 1028473615            |

Payment verification is out of scope for now.