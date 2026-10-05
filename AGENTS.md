# NORTH & FORM — Agent & Engineering Context

Fictional Nigerian men's fashion brand. Tagline: **"Built for the way you move."**

This file is the always-loaded entry point: what the project is, the rules that
must not be broken, and where to find the reasoning behind each subsystem. Keep
it short — depth belongs in [`docs/`](./docs/README.md).

## Documentation map

Read [`docs/README.md`](./docs/README.md) first — it maps each document to the
files it governs and says when to open it.

| Document | Covers |
| -------- | ------ |
| [`docs/storefront.md`](./docs/storefront.md) | Catalogue reads, filter/search/sort, the **client** cart, images, availability |
| [`docs/cart.md`](./docs/cart.md) | `cart_items`, `private.add_cart_item`, the `/api/cart` routes, cart ownership (Phase 6) |
| [`docs/checkout.md`](./docs/checkout.md) | The `/checkout` form, its auth guard, validation, totals, submit boundary |
| [`docs/orders.md`](./docs/orders.md) | `private.place_order()`, `POST /api/orders`, confirmation page, Mailgun email, payment model |
| [`docs/auth.md`](./docs/auth.md) | Supabase clients, session refresh, Google OAuth, redirects, dashboard config |
| [`docs/database.md`](./docs/database.md) | Schema, migrations, tables, RLS policies, grants, delete behaviour |
| [`docs/reference.md`](./docs/reference.md) | Env vars, seed catalogue, delivery fees, brand tokens, verification procedures |

`codebase.md` in the repo root is a generated analysis of the source tree — it
describes *what the code is*. The `docs/` files describe *why it is that way*.
`codebase.md` predates the cart work and is **stale**: it still lists ten
migrations and no cart files. Regenerate it when convenient.

There are two carts, and which one you are changing matters:

- the **client** cart — `lib/cart/reducer.ts` + `localStorage`, documented in
  `docs/storefront.md`, still the only cart the UI uses;
- the **server** cart — `cart_items` + `/api/cart`, documented in
  `docs/cart.md`, built in Phase 6 and not yet wired to the UI.

They share one line identity (`productId::size`) and one set of quantity rules,
but they are separate implementations. Phase 7 connects them.

## Project status

**Phases 1–5C are complete, and Phase 6 (the shared cart backend) is in
place.** The scaffold, the Supabase client foundation and the database
schema/RLS/demo catalogue are in place, the customer-facing storefront
(homepage, shop with filter/search/sort, product detail, cart) is built on top
of the public catalogue, Google sign-in via Supabase Auth works end to end,
`/checkout` is a protected, validated checkout form, `POST /api/orders` calls
the trusted `private.place_order()` function, and a placed order produces a
database-backed confirmation page plus a Mailgun order-confirmation email.

Phase 6 adds the **server-side cart**: `cart_items` with RLS, the trusted
`private.add_cart_item()`, and the `/api/cart` + `/api/cart/items` routes. It is
built and tested but **the web cart still uses `localStorage`** — Phase 7 wires
the UI to it and retires storage.

Deliberately **not** built yet — do not assume any of this exists:

- **The web cart is not migrated to the server cart.** Phase 7 does that.
- **The cart is not wired into checkout.** `POST /api/orders` still takes its
  cart in the request body, which stays authoritative and re-validated.
- **Payment verification.** An order is created `awaiting_payment` and nothing
  ever moves it on — no webhook, no admin action
- Bank transfer flow / payment instructions beyond the confirmation copy and
  the confirmation email
- Order history — the confirmation page is the only order page
- Admin functionality
- Stock decrement or reservation
- A mobile app. `/api/cart` is plain JSON with no browser dependency, so an
  Expo client can call it as-is, but no mobile code exists.

## Stack (as scaffolded — do not churn)

| Concern       | Choice                                     | Version  |
| ------------- | ------------------------------------------ | -------- |
| Framework     | Next.js (App Router)                       | 16.3.7   |
| React         | react / react-dom                          | 19.2.8   |
| Language      | TypeScript (strict)                        | ^5       |
| Styling       | Tailwind CSS (v4, CSS-first config)        | ^4       |
| UI primitives | shadcn/ui — style `base-vega` (Base UI)    | ^4.21.0  |
| Icons         | lucide-react                               | ^1.48.0  |
| React Compiler| enabled in `next.config.ts`                | —        |
| Backend       | Supabase (Postgres + Auth)                 | —        |
| Email         | Mailgun (transactional, order confirmations)| —        |
| Forms         | React Hook Form + Zod + `@hookform/resolvers` | ^7.89 / ^4.6 / ^5.9 |
| Testing       | Vitest (Node environment, no DOM)           | ^5.0.3   |

Package manager is **pnpm** (`packageManager: pnpm@12.6.0`). Currency is **NGN**,
formatted with `en-NG`.

### Notes on the non-obvious bits

- **Tailwind v4 has no `tailwind.config.js`.** Theme tokens are CSS variables
  declared in `app/globals.css` via `@theme inline`. Configure colors there.
- **shadcn v4 + Base UI.** Components import from `@base-ui/react/*`, not Radix.
  `components.json` uses style `base-vega`, and `globals.css` imports
  `shadcn/tailwind.css`. Do not add `tailwind.config.js` or Radix deps.
- **`cn` comes from the standalone `cn` package** (see `lib/utils.ts`), not a
  hand-rolled `clsx` + `twMerge` helper. Do not replace it.
- **Path alias is `@/*` → `./*`** (repo root, not `src/`). There is no `src/`
  directory; don't introduce one without a reason.

## Next.js 16 gotchas (this is not the Next.js you know)

- **`middleware.ts` is deprecated → `proxy.ts`.** The file exports a function
  named `proxy` (not `middleware`). Our Supabase session refresh lives in
  `proxy.ts` at the repo root.
- **`cookies()` is async.** Always `const cookieStore = await cookies()`.
- **Turbopack is the default** for `next dev` and `next build`.
- Route types are generated — note `LayoutProps<"/">` used in `app/layout.tsx`.
- Read version-matched docs in `node_modules/next/dist/docs/` before relying on
  an API you haven't used in this project.

## Source structure

```
app/                  App Router routes, layout, global CSS
components/ui/        shadcn/ui primitives
components/storefront/  Site shell and catalogue presentation (mostly RSC)
components/cart/        Cart provider + cart UI (client)
components/auth/        Sign-in page pieces, header auth state, sign-out
components/checkout/    Checkout form, order summary, field wrapper (client)
app/api/orders/         POST /api/orders — the order-creation API route
app/api/cart/           GET/DELETE /api/cart — read and clear the cart
app/api/cart/items/     POST/PATCH/DELETE /api/cart/items — one cart line
lib/utils.ts          cn() re-export (shadcn convention)
lib/format.ts         NGN / stock / item-count formatting
lib/auth/             Open-redirect guard + server-only identity helpers
lib/catalogue/        Domain types + server-only catalogue reads
lib/cart/             Client reducer + localStorage; server schema/errors/queries/mutations
lib/checkout/         Nigeria states, delivery fees, phone, Zod schema
lib/orders/           Request schema, error mapping, place-order, queries
lib/email/            Confirmation template, Mailgun transport, notifier
lib/supabase/         client.ts / server.ts / proxy.ts
proxy.ts              Next.js 16 proxy: refreshes auth session per request
supabase/migrations/  Applied SQL migrations
supabase/tests/       Rollback-safe DB verification scripts
docs/                 Per-subsystem engineering context (see the map above)
```

## Invariants — do not break these

Distilled from `docs/`. If a change seems to require breaking one, that is a
design change, not an implementation detail.

**The database owns the order.**

- Never trust a client-supplied price, total, product name, user id or status.
- There is **no client write path** to `orders` / `order_items`. Adding a
  permissive INSERT policy "to make checkout work" would let anyone forge an
  order.
- `private.place_order()` is the only writer, and its power comes from having
  no price / total / user / status parameters — do not add them.
- **Never use a service-role key in application code.** `SUPABASE_SECRET_KEY` is
  deliberately unused. The order path runs as the customer under their own RLS.
- Stock is validated, never mutated. Two customers can both pass the check for
  the last unit; that is a documented deferral, not a bug to fix here.

**Ownership is RLS, not application logic.** `getOrderByNumber()` and
`getCart()` take no user id. Return `404` for someone else's order or cart line,
never `403` — a `403` would be an existence oracle. Where a cart write names an
owner in its `WHERE` clause, that id comes from the **verified** session, never
from the request body.

**The cart stores no money.** `cart_items` has no `price`, `unit_price`,
`subtotal`, `total`, `product_name` or `stock_quantity` column. Name, price and
stock are joined from `products` on read. Do not add a snapshot column to make a
cart read cheaper — that is exactly how a stale price reaches a checkout, and the
server would then have to remember not to trust it. (This is deliberately the
opposite of `order_items`, which *does* snapshot: an order is a record, a cart
is not.)

**Redirects.** Every use of `?next=` goes through `safeRedirectPath()`. Never
build a redirect or an `href` from a raw query value.

**Never log the request.** Only the SQLSTATE and the function's machine code; on
rejection, the *path* of the first bad field, never its value.

**Email is secondary to the order.** A Mailgun failure must never fail an order
— the email is skipped instead. The recipient is the verified account address
(`getAuthUser().email`), never `order.customer_email`: falling back would let any
account holder relay an order's contents to an arbitrary address. `MAILGUN_*` is
server-side only — never add a `NEXT_PUBLIC_` prefix.

**Routes and rendering.**

- **Never add a `loading.tsx` to `/checkout` or
  `/checkout/confirmation/[orderNumber]`.** It wraps the page in a Suspense
  boundary that flushes before the page body runs, turning the auth guard's
  `307` into a `200` carrying a meta-refresh. Their loading states are
  client-side skeletons.
- The storefront stays public. Do not add blanket route protection; a route
  opts in with `requireAuthUser()`. The guard lives in the page, not
  `proxy.ts`.
- Payment is never claimed. Orders stay `awaiting_payment`; nothing moves them
  on.

## Conventions

- TypeScript-first, strict mode. No `any` without a reason.
- Prefer existing project patterns over new abstractions.
- Don't add a dependency when the current stack solves it.
- Server Components by default; add `'use client'` only when needed.
- Keep changes incremental and reviewable. Don't refactor unrelated files.
- If something is ambiguous or could materially affect the architecture, ask
  rather than guessing.

## Verification

```bash
pnpm lint
pnpm build                # must run before typecheck — see below
pnpm typecheck
pnpm test
pnpm dev                  # confirm the app still starts
```

> **`pnpm typecheck` requires `pnpm build` (or `pnpm dev`) to have run at least
> once.** `tsconfig.json` includes `.next/types/**/*.ts`, which Next.js
> generates during a build; without it every route file fails with
> `Cannot find name 'PageProps' / 'LayoutProps'`. That is not a code error —
> run the build first, or the check lies to you.

`pnpm test` runs Vitest over the pure logic in a Node environment — no DOM, no
browser, no jsdom. Component rendering and responsive layout are not covered by
it and must be checked by hand.

Database changes additionally require `supabase/tests/verify_phase2.sql`;
order-creation changes require `supabase/tests/verify_phase5b.sql` — it is the
only thing that proves the trusted function still computes money correctly; and
cart changes require `supabase/tests/verify_cart.sql`, which is the only thing
that proves one user cannot reach another's cart. All three run inside a
transaction ending in `ROLLBACK`. Full procedures, including the manual auth
check, are in [`docs/reference.md`](./docs/reference.md).

**A database change that adds a table or policy will break the bare count
assertions in `verify_phase2.sql` / `verify_phase5b.sql`.** Scope them to the
tables they are actually about rather than counting the whole `public` schema,
so the assertion keeps testing its intent instead of becoming a tripwire for any
future phase.
<!-- BEGIN:nextjs-agent-rules -->



# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
