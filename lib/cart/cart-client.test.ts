import { describe, expect, it, vi } from "vitest"

import {
  addCartItem,
  clearCart,
  fetchCart,
  removeCartItem,
  setCartItemQuantity,
  type FetchLike,
} from "@/lib/cart/cart-client"
import type { Cart } from "@/lib/cart/queries"

const PRODUCT = "11111111-1111-4111-8111-111111111111"
const LINE = "M"

const line = {
  lineId: `${PRODUCT}::${LINE}`,
  productId: PRODUCT,
  productSlug: "essential-oxford",
  productName: "Essential Oxford",
  productImage: null,
  categoryName: "Shirts",
  unitPrice: 28000,
  size: LINE,
  quantity: 2,
  maxQuantity: 24,
}

const cart: Cart = { items: [line], itemCount: 2, subtotal: 56000 }

/** A `fetch` stub that records the request and answers with `body`/`status`. */
function stubFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }) as unknown as FetchLike
  return { impl, calls }
}

function lastBody(calls: Array<{ init: RequestInit | undefined }>): Record<string, unknown> {
  const init = calls[calls.length - 1]?.init
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

describe("cart client — the request each operation makes", () => {
  it("reads the cart with GET /api/cart", async () => {
    const { impl, calls } = stubFetch(cart)

    await fetchCart(impl)

    expect(calls[0].url).toBe("/api/cart")
    expect(calls[0].init?.method).toBe("GET")
  })

  it("adds with POST /api/cart/items and the three line fields", async () => {
    const { impl, calls } = stubFetch(cart, 201)

    await addCartItem({ productId: PRODUCT, size: LINE, quantity: 3 }, impl)

    expect(calls[0].url).toBe("/api/cart/items")
    expect(calls[0].init?.method).toBe("POST")
    expect(lastBody(calls)).toEqual({ productId: PRODUCT, size: LINE, quantity: 3 })
  })

  it("forwards a migration id when one is supplied", async () => {
    const { impl, calls } = stubFetch(cart, 201)
    const migrationId = "33333333-3333-4333-8333-333333333333"

    await addCartItem({ productId: PRODUCT, size: LINE, quantity: 1, migrationId }, impl)

    expect(lastBody(calls).migrationId).toBe(migrationId)
  })

  it("omits the migration id entirely when there is none", async () => {
    const { impl, calls } = stubFetch(cart, 201)

    await addCartItem({ productId: PRODUCT, size: LINE, quantity: 1 }, impl)

    // Absent rather than null, so the server sees an ordinary add.
    expect("migrationId" in lastBody(calls)).toBe(false)
  })

  it("sets a quantity with PATCH /api/cart/items", async () => {
    const { impl, calls } = stubFetch(cart)

    await setCartItemQuantity({ productId: PRODUCT, size: LINE, quantity: 5 }, impl)

    expect(calls[0].init?.method).toBe("PATCH")
    expect(lastBody(calls)).toEqual({ productId: PRODUCT, size: LINE, quantity: 5 })
  })

  it("removes with DELETE /api/cart/items and sends no quantity", async () => {
    const { impl, calls } = stubFetch({ items: [], itemCount: 0, subtotal: 0 })

    await removeCartItem({ productId: PRODUCT, size: LINE }, impl)

    expect(calls[0].init?.method).toBe("DELETE")
    expect(lastBody(calls)).toEqual({ productId: PRODUCT, size: LINE })
  })

  it("clears with DELETE /api/cart and sends no body", async () => {
    const { impl, calls } = stubFetch({ items: [], itemCount: 0, subtotal: 0 })

    await clearCart(impl)

    expect(calls[0].url).toBe("/api/cart")
    expect(calls[0].init?.method).toBe("DELETE")
    expect(calls[0].init?.body).toBeUndefined()
  })
})

describe("cart client — failures become typed errors, never thrown", () => {
  const cases: Array<[string, number, string]> = [
    ["UNAUTHENTICATED", 401, "UNAUTHENTICATED"],
    ["INSUFFICIENT_STOCK", 409, "INSUFFICIENT_STOCK"],
    ["INVALID_SIZE", 400, "INVALID_SIZE"],
    ["PRODUCT_NOT_FOUND", 404, "PRODUCT_NOT_FOUND"],
    ["CART_ITEM_NOT_FOUND", 404, "CART_ITEM_NOT_FOUND"],
    ["INVALID_QUANTITY", 400, "INVALID_QUANTITY"],
    ["CART_FAILED", 500, "CART_FAILED"],
  ]

  for (const [code, status, expected] of cases) {
    it(`surfaces ${code} as ${expected}`, async () => {
      const { impl } = stubFetch({ error: { code, message: "Something went wrong." } }, status)

      const result = await addCartItem({ productId: PRODUCT, size: LINE, quantity: 1 }, impl)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe(expected)
        expect(result.error.status).toBe(status)
        expect(result.error.message).toBe("Something went wrong.")
      }
    })
  }

  it("reports a transport failure as NETWORK_ERROR, not as a thrown error", async () => {
    const impl = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    }) as unknown as FetchLike

    const result = await fetchCart(impl)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("NETWORK_ERROR")
      expect(result.error.message).not.toContain("Failed to fetch")
    }
  })

  it("falls back to a generic message when the error envelope is malformed", async () => {
    const { impl } = stubFetch({ unexpected: true }, 500)

    const result = await fetchCart(impl)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("CART_FAILED")
      expect(result.error.message).not.toContain("unexpected")
    }
  })

  it("surfaces the server's own copy, which the API guarantees is customer-safe", async () => {
    const { impl } = stubFetch(
      { error: { code: "INSUFFICIENT_STOCK", message: "We do not have enough stock left." } },
      409,
    )

    const result = await fetchCart(impl)

    // The client deliberately does not filter this string. It cannot tell a
    // safe message from an unsafe one, and rewriting copy the API chose would
    // be worse than trusting it. The guarantee lives in lib/cart/errors.ts,
    // where every unknown code collapses to one generic message, and is
    // asserted by that module's own tests.
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe("We do not have enough stock left.")
    }
  })

  it("never leaks the raw payload when the envelope is missing a message", async () => {
    const { impl } = stubFetch({ error: { code: "CART_FAILED" } }, 500)

    const result = await fetchCart(impl)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).not.toContain("CART_FAILED")
    }
  })
})

describe("cart client — a malformed success is a failure, never a bad render", () => {
  const malformed: Array<[string, unknown]> = [
    ["a null body", null],
    ["an array", []],
    ["a missing items array", { itemCount: 0, subtotal: 0 }],
    ["a non-numeric subtotal", { items: [], itemCount: 0, subtotal: "free" }],
    ["a missing itemCount", { items: [], subtotal: 0 }],
  ]

  for (const [label, body] of malformed) {
    it(`rejects ${label}`, async () => {
      const { impl } = stubFetch(body)

      const result = await fetchCart(impl)

      expect(result.ok).toBe(false)
    })
  }

  it("rejects a 200 whose body is not JSON at all", async () => {
    const impl = vi.fn(
      async () => new Response("<html>gateway</html>", { status: 200 }),
    ) as unknown as FetchLike

    const result = await fetchCart(impl)

    expect(result.ok).toBe(false)
  })
})

describe("cart client — a success is the server's cart, verbatim", () => {
  it("returns the whole cart rather than an acknowledgement", async () => {
    const { impl } = stubFetch(cart)

    const result = await fetchCart(impl)

    expect(result).toEqual({ ok: true, cart })
  })

  it("accepts an empty cart as a success, not a failure", async () => {
    const { impl } = stubFetch({ items: [], itemCount: 0, subtotal: 0 })

    const result = await fetchCart(impl)

    expect(result.ok).toBe(true)
  })
})