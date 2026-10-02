# North & Form

**Built for the way you move.**

A storefront for a fictional Nigerian men's fashion brand — browse a Supabase-backed
catalogue, build a cart, sign in with Google, and place an order that the database
validates and computes itself.

> **Demo project.** North & Form is not a real brand. The catalogue, bank details and
> payment instructions are fictional and for demonstration only. No payment is ever
> taken or verified.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.3.7 (App Router), React 19.2.8, TypeScript (strict) |
| Styling | Tailwind CSS v4 (CSS-first config), shadcn/ui (`base-vega`) |
| Backend | Supabase — Postgres, Auth, Row Level Security |
| Email | Mailgun (transactional order confirmations) |
| Forms | React Hook Form + Zod |
| Testing | Vitest (Node environment) |

Package manager is **pnpm**. Currency is **NGN**, formatted with the `en-NG` locale.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in the values below
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

`.env.local` is gitignored — never commit real credentials.

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Safe to expose; RLS is the real boundary |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Safe to expose; RLS is the real boundary |
| `MAILGUN_API_KEY` | no | Server-side only. Omitting it skips the confirmation email — the order still succeeds |
| `MAILGUN_DOMAIN` | no | Server-side only |
| `MAILGUN_FROM_EMAIL` | no | Server-side only |
| `MAILGUN_FROM_NAME` | no | Optional, defaults to the brand |

Never add a `NEXT_PUBLIC_` prefix to any `MAILGUN_*` variable.

## Routes

| Route | Description |
| --- | --- |
| `/` | Homepage |
| `/shop` | Catalogue with Postgres-driven filter, search and sort |
| `/shop/[slug]` | Product detail |
| `/cart` | Client-side cart |
| `/auth` | Google sign-in |
| `/checkout` | Checkout form — **requires sign-in** |
| `/checkout/confirmation/[orderNumber]` | Placed order, read back from the database |
| `POST /api/orders` | Order creation API |

## How an order is created

The client never supplies a price, a total, a user id or a status. Checkout posts the
typed details and the cart to `POST /api/orders`, which validates the request and calls
the trusted database function `private.place_order()`. That function re-reads products,
prices and stock and computes every total itself.

Consequences worth knowing:

- There is **no client write path** to `orders` or `order_items`, by design.
- All totals are `numeric(12,2)`; money is never a float.
- The whole cart is validated before any row is written, so a failure rolls back
  cleanly — there is no partial order.
- Stock is **validated but never decremented**. Two customers can both pass the check
  for the last unit. Reserving inventory needs an explicit payment/order lifecycle
  decision.
- Ownership is enforced by RLS. Another customer's order number simply resolves to
  nothing, and the confirmation page 404s.

### Payment

There is no payment gateway. An order is created with status `awaiting_payment` and
receives bank-transfer instructions by email. **Payment is not verified and no webhook
moves the order on.**

## Authentication

Google is the only provider — there is no email/password, magic link or custom OAuth
flow. Supabase owns the protocol.

```
/auth  →  Supabase Auth  →  Google  →  /auth/callback  →  session cookies  →  next
```

The storefront is public. Only routes that explicitly call `requireAuthUser()` are
protected. Redirect targets are always passed through `safeRedirectPath()`.

To enable it, configure the Google OAuth client and the Supabase provider in the
dashboard. No application code or environment variable changes are required.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` covers the pure logic — checkout validation, delivery fees, the order
request contract, error mapping and the Mailgun request construction. It runs in a Node
environment with no DOM. Component rendering and responsive layout are not covered and
must be checked by hand.

Database changes should be verified against `supabase/tests/verify_phase2.sql`, and
order-creation changes against `supabase/tests/verify_phase5b.sql`. Both run inside a
transaction that ends in `ROLLBACK`.

## Project layout

```
app/                   Routes, layout, global CSS
components/            UI, split by storefront / cart / auth / checkout
lib/                   Domain logic — auth, catalogue, cart, checkout, orders, email
supabase/migrations/   Applied SQL migrations
supabase/tests/        Rollback-safe database verification scripts
proxy.ts               Session refresh (Next.js 16 replaced middleware.ts)
```

`AGENTS.md` holds the full engineering context: the decisions behind each subsystem
and the constraints to respect before changing them.

## Licence

MIT — see [LICENSE](LICENSE).
