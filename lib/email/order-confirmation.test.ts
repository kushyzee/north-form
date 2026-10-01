import { describe, expect, it } from "vitest"

import { buildOrderConfirmationEmail } from "@/lib/email/order-confirmation"
import { DEMO_BANK_TRANSFER } from "@/lib/orders/payment-details"
import type { OrderDetails } from "@/lib/orders/queries"

const order: OrderDetails = {
  orderNumber: "NF-BBE2C1E1A3F94E10",
  status: "awaiting_payment",
  customerName: "Ade Okafor",
  customerEmail: "ade@example.test",
  customerPhone: "0801 234 5678",
  deliveryAddress: "14 Adeniyi Jones Avenue",
  deliveryCity: "Ikeja",
  deliveryState: "Lagos",
  subtotal: 56000,
  deliveryFee: 2000,
  total: 58000,
  createdAt: "2026-10-01T10:00:00.000Z",
  items: [
    { productName: "Essential Oxford", quantity: 2, size: "M", unitPrice: 28000 },
    { productName: "Plain T-Shirt", quantity: 1, size: "L", unitPrice: 22000 },
  ],
}

const email = buildOrderConfirmationEmail(order)
const bothParts = `${email.subject}\n${email.text}\n${email.html}`

/**
 * True when a value appears in a part, either literally or HTML-escaped.
 *
 * The HTML part escapes `&` and friends, so "North & Form Inc" is correctly
 * present as "North &amp; Form Inc" there. Asserting the raw string against the
 * HTML would fail on correct escaping, so both forms count.
 */
function appearsIn(part: string, value: string): boolean {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

  return part.includes(value) || part.includes(escaped)
}

describe("buildOrderConfirmationEmail", () => {
  it("names the order and states that payment is pending", () => {
    expect(email.subject).toContain("NF-BBE2C1E1A3F94E10")
    expect(email.subject.toLowerCase()).toContain("payment pending")
    for (const part of [email.text, email.html]) {
      expect(part).toContain("NF-BBE2C1E1A3F94E10")
      expect(part.toLowerCase()).toContain("payment pending")
    }
  })

  it("never claims the money has arrived", () => {
    // The one thing this email must never say, in any casing.
    expect(bothParts.toLowerCase()).not.toContain("payment confirmed")
    expect(bothParts.toLowerCase()).not.toContain("payment received")
    expect(bothParts.toLowerCase()).not.toContain("order shipped")
    expect(bothParts.toLowerCase()).not.toContain("order delivered")
    // It says the opposite, explicitly.
    expect(email.text).toContain("PAYMENT IS NOT YET RECEIVED")
    expect(email.html).toContain("Payment is not yet received")
  })

  it("includes every item with its size, quantity and prices", () => {
    for (const part of [email.text, email.html]) {
      expect(part).toContain("Essential Oxford")
      expect(part).toContain("Plain T-Shirt")
      expect(part).toContain("M")
      expect(part).toContain("L")
      expect(part).toContain("2")
      expect(part).toContain("₦28,000")
      expect(part).toContain("₦22,000")
    }
    // Line totals, not just unit prices.
    expect(email.text).toContain("₦56,000")
    expect(email.text).toContain("₦22,000")
  })

  it("includes the authoritative totals", () => {
    for (const part of [email.text, email.html]) {
      expect(part).toContain("₦56,000") // subtotal
      expect(part).toContain("₦2,000") // delivery fee
      expect(part).toContain("₦58,000") // total
    }
  })

  it("includes the delivery snapshot", () => {
    for (const part of [email.text, email.html]) {
      expect(appearsIn(part, "Ade Okafor")).toBe(true)
      expect(appearsIn(part, "14 Adeniyi Jones Avenue")).toBe(true)
      expect(appearsIn(part, "Ikeja")).toBe(true)
      expect(appearsIn(part, "Lagos")).toBe(true)
    }
    // The phone number is in the text part only; the HTML keeps it shorter.
    expect(email.text).toContain("0801 234 5678")
  })

  it("includes the bank-transfer instructions", () => {
    for (const part of [email.text, email.html]) {
      expect(appearsIn(part, DEMO_BANK_TRANSFER.bank)).toBe(true)
      expect(appearsIn(part, DEMO_BANK_TRANSFER.accountName)).toBe(true)
      expect(appearsIn(part, DEMO_BANK_TRANSFER.accountNumber)).toBe(true)
    }
    // And says plainly that they are demonstration details.
    expect(email.text).toContain("demonstration bank details")
    expect(email.html).toContain("demonstration bank details")
  })

  it("carries the branding", () => {
    expect(email.text).toContain("NORTH & FORM")
    expect(email.html).toContain("NORTH &amp; FORM")
  })

  it("offers a plain-text alternative alongside the HTML", () => {
    expect(email.text.length).toBeGreaterThan(0)
    expect(email.html).toContain("<!doctype html>")
    expect(email.html).toContain("<html lang=\"en\">")
  })

  it("does not leak internal database identifiers", () => {
    // The order id, the user id and row ids must never reach the customer's
    // inbox; only the order number is meant to.
    expect(bothParts).not.toContain("order_id")
    expect(bothParts).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    )
  })

  it("escapes customer-supplied text before it reaches HTML", () => {
    const hostile = buildOrderConfirmationEmail({
      ...order,
      customerName: '<script>alert("x")</script>',
      items: [
        {
          productName: '<img src=x onerror=alert(1)>',
          quantity: 1,
          size: "M",
          unitPrice: 1000,
        },
      ],
    })

    expect(hostile.html).not.toContain("<script>")
    expect(hostile.html).not.toContain("<img src=x")
    expect(hostile.html).toContain("&lt;script&gt;")
  })

  it("describes a non-awaiting-payment status without overstating it", () => {
    const shipped = buildOrderConfirmationEmail({ ...order, status: "shipped" })
    expect(shipped.subject).toContain("payment pending")
    expect(shipped.text).toContain("status: shipped")
  })
})