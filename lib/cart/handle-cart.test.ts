import { type Mock, describe, expect, it, vi } from "vitest"

import {
  handleAddCartItem,
  handleClearCart,
  handleGetCart,
  handleRemoveCartItem,
  handleSetCartItemQuantity,
  type CartEffects,
  type CartEffectsError,
} from "@/lib/cart/handle-cart"
import type { Cart } from "@/lib/cart/queries"

const PRODUCT = "11111111-1111-4111-8111-111111111111"
const OTHER_PRODUCT = "22222222-2222-4222-8222-222222222222"
const USER = "99999999-9999-4999-8999-999999999999"

const line = {
  lineId: `${PRODUCT}::M`,
  productId: PRODUCT,
  productSlug: "essential-oxford",
  productName: "Essential Oxford",
  productImage: null,
  categoryName: "Shirts",
  unitPrice: 28000,
  size: "M",
  quantity: 2,
  maxQuantity: 24,
}

const cart: Cart = { items: [line], itemCount: 2, subtotal: 56000 }

const validAdd = { productId: PRODUCT, size: "M", quantity: 2 }
const validQuantity = { productId: PRODUCT, size: "M", quantity: 3 }
const validRemove = { productId: PRODUCT, size: "M" }

/** The shape of a database error a test wants to simulate. */
function failing(code: string | null, message: string | null): CartEffectsError {
  return { code, message }
}

describe("handleGetCart — authentication", () => {
  it("rejects an anonymous caller with 401 and never reads the database", async () => {
    const getCart = vi.fn(async () => cart)

    const result = await handleGetCart({ userId: null, getCart })

    expect(result.status).toBe(401)
    expect(result.body).toMatchObject({ error: { code: "UNAUTHENTICATED" } })
    expect(getCart).not.toHaveBeenCalled()
  })

  it("returns the cart for a signed-in caller", async () => {
    const result = await handleGetCart({ userId: USER, getCart: async () => cart })

    expect(result.status).toBe(200)
    expect(result.body).toEqual(cart)
  })

  it("takes no user id for the read — RLS decides what is visible", async () => {
    const getCart = vi.fn(async () => cart)

    await handleGetCart({ userId: USER, getCart })

    // The only argument is the read itself; no owner is passed to the database.
    expect(getCart).toHaveBeenCalledWith()
  })
})

describe("handleAddCartItem — validation", () => {
  it("rejects an anonymous caller with 401 and never calls the database", async () => {
    const addCartItem = vi.fn(async () => ({ ok: true as const }))

    const result = await handleAddCartItem({
      rawBody: JSON.stringify(validAdd),
      userId: null,
      addCartItem,
      getCart: async () => cart,
    })

    expect(result.status).toBe(401)
    expect(addCartItem).not.toHaveBeenCalled()
  })

  it("checks the session before parsing the body", async () => {
    const result = await handleAddCartItem({
      rawBody: "{ not json",
      userId: null,
      addCartItem: async () => ({ ok: true }),
      getCart: async () => cart,
    })

    expect(result.status).toBe(401)
  })

  it("rejects malformed JSON with 400 and never calls the database", async () => {
    const addCartItem = vi.fn(async () => ({ ok: true as const }))

    const result = await handleAddCartItem({
      rawBody: "{ not json",
      userId: USER,
      addCartItem,
      getCart: async () => cart,
    })

    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ error: { code: "INVALID_REQUEST" } })
    expect(addCartItem).not.toHaveBeenCalled()
  })

  it("rejects an empty or absent body with 400", async () => {
    for (const rawBody of ["", null]) {
      const result = await handleAddCartItem({
        rawBody,
        userId: USER,
        addCartItem: async () => ({ ok: true }),
        getCart: async () => cart,
      })
      expect(result.status).toBe(400)
    }
  })

  const invalid: Array<[string, unknown]> = [
    ["a malformed product id", { ...validAdd, productId: "nope" }],
    ["a zero quantity", { ...validAdd, quantity: 0 }],
    ["a negative quantity", { ...validAdd, quantity: -3 }],
    ["a blank size", { ...validAdd, size: "  " }],
    ["a missing size", { productId: PRODUCT, quantity: 1 }],
    ["a forged userId", { ...validAdd, userId: OTHER_PRODUCT }],
    ["a forged unitPrice", { ...validAdd, unitPrice: 1 }],
    ["a forged total", { ...validAdd, total: 1 }],
    ["a client stock figure", { ...validAdd, stockQuantity: 9999 }],
  ]

  for (const [label, body] of invalid) {
    it(`rejects ${label} with 400`, async () => {
      const addCartItem = vi.fn(async () => ({ ok: true as const }))

      const result = await handleAddCartItem({
        rawBody: JSON.stringify(body),
        userId: USER,
        addCartItem,
        getCart: async () => cart,
      })

      expect(result.status).toBe(400)
      expect(addCartItem).not.toHaveBeenCalled()
    })
  }
})
describe("handleAddCartItem — ownership", () => {
  it("never passes a user id to the database call", async () => {
    // The owner is auth.uid() inside the database. Forwarding the session id
    // would be the client-controlled-owner mistake this endpoint exists to
    // avoid, so the function takes only the three line fields.
    const addCartItem: Mock<CartEffects["addCartItem"]> = vi.fn(async () => ({ ok: true as const }))

    await handleAddCartItem({
      rawBody: JSON.stringify(validAdd),
      userId: USER,
      addCartItem,
      getCart: async () => cart,
    })

    expect(addCartItem).toHaveBeenCalledWith(PRODUCT, "M", 2)
    expect(JSON.stringify(addCartItem.mock.calls)).not.toContain(USER)
  })
})

describe("handleAddCartItem — database failures", () => {
  const cases: Array<[string, CartEffectsError, number, string]> = [
    ["a vanished product", failing("P0001", "PRODUCT_NOT_FOUND"), 404, "PRODUCT_NOT_FOUND"],
    ["a size the product does not offer", failing("P0001", "INVALID_SIZE"), 400, "INVALID_SIZE"],
    [
      "more units than remain in stock",
      failing("P0001", "INSUFFICIENT_STOCK"),
      409,
      "INSUFFICIENT_STOCK",
    ],
    ["a non-positive quantity", failing("P0001", "INVALID_QUANTITY"), 400, "INVALID_QUANTITY"],
    ["an unauthenticated call", failing("P0001", "UNAUTHENTICATED"), 401, "UNAUTHENTICATED"],
  ]

  for (const [label, error, status, code] of cases) {
    it(`maps ${label} to ${status}`, async () => {
      const result = await handleAddCartItem({
        rawBody: JSON.stringify(validAdd),
        userId: USER,
        addCartItem: async () => ({ ok: false, error }),
        getCart: async () => cart,
      })

      expect(result.status).toBe(status)
      expect(result.body).toMatchObject({ error: { code } })
    })
  }

  it("turns an unexpected database error into a generic 500", async () => {
    const result = await handleAddCartItem({
      rawBody: JSON.stringify(validAdd),
      userId: USER,
      addCartItem: async () => ({
        ok: false,
        error: failing("23505", 'duplicate key value violates "cart_items_line_unique"'),
      }),
      getCart: async () => cart,
    })

    expect(result.status).toBe(500)
    expect(result.body).toMatchObject({ error: { code: "CART_FAILED" } })
    expect(JSON.stringify(result.body)).not.toContain("cart_items_line_unique")
  })

  it("treats a missing error as a failure rather than a success", async () => {
    const result = await handleAddCartItem({
      rawBody: JSON.stringify(validAdd),
      userId: USER,
      addCartItem: async () => ({ ok: false, error: null }),
      getCart: async () => cart,
    })

    expect(result.status).toBe(500)
  })

  it("does not read the cart back when the add was rejected", async () => {
    const getCart = vi.fn(async () => cart)

    await handleAddCartItem({
      rawBody: JSON.stringify(validAdd),
      userId: USER,
      addCartItem: async () => ({ ok: false, error: failing("P0001", "INSUFFICIENT_STOCK") }),
      getCart,
    })

    expect(getCart).not.toHaveBeenCalled()
  })
})

describe("handleAddCartItem — success", () => {
  it("returns 201 with the cart the database settled on", async () => {
    // An add of 2 into a line already holding 1 leaves 3 — the client cannot
    // know that, which is why the response is the cart rather than an echo.
    const merged: Cart = { items: [{ ...line, quantity: 3 }], itemCount: 3, subtotal: 84000 }

    const result = await handleAddCartItem({
      rawBody: JSON.stringify(validAdd),
      userId: USER,
      addCartItem: async () => ({ ok: true }),
      getCart: async () => merged,
    })

    expect(result.status).toBe(201)
    expect(result.body).toEqual(merged)
  })
describe("handleSetCartItemQuantity", () => {
  it("rejects an anonymous caller with 401", async () => {
    const result = await handleSetCartItemQuantity({
      rawBody: JSON.stringify(validQuantity),
      userId: null,
      setCartItemQuantity: async () => ({ ok: true }),
      getCart: async () => cart,
    })

    expect(result.status).toBe(401)
  })

  it("rejects malformed JSON with 400", async () => {
    const result = await handleSetCartItemQuantity({
      rawBody: "{ not json",
      userId: USER,
      setCartItemQuantity: async () => ({ ok: true }),
      getCart: async () => cart,
    })

    expect(result.status).toBe(400)
  })

  it("rejects a non-positive quantity rather than deleting the line", async () => {
    const setCartItemQuantity = vi.fn(async () => ({ ok: true as const }))

    const result = await handleSetCartItemQuantity({
      rawBody: JSON.stringify({ ...validQuantity, quantity: 0 }),
      userId: USER,
      setCartItemQuantity,
      getCart: async () => cart,
    })

    expect(result.status).toBe(400)
    expect(setCartItemQuantity).not.toHaveBeenCalled()
  })

  it("passes the verified session id so the UPDATE names its owner", async () => {
    const setCartItemQuantity: Mock<CartEffects["setCartItemQuantity"]> = vi.fn(
      async () => ({ ok: true as const }),
    )

    await handleSetCartItemQuantity({
      rawBody: JSON.stringify(validQuantity),
      userId: USER,
      setCartItemQuantity,
      getCart: async () => cart,
    })

    expect(setCartItemQuantity).toHaveBeenCalledWith(USER, PRODUCT, "M", 3)
  })

  it("answers 404 when no line matched — not 403", async () => {
    const result = await handleSetCartItemQuantity({
      rawBody: JSON.stringify(validQuantity),
      userId: USER,
      setCartItemQuantity: async () => ({ ok: false, notFound: true }),
      getCart: async () => cart,
    })

    expect(result.status).toBe(404)
    expect(result.body).toMatchObject({ error: { code: "CART_ITEM_NOT_FOUND" } })
  })

  it("maps a stock rejection from the trigger to 409", async () => {
    const result = await handleSetCartItemQuantity({
      rawBody: JSON.stringify(validQuantity),
      userId: USER,
      setCartItemQuantity: async () => ({
        ok: false,
        error: failing("P0001", "INSUFFICIENT_STOCK"),
      }),
      getCart: async () => cart,
    })

    expect(result.status).toBe(409)
    expect(result.body).toMatchObject({ error: { code: "INSUFFICIENT_STOCK" } })
  })

  it("returns 200 with the updated cart", async () => {
    const updated: Cart = { items: [{ ...line, quantity: 3 }], itemCount: 3, subtotal: 84000 }

    const result = await handleSetCartItemQuantity({
      rawBody: JSON.stringify(validQuantity),
      userId: USER,
      setCartItemQuantity: async () => ({ ok: true }),
      getCart: async () => updated,
    })

    expect(result.status).toBe(200)
    expect(result.body).toEqual(updated)
  })
})

describe("handleRemoveCartItem", () => {
  it("rejects an anonymous caller with 401", async () => {
    const result = await handleRemoveCartItem({
      rawBody: JSON.stringify(validRemove),
      userId: null,
      removeCartItem: async () => ({ ok: true }),
      getCart: async () => cart,
    })

    expect(result.status).toBe(401)
  })

  it("addresses the line by product and size, with no quantity", async () => {
    const removeCartItem: Mock<CartEffects["removeCartItem"]> = vi.fn(
      async () => ({ ok: true as const }),
    )

    const result = await handleRemoveCartItem({
      rawBody: JSON.stringify(validRemove),
      userId: USER,
      removeCartItem,
      getCart: async () => ({ items: [], itemCount: 0, subtotal: 0 }),
    })

    expect(removeCartItem).toHaveBeenCalledWith(USER, PRODUCT, "M")
    expect(result.status).toBe(200)
  })

  it("rejects a quantity in the body — removal is not a quantity change", async () => {
    const removeCartItem = vi.fn(async () => ({ ok: true as const }))

    const result = await handleRemoveCartItem({
      rawBody: JSON.stringify({ ...validRemove, quantity: 1 }),
      userId: USER,
      removeCartItem,
      getCart: async () => cart,
    })

    expect(result.status).toBe(400)
    expect(removeCartItem).not.toHaveBeenCalled()
  })

  it("succeeds even when the line was already gone", async () => {
    // The end state the caller asked for holds either way; a delete that
    // matches nothing is not a failure.
    const result = await handleRemoveCartItem({
      rawBody: JSON.stringify(validRemove),
      userId: USER,
      removeCartItem: async () => ({ ok: true }),
      getCart: async () => ({ items: [], itemCount: 0, subtotal: 0 }),
    })

    expect(result.status).toBe(200)
  })
})

describe("handleClearCart", () => {
  it("rejects an anonymous caller with 401 and never clears anything", async () => {
    const clearCart = vi.fn(async () => ({ ok: true as const }))

    const result = await handleClearCart({
      userId: null,
      clearCart,
      getCart: async () => cart,
    })

    expect(result.status).toBe(401)
    expect(clearCart).not.toHaveBeenCalled()
  })

  it("clears the caller's own cart and returns it empty", async () => {
    const clearCart: Mock<CartEffects["clearCart"]> = vi.fn(async () => ({ ok: true as const }))

    const result = await handleClearCart({
      userId: USER,
      clearCart,
      getCart: async () => ({ items: [], itemCount: 0, subtotal: 0 }),
    })

    expect(clearCart).toHaveBeenCalledWith(USER)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ items: [], itemCount: 0, subtotal: 0 })
  })

  it("succeeds when the cart was already empty", async () => {
    const result = await handleClearCart({
      userId: USER,
      clearCart: async () => ({ ok: true }),
      getCart: async () => ({ items: [], itemCount: 0, subtotal: 0 }),
    })

    expect(result.status).toBe(200)
  })

  it("turns an unexpected database error into a generic 500", async () => {
    const result = await handleClearCart({
      userId: USER,
      clearCart: async () => ({ ok: false, error: failing("57014", "statement timeout") }),
      getCart: async () => cart,
    })

    expect(result.status).toBe(500)
    expect(result.body).toMatchObject({ error: { code: "CART_FAILED" } })
    expect(JSON.stringify(result.body)).not.toContain("statement timeout")
  })
})
})