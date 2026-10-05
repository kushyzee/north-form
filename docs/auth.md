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

## Two transports, one auth system

The browser and a native client present the **same Supabase access token** over
different transports. There is still exactly one auth system and one authority —
`auth.uid()` inside the database — only the way the token arrives differs.

| Transport            | Presented as                              | Verified by           |
| -------------------- | ----------------------------------------- | --------------------- |
| Browser              | Supabase httpOnly session cookies         | `getClaims()`         |
| Native (Expo, later) | `Authorization: Bearer <access-token>`    | `getClaims(token)`    |

| File                       | Role                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| `lib/auth/bearer.ts`       | Pure `parseBearerToken()` + the precedence rule. Unit tested     |
| `lib/auth/session.ts`      | `getAuthUser()` — the identity both transports resolve to         |
| `lib/supabase/server.ts`   | `getBearerToken()`, `verifyBearerToken()`, `createRequestClient()` |

A native client has no cookie jar, so it cannot use the browser path at all.
`Authorization: Bearer <token>` is how the same credential crosses that gap.
**The browser flow above is unchanged** — cookies, `proxy.ts` refresh and the
OAuth callback all behave exactly as before.

### Precedence — the rule, and why it is a rule

```
no Authorization header              → cookie session
Authorization: Bearer <valid>       → that token's user
Authorization: Bearer <invalid>     → anonymous, 401. NEVER the cookie user
```

The third line is the whole point, and it is easy to get wrong. `getAuthUser()`
and `createRequestClient()` are two halves of one request: the first decides
*who the caller is*, the second decides *what credential the database calls
carry*. When they decided independently, an unverifiable token produced `401`
from the first and the **cookie client** from the second — so a request carrying
a stale or forged token while the browser was signed in went on to read and
write as the signed-in browser user. That is a privilege escalation, and no
amount of correctness in `getAuthUser()` prevents it.

Both now derive from `resolveCredentialSource(token, verified)` in
`lib/auth/bearer.ts`, which returns `'cookie' | 'bearer' | 'anonymous'`.
`cookie` is reachable **only** when no token was parsed, so the disagreement is
impossible rather than merely unlikely.

### Verification is separate from the database client

This split is forced by the SDK, not chosen for tidiness. A client configured
with `accessToken` has **no usable `auth` namespace** — the SDK documents this
outright — so `getClaims()` cannot run on the very client that needs the token.
Hence `verifyBearerToken()` runs on an ordinary cookie client purely to *check*
the token, and `createRequestClient()` then builds the client that *uses* it.

`getClaims(token)` checks the signature against Supabase's published JWKS, so a
forged, tampered or expired token cannot name a user it does not belong to.
**The `sub` of that verified token is the identity** — nothing the caller sent
is read as an identity.

When verification fails, `createRequestClient()` returns an **anonymous** client
— no `accessToken`, no cookie adapter — so the request reaches PostgREST as
`anon` and is refused by RLS (`42501`). Never the cookie client.

### Rules for this area

- **Never trust the header.** `parseBearerToken()` only recognises the shape.
  Verification is `getClaims()`'s job and is the single place it happens.
- **Never let a failed bearer fall back to cookies.** A supplied credential
  decides the outcome outright. If in doubt, return anonymous.
- **Never use a service-role key on either transport.** Both clients are built
  from the same publishable key; only the *credential* differs. A service-role
  client would bypass the customer's own RLS, which is the property that makes
  this safe.
- **Never log a token.** Rejections log the reason (`Invalid JWT signature`),
  never the credential.
- A header that carries no token at all — bare `Bearer`, `Basic abc`, `Token
  abc`, whitespace — is treated as *absent*, so the browser path still applies.
  That is a deliberate compatibility choice, not a security one: such a request
  presents nothing to verify, and degrades to what it would have been without
  the header. Only a *present* token locks the request out of cookies.

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
  second middleware. The callback does not duplicate it. It refreshes
  **cookies** only — a bearer request has no cookie to refresh, which is fine,
  because `verifyBearerToken()` checks the token itself.
- Server-side identity is `getAuthUser()` in `lib/auth/session.ts` (server-only).
  The `id` it returns is the `sub` of a verified token — cookie or bearer — never
  a client-supplied user id. See
  [Two transports](#two-transports-one-auth-system).
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