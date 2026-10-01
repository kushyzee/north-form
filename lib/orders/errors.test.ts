import { describe, expect, it } from "vitest"

import {
  BUSINESS_ERROR_SQLSTATE,
  invalidRequestError,
  mapPlaceOrderError,
  unauthenticatedError,
} from "@/lib/orders/errors"

describe("mapPlaceOrderError", () => {
  const business = (message: string) => ({ code: BUSINESS_ERROR_SQLSTATE, message })

  it("maps each business code to the documented status", () => {
    const expected: Record<string, number> = {
      UNAUTHENTICATED: 401,
      INVALID_CART: 400,
      EMPTY_CART: 400,
      INVALID_CART_ITEM: 400,
      INVALID_CUSTOMER: 400,
      INVALID_SIZE: 400,
      INVALID_STATE: 400,
      PRODUCT_NOT_FOUND: 404,
      INSUFFICIENT_STOCK: 409,
      ORDER_CREATION_FAILED: 500,
    }

    for (const [code, status] of Object.entries(expected)) {
      expect(mapPlaceOrderError(business(code)), code).toMatchObject({ status, code })
    }
  })

  it("always pairs a business error with a human message", () => {
    for (const code of Object.keys({
      UNAUTHENTICATED: 0,
      INVALID_CART: 0,
      EMPTY_CART: 0,
      INVALID_CART_ITEM: 0,
      INVALID_CUSTOMER: 0,
      INVALID_SIZE: 0,
      INVALID_STATE: 0,
      PRODUCT_NOT_FOUND: 0,
      INSUFFICIENT_STOCK: 0,
      ORDER_CREATION_FAILED: 0,
    })) {
      const mapped = mapPlaceOrderError(business(code))
      expect(mapped.message.length, code).toBeGreaterThan(0)
      expect(mapped.message, code).not.toContain(code)
    }
  })

  it("treats an unknown P0001 code as unexpected rather than trusting it", () => {
    const mapped = mapPlaceOrderError(business("SOMETHING_NEW_WE_HAVE_NOT_SEEN"))
    expect(mapped.status).toBe(500)
    expect(mapped.code).toBe("ORDER_FAILED")
  })

  it("collapses every non-business SQLSTATE to one generic 500", () => {
    // A raw constraint violation or a connection error must not reach the
    // customer, whatever it says.
    const leaky = [
      { code: "23505", message: 'duplicate key value violates unique constraint "orders_pkey"' },
      { code: "22P02", message: "invalid input syntax for type uuid: \"secret-thing\"" },
      { code: "PGRST301", message: "JWT expired" },
      { code: "ECONNREFUSED", message: "connect ECONNREFUSED 10.0.0.1:5432" },
    ]

    for (const error of leaky) {
      const mapped = mapPlaceOrderError(error)
      expect(mapped.status, error.code).toBe(500)
      expect(mapped.message, error.code).not.toContain(error.message)
    }
  })

  it("handles a missing or malformed error object", () => {
    for (const error of [null, undefined, {}, { code: null }, { message: null }]) {
      const mapped = mapPlaceOrderError(error)
      expect(mapped.status).toBe(500)
    }
  })

  it("does not echo the database message into the response", () => {
    const mapped = mapPlaceOrderError(
      business("INSUFFICIENT_STOCK"),
    )
    expect(mapped.message).not.toMatch(/relation|column|pg_|SQL/i)
  })
})

describe("request-level errors", () => {
  it("answers an anonymous caller with 401", () => {
    expect(unauthenticatedError()).toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    })
  })

  it("answers a malformed body with 400", () => {
    expect(invalidRequestError()).toMatchObject({
      status: 400,
      code: "INVALID_REQUEST",
    })
  })
})