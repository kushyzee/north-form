import { describe, expect, it } from "vitest"

import { parseBearerToken, resolveCredentialSource } from "@/lib/auth/bearer"

const TOKEN = "eyJhbGciOiJSUzI1NiJ9.payload.signature"

describe("parseBearerToken — the shape a native client sends", () => {
  it("reads the token from a well-formed header", () => {
    expect(parseBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN)
  })

  it("accepts the scheme case-insensitively, as RFC 7235 requires", () => {
    expect(parseBearerToken(`bearer ${TOKEN}`)).toBe(TOKEN)
    expect(parseBearerToken(`BEARER ${TOKEN}`)).toBe(TOKEN)
    expect(parseBearerToken(`BeArEr ${TOKEN}`)).toBe(TOKEN)
  })

  it("returns the token verbatim — never trimmed, normalised or decoded", () => {
    // A JWT is opaque here. Rewriting it could only corrupt a credential, and
    // "fixing" its contents is not this function's job.
    expect(parseBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN)
    expect(parseBearerToken(`Bearer   ${TOKEN}`)).toBe(TOKEN)
    expect(parseBearerToken(`  Bearer ${TOKEN}  `)).toBe(TOKEN)
  })
})

describe("parseBearerToken — no credential is `null`, not an error", () => {
  const absent: Array<[string, string | null | undefined]> = [
    ["a missing header", null],
    ["an undefined header", undefined],
    ["an empty string", ""],
    ["whitespace only", "   "],
    ["a bare scheme with no token", "Bearer"],
    ["a bare scheme and spaces", "Bearer    "],
    ["a different scheme", `Basic ${TOKEN}`],
    ["a token with no scheme", TOKEN],
    ["an unrelated header", "something-else"],
  ]

  for (const [label, header] of absent) {
    it(`treats ${label} as no credential`, () => {
      // Every one of these must degrade to the browser cookie path rather than
      // invent a failure: the worst case is an anonymous request answered 401,
      // which is exactly what it would have been without the header.
      expect(parseBearerToken(header)).toBeNull()
    })
  }
})

describe("parseBearerToken — it parses, it does not decide", () => {
  it("hands back an obviously invalid token unchanged", () => {
    // Verification is Supabase's job (`getClaims`), not this function's. A
    // syntactically-present token is returned so the caller can verify it and
    // be the single place that decides.
    expect(parseBearerToken("Bearer invalid-token")).toBe("invalid-token")
  })

  it("never returns a token for a header it could not parse", () => {
    // The distinction that matters: garbage in is null out, never passed along.
    for (const header of ["Basic abc", "Bearer", "", "   "]) {
      const parsed = parseBearerToken(header)
      expect(parsed).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// The authentication precedence contract.
//
// `resolveCredentialSource` is the single rule both `getAuthUser()` and
// `createRequestClient()` derive their answer from, so it is where the whole
// contract is pinned down. Every case below is evaluated for the *identity the
// request acts as*.
// ---------------------------------------------------------------------------

describe("credential precedence — no bearer supplied", () => {
  it("Case 1: a browser request uses its cookie identity", () => {
    // No header at all is the ordinary case for the storefront, and it must
    // keep authenticating by cookie exactly as it always has.
    expect(resolveCredentialSource(null, false)).toBe("cookie")
    expect(resolveCredentialSource(null, true)).toBe("cookie")
  })

  it("treats a header it cannot parse as no bearer supplied, so cookies stand", () => {
    // These carry no token to verify. `parseBearerToken` decides that, and the
    // rule then sees `null` — the same position as a request with no header.
    for (const header of ["Bearer", "   ", "Basic abc", "Token abc", ""]) {
      const token = parseBearerToken(header)

      expect(token).toBeNull()
      expect(resolveCredentialSource(token, false)).toBe("cookie")
    }
  })
})

describe("credential precedence — a bearer was supplied", () => {
  it("Case 2: a verified token authenticates as the caller it names", () => {
    expect(resolveCredentialSource("valid-jwt", true)).toBe("bearer")
  })

  it("Case 3: an unverifiable token is anonymous, never the cookie user", () => {
    expect(resolveCredentialSource("invalid-token", false)).toBe("anonymous")
  })

  it("Case 4 — the critical one: a bad token must NOT fall back to cookies", () => {
    // Regression guard. `createRequestClient()` used to return the *cookie*
    // client on this branch, so a request carrying an invalid bearer token
    // alongside a signed-in browser cookie read and wrote as the browser user
    // while `getAuthUser()` had already answered 401 — two halves of one
    // request disagreeing about who the caller was.
    //
    // The rule must have no path from "token supplied but unverified" to
    // "cookie", whatever the verification outcome is claimed to be.
    const withBrowserSession = resolveCredentialSource("invalid-token", false)

    expect(withBrowserSession).toBe("anonymous")
    expect(withBrowserSession).not.toBe("cookie")
  })

  it("only a missing token may ever select the cookie source", () => {
    // The exhaustive form of Case 4: across every combination of "was a token
    // supplied" and "did it verify", `cookie` is reachable only when no token was
    // presented. This is the whole contract in one assertion.
    const table: Array<[string | null, boolean, string]> = [
      [null, false, "cookie"],
      [null, true, "cookie"],
      ["a-token", true, "bearer"],
      ["a-token", false, "anonymous"],
    ]

    for (const [token, verified, expected] of table) {
      expect(resolveCredentialSource(token, verified)).toBe(expected)
    }

    // Nothing that presented a credential resolves to a cookie session.
    const cookieSources = table
      .filter(([token]) => token !== null)
      .map(([token, verified]) => resolveCredentialSource(token, verified))

    expect(cookieSources).not.toContain("cookie")
  })

  it("never treats a failed verification as merely absent", () => {
    // `null` token and `false` verification both mean "no cookie", but they are
    // not the same situation and must not collapse to the same credential.
    expect(resolveCredentialSource(null, false)).not.toBe(
      resolveCredentialSource("a-token", false),
    )
  })

  it("keeps a malformed but JWT-shaped token on the bearer path so it is rejected", () => {
    // A forged token parses successfully; it is verification that must catch
    // it. If parsing dropped it, the request would silently inherit cookies.
    const forged = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdHRhY2tlciJ9.bm90YXNpZw"
    const token = parseBearerToken(`Bearer ${forged}`)

    expect(token).toBe(forged)
    // Supabase rejects it, so the outcome is anonymous — never `cookie`.
    expect(resolveCredentialSource(token, false)).toBe("anonymous")
  })
})