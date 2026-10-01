import "server-only"

import { buildOrderConfirmationEmail } from "@/lib/email/order-confirmation"
import { sendMailgunMessage, type MailgunResult } from "@/lib/email/mailgun-transport"
import type { OrderDetails } from "@/lib/orders/queries"

/**
 * Composes the order-confirmation email and hands it to the transport.
 *
 * The two halves are kept apart so the rest of the app never deals with
 * Mailgun's API: callers say "send this order's confirmation", not anything
 * about endpoints, auth or form encoding. The template above is pure and tested;
 * this module is the seam where it meets the outside world.
 *
 * The recipient is `order.customerEmail`, which came from the database — the
 * checkout request's email is never trusted for delivery, because a mistyped or
 * borrowed address would send somebody else's order details to a stranger.
 */
export async function sendOrderConfirmationEmail(
  order: OrderDetails,
  timeoutMs?: number,
): Promise<MailgunResult> {
  const email = buildOrderConfirmationEmail(order)

  return sendMailgunMessage(
    {
      to: order.customerEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
    },
    { timeoutMs },
  )
}