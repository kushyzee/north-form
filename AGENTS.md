# NORTH & FORM — Agent & Engineering Context

Fictional Nigerian men's fashion brand. Tagline: **"Built for the way you move."**

This file is the source of truth for engineering context and decisions. Keep it
current as the project evolves.

## Project status

**Phases 1–3 are complete.** The scaffold, the Supabase client foundation and
the database schema/RLS/demo catalogue are in place, and the customer-facing
storefront (homepage, shop with filter/search/sort, product detail, cart) is
built on top of the public catalogue.

Deliberately **not** built yet — do not assume any of this exists:

- Checkout submission, order creation, bank transfer flow
- Google OAuth configuration (Supabase + Google Cloud Console)
- Mailgun integration
- Authentication UI / account area
- Admin functionality
- Payment verification
- Customer order history

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
| Forms         | React Hook Form + Zod                      | not yet installed |

Package manager is **pnpm** (`packageManager: pnpm@12.6.0`).

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
components/ui/        shadcn/ui primitives (generated via shadcn CLI)
components/storefront/  Site shell and catalogue presentation (mostly RSC)
components/cart/        Cart provider + cart UI (client)
lib/utils.ts          cn() re-export (shadcn convention)
lib/format.ts         NGN / stock / item-count formatting
lib/catalogue/
  types.ts            Domain types + stock availability helpers
  queries.ts          Server-only catalogue reads (RLS-constrained)
lib/cart/
  reducer.ts          Pure cart reducer + selectors (no React)
  storage.ts          localStorage adapter with validation
lib/supabase/
  client.ts           Browser client — Client Components
  server.ts           Server client — Server Components/Actions/Route Handlers
  proxy.ts            Session refresh helper used by /proxy.ts
proxy.ts              Next.js 16 proxy: refreshes auth session per request
supabase/migrations/  Applied SQL migrations (mirrors the live schema exactly)
supabase/tests/       verify_phase2.sql — rollback-safe DB verification script
.env.example          Documented env vars, placeholders only
```

Feature code will be added alongside these as features are built.

## Storefront (Phase 3)

Routes: `/` (homepage), `/shop`, `/shop/[slug]`, `/cart`. Plus `app/error.tsx`,
`app/not-found.tsx` and per-route `loading.tsx` skeletons.

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
- **Cart line identity is `productId::size`** — same product + same size merges,
  different sizes stay as separate lines. The reducer is pure and has no React
  dependency; `clampQuantity` enforces the stock ceiling.
- **Every route is dynamically rendered** because `lib/supabase/server.ts` calls
  `cookies()`. A `revalidate` export has no effect until that changes.
- **Images**: `next.config.ts` allows exactly one host, `placehold.co`, which is
  what the seeded catalogue uses. Add a single new host when real photography
  lands — do not widen it to a wildcard.
- **Availability is never colour-only.** Cards and the product page state
  "Sold out" / "Low stock" / "N in stock" in text as well as styling.
- React Hook Form and Zod are still **not** installed and are not needed yet —
  search, quantity and cart are plain UI state. They arrive with checkout.

## Supabase foundation

Packages: `@supabase/supabase-js`, `@supabase/ssr`, `server-only`.

Three clients, by context:

| Where                                             | Import                  |
| ------------------------------------------------- | ----------------------- |
| Client Components (browser)                       | `@/lib/supabase/client` |
| Server Components / Actions / Route Handlers      | `@/lib/supabase/server` |
| Proxy (session refresh)                           | `@/lib/supabase/proxy`  |

Rules:

- **Never share a server client across requests.** Call `createClient()` per
  request. `lib/supabase/server.ts` imports `server-only` to enforce this.
- `getClaims()` verifies identity. `getUser()` only when a fresh user record is
  needed. Don't use `getSession()` for authorization decisions — it isn't
  re-validated.
- Server Components cannot write cookies; `proxy.ts` performs the refresh.

## Environment variables

Copy `.env.example` to `.env.local` and fill in real values. **`.env.local` is
gitignored — never commit real credentials.**

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — safe to
  expose; RLS is the actual security boundary.
- `MAILGUN_*` — **server-side only.** Never add a `NEXT_PUBLIC_` prefix to
  these, and only read them from Server Components/Actions/Route Handlers.

## Database (Phase 2 — applied and verified)

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

`supabase/tests/verify_phase2.sql` re-runs every structural, RLS and
constraint assertion against a live database. It creates fixtures inside a
transaction that ends in `ROLLBACK`, so nothing it creates persists. Run it
with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_phase2.sql`.

### Tables

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

### Delete behaviour — order history is protected

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

### RLS

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

### Client grant matrix

Supabase's default privileges grant **ALL** on new `public` tables to `anon`
and `authenticated`, including `TRUNCATE`/`REFERENCES`/`TRIGGER`, which RLS
does **not** cover. That was revoked and restated explicitly:

| Role | Access |
| ---- | ------ |
| `anon` | `SELECT` on `categories`, `products` — nothing else |
| `authenticated` | `SELECT` on all five tables; `UPDATE` on `profiles` only |
| `service_role` | `ALL` (bypasses RLS; server-side only, never in the browser) |

### Order creation (Phase 3 — deliberate gap)

There is **no client write path to `orders` or `order_items`**, by design.
Checkout must create orders through a trusted server-side operation that
re-reads products, prices and stock and computes the total itself. Never
trust client-submitted prices, totals, product names, user ids or stock, and
never add a permissive client insert policy to "make checkout work". That
path will need a server-only secret (service role / secret key) — add it to
`.env.example` as a placeholder when that phase starts, and keep it out of
anything prefixed `NEXT_PUBLIC_`.

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

## Product seed data (fictional demo catalogue)

This is the catalogue **actually seeded** in the database (see
`20260930220104_seed_products.sql`):

| Category | Products                                                                                |
| -------- | --------------------------------------------------------------------------------------- |
| Shirts   | Essential Oxford ₦28,000 · Graphic T-Shirt ₦25,000 · Plain T-Shirt ₦22,000              |
| Jeans    | Baggy Jeans ₦35,000 · Washed Black Denim ₦38,000 · Straight Stone Denim ₦36,000          |
| Shoes    | Classic Court Sneaker ₦55,000 · Everyday Loafer ₦62,000 · Everyday Slide ₦25,000         |
| Hoodies  | Studio Heavyweight Hoodie ₦45,000 · Olive Essential Hoodie ₦40,000 · Studio Hoodie ₦35,000 |

Sizes are `text[]` (apparel `S`–`XXL`, jeans `30`–`38`, shoes `40`–`45`). Seeded
images are `placehold.co` placeholders in the brand palette — `next.config.ts`
allows exactly that host under `images.remotePatterns` (Phase 3).

**These are fictional demo entries** for a fictional brand. No third-party
brand name appears anywhere in the catalogue. Do not imply any affiliation,
endorsement or partnership with any real brand in the app or docs.

Currency: **NGN**, formatted with `en-NG` locale and `NGN` currency.

## Delivery fees (reference for Phase 3 checkout)

Fictional demo fees — checkout must **not** accept a client-supplied fee:

| Destination | Fee |
| ----------- | --- |
| Lagos | ₦2,000 |
| Abuja | ₦2,500 |
| Port Harcourt | ₦3,000 |
| Other states | ₦4,000 |

## Brand direction

Minimal · contemporary · editorial · masculine · warm · premium but approachable.

| Token          | Hex       |
| -------------- | --------- |
| Near-black     | `#111111` |
| Warm off-white | `#F7F5F0` |
| Charcoal       | `#2A2A2A` |
| Muted stone    | `#D8D3C8` |
| Deep olive     | `#4A5140` |

These **are** wired into `app/globals.css` as `--brand-*` custom properties
(Phase 3). The shadcn semantic tokens (`--background`, `--foreground`,
`--primary`, `--ring`, …) are derived from them, so shadcn components pick up
the brand automatically. Add new brand tones as `--brand-*` tokens in `:root`
and expose them under `@theme inline` to use them as Tailwind utilities
(`bg-brand-olive`, `text-brand-ink`, …).

Typography: **Instrument Serif** for headings/display (`--font-heading`) paired
with **Inter** for UI/body (`--font-sans`). `app/layout.tsx` loads both via
`next/font`; Geist Mono remains for `--font-mono`.

## Verification

Run before considering work done:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm dev                # confirm the app still starts
```

Database changes additionally require re-running
`supabase/tests/verify_phase2.sql` (see the Database section).

## Conventions

- TypeScript-first, strict mode. No `any` without a reason.
- Prefer existing project patterns over new abstractions.
- Don't add a dependency when the current stack solves it.
- Server Components by default; add `'use client'` only when needed.
- Keep changes incremental and reviewable. Don't refactor unrelated files.

<!-- BEGIN:nextjs-agent-rules -->



# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
