# NORTH & FORM — Engineering documentation

`AGENTS.md` is the entry point: project status, the stack, the non-negotiable
invariants and the conventions. Everything that explains *why* a subsystem is
built the way it is lives here.

| Document | Covers | Read it when |
| -------- | ------ | ------------ |
| [`storefront.md`](./storefront.md) | Catalogue reads, filter/search/sort, the cart, images, availability | Changing `app/shop`, `app/cart`, `lib/catalogue/` or `lib/cart/` |
| [`checkout.md`](./checkout.md) | The `/checkout` form, its auth guard, validation, totals, submit boundary | Changing `app/checkout`, `components/checkout/` or `lib/checkout/` |
| [`orders.md`](./orders.md) | `private.place_order()`, `POST /api/orders`, the confirmation page, the Mailgun email, the payment model | Changing order creation, the confirmation page or `lib/email/` |
| [`auth.md`](./auth.md) | Supabase clients, session refresh, Google OAuth, redirects, profile creation, dashboard configuration | Changing auth, `proxy.ts`, `lib/auth/` or `lib/supabase/` |
| [`database.md`](./database.md) | Schema, migrations, tables, RLS policies, client grants, delete behaviour | Changing anything in `supabase/`, or touching a table's policies |
| [`reference.md`](./reference.md) | Environment variables, seed catalogue, delivery fees, brand tokens, verification procedures | Wiring up an environment, seeding data, or working on UI/brand work |

Each document opens with the files it governs, then the decisions behind them.
The most important decisions are also summarised in `AGENTS.md` so the rules are
visible without opening anything here — `AGENTS.md` is the summary and these
documents are the reasoning. Keep the two in step when a decision changes.

`codebase.md` in the repository root is a separate, generated analysis of the
source tree (data model, routes, components, state). It describes *what the code
is*; these documents describe *why it is that way*.