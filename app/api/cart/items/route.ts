import { NextResponse } from "next/server"

import { getAuthUser } from "@/lib/auth/session"
import {
  handleAddCartItem,
  handleRemoveCartItem,
  handleSetCartItemQuantity,
} from "@/lib/cart/handle-cart"
import { addCartItem, removeCartItem, setCartItemQuantity } from "@/lib/cart/mutations"
import { getCart } from "@/lib/cart/queries"

/**
 * `/api/cart/items` — add, re-quantify or remove a single cart line.
 *
 * The route is an adapter and nothing else: read the body, resolve the caller
 * from the server session, hand both to a `handle*` function, and serialise
 * what comes back. Every rule worth enforcing is enforced in the database — the
 * merge and the stock ceiling in `private.add_cart_item`, product existence,
 * size and the quantity ceiling in the `cart_items_validate` trigger.
 *
 * Authentication is repeated here for the same reason as in `/api/orders`: a
 * Route Handler is a separate entry point, so nothing upstream would have
 * stopped an anonymous caller. `getAuthUser()` verifies the access token.
 *
 * **Lines are addressed by `productId` + `size`** — the same composite the
 * client reducer uses — rather than by a server row id, so the web and mobile
 * clients address a line the way they already think about one. Every success
 * returns the whole cart, because an add's resulting quantity is not knowable
 * from the request alone.
 */

/** Reads the body as text so malformed JSON can be answered with a 400. */
async function readBody(request: Request): Promise<string | null> {
  return request.text().catch(() => null)
}

/** Anything other than POST, PATCH or DELETE is not part of this API. */
export async function GET() {
  return NextResponse.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST, PATCH or DELETE." } },
    { status: 405, headers: { Allow: "POST, PATCH, DELETE" } },
  )
}

export async function PUT() {
  return NextResponse.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST, PATCH or DELETE." } },
    { status: 405, headers: { Allow: "POST, PATCH, DELETE" } },
  )
}

export async function POST(request: Request) {
  const rawBody = await readBody(request)
  const user = await getAuthUser()

  const result = await handleAddCartItem({
    rawBody,
    userId: user?.id ?? null,
    addCartItem,
    getCart,
  })

  return NextResponse.json(result.body, { status: result.status })
}

export async function PATCH(request: Request) {
  const rawBody = await readBody(request)
  const user = await getAuthUser()

  const result = await handleSetCartItemQuantity({
    rawBody,
    userId: user?.id ?? null,
    setCartItemQuantity,
    getCart,
  })

  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(request: Request) {
  const rawBody = await readBody(request)
  const user = await getAuthUser()

  const result = await handleRemoveCartItem({
    rawBody,
    userId: user?.id ?? null,
    removeCartItem,
    getCart,
  })

  return NextResponse.json(result.body, { status: result.status })
}