import { describe, expect, it } from "vitest"

import {
  cartReducer,
  clampQuantity,
  getCartCount,
  getCartSubtotal,
  initialCartState,
  toLineId,
  type CartItem,
  type CartState,
} from "@/lib/cart/reducer"

/**
 * The client reducer still backs the **anonymous** cart, so these rules are
 * live behaviour rather than dead code — they are what a signed-out shopper
 * gets. They are also the reference semantics the server implements: line
 * identity is `productId::size`, a repeat merges, a different size does not,
 * and a quantity can never exceed the stock known when it was added.
 *
 * The server is authoritative whenever there is a session, and it re-checks
 * every one of these on write. Nothing here is a security control.
 */

const PRODUCT = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"

function item(overrides: Partial<CartItem> = {}): Omit<CartItem, "lineId" | "quantity"> {
  return {
    productId: PRODUCT,
    productSlug: "essential-oxford",
    productName: "Essential Oxford",
    productImage: null,
    categoryName: "Shirts",
    unitPrice: 28000,
    size: "M",
    maxQuantity: 24,
    ...overrides,
  }
}

function hydrated(...items: CartItem[]): CartState {
  return { items, hydrated: true }
}

function add(state: CartState, product: Partial<CartItem> = {}, quantity = 1): CartState {
  return cartReducer(state, { type: "add", item: item(product), quantity })
}

describe("line identity", () => {
  it("is productId::size", () => {
    expect(toLineId(PRODUCT, "M")).toBe(`${PRODUCT}::M`)
  })

  it("gives a sizeless product its own key", () => {
    expect(toLineId(PRODUCT, null)).toBe(`${PRODUCT}::`)
  })
})

describe("hydrate", () => {
  it("marks the cart hydrated so consumers stop showing a skeleton", () => {
    const state = cartReducer(initialCartState, { type: "hydrate", items: [] })
    expect(state.hydrated).toBe(true)
  })

  it("replaces rather than merges, which is how a server cart replaces a local one", () => {
    const state = cartReducer(hydrated(), { type: "hydrate", items: [] })
    expect(state.items).toEqual([])
  })
})

describe("add — the merge rule", () => {
  it("creates a line when the product+size is new", () => {
    const state = add(initialCartState)
    expect(state.items).toHaveLength(1)
    expect(state.items[0].lineId).toBe(`${PRODUCT}::M`)
  })

  it("merges into the existing line for the same product AND size", () => {
    const state = add(add(initialCartState), {}, 2)
    expect(state.items).toHaveLength(1)
    expect(state.items[0].quantity).toBe(3)
  })

  it("keeps different sizes as separate lines", () => {
    const state = add(add(initialCartState, { size: "L" }), {}, 1)
    expect(state.items).toHaveLength(2)
  })

  it("keeps different products as separate lines", () => {
    const state = add(add(initialCartState, { productId: OTHER }), {}, 1)
    expect(state.items).toHaveLength(2)
  })

  it("refuses an out-of-stock product rather than storing an unbuyable line", () => {
    const state = add(initialCartState, { maxQuantity: 0 })
    expect(state.items).toHaveLength(0)
  })

  it("clamps the add to the stock ceiling instead of exceeding it", () => {
    const state = add(initialCartState, { maxQuantity: 3 }, 10)
    expect(state.items[0].quantity).toBe(3)
  })
describe("quantity controls", () => {
  it("increments and decrements a line", () => {
    const base = add(initialCartState, {}, 2)
    expect(cartReducer(base, { type: "increment", lineId: `${PRODUCT}::M` }).items[0].quantity).toBe(3)
    expect(cartReducer(base, { type: "decrement", lineId: `${PRODUCT}::M` }).items[0].quantity).toBe(1)
  })

  it("removes the line when decremented below 1 rather than parking it at 0", () => {
    const base = add(initialCartState, {}, 1)
    expect(cartReducer(base, { type: "decrement", lineId: `${PRODUCT}::M` }).items).toHaveLength(0)
  })

  it("removes the line when the quantity is set to 0", () => {
    const base = add(initialCartState, {}, 2)
    const state = cartReducer(base, { type: "setQuantity", lineId: `${PRODUCT}::M`, quantity: 0 })
    expect(state.items).toHaveLength(0)
  })

  it("ignores a non-numeric request, so clearing the input cannot delete the line", () => {
    const base = add(initialCartState, {}, 2)
    const state = cartReducer(base, {
      type: "setQuantity",
      lineId: `${PRODUCT}::M`,
      quantity: Number.NaN,
    })
    expect(state.items).toHaveLength(1)
    expect(state.items[0].quantity).toBe(2)
  })

  it("caps a typed quantity at the stock ceiling", () => {
    const base = add(initialCartState, { maxQuantity: 5 }, 2)
    const state = cartReducer(base, { type: "setQuantity", lineId: `${PRODUCT}::M`, quantity: 99 })
    expect(state.items[0].quantity).toBe(5)
  })

  it("ignores a control aimed at a line that is not there", () => {
    const base = add(initialCartState)
    expect(cartReducer(base, { type: "increment", lineId: "nope" })).toBe(base)
  })
})

describe("remove and clear", () => {
  it("removes one line and leaves the others", () => {
    const two = add(add(initialCartState, { size: "L" }))
    const state = cartReducer(two, { type: "remove", lineId: `${PRODUCT}::M` })
    expect(state.items).toHaveLength(1)
    expect(state.items[0].size).toBe("L")
  })

  it("returns the same reference when a remove matches nothing", () => {
    const base = add(initialCartState)
    expect(cartReducer(base, { type: "remove", lineId: "nope" })).toBe(base)
  })

  it("empties the cart", () => {
    const base = add(add(initialCartState, { size: "L" }))
    expect(cartReducer(base, { type: "clear" }).items).toEqual([])
  })

  it("returns the same reference when a clear matches nothing", () => {
    const base = hydrated()
    expect(cartReducer(base, { type: "clear" })).toBe(base)
  })
})

describe("clampQuantity", () => {
  it("keeps a request inside [1, max]", () => {
    expect(clampQuantity(0, 5)).toBe(1)
    expect(clampQuantity(3, 5)).toBe(3)
    expect(clampQuantity(9, 5)).toBe(5)
  })

  it("returns 0 when there is no stock at all", () => {
    expect(clampQuantity(3, 0)).toBe(0)
  })

  it("falls back to 1 for a non-finite request, rather than storing a broken value", () => {
    // `Math.floor(Infinity)` is `Infinity`, so the finiteness check is what
    // catches it. Both land on 1, which is what `updateQuantity` treats as the
    // minimum sensible quantity.
    expect(clampQuantity(Number.NaN, 5)).toBe(1)
    expect(clampQuantity(Number.POSITIVE_INFINITY, 5)).toBe(1)
    expect(clampQuantity(Number.NEGATIVE_INFINITY, 5)).toBe(1)
  })

  it("floors a fractional request", () => {
    expect(clampQuantity(2.7, 5)).toBe(2)
  })
})

describe("derived totals", () => {
  it("counts total units across lines", () => {
    const two = add(add(initialCartState, { size: "L" }), {}, 3)
    expect(getCartCount(two.items)).toBe(4)
  })

  it("sums unit price times quantity", () => {
    const two = add(add(initialCartState, { size: "L", unitPrice: 40000 }))
    expect(getCartSubtotal(two.items)).toBe(28000 + 40000)
  })

  it("is zero for an empty cart", () => {
    expect(getCartCount([])).toBe(0)
    expect(getCartSubtotal([])).toBe(0)
  })
})

  it("clamps a merged line against the freshest stock figure", () => {
    // 3 already on the line, stock now 4, adding 5 can only reach 4.
    const state = add(add(initialCartState, { maxQuantity: 24 }, 3), { maxQuantity: 4 }, 5)
    expect(state.items[0].quantity).toBe(4)
  })

  it("refreshes maxQuantity on a merge, so a later stepper is capped correctly", () => {
    const state = add(add(initialCartState, { maxQuantity: 24 }), { maxQuantity: 10 }, 1)
    expect(state.items[0].maxQuantity).toBe(10)
  })
})