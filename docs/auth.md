# Authentication & Supabase foundation

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

## Authentication (Phase 4 — Google OAuth)

```
/auth  →  "Continue with Google"  →  Supabase Auth  →  Google  →
/auth/callback  →  exchangeCodeForSession  →  session cookies  →  next
```

Google is the **only** provider. There is no email/password, magic link, phone
or other social login, and no custom OAuth flow — Supabase owns the protocol.

### Routes

| Route                   | Kind             | Purpose |
| ----------------------- | ---------------- | ------- |
| `/auth`                 | RSC + client btn | The sign-in page. Reads `?next=` and `?error=` |
| `/auth/callback`        | Route Handler    | Exchanges the authorization code for a session |

`components/auth/google-sign-in-button.tsx` calls
`signInWithOAuth({ provider: "google", options: { redirectTo } })` on the
**browser** client. `redirectTo` is built from `window.location.origin`, so the
same code works on localhost, a preview URL and production — there is no
hardcoded host and no separate callback per environment.

`app/auth/callback/route.ts` calls `exchangeCodeForSession(code)` with the
**server** client. A Route Handler may write outgoing cookies, so the session
cookies Supabase sets ride along on the `NextResponse.redirect` — do **not**
copy, read or delete auth cookies by hand. The access and refresh tokens never
reach client JavaScript; the browser only ends up holding Supabase's cookies.

### Redirects — the one rule

`next` travels in a query string, so it is attacker-controlled. **Every** use
goes through `safeRedirectPath()` in `lib/auth/redirect.ts`, which accepts only
a single-slash absolute path and rejects `//evil.example`, `/\evil.example`,
control characters and anything that resolves off-origin, defaulting to `/`.
Supabase's own redirect allow-list is a second layer, not the primary guard —
never construct a redirect or an `href` from a raw query value.

### Session and identity

- `proxy.ts` still owns session refresh. There is no second mechanism, and no
  second middleware. The callback does not duplicate it.
- Server-side identity is `getAuthUser()` in `lib/auth/session.ts` (server-only),
  built on `getClaims()`. The `id` it returns is the `sub` of a verified token —
  never a client-supplied user id.
- `requireAuthUser(nextPath)` protects `/checkout` and the confirmation page. It
  protects a *route*; RLS still protects the *data*. It is used from the page
  itself only — see [`checkout.md`](./checkout.md) for why the guard is not
  duplicated in `proxy.ts` or moved into a layout.
- The header's auth state is a Server Component (`components/auth/auth-status.tsx`)
  passed into the client `SiteHeader` as `children`. It renders "Sign in" when
  anonymous, and the email plus a sign-out control when signed in. Sign-out uses
  the browser client's `signOut()` then `router.refresh()`; Supabase clears the
  cookies itself.
- `/`, `/shop`, `/shop/[slug]` and `/cart` stay public. Auth is required only
  where a route opts in via `requireAuthUser`. Do not add blanket route
  protection — it would make the storefront private.

### Configuration (dashboard only — never in the repo)

Already configured for this project (project ref `gtgovpkjbqoxdgmwbwny`):

- **Google Cloud** → Google Auth Platform. An *OAuth client* of type **Web
  application** exists with client id
  `154939204905-99tj4495jacv7edjoih1ibf25skea3iu.apps.googleusercontent.com`.
  Authorized redirect URI is Supabase's callback, **not** our app:
  `https://gtgovpkjbqoxdgmwbwny.supabase.co/auth/v1/callback`.
  Authorized JavaScript origins: `http://localhost:3000` (+ the production
  origin). Audience must include the testers' accounts; Data Access scopes are
  `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
- **Supabase** → Authentication → Providers → Google: enabled, with the client
  id and client secret stored in the dashboard.
- **Supabase** → Authentication → URL Configuration: Site URL = the production
  origin; Redirect URLs include `http://localhost:3000/**` and the production
  origin. The wildcard matters because the callback carries `?next=`, which an
  exact-path entry would not match.

> The Google client secret and the Supabase service-role/secret key live only in
> the Supabase dashboard and `.env.local`. Never commit either, never add a
> `NEXT_PUBLIC_` prefix to either, and never log a token.

To reproduce this from scratch for a new project: create the Google Cloud OAuth
client as above, paste its id/secret into Supabase → Providers → Google, then
allow-list the origins and redirect URLs in Supabase → URL Configuration. No
application code or environment variable changes.

### Profile creation

The Phase 2 `handle_new_user()` trigger is unchanged and does all the work:
`on_auth_user_created` fires once per new `auth.users` row and inserts into
`public.profiles`, taking `full_name` (then `name`) from the OAuth identity,
falling back to the email local part, with `on conflict (id) do nothing` so
repeat sign-ins never create a second row. **Do not add a client-side profile
insert path**, and do not add an insert policy on `profiles`.