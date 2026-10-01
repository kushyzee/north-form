import { NextResponse } from "next/server"

import { getAuthUser } from "@/lib/auth/session"
import { handlePlaceOrder } from "@/lib/orders/handle-place-order"
import { placeOrder } from "@/lib/orders/place-order"

/**
 * `POST /api/orders` — place an order for the signed-in customer.
 *
 * The route is an adapter and nothing else: read the body, resolve the caller
 * from the server session, hand both to `handlePlaceOrder`, and serialise what
 * comes back. It holds no business logic, because everything worth enforcing is
 * enforced in `private.place_order`.
 *
 * Authentication is repeated here rather than inherited from the `/checkout`
 * page guard. A Route Handler is a separate entry point that a browser can call
 * directly — it never renders a page, so nothing upstream would have stopped it.
 * `getAuthUser()` verifies the access token; a browser-supplied user id is never
 * read, and the order's owner is decided by `auth.uid()` inside the database.
 */

/** Anything other than POST is not part of this API. */
export async function GET() {
  return NextResponse.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST to place an order." } },
    { status: 405, headers: { Allow: "POST" } },
  )
}

export async function POST(request: Request) {
  // Read as text so a malformed body can be answered with a 400 instead of an
  // unhandled SyntaxError from request.json().
  const rawBody = await request.text().catch(() => null)

  const user = await getAuthUser()

  const result = await handlePlaceOrder({
    rawBody,
    userId: user?.id ?? null,
    placeOrder,
  })

  return NextResponse.json(result.body, { status: result.status })
}