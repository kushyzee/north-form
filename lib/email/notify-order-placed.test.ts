import { describe, expect, it, vi } from "vitest"

import { notifyOrderPlaced } from "@/lib/email/notify-order-placed"
import type { OrderDetails } from "@/lib/orders/queries"

const ORDER_NUMBER = "NF-BBE2C1E1A3F94E10"

const order: OrderDetails = {
  orderNumber: ORDER_NUMBER,
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
  ],
}

describe("notifyOrderPlaced", () => {
  it("sends the confirmation for the order it was given", async () => {
    const loadOrder = vi.fn(async () => order)
    const sendEmail = vi.fn(async () => ({ ok: true }))

    const result = await notifyOrderPlaced({
      orderNumber: ORDER_NUMBER,
      loadOrder,
      sendEmail,
    })

    expect(result).toEqual({ sent: true })
    expect(loadOrder).toHaveBeenCalledWith(ORDER_NUMBER)
    expect(sendEmail).toHaveBeenCalledWith(order)
  })

  it("does not throw when the email sender rejects", async () => {
    // The order is already committed at this point. Mailgun saying no must not
    // become the request's failure.
    const sendEmail = vi.fn(async () => ({ ok: false, reason: "http-401" }))

    const result = await notifyOrderPlaced({
      orderNumber: ORDER_NUMBER,
      loadOrder: async () => order,
      sendEmail,
    })

    expect(result).toEqual({ sent: false, reason: "http-401" })
  })

  it("does not throw when the email sender rejects with an exception", async () => {
    const sendEmail = vi.fn(async () => {
      throw new Error("socket hang up")
    })

    const result = await notifyOrderPlaced({
      orderNumber: ORDER_NUMBER,
      loadOrder: async () => order,
      sendEmail,
    })

    expect(result).toEqual({ sent: false, reason: "send-threw" })
  })

  it("does not throw when the order cannot be read back", async () => {
    const sendEmail = vi.fn(async () => ({ ok: true }))

    const result = await notifyOrderPlaced({
      orderNumber: ORDER_NUMBER,
      loadOrder: async () => {
        throw new Error("connection reset")
      },
      sendEmail,
    })

    expect(result).toEqual({ sent: false, reason: "order-unreadable" })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("does not send anything when the order is not readable", async () => {
    const sendEmail = vi.fn(async () => ({ ok: true }))

    const result = await notifyOrderPlaced({
      orderNumber: ORDER_NUMBER,
      loadOrder: async () => null,
      sendEmail,
    })

    expect(result).toEqual({ sent: false, reason: "order-missing" })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("treats a sender that returns nothing as a failure, not a success", async () => {
    const result = await notifyOrderPlaced({
      orderNumber: ORDER_NUMBER,
      loadOrder: async () => order,
      sendEmail: async () => undefined,
    })

    expect(result.sent).toBe(false)
  })

  it("treats an unconfigured transport as a failure, not a crash", async () => {
    const result = await notifyOrderPlaced({
      orderNumber: ORDER_NUMBER,
      loadOrder: async () => order,
      sendEmail: async () => ({ ok: false, reason: "not-configured" }),
    })

    expect(result).toEqual({ sent: false, reason: "not-configured" })
  })

  it("never throws, whatever the effects do", async () => {
    const hostile = [
      async () => {
        throw new Error("load")
      },
      async () => null,
    ]

    for (const loadOrder of hostile) {
      const senders = [
        async () => {
          throw new Error("send")
        },
        async () => ({ ok: false }),
        async () => ({ ok: true }),
      ]

      for (const sendEmail of senders) {
        await expect(
          notifyOrderPlaced({ orderNumber: ORDER_NUMBER, loadOrder, sendEmail }),
        ).resolves.toBeDefined()
      }
    }
  })

  it("never puts the order in the log line", async () => {
    // The failing path logs the reason, not the customer's details.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    await notifyOrderPlaced({
      orderNumber: ORDER_NUMBER,
      loadOrder: async () => order,
      sendEmail: async () => {
        throw new Error("boom")
      },
    })

    for (const call of spy.mock.calls) {
      const line = call.map((value) => String(value)).join(" ")
      expect(line).not.toContain(order.customerEmail)
      expect(line).not.toContain(order.deliveryAddress)
      expect(line).not.toContain(order.customerPhone)
    }

    spy.mockRestore()
  })
})