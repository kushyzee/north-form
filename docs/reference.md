# Reference

Look-up material rather than decisions: environment variables, the demo
catalogue, brand tokens and the verification procedures.

## Environment variables

Copy `.env.example` to `.env.local` and fill in real values. **`.env.local` is
gitignored — never commit real credentials.**

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — safe to
  expose; RLS is the actual security boundary.
- `MAILGUN_*` — **server-side only.** Never add a `NEXT_PUBLIC_` prefix to
  these, and only read them from Server Components/Actions/Route Handlers. All
  three of `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` / `MAILGUN_FROM_EMAIL` are
  required; if any is missing the confirmation email is skipped and the order
  still succeeds. `MAILGUN_FROM_NAME` is optional and defaults to the brand.
- `SUPABASE_SECRET_KEY` — **not read by any application code.** It is
  deliberately unused: the order path calls the trusted function with the
  *caller's own* session rather than a service-role key, so the request runs as
  the customer under their own RLS. Listed only so a future admin-only script
  has it documented. Do not reach for it in application code.

**Google OAuth adds no environment variables.** The client secret stays in the
Supabase dashboard, and the redirect origin is derived at runtime from
`window.location.origin` / `request.nextUrl.origin`.

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

## Delivery fees

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
pnpm test
pnpm build
pnpm dev                # confirm the app still starts
```

`pnpm test` runs Vitest over the pure logic (checkout validation, delivery
fees, the order request contract, error mapping and the Mailgun request
construction) in a Node environment — no DOM, no browser, no jsdom. Component
rendering and responsive layout are not covered by it and must be checked by
hand.

Database changes additionally require re-running
`supabase/tests/verify_phase2.sql` (see [`database.md`](./database.md)).
Order-creation changes require `supabase/tests/verify_phase5b.sql` as well — it
is the only thing that proves the trusted function still computes money
correctly.

### Verifying authentication

Auth cannot be proven by types and a build. A real Google sign-in needs a
browser, an interactive Google account, and the dashboard config. When checking
it by hand: open `/auth`, click **Continue with Google**, complete consent, and
confirm the header switches to the signed-in state; then confirm `auth.users`
gained exactly one row and `public.profiles` exactly one row with
`profiles.id = auth.users.id`.

Two behaviours worth remembering when testing:

- `signInWithOAuth` builds the PKCE URL client-side, so the browser leaves for
  Google within milliseconds and the button's pending/disabled state is rarely
  painted. That is expected, not a bug — the guard that matters is that repeated
  clicks still produce a single authorize request.
- Callback errors (`?error=`) are the way to exercise the failure paths without a
  real provider: `?error=access_denied` renders the "cancelled" copy, and a bogus
  `?code=` renders the "couldn't complete" copy.