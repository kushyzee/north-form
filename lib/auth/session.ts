import "server-only"

import { redirect } from "next/navigation"

import { safeRedirectPath } from "@/lib/auth/redirect"
import { resolveCredentialSource } from "@/lib/auth/bearer"
import { createClient, getBearerToken, verifyBearerToken } from "@/lib/supabase/server"

/**
 * Server-side identity helpers.
 *
 * Authorization always comes from Supabase Auth — never from a value the
 * browser supplied. The `id` returned here is the `sub` of a *verified* access
 * token, so a forged or stale client-supplied user id cannot widen anything.
 *
 * There is still only one auth system. A request may present its identity two
 * ways, and both end at the same place — a verified Supabase token:
 *
 *   browser — Supabase's httpOnly session cookies, via `getClaims()`
 *   native  — `Authorization: Bearer <token>`, via `getClaims(token)`
 *
 * Only the transport differs. Ownership is still decided by `auth.uid()` inside
 * the database, and no service-role key is involved on either path.
 */

/** The signed-in user, or `null` when the visitor is anonymous. */
export type AuthUser = {
  /** `auth.users.id`, taken from verified claims. */
  id: string
  /** Convenience copy for display only — `auth.users` stays authoritative. */
  email: string | null
}

/** Anonymous visitors raise this rather than a genuine failure. */
function isMissingSessionError(error: { code?: string }): boolean {
  return error.code === "session_not_found"
}

/**
 * The current user, or `null`.
 *
 * Uses `getClaims()`, which verifies the access token (and refreshes it when it
 * is close to expiry). `proxy.ts` has already refreshed the session before the
 * route renders, so this is a local read rather than another network round trip.
 * `getSession()` is deliberately not used — its user object is not re-validated.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  // Native client: `Authorization: Bearer <token>`, verified against Supabase
  // before it means anything.
  const bearerToken = await getBearerToken()
  if (bearerToken) {
    const bearerUser = await verifyBearerToken(bearerToken)

    // The same rule `createRequestClient()` uses, so the identity this function
    // reports and the credential its database calls carry cannot disagree. An
    // unverified token resolves to `anonymous` and is answered `401` by the
    // route — it never falls through to the cookie session below, which would
    // authenticate the caller as the signed-in browser user instead.
    const source = resolveCredentialSource(bearerToken, bearerUser !== null)

    // `bearerUser` is non-null on the `bearer` branch by construction: the rule
    // only yields `bearer` when verification succeeded.
    if (source !== 'bearer' || !bearerUser) return null

    return { id: bearerUser.id, email: bearerUser.email }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  // A missing session is the normal state for most of the storefront and must
  // not fill the logs; anything else is worth recording.
  if (error && !isMissingSessionError(error)) {
    console.error("[auth] getClaims failed:", error.message)
  }

  const claims = data?.claims
  if (!claims?.sub) return null

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  }
}

/**
 * Guard for routes that require a signed-in user.
 *
 * Phase 5 (`/checkout`) is the first caller. It is defined here now so the
 * auth boundary lives in one place rather than being re-invented per route.
 * Note this *protects a route* — it does not protect any data. Row Level
 * Security remains the authority on who may read or write which row.
 */
export async function requireAuthUser(nextPath: string): Promise<AuthUser> {
  const user = await getAuthUser()
  if (user) return user

  const next = safeRedirectPath(nextPath)
  redirect(`/auth?next=${encodeURIComponent(next)}`)
}