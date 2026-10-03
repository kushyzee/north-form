# Checkout (Phase 5A)

`/checkout` is the first route to opt into the auth guard. It collects customer
and delivery details, validates them, and shows the cart and totals. **It does
not create an order** — the submit handler posts to `POST /api/orders`, which is
covered in [`orders.md`](./orders.md).

| File                                       | Role                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `app/checkout/page.tsx`                    | RSC. `requireAuthUser("/checkout")`, reads the profile, renders the chrome     |
| `components/checkout/checkout-view.tsx`    | Client. Hydration gate, empty-cart state, skeleton                            |
| `components/checkout/checkout-form.tsx`    | Client. RHF + Zod form, order summary wiring, submit boundary                  |
| `components/checkout/checkout-field.tsx`   | Label / error / hint wrapper shared by all fields                              |
| `components/checkout/order-summary.tsx`     | Presentational lines + Subtotal / Delivery / Total                            |
| `lib/checkout/schema.ts`                   | The single Zod contract, shared with the order API                            |
| `lib/checkout/profile.ts`                  | Server-only own-row profile read (pre-fill defaults only)                     |

Decisions worth knowing before changing anything here:

- **The guard is `requireAuthUser()` in the page, nothing else.** `proxy.ts`
  still only refreshes the session. There is no proxy-level route protection and
  no second auth mechanism.
- **Do not add `app/checkout/loading.tsx`.** This is not a style preference: a
  route `loading.tsx` wraps the page in a Suspense boundary that flushes before
  the page body runs, so `redirect()` becomes a `200` carrying a meta-refresh
  instead of a real `307`. Verified — with the file the guard degrades to
  `200`; without it, `/checkout` returns `307 → /auth?next=%2Fcheckout`. The
  loading state is the client-side skeleton in `checkout-view.tsx`, exactly as
  `/cart` does it.
- **The submit button creates a real order.** `onSubmit` posts the typed details
  and the cart to `POST /api/orders`, which calls `private.place_order` (Phase
  5B-2). It claims nothing until the API answers `201`, and it does not compute
  the order — the database does. There is no client-supplied `user_id`, price,
  subtotal, fee, total or status anywhere in the request.
- **Every total is display-only.** `subtotal` comes from the cart's add-time
  snapshot and `deliveryFee` from `getDeliveryFee()`. The order path recomputes
  both server-side. Nothing here is ever submitted.
- **One schema, two consumers.** `lib/checkout/schema.ts` is the single Zod
  contract, used by the browser form now and by the server-side order path
  later. `state` is `z.enum(NIGERIAN_STATES)`, so an unknown state is rejected
  rather than stored as free text.
- **Profile is read, never written.** `lib/checkout/profile.ts` returns
  defaults for `fullName` / `email` / `phone` and nothing more. Profile
  persistence is out of scope, and the auth trigger still owns row creation.
- **`getDeliveryRegion()` uses a `switch`, not an object lookup.** The state
  value is user-controlled, and indexing a plain object with an arbitrary
  string returns whatever is inherited from `Object.prototype`.
- **Validation runs in `onTouched` mode** so nothing is flagged mid-typing, and
  `useWatch` (not `watch()`) subscribes the summary to the state field — the
  React Compiler treats RHF's `watch()` as an incompatible library and skips
  memoizing the component. For the same reason the in-flight guard is `useState`
  rather than a ref: the compiler rejects reading `ref.current` inside a handler
  it cannot prove is event code.