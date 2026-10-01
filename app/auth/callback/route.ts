import { NextResponse, type NextRequest } from "next/server"

import { safeRedirectPath } from "@/lib/auth/redirect"
import { createClient } from "@/lib/supabase/server"

/**
 * OAuth callback for Supabase Auth (Google).
 *
 * The flow:
 *   1. the browser client calls `signInWithOAuth` with `redirectTo` pointing
 *      back here, keeping the PKCE code verifier in a cookie;
 *   2. the provider returns an authorization `code` to this route;
 *   3. the *server* client exchanges it for a session. That writes the session
 *      cookies through `next/headers`, and because a Route Handler may set
 *      outgoing cookies, they ride along on the redirect response below — no
 *      cookie is read, written or deleted by hand;
 *   4. the user is forwarded to the validated `next` path.
 *
 * The browser never receives an access or refresh token; it only ends up
 * holding Supabase's httpOnly cookies. `proxy.ts` continues to refresh the
 * session on subsequent requests — this route does not duplicate that.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  // `next` came from a URL, so it is validated before it can become a Location.
  const next = safeRedirectPath(searchParams.get("next"))

  // Origin of this request, taken from the URL Next.js resolved for it. A
  // reverse proxy must forward the public Host header for this to be right in
  // production.
  const origin = request.nextUrl.origin

  // Supabase reports a rejected or cancelled consent by redirecting back here
  // with `error` instead of a code.
  const providerError = searchParams.get("error")
  if (providerError) {
    console.error(
      "[auth] OAuth returned an error before the callback:",
      providerError,
      searchParams.get("error_description") ?? "(no description)",
    )
    const reason = providerError === "access_denied" ? "cancelled" : "failed"
    return NextResponse.redirect(new URL(`/auth?error=${reason}`, origin))
  }

  const code = searchParams.get("code")
  if (!code) {
    return NextResponse.redirect(new URL("/auth?error=missing_code", origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Authorization codes are single-use and short-lived, so an expired or
    // already-spent code lands here. Log the reason, show something actionable.
    console.error("[auth] exchangeCodeForSession failed:", error.message)
    return NextResponse.redirect(new URL("/auth?error=callback", origin))
  }

  return NextResponse.redirect(new URL(next, origin))
}