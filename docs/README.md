# NORTH & FORM — Engineering documentation

`AGENTS.md` is the entry point: project status, the stack, the non-negotiable
invariants and the conventions. Everything that explains *why* a subsystem is
built the way it is lives here.

| Document | Covers | Read it when |
| -------- | ------ | ------------ |
| [`storefront.md`](./storefront.md) | Catalogue reads, filter/search/sort, the **client** cart, images, availability | Changing `app/shop`, `app/cart`, `lib/catalogue/` or the client half of `lib/cart/` |
| [`cart.md`](./cart.md) | `cart_items`, `private.add_cart_item`, the `/api/cart` routes, cart ownership | Changing `app/api/cart/`, the server half of `lib/cart/`, or the cart migrations |
| [`checkout.md`](./checkout.md) | The `/checkout` form, its auth guard, validation, totals, submit boundary | Changing `app/checkout`, `components/checkout/` or `lib/checkout/` |
| [`orders.md`](./orders.md) | `private.place_order()`, `POST /api/orders`, the confirmation page, the Mailgun email, the payment model | Changing order creation, the confirmation page or `lib/email/` |
| [`auth.md`](./auth.md) | Supabase clients, session refresh, Google OAuth, redirects, profile creation, dashboard configuration | Changing auth, `proxy.ts`, `lib/auth/` or `lib/supabase/` |
| [`database.md`](./database.md) | Schema, migrations, tables, RLS policies, client grants, delete behaviour | Changing anything in `supabase/`, or touching a table's policies |
| [`reference.md`](./reference.md) | Environment variables, seed catalogue, delivery fees, brand tokens, verification procedures | Wiring up an environment, seeding data, or working on UI/brand work |

There are two carts, and it matters which one you are changing:

- **`storefront.md` covers the browser cart** — `cartReducer` and the
  `localStorage` adapter. Still the only cart the UI uses.
- **`cart.md` covers the server cart** — the `cart_items` table, the trusted
  add function and the `/api/cart` routes. Built in Phase 6 and not yet wired
  to the UI; Phase 7 does that.

They deliberately share one line identity (`productId::size`) and one set of
quantity rules, but they are separate implementations, not one shared module.

Each document opens with the files it governs, then the decisions behind them.
The most important decisions are also summarised in `AGENTS.md` so the rules are
visible without opening anything here — `AGENTS.md` is the summary and these
documents are the reasoning. Keep the two in step when a decision changes.

`codebase.md` in the repository root is a separate, generated analysis of the
source tree (data model, routes, components, state). It describes *what the code
is*; these documents describe *why it is that way*.