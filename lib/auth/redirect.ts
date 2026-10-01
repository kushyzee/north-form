/**
 * Redirect handling for the authentication flow.
 *
 * The post-sign-in destination travels in a query string (`?next=`), which
 * makes it attacker-controlled input. It must therefore never reach a redirect
 * or an `href` unchecked — otherwise this app would be an open redirector used
 * for phishing.
 *
 * Both the `/auth` page and the OAuth callback funnel through `safeRedirectPath`
 * so the rule exists in exactly one place.
 */

/** Where a user lands when no safe destination was requested. */
export const DEFAULT_AUTH_REDIRECT = "/"

/** Route the OAuth provider returns to. Supabase appends `?code=` to it. */
export const AUTH_CALLBACK_PATH = "/auth/callback"

/**
 * True only for paths that stay on this origin.
 *
 * The two easy mistakes are protocol-relative URLs (`//evil.example`) and the
 * backslash spelling browsers normalise the same way (`/\evil.example`) — both
 * leave the site despite starting with a single "/".
 */
function isInternalPath(value: string): boolean {
  if (!value.startsWith("/")) return false
  if (value.startsWith("//")) return false
  if (value.startsWith("/\\")) return false

  // Control characters can be smuggled into a Location header, and browsers
  // strip newlines/tabs before resolving it.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return false
  }

  return true
}

/**
 * Narrows an untrusted value to a safe internal path, falling back to the home
 * page. Always returns something that is safe to redirect or link to.
 */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_AUTH_REDIRECT

  const candidate = value.trim()
  if (!isInternalPath(candidate)) return DEFAULT_AUTH_REDIRECT

  // Defence in depth: resolve against a throwaway origin and confirm the
  // result did not actually change origin.
  try {
    const resolved = new URL(candidate, "https://north-and-form.invalid")
    if (resolved.origin !== "https://north-and-form.invalid") {
      return DEFAULT_AUTH_REDIRECT
    }
  } catch {
    return DEFAULT_AUTH_REDIRECT
  }

  return candidate
}