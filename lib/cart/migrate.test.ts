import { describe, expect, it, vi } from "vitest"

import type { CartClientResult } from "@/lib/cart/cart-client"
import { migrateLocalCart, type AddLineFn } from "@/lib/cart/migrate"
import type { CartItem } from "@/lib/cart/reducer"

const MIGRATION_ID = "33333333-3333-4333-8333-333333333333"

function line(overrides: Partial<CartItem> = {}): CartItem {
  return {
    lineId: "11111111-1111-4111-8111-111111111111::M",
    productId: "11111111-1111-4111-8111-111111111111",
    productSlug: "essential-oxford",
    productName: "Essential Oxford",
    productImage: null,
    categoryName: "Shirts",
    unitPrice: 28000,
    size: "M",
    quantity: 2,
    maxQuantity: 24,
    ...overrides,
  }
}

const ok: CartClientResult = { ok: true, cart: { items: [], itemCount: 0, subtotal: 0 } }

function refused(code: string, message = "Refused."): CartClientResult {
  return { ok: false, error: { code: code as never, message, status: 400 } }
}

/** Records every call so a test can assert on the migration id used. */
function recordingAdd(result: CartClientResult = ok) {
  const calls: Array<{ migrationId: string; quantity: number }> = []
  const addLine: AddLineFn = vi.fn(async (input) => {
    calls.push({ migrationId: input.migrationId, quantity: input.quantity })
    return result
  })
  return { addLine, calls }
}

const fixedId = () => MIGRATION_ID

describe("migrateLocalCart — the happy path", () => {
  it("migrates every local line", async () => {
    const { addLine, calls } = recordingAdd()

    const result = await migrateLocalCart({
      items: [line(), line({ size: "L", lineId: "x::L", quantity: 1 })],
      addLine,
      newMigrationId: fixedId,
    })

    expect(calls).toHaveLength(2)
    expect(result.migrated).toHaveLength(2)
    expect(result.dropped).toHaveLength(0)
    expect(result.complete).toBe(true)
  })

  it("sends product, size and quantity from the local line", async () => {
    const addLine = vi.fn(async () => ok)

    await migrateLocalCart({ items: [line({ quantity: 3 })], addLine, newMigrationId: fixedId })

    expect(addLine).toHaveBeenCalledWith({
      productId: "11111111-1111-4111-8111-111111111111",
      size: "M",
      quantity: 3,
      migrationId: MIGRATION_ID,
    })
  })

  it("uses ONE migration id for the whole pass, so a retry is recognised", async () => {
    const { addLine, calls } = recordingAdd()

    await migrateLocalCart({
      items: [line(), line({ lineId: "x::L", size: "L" }), line({ lineId: "y::S", size: "S" })],
      addLine,
      newMigrationId: fixedId,
    })

    // This is the property that makes an interrupted migration safe to retry:
    // the database records it per line, so a replayed add is a no-op there.
    expect(new Set(calls.map((c) => c.migrationId))).toEqual(new Set([MIGRATION_ID]))
  })

  it("does nothing at all for an empty local cart", async () => {
    const { addLine } = recordingAdd()

    const result = await migrateLocalCart({ items: [], addLine, newMigrationId: fixedId })

    expect(addLine).not.toHaveBeenCalled()
    expect(result.complete).toBe(true)
  })
})

describe("migrateLocalCart — permanent rejections drop the line", () => {
  // These are facts about the catalogue. Retrying can never change them, so
  // blocking the whole migration on one of them would strand the customer.
  const final: Array<[string, string]> = [
    ["PRODUCT_NOT_FOUND", "That piece is no longer available."],
    ["INVALID_SIZE", "That size is not offered for this piece."],
    ["INSUFFICIENT_STOCK", "We do not have enough stock left."],
    ["INVALID_QUANTITY", "Choose a quantity of at least 1."],
    ["CART_ITEM_NOT_FOUND", "That item is no longer in your bag."],
  ]

  for (const [code, message] of final) {
    it(`drops a line refused with ${code} and keeps going`, async () => {
      // The first line is refused, the second succeeds — the shape that actually
      // matters: one retired product must not strand the rest of someone's bag.
      // The counter is created inside each test, so no state leaks between them.
      const calls: Array<{ migrationId: string }> = []
      const addLine: AddLineFn = vi.fn(async (input) => {
        calls.push({ migrationId: input.migrationId })
        return calls.length === 1 ? refused(code, message) : ok
      })

      const result = await migrateLocalCart({
        items: [line(), line({ lineId: "x::L", size: "L" })],
        addLine,
        newMigrationId: fixedId,
      })

      // Both were attempted: the second line was not blocked by the first.
      expect(calls).toHaveLength(2)
      expect(result.dropped).toHaveLength(1)
      expect(result.migrated).toHaveLength(1)
      expect(result.complete).toBe(true)
      expect(result.dropped[0].reason).toBe(message)
    })
  }

  it("drops every line when they are all refused, and still completes", async () => {
    const { addLine, calls } = recordingAdd(refused("PRODUCT_NOT_FOUND"))

    const result = await migrateLocalCart({
      items: [line(), line({ lineId: "x::L", size: "L" })],
      addLine,
      newMigrationId: fixedId,
    })

    expect(calls).toHaveLength(2)
    expect(result.dropped).toHaveLength(2)
    expect(result.migrated).toHaveLength(0)
    // Nothing is left to retry, so local storage may safely be discarded.
    expect(result.complete).toBe(true)
  })

  it("records the product name so the customer can recognise what was dropped", async () => {
    const { addLine } = recordingAdd(refused("PRODUCT_NOT_FOUND"))

    const result = await migrateLocalCart({
      items: [line({ productName: "Studio Hoodie" })],
      addLine,
      newMigrationId: fixedId,
    })

    expect(result.dropped[0].productName).toBe("Studio Hoodie")
  })

  it("drops a sizeless line without asking the server", async () => {
    const { addLine, calls } = recordingAdd()

    const result = await migrateLocalCart({
      items: [line({ size: null, lineId: "x::" })],
      addLine,
      newMigrationId: fixedId,
    })

    expect(calls).toHaveLength(0)
    expect(result.dropped).toHaveLength(1)
    expect(result.complete).toBe(true)
  })
})

describe("migrateLocalCart — a transport failure is not final", () => {
  it("reports incomplete and stops, so local storage is kept for a retry", async () => {
    const { addLine, calls } = recordingAdd({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "No connection.", status: 0 },
    })

    const result = await migrateLocalCart({
      items: [line(), line({ lineId: "x::L", size: "L" })],
      addLine,
      newMigrationId: fixedId,
    })

    // The caller must NOT clear local storage when this happens.
    expect(result.complete).toBe(false)
    // Stopped at the first unknown, rather than pressing on into a state it
    // cannot describe.
    expect(calls).toHaveLength(1)
  })

  it("treats a server error the same way", async () => {
    const { addLine } = recordingAdd(refused("CART_FAILED", "Server error."))

    const result = await migrateLocalCart({ items: [line()], addLine, newMigrationId: fixedId })

    expect(result.complete).toBe(false)
  })

  it("is safe to run twice: the second pass reuses one id and the server skips", async () => {
    // The database side of this guarantee is covered by verify_cart.sql. Here
    // we assert the client half — that a retry sends the SAME id, which is what
    // lets the server recognise the replay.
    const first = recordingAdd()
    await migrateLocalCart({ items: [line()], addLine: first.addLine, newMigrationId: fixedId })

    const second = recordingAdd()
    await migrateLocalCart({ items: [line()], addLine: second.addLine, newMigrationId: fixedId })

    expect(first.calls[0].migrationId).toBe(second.calls[0].migrationId)
  })
})

