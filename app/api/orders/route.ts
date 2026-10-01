import { NextResponse } from "next/server"

import { getAuthUser } from "@/lib/auth/session"
import { notifyOrderPlaced } from "@/lib/email/notify-order-placed"
import { sendOrderConfirmationEmail } from "@/lib/email/send-order-confirmation"
import { handlePlaceOrder, type OrderSuccessBody } from "@/lib/orders/handle-place-order"
import { placeOrder } from "@/lib/orders/place-order"
import { getOrderByNumber } from "@/lib/orders/queries"

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

/** How long the confirmation email may hold up the response. */
const EMAIL_TIMEOUT_MS = 8000

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

  // The order is committed by the time we are here. The confirmation email is
  // secondary: it is awaited rather than left dangling (a fire-and-forget
  // promise is liable to be killed when the response is sent), but it is
  // bounded and it cannot change the status or the body below. A customer whose
  // email bounced still has a real order.
  if (result.status === 201) {
    const order = result.body as OrderSuccessBody
    await notifyOrderPlaced({
      orderNumber: order.orderNumber,
      // Re-read through the caller's own RLS-scoped session rather than
      // assembling the email from the order the RPC just returned: the email
      // needs the line items and the delivery snapshot, and the database is the
      // only source that has them.
      loadOrder: getOrderByNumber,
      sendEmail: (details) =>
        sendOrderConfirmationEmail(details, EMAIL_TIMEOUT_MS),
    })
  }

  return NextResponse.json(result.body, { status: result.status })
}