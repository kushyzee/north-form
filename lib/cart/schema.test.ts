import { describe, expect, it } from "vitest"

import {
  addCartItemSchema,
  removeCartItemSchema,
  setCartItemQuantitySchema,
} from "@/lib/cart/schema"

const PRODUCT = "11111111-1111-4111-8111-111111111111"
const validLine = { productId: PRODUCT, size: "M", quantity: 2 }

describe("addCartItemSchema", () => {
  it("accepts a product, a size and a quantity", () => {
    expect(addCartItemSchema.parse(validLine)).toEqual(validLine)
  })

  it("trims the size, so ' M ' and 'M' are the same line", () => {
    expect(addCartItemSchema.parse({ ...validLine, size: " M " }).size).toBe("M")
  })

  const rejected: Array<[string, unknown]> = [
    ["a missing product", { size: "M", quantity: 1 }],
    ["a malformed product id", { ...validLine, productId: "nope" }],
    ["a missing size", { productId: PRODUCT, quantity: 1 }],
    ["a blank size", { ...validLine, size: "   " }],
    ["a missing quantity", { productId: PRODUCT, size: "M" }],
    ["a zero quantity", { ...validLine, quantity: 0 }],
    ["a negative quantity", { ...validLine, quantity: -1 }],
    ["a fractional quantity", { ...validLine, quantity: 1.5 }],
    ["a string quantity", { ...validLine, quantity: "2" }],
    ["an absurd quantity", { ...validLine, quantity: 1_000_000 }],
    ["null", null],
    ["a bare string", "M"],
  ]

  for (const [label, value] of rejected) {
    it(`rejects ${label}`, () => {
      expect(addCartItemSchema.safeParse(value).success).toBe(false)
    })
  }
})

describe("cart schemas reject forged authority", () => {
  // The client may say three things about a line. Anything else is either a
  // bug or an attempt to set a value the server owns, and must fail loudly at
  // the edge rather than be silently stripped.
  const forged: Array<[string, Record<string, unknown>]> = [
    ["a userId", { ...validLine, userId: "99999999-9999-4999-8999-999999999999" }],
    ["a unitPrice", { ...validLine, unitPrice: 1 }],
    ["a subtotal", { ...validLine, subtotal: 1 }],
    ["a total", { ...validLine, total: 1 }],
    ["a stock figure", { ...validLine, stockQuantity: 999 }],
    ["a line id", { ...validLine, lineId: `${PRODUCT}::M` }],
    ["a status", { ...validLine, status: "paid" }],
    // `migrationId` is deliberately absent. It is the one client-supplied key
    // the add contract now accepts (for the anonymous-cart migration) and it has
    // its own describe block below, which also asserts the other two contracts
    // still refuse it.
  ]

  for (const [label, value] of forged) {
    it(`rejects ${label} rather than stripping it`, () => {
      // `.strict()` means an unknown key is an error, not a silent drop.
      expect(addCartItemSchema.safeParse(value).success).toBe(false)
      expect(setCartItemQuantitySchema.safeParse(value).success).toBe(false)
    })
  }
})

describe("addCartItemSchema — the migration id", () => {
  // The anonymous-cart migration needs one idempotency key. It is the only
  // client-supplied value with server meaning, so it is worth pinning down
  // precisely: a UUID, optional, and nothing else about it is honoured.
  const MIGRATION = "33333333-3333-4333-8333-333333333333"

  it("accepts a valid UUID", () => {
    const parsed = addCartItemSchema.parse({ ...validLine, migrationId: MIGRATION })
    expect(parsed.migrationId).toBe(MIGRATION)
  })

  it("stays optional, so an ordinary add is unaffected", () => {
    const parsed = addCartItemSchema.parse(validLine)
    expect(parsed.migrationId).toBeUndefined()
  })

  it("rejects a non-UUID rather than coercing it", () => {
    expect(addCartItemSchema.safeParse({ ...validLine, migrationId: "not-a-uuid" }).success).toBe(false)
  })

  it("rejects an empty string", () => {
    expect(addCartItemSchema.safeParse({ ...validLine, migrationId: "" }).success).toBe(false)
  })

  it("is not accepted on the quantity update or remove contracts", () => {
    // Those paths have no migration semantics, so accepting one would be a key
    // the server silently ignores.
    expect(
      setCartItemQuantitySchema.safeParse({ ...validLine, migrationId: MIGRATION }).success,
    ).toBe(false)
    expect(
      removeCartItemSchema.safeParse({ ...validLine, migrationId: MIGRATION }).success,
    ).toBe(false)
  })
})

describe("setCartItemQuantitySchema", () => {
  it("accepts an absolute quantity of at least 1", () => {
    expect(setCartItemQuantitySchema.parse({ ...validLine, quantity: 5 }).quantity).toBe(5)
  })

  it("rejects zero, which the client reducer treats as 'remove'", () => {
    // The server has an explicit DELETE for removal, so writing 0 here would be
    // ambiguous. It is a 400 rather than a silent delete.
    expect(setCartItemQuantitySchema.safeParse({ ...validLine, quantity: 0 }).success).toBe(false)
  })
})

describe("removeCartItemSchema", () => {
  it("identifies a line by product and size alone", () => {
    expect(removeCartItemSchema.parse({ productId: PRODUCT, size: "L" })).toEqual({
      productId: PRODUCT,
      size: "L",
    })
  })

  it("takes no quantity — removal is not a quantity change", () => {
    expect(
      removeCartItemSchema.safeParse({ productId: PRODUCT, size: "L", quantity: 1 }).success,
    ).toBe(false)
  })

  it("still rejects a forged userId", () => {
    expect(
      removeCartItemSchema.safeParse({
        productId: PRODUCT,
        size: "L",
        userId: "99999999-9999-4999-8999-999999999999",
      }).success,
    ).toBe(false)
  })
})