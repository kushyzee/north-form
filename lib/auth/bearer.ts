/**
 * Reading a bearer token off an `Authorization` header.
 *
 * The browser authenticates with Supabase's httpOnly session cookies, which
 * JavaScript — including a future Expo client — never sees. A native client has
 * no cookie jar, so it presents the same Supabase **access token** the browser
 * holds internally, in the standard `Authorization: Bearer <token>` form. This
 * module recognises that header; it does not trust it.
 *
 * **Nothing here verifies anything.** A token read from a header is a claim by
 * the caller until Supabase has checked its signature. Verification happens in
 * `lib/supabase/server.ts`, and the identity that acts on a request always
 * comes from that verified token — never from this string.
 *
 * Pure and free of `server-only`, so the parsing rules are unit tested in the
 * project's Node-only Vitest setup, exactly like `lib/auth/redirect.ts`.
 */

/** The scheme this API accepts, compared case-insensitively per RFC 7235. */
const BEARER_SCHEME = "bearer"

/**
 * The token in an `Authorization` header value, or `null`.
 *
 * `null` means "this request carries no bearer credential", which is the normal
 * state for every browser request — those authenticate by cookie and must keep
 * working exactly as before. It is deliberately also the answer for a header
 * that is present but unusable: a different scheme (`Basic`, `Token`), a bare
 * `Bearer` with nothing after it, or a token that is only whitespace.
 *
 * Those cases are treated as *absent* rather than as an error so a malformed
 * header degrades to the existing cookie path instead of inventing a new
 * failure mode. An attacker gains nothing by sending rubbish here — the worst
 * case is the request is treated as anonymous and answered `401`, which is
 * exactly what it would have been without the header.
 *
 * The token is returned verbatim: it is opaque to us, and trimming or
 * normalising it could only corrupt a credential. JWTs have no surrounding
 * whitespace in any case, so the `.trim()` below removes the *separating*
 * space, not part of the token.
 */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (typeof header !== "string") return null

  const trimmed = header.trim()
  if (trimmed.length === 0) return null

  const separator = trimmed.indexOf(" ")
  if (separator === -1) return null

  const scheme = trimmed.slice(0, separator)
  if (scheme.toLowerCase() !== BEARER_SCHEME) return null

  const token = trimmed.slice(separator + 1).trim()
  return token.length > 0 ? token : null
}

/**
 * Which credential a request's database calls should use.
 *
 * This is the authentication precedence rule in one place, as a value both the
 * identity helper and the client factory can switch on. They used to decide
 * independently, and that is how an unusable bearer token ended up quietly
 * falling back to the browser cookie session: the identity helper said `401`
 * while the client factory returned the cookie client and went on to read and
 * write as the signed-in browser user.
 *
 * Deriving both from one decision is what makes the disagreement impossible
 * rather than merely unlikely.
 *
 * - `cookie`   — no bearer credential was supplied; the existing browser path.
 * - `bearer`   — a token was supplied and verified; use the caller it names.
 * - `anonymous`— a token was supplied and did not verify. **Never** `cookie`.
 */
export type CredentialSource = 'cookie' | 'bearer' | 'anonymous'

/**
 * Decides the credential source from what the request presented and whether it
 * verified.
 *
 * `verified` is only consulted when a token was actually supplied, so a `null`
 * here means "we have no token to check" for a browser request and "the token is
 * bad" for a native one — the two must not collapse into the same answer, which
 * is precisely the bug this function exists to prevent.
 */
export function resolveCredentialSource(
  token: string | null,
  verified: boolean,
): CredentialSource {
  if (!token) return 'cookie'

  return verified ? 'bearer' : 'anonymous'
}