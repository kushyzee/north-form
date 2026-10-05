# Storefront (Phase 3)

Routes: `/` (homepage), `/shop`, `/shop/[slug]`, `/cart`. Plus `app/error.tsx`,
`app/not-found.tsx` and per-route `loading.tsx` skeletons.

| File                          | Role                                              |
| ----------------------------- | ------------------------------------------------- |
| `lib/catalogue/types.ts`      | Domain types + stock availability helpers         |
| `lib/catalogue/queries.ts`    | Server-only catalogue reads (RLS-constrained)     |
| `lib/cart/reducer.ts`         | Pure cart reducer + selectors (no React)          |
| `lib/cart/storage.ts`         | `localStorage` adapter with validation            |
| `components/cart/`            | Cart provider + cart UI (client)                  |
| `components/storefront/`      | Site shell and catalogue presentation (mostly RSC) |

This document covers the **client** cart only. The server-backed cart —
`cart_items`, `private.add_cart_item`, `/api/cart` — is in
[`cart.md`](./cart.md). Nothing in `components/cart/` calls it yet; Phase 7 does
that.

Decisions worth knowing before changing anything here:

- **The database is the catalogue.** Nothing is hardcoded in components. All
  reads go through `lib/catalogue/queries.ts`, which is `server-only` and uses
  the anon publishable key, so queries run under the existing RLS policies.
- **No generated Supabase types (yet).** `queries.ts` validates each row from
  `unknown` into the domain types in `lib/catalogue/types.ts`. That keeps the
  app `any`-free without committing to a codegen workflow. If you introduce
  `supabase gen types`, the runtime mappers become redundant — remove them in
  the same change rather than leaving two sources of truth.
- **Filter/search/sort happen in Postgres**, driven by URL search params
  (`?category=`, `?q=`, `?sort=`). `getProducts` builds one query chain; do not
  fetch the catalogue and sort it in JS. Unrecognised param values are dropped,
  not passed through.
- **The cart is a client-side UX snapshot, not order data.** `unitPrice` and
  `maxQuantity` are captured at add-time purely so the UI can render. Checkout
  must re-read products, prices and stock server-side and compute totals itself.
  The server cart follows the same rule for a different reason — it stores no
  price at all and joins `products` on read (see [`cart.md`](./cart.md)).
- **Cart line identity is `productId::size`** — same product + same size merges,
  different sizes stay as separate lines. The reducer is pure and has no React
  dependency; `clampQuantity` enforces the stock ceiling. The server cart uses
  the identical composite (`UNIQUE (user_id, product_id, size)`), so Phase 7 can
  hydrate one from the other.
- **Every route is dynamically rendered** because `lib/supabase/server.ts` calls
  `cookies()`. A `revalidate` export has no effect until that changes.
- **Images**: `next.config.ts` allows exactly one host, `placehold.co`, which is
  what the seeded catalogue uses. Add a single new host when real photography
  lands — do not widen it to a wildcard.
- **Availability is never colour-only.** Cards and the product page state
  "Sold out" / "Low stock" / "N in stock" in text as well as styling.
- React Hook Form and Zod are installed and used **only by the checkout form**.
  Search, quantity and cart remain plain UI state; do not migrate them.