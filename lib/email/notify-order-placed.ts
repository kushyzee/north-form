/**
 * Order creation succeeded; now tell the customer about it.
 *
 * **The order is already committed when this runs.** `private.place_order`
 * returned 201 and the row is in PostgreSQL. Sending an email is a courtesy on
 * top of that, not part of it, so this function can never change the outcome of
 * the request it follows: every failure — the order not being readable, the
 * template throwing, Mailgun refusing the credentials, the network dropping —
 * is logged and reported as `{ sent: false }`.
 *
 * The effects are injected for the same reason Phase 5B-2's request handler
 * takes its `placeOrder`: it makes "a broken Mailgun cannot fail a good order"
 * an assertion in a unit test rather than a hope. There is no database
 * idempotency table, because the trigger for sending is one successful
 * `POST /api/orders`, not a page render — refreshing the confirmation page
 * re-reads the order and sends nothing.
 *
 * No `server-only` import, so a test can import it.
 */

import type { OrderDetails } from "@/lib/orders/queries"

export type NotifyOrderPlacedResult = {
  sent: boolean
  /** Why it was not sent. Suitable for a log line; never for a response. */
  reason?: string
}

export async function notifyOrderPlaced(input: {
  orderNumber: string
  /** Reads the authoritative order, already scoped by RLS. */
  loadOrder: (orderNumber: string) => Promise<OrderDetails | null>
  /** Sends the confirmation. May reject; that must not propagate. */
  sendEmail: (order: OrderDetails) => Promise<unknown>
}): Promise<NotifyOrderPlacedResult> {
  let order: OrderDetails | null

  try {
    order = await input.loadOrder(input.orderNumber)
  } catch (cause) {
    console.error(
      `[email] could not read order ${input.orderNumber} to email it:`,
      cause instanceof Error ? cause.message : "unknown error",
    )
    return { sent: false, reason: "order-unreadable" }
  }

  // The order was created, so this should not happen. If it does, do not send a
  // half-formed message.
  if (!order) {
    console.error(
      `[email] order ${input.orderNumber} was not readable after creation; no email sent`,
    )
    return { sent: false, reason: "order-missing" }
  }

  try {
    const result = await input.sendEmail(order)
    const ok = (result as { ok?: unknown } | null | undefined)?.ok === true

    if (!ok) {
      const reason = (result as { reason?: string } | null | undefined)?.reason
      console.error(
        `[email] confirmation not sent for ${order.orderNumber}:`,
        reason ?? "unknown",
      )
      return { sent: false, reason: reason ?? "send-rejected" }
    }

    return { sent: true }
  } catch (cause) {
    console.error(
      `[email] confirmation threw for ${order.orderNumber}:`,
      cause instanceof Error ? cause.message : "unknown error",
    )
    return { sent: false, reason: "send-threw" }
  }
}