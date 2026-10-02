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
 * The recipient is passed in rather than read off the order, and deliberately so:
 * `order.customerEmail` is a *snapshot* of whatever the customer typed at
 * checkout, so it is not evidence that anybody at that address is entitled to
 * this order's contents — name, phone, street address and all. The caller passes
 * the signed-in account's verified address instead, which is proven by Google.
 * The order keeps its own `customer_email` as the business contact record.
 */
export async function sendOrderConfirmationEmail(
  order: OrderDetails,
  to: string,
  timeoutMs?: number,
): Promise<MailgunResult> {
  const email = buildOrderConfirmationEmail(order)

  return sendMailgunMessage(
    {
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    },
    { timeoutMs },
  )
}