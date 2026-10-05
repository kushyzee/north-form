import { NextResponse } from "next/server"

import { getAuthUser } from "@/lib/auth/session"
import { handleClearCart, handleGetCart } from "@/lib/cart/handle-cart"
import { clearCart } from "@/lib/cart/mutations"
import { getCart } from "@/lib/cart/queries"

/**
 * `/api/cart` — read or empty the signed-in customer's cart.
 *
 * The route is an adapter and nothing else: resolve the caller from the server
 * session, hand both to a `handle*` function, and serialise what comes back. It
 * holds no business logic, and it computes no totals — every value in the
 * response came from the database.
 *
 * Authentication is repeated here rather than inherited from a page guard. A
 * Route Handler is a separate entry point that any browser — or a future mobile
 * client — can call directly, so it never renders a page and nothing upstream
 * would have stopped it. `getAuthUser()` verifies the access token; a
 * browser-supplied user id is never read, and RLS plus `auth.uid()` decide
 * which rows are visible.
 *
 * The response is plain JSON with no dependence on React state, browser APIs
 * or `localStorage`, which is what makes it usable from an Expo client as-is.
 */

/** Anything other than GET or DELETE is not part of this API. */
export async function POST() {
  return NextResponse.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or DELETE." } },
    { status: 405, headers: { Allow: "GET, DELETE" } },
  )
}

export async function PUT() {
  return NextResponse.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or DELETE." } },
    { status: 405, headers: { Allow: "GET, DELETE" } },
  )
}

export async function PATCH() {
  return NextResponse.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or DELETE." } },
    { status: 405, headers: { Allow: "GET, DELETE" } },
  )
}

export async function GET() {
  const user = await getAuthUser()

  const result = await handleGetCart({ userId: user?.id ?? null, getCart })

  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE() {
  const user = await getAuthUser()

  const result = await handleClearCart({
    userId: user?.id ?? null,
    clearCart,
    getCart,
  })

  return NextResponse.json(result.body, { status: result.status })
}