# NORTH & FORM — Agent & Engineering Context

Fictional Nigerian men's fashion brand. Tagline: **"Built for the way you move."**

This file is the source of truth for engineering context and decisions. Keep it
current as the project evolves.

## Project status

**Phase 1 (foundation) is complete.** The scaffold exists, the Supabase client
foundation is in place, and `AGENTS.md` + `.env.example` are set up. The app
still renders the default Next.js starter page.

Deliberately **not** built yet — do not assume any of this exists:

- Homepage, product catalogue UI, product detail page
- Cart, checkout, order creation
- Google OAuth configuration (Supabase + Google Cloud Console)
- Mailgun integration
- Database schema / migrations / RLS policies
- Admin functionality
- Payment verification

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
lib/utils.ts          cn() re-export (shadcn convention)
lib/supabase/
  client.ts           Browser client — Client Components
  server.ts           Server client — Server Components/Actions/Route Handlers
  proxy.ts            Session refresh helper used by /proxy.ts
proxy.ts              Next.js 16 proxy: refreshes auth session per request
.env.example          Documented env vars, placeholders only
```

Feature code will be added alongside these as features are built.

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

## Planned database (NOT yet created)

Tables: `profiles`, `categories`, `products`, `orders`, `order_items`.

- `products` and `categories` are publicly readable.
- Users can read/write their own `profile` and read their own `orders`.
- RLS protects application data. Schema/migrations are a later phase.

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

| Category | Products                                                                                |
| -------- | --------------------------------------------------------------------------------------- |
| Shirts   | Essential Oxford ₦28,000 · Graphic T-Shirt ₦25,000 · Plain T-Shirt ₦22,000              |
| Jeans    | Baggy Jeans ₦35,000 · Washed Black Denim ₦38,000 · Straight Stone Denim ₦36,000          |
| Shoes    | Nike Air Force 1 ₦55,000 · Everyday Loafer ₦62,000 · Adidas Slides ₦25,000             |
| Hoodies  | Balenciaga Hoodie ₦45,000 · Olive Essential Hoodie ₦40,000 · Studio Hoodie ₦35,000        |

**These are fictional demo entries.** Product names referencing Nike, Adidas and
Balenciaga are placeholders in a fictional catalogue. Do not imply any
affiliation, endorsement or partnership with those brands anywhere in the app
or docs.

Currency: **NGN**, formatted with `en-NG` locale and `NGN` currency.

## Brand direction

Minimal · contemporary · editorial · masculine · warm · premium but approachable.

| Token          | Hex       |
| -------------- | --------- |
| Near-black     | `#111111` |
| Warm off-white | `#F7F5F0` |
| Charcoal       | `#2A2A2A` |
| Muted stone    | `#D8D3C8` |
| Deep olive     | `#4A5140` |

These are **not yet wired into `app/globals.css`** — the current tokens are
shadcn defaults. Applying them is part of building the UI.

Typography: an editorial heading font paired with a clean UI/body font.
`app/layout.tsx` currently loads Inter (`--font-sans`) and Geist
(`--font-geist-sans`); `globals.css` maps `--font-heading` to the sans stack.
Revisit with the UI phase.

## Verification

Run before considering work done:

```bash
pnpm lint
pnpm exec tsc --noEmit   # no `typecheck` script exists yet
pnpm build
pnpm dev                # confirm the app still starts
```

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
