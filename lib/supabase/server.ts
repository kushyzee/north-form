import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

import { parseBearerToken, resolveCredentialSource } from '@/lib/auth/bearer'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * A new client must be created per request — never share one across requests.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component, which cannot write cookies.
            // The proxy refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  )
}

/**
 * The bearer token on this request, or `null` when there is none.
 *
 * `null` is the overwhelmingly common case: every browser request lands here
 * with no `Authorization` header at all. Reading it costs nothing and never
 * fails — `headers()` is available in every context that already calls
 * `createClient()`.
 */
export async function getBearerToken(): Promise<string | null> {
  const requestHeaders = await headers()

  return parseBearerToken(requestHeaders.get('authorization'))
}

/** The identity a bearer token resolves to, or `null` when it is not usable. */
export type VerifiedBearerUser = {
  /** `auth.users.id` — the `sub` of a signature-verified token. */
  id: string
  email: string | null
}

/**
 * Verifies a bearer token with Supabase and returns the user it belongs to.
 *
 * Verification is deliberately a separate step from building the database
 * client. A client configured with `accessToken` has **no usable `auth`
 * namespace** — the SDK states this outright — so `getClaims()` has to run on
 * an ordinary client. That constraint is the whole reason this is its own
 * function rather than being folded into `createRequestClient()`.
 *
 * `getClaims(token)` checks the signature against Supabase's published JWKS
 * (falling back to a `getUser(token)` round trip), so a forged, tampered or
 * expired token cannot name a user it does not belong to. **The `sub` of that
 * verified token is the identity** — nothing the caller sent is read as an
 * identity, and no service-role key is involved.
 *
 * Returns `null` — never throws, and never falls back to the cookie session —
 * when the token is absent, malformed, forged or expired. Falling back would be
 * a privilege-escalation path: a caller holding a *stale* token could silently
 * be authenticated as the cookie session it should not be using.
 */
export async function verifyBearerToken(
  token: string | null,
): Promise<VerifiedBearerUser | null> {
  if (!token) return null

  // An ordinary cookie client: we need its `auth` namespace, and it is used
  // only to *verify* — never to read data.
  const supabase = await createClient()

  let claims: { sub?: unknown; email?: unknown } | undefined

  try {
    const { data, error } = await supabase.auth.getClaims(token)

    if (error) {
      // An invalid, forged or expired token is the caller's mistake, not ours.
      // Logged without the token itself — it is a credential.
      console.error('[auth] bearer token rejected:', error.message)
      return null
    }

    claims = data?.claims
  } catch (error) {
    // A structurally malformed token can throw out of the decoder rather than
    // returning an `error`. That must still mean "anonymous", not a 500: the
    // caller is no more authenticated than an attacker would be.
    console.error(
      '[auth] bearer token could not be verified:',
      error instanceof Error ? error.message : '(non-error thrown)',
    )
    return null
  }

  const sub = claims?.sub
  if (typeof sub !== 'string' || sub.length === 0) return null

  return {
    id: sub,
    email: typeof claims?.email === 'string' ? claims.email : null,
  }
}

/**
 * A Supabase client carrying **no credentials at all**.
 *
 * Used when a request presented a bearer token that did not verify. It must not
 * be the cookie client: falling back to cookies there would authenticate the
 * request as whoever the browser session belongs to, which is exactly the
 * privilege escalation this whole precedence rule exists to prevent. A caller
 * whose token is bad is anonymous, full stop.
 *
 * Still built from the publishable key, so PostgREST sees the `anon` role and
 * applies exactly the RLS policies any anonymous request faces — no service-role
 * key, no bypass.
 */
function createAnonymousClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // No `accessToken` and no cookie adapter: this client cannot become
      // authenticated by either transport.
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}

/**
 * The Supabase client a request should use for **database work**.
 *
 * Two transports, one client shape, so nothing downstream — the cart queries and
 * mutations, the order RPC, the order read — has to know which one it is
 * running under:
 *
 * - **Browser** (no bearer token): the ordinary cookie client, unchanged. This
 *   is the existing path and it is deliberately left exactly as it was.
 * - **Native** (`Authorization: Bearer …`): a client bound to that token via
 *   `accessToken`, so every PostgREST and RPC call carries it and the database
 *   sees the caller as themselves.
 *
 * **A supplied bearer token is never allowed to fall back to cookies.** If the
 * header is present it decides the outcome outright: a token that verifies
 * produces a bearer client, and a token that does not produces an *anonymous*
 * client — never the cookie client. Returning cookies there would mean a caller
 * holding a stale, forged or wrong-account token silently acted on the browser
 * session instead, and `getAuthUser()` would already have answered `401` while
 * this function went on to read and write as somebody else. The two must agree,
 * so both derive their answer from the same rule rather than each deciding
 * separately.
 *
 * **No service-role key is used on either path.** Every client here is built
 * from the same publishable key; only the *credential* differs. That is what
 * keeps the request subject to the customer's own RLS policies rather than
 * bypassing them.
 */
export async function createRequestClient() {
  const token = await getBearerToken()

  // No bearer credential on this request: the browser path, untouched. This is
  // the only branch that may use cookies.
  if (!token) {
    return createClient()
  }

  const user = await verifyBearerToken(token)

  // One shared precedence rule, so this function and `getAuthUser()` can never
  // disagree about who a request is.
  const source = resolveCredentialSource(token, user !== null)

  if (source === 'anonymous') {
    // A credential was supplied and it did not verify. Anonymity is the only
    // correct answer — falling back to the cookie client is the bug this branch
    // exists to prevent.
    return createAnonymousClient()
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // The verified token becomes the Authorization header on every data
      // request. Session persistence is off because there is no cookie jar to
      // persist into, and this client must never try to write one.
      accessToken: async () => token,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}
