/**
 * The order-confirmation email, as a pure function of the order.
 *
 * This module builds the message and nothing else: no configuration, no
 * network, no database. That is deliberate — the template is the part most
 * worth testing, and it is fully testable here because the only input is the
 * order the database produced.
 *
 * Two parts are produced, `text` and `html`, because a plain-text alternative
 * is what keeps a transactional message out of the spam folder, and because
 * some clients will not render HTML at all.
 *
 * Everything here is derived from `OrderDetails`, which the caller reads back
 * from the database through an RLS-scoped query. Nothing comes from the
 * checkout request.
 *
 * No `server-only` import: a test imports this module, and anything a test
 * imports cannot be marked server-only.
 */

import { formatNaira } from "@/lib/format"
import type { OrderDetails } from "@/lib/orders/queries"
import { DEMO_BANK_TRANSFER, isAwaitingPayment } from "@/lib/orders/payment-details"

export type RenderedEmail = {
  subject: string
  text: string
  html: string
}

/** Escapes text for interpolation into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Status wording for the customer.
 *
 * Deliberately says "received" and "payment pending" rather than anything that
 * could be read as money having arrived. The order is genuinely received; the
 * payment genuinely is not.
 */
function statusLine(order: OrderDetails): string {
  return isAwaitingPayment(order.status)
    ? "Order received — payment pending"
    : `Order received — status: ${order.status.replace(/_/g, " ")}`
}

function renderText(order: OrderDetails, status: string): string {
  const itemRows = order.items
    .map(
      (item) =>
        `  ${item.quantity} x ${item.productName} (size ${item.size})` +
        ` — ${formatNaira(item.unitPrice)} each, ${formatNaira(item.unitPrice * item.quantity)}`,
    )
    .join("\n")

  return [
    "NORTH & FORM",
    "Built for the way you move.",
    "",
    status,
    "",
    `Order reference: ${order.orderNumber}`,
    "",
    "WHAT YOU ORDERED",
    itemRows || "  (no items recorded)",
    "",
    `Subtotal:  ${formatNaira(order.subtotal)}`,
    `Delivery:  ${formatNaira(order.deliveryFee)}`,
    `TOTAL:     ${formatNaira(order.total)}`,
    "",
    "DELIVERING TO",
    `  ${order.customerName}`,
    `  ${order.deliveryAddress}`,
    `  ${order.deliveryCity}, ${order.deliveryState}`,
    `  ${order.customerPhone}`,
    "",
    "HOW TO PAY",
    "  We do not take card payments. Please transfer the total to:",
    `    Bank:           ${DEMO_BANK_TRANSFER.bank}`,
    `    Account name:   ${DEMO_BANK_TRANSFER.accountName}`,
    `    Account number: ${DEMO_BANK_TRANSFER.accountNumber}`,
    "",
    `  Quote ${order.orderNumber} as the reference.`,
    "  These are demonstration bank details for this storefront.",
    "",
    "PAYMENT IS NOT YET RECEIVED",
    "  Your order is recorded as awaiting payment and we have not received",
    "  your transfer yet. It will not be treated as paid until we confirm the",
    "  money ourselves.",
    "",
    "— NORTH & FORM",
  ].join("\n")
}

function renderItemRowsHtml(order: OrderDetails): string {
  return order.items
    .map(
      (item) => `
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #ddd8cc;">
                <div style="font-weight:600;color:#111111;">${escapeHtml(item.productName)}</div>
                <div style="color:#6e6a61;font-size:13px;">Size ${escapeHtml(item.size)} &middot; ${item.quantity} &times; ${escapeHtml(formatNaira(item.unitPrice))}</div>
              </td>
              <td align="right" style="padding:12px 0;border-bottom:1px solid #ddd8cc;white-space:nowrap;color:#111111;">
                ${escapeHtml(formatNaira(item.unitPrice * item.quantity))}
              </td>
            </tr>`,
    )
    .join("")
}

function renderHtml(order: OrderDetails, status: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(`Order ${order.orderNumber} received — payment pending`)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f7f5f0;color:#111111;font-family:Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <p style="margin:0;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6e6a61;">NORTH &amp; FORM</p>
      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">${escapeHtml(status)}</h1>
      <p style="margin:8px 0 0;color:#6e6a61;font-size:14px;">Quote this reference if you need to get in touch:</p>
      <p style="margin:8px 0 0;font-family:monospace;font-size:18px;">${escapeHtml(order.orderNumber)}</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-collapse:collapse;">
        <tbody>${renderItemRowsHtml(order)}
        </tbody>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:4px 0;color:#6e6a61;">Subtotal</td>
          <td align="right" style="padding:4px 0;">${escapeHtml(formatNaira(order.subtotal))}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#6e6a61;">Delivery</td>
          <td align="right" style="padding:4px 0;">${escapeHtml(formatNaira(order.deliveryFee))}</td>
        </tr>
        <tr>
          <td style="padding:12px 0 0;border-top:1px solid #ddd8cc;font-weight:600;">Total to transfer</td>
          <td align="right" style="padding:12px 0 0;border-top:1px solid #ddd8cc;font-weight:600;font-size:18px;">${escapeHtml(formatNaira(order.total))}</td>
        </tr>
      </table>

      <div style="margin-top:28px;padding:16px;background:#fcfbf8;border:1px solid #ddd8cc;border-radius:8px;">
        <h2 style="margin:0;font-size:15px;">How to pay</h2>
        <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#6e6a61;">We do not take card payments. Please transfer the total to:</p>
        <p style="margin:12px 0 0;font-size:14px;line-height:1.8;">
          Bank: ${escapeHtml(DEMO_BANK_TRANSFER.bank)}<br />
          Account name: ${escapeHtml(DEMO_BANK_TRANSFER.accountName)}<br />
          Account number: <span style="font-family:monospace;">${escapeHtml(DEMO_BANK_TRANSFER.accountNumber)}</span>
        </p>
        <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#6e6a61;">Quote ${escapeHtml(order.orderNumber)} as the reference. These are demonstration bank details for this storefront.</p>
      </div>

      <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#6e6a61;">
        <strong>Payment is not yet received.</strong> Your order is recorded as awaiting payment, and we have not received your transfer. It will not be treated as paid until we confirm the money ourselves.
      </p>

      <p style="margin:28px 0 0;font-size:13px;color:#6e6a61;">Delivering to ${escapeHtml(order.customerName)} &mdash; ${escapeHtml(order.deliveryAddress)}, ${escapeHtml(order.deliveryCity)}, ${escapeHtml(order.deliveryState)}.</p>

      <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #ddd8cc;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6e6a61;">Built for the way you move.</p>
    </div>
  </body>
</html>`
}

export function buildOrderConfirmationEmail(order: OrderDetails): RenderedEmail {
  const status = statusLine(order)
  return {
    subject: `Order ${order.orderNumber} received — payment pending`,
    text: renderText(order, status),
    html: renderHtml(order, status),
  }
}
