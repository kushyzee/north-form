import { type MockedFunction, describe, expect, it, vi } from "vitest"

import { BUSINESS_ERROR_SQLSTATE } from "@/lib/orders/errors"
import {
  handlePlaceOrder,
  mapPlacedOrder,
  type PlaceOrderFn,
  type PlacedOrder,
} from "@/lib/orders/handle-place-order"

import type { PlaceOrderRpcParams } from "@/lib/orders/schema"

const PRODUCT_A = "11111111-1111-4111-8111-111111111111"
const USER = "99999999-9999-4999-8999-999999999999"

const validBody = {
  fullName: "Ade Okafor",
  email: "ade@example.test",
  phone: "0801 234 5678",
  address: "14 Adeniyi Jones Avenue",
  city: "Ikeja",
  state: "Lagos",
  cart: [{ productId: PRODUCT_A, quantity: 2, size: "M" }],
}

const placedOrder: PlacedOrder = {
  orderId: "aaaaaaaa-0000-4000-8000-000000000001",
  orderNumber: "NF-BBE2C1E1A3F94E10",
  subtotal: 78000,
  deliveryFee: 2000,
  total: 80000,
}

/** A stub that always succeeds, so tests can focus on one decision at a time. */
function succeeding(): MockedFunction<PlaceOrderFn> {
  return vi.fn(async () => ({ ok: true as const, order: placedOrder }))
}

function failing(
  code: string | null,
  message: string | null,
): MockedFunction<PlaceOrderFn> {
  return vi.fn(async () => ({ ok: false as const, error: { code, message } }))
}

function call(overrides: {
  rawBody?: string | null
  userId?: string | null
  placeOrder?: MockedFunction<PlaceOrderFn>
} = {}) {
  return handlePlaceOrder({
    rawBody: JSON.stringify(validBody),
    userId: USER,
    placeOrder: succeeding(),
    ...overrides,
  })
}

describe("handlePlaceOrder — authentication", () => {
  it("rejects an anonymous caller with 401 and never calls the database", async () => {
    const placeOrder = succeeding()

    const result = await call({ userId: null, placeOrder })

    expect(result.status).toBe(401)
    expect(result.body).toMatchObject({ error: { code: "UNAUTHENTICATED" } })
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it("checks the session before parsing the body", async () => {
    const result = await call({ userId: null, rawBody: "{ not json" })
    expect(result.status).toBe(401)
  })
})

describe("handlePlaceOrder — validation", () => {
  it("rejects malformed JSON with 400 and never calls the database", async () => {
    const placeOrder = succeeding()

    const result = await call({ rawBody: "{ not json", placeOrder })

    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ error: { code: "INVALID_REQUEST" } })
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it("rejects an empty or absent body with 400", async () => {
    expect((await call({ rawBody: "" })).status).toBe(400)
    expect((await call({ rawBody: null })).status).toBe(400)
  })

  const invalidCases: Array<[string, (b: Record<string, unknown>) => unknown]> = [
    ["a missing cart", (b) => ({ ...b, cart: undefined })],
    ["an empty cart", (b) => ({ ...b, cart: [] })],
    ["a malformed cart item", (b) => ({ ...b, cart: ["x"] })],
    [
      "an invalid product UUID",
      (b) => ({ ...b, cart: [{ productId: "nope", quantity: 1, size: "M" }] }),
    ],
    [
      "an invalid quantity",
      (b) => ({ ...b, cart: [{ productId: PRODUCT_A, quantity: 0, size: "M" }] }),
    ],
    ["a missing size", (b) => ({ ...b, cart: [{ productId: PRODUCT_A, quantity: 1 }] })],
    ["an invalid email", (b) => ({ ...b, email: "nope" })],
    ["an invalid phone", (b) => ({ ...b, phone: "1" })],
    ["a missing address", (b) => ({ ...b, address: "" })],
    ["a missing city", (b) => ({ ...b, city: "" })],
    ["a missing state", (b) => ({ ...b, state: "" })],
    ["an invalid state", (b) => ({ ...b, state: "Lagos State" })],
    ["a forged total", (b) => ({ ...b, total: 1 })],
    ["a forged userId", (b) => ({ ...b, userId: USER })],
    ["a forged status", (b) => ({ ...b, status: "delivered" })],
    ["a forged order number", (b) => ({ ...b, orderNumber: "NF-FORGED" })],
  ]

  it.each(invalidCases)("rejects %s with 400 and never calls the database", async (_l, mutate) => {
    const placeOrder = succeeding()

    const result = await call({
      rawBody: JSON.stringify(mutate(validBody)),
      placeOrder,
    })

    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ error: { code: "INVALID_REQUEST" } })
    expect(placeOrder).not.toHaveBeenCalled()
  })
})
describe("handlePlaceOrder — database errors", () => {
  const cases: Array<[string, number, string]> = [
    ["UNAUTHENTICATED", 401, "UNAUTHENTICATED"],
    ["INVALID_CART", 400, "INVALID_CART"],
    ["EMPTY_CART", 400, "EMPTY_CART"],
    ["INVALID_CART_ITEM", 400, "INVALID_CART_ITEM"],
    ["INVALID_CUSTOMER", 400, "INVALID_CUSTOMER"],
    ["INVALID_SIZE", 400, "INVALID_SIZE"],
    ["INVALID_STATE", 400, "INVALID_STATE"],
    ["PRODUCT_NOT_FOUND", 404, "PRODUCT_NOT_FOUND"],
    ["INSUFFICIENT_STOCK", 409, "INSUFFICIENT_STOCK"],
    ["ORDER_CREATION_FAILED", 500, "ORDER_CREATION_FAILED"],
  ]

  it.each(cases)("maps %s to %i", async (message, status, code) => {
    const result = await call({ placeOrder: failing(BUSINESS_ERROR_SQLSTATE, message) })

    expect(result.status).toBe(status)
    expect(result.body).toMatchObject({ error: { code } })
  })

  it("turns an unexpected database error into a generic 500", async () => {
    const result = await call({
      placeOrder: failing("23505", 'duplicate key violates "orders_pkey"'),
    })

    expect(result.status).toBe(500)
    expect(result.body).toMatchObject({ error: { code: "ORDER_FAILED" } })
    expect(JSON.stringify(result.body)).not.toContain("orders_pkey")
  })

  it("turns a missing error into a generic 500 rather than a success", async () => {
    expect((await call({ placeOrder: failing(null, null) })).status).toBe(500)
  })
})

describe("handlePlaceOrder — success", () => {
  it("returns 201 with the values the database produced", async () => {
    const result = await call()

    expect(result.status).toBe(201)
    expect(result.body).toEqual({
      orderId: placedOrder.orderId,
      orderNumber: placedOrder.orderNumber,
      subtotal: 78000,
      deliveryFee: 2000,
      total: 80000,
    })
  })

  it("passes the database's numbers through untouched", async () => {
    // The order summary on the client said 78000 + 2000 = 80000. If the
    // database says something else, the response must be the database's.
    const fromDb: PlacedOrder = { ...placedOrder, subtotal: 1, deliveryFee: 2, total: 3 }

    const result = await call({
      placeOrder: vi.fn(async () => ({ ok: true as const, order: fromDb })),
    })

    expect(result.body).toEqual(fromDb)
  })

  it("sends only the function's named arguments, with no user id", async () => {
    const placeOrder = succeeding()

    await call({ placeOrder })

    const params = placeOrder.mock.calls[0]?.[0] as PlaceOrderRpcParams
    expect(Object.keys(params).sort()).toEqual([
      "p_cart",
      "p_customer_email",
      "p_customer_name",
      "p_customer_phone",
      "p_delivery_address",
      "p_delivery_city",
      "p_delivery_state",
    ])
    expect(JSON.stringify(params)).not.toContain(USER)
  })
})

describe("mapPlacedOrder", () => {
  it("maps the function's snake_case result to camelCase", () => {
    expect(
      mapPlacedOrder({
        order_id: placedOrder.orderId,
        order_number: placedOrder.orderNumber,
        subtotal: 78000,
        delivery_fee: 2000,
        total: 80000,
      }),
    ).toEqual(placedOrder)
  })

  it("accepts numeric strings, since PostgREST may return jsonb numerics as text", () => {
    expect(
      mapPlacedOrder({
        order_id: placedOrder.orderId,
        order_number: placedOrder.orderNumber,
        subtotal: "78000.00",
        delivery_fee: "2000.00",
        total: "80000.00",
      }),
    ).toEqual(placedOrder)
  })

  it("rejects a result missing any part of the order", () => {
    for (const key of ["order_id", "order_number", "subtotal", "delivery_fee", "total"]) {
      const value: Record<string, unknown> = {
        order_id: placedOrder.orderId,
        order_number: placedOrder.orderNumber,
        subtotal: 78000,
        delivery_fee: 2000,
        total: 80000,
      }
      delete value[key]
      expect(mapPlacedOrder(value), key).toBeNull()
    }
  })

  it("rejects a non-object result", () => {
    for (const value of [null, undefined, "NF-1", 42, []]) {
      expect(mapPlacedOrder(value)).toBeNull()
    }
  })
})