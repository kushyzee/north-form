import { describe, expect, it } from "vitest"

import { BUSINESS_ERROR_SQLSTATE } from "@/lib/orders/errors"
import {
  CART_BUSINESS_ERROR_SQLSTATE,
  cartLineNotFoundError,
  invalidCartRequestError,
  mapCartError,
  unauthenticatedCartError,
} from "@/lib/cart/errors"

describe("cart error codes", () => {
  it("shares the orders SQLSTATE, so one table maps every database rejection", () => {
    expect(CART_BUSINESS_ERROR_SQLSTATE).toBe(BUSINESS_ERROR_SQLSTATE)
  })

  it("maps each business code the cart functions can raise", () => {
    const expected: Array<[string, number, string]> = [
      ["UNAUTHENTICATED", 401, "UNAUTHENTICATED"],
      ["INVALID_QUANTITY", 400, "INVALID_QUANTITY"],
      ["INVALID_SIZE", 400, "INVALID_SIZE"],
      ["PRODUCT_NOT_FOUND", 404, "PRODUCT_NOT_FOUND"],
      ["INSUFFICIENT_STOCK", 409, "INSUFFICIENT_STOCK"],
    ]

    for (const [dbCode, status, apiCode] of expected) {
      const mapped = mapCartError({ code: "P0001", message: dbCode })
      expect(mapped.status, dbCode).toBe(status)
      expect(mapped.code, dbCode).toBe(apiCode)
    }
  })
})

describe("mapCartError — everything unexpected collapses to one 500", () => {
  it("hides a raw PostgreSQL message behind a generic error", () => {
    const mapped = mapCartError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "cart_items_line_unique"',
    })

    expect(mapped.status).toBe(500)
    expect(mapped.code).toBe("CART_FAILED")
    expect(JSON.stringify(mapped)).not.toContain("cart_items_line_unique")
  })

  it("treats a missing, null or non-P0001 error as a failure rather than a success", () => {
    expect(mapCartError(null).status).toBe(500)
    expect(mapCartError(undefined).status).toBe(500)
    expect(mapCartError({ code: null, message: null }).status).toBe(500)
    expect(mapCartError({ code: "PGRST116", message: "no rows" }).status).toBe(500)
  })

  it("treats an unknown P0001 code as a failure, not as a pass-through", () => {
    const mapped = mapCartError({ code: "P0001", message: "SOMETHING_NEW" })

    expect(mapped.status).toBe(500)
    expect(mapped.code).toBe("CART_FAILED")
    expect(mapped.message).not.toContain("SOMETHING_NEW")
  })

  it("handles a P0001 error with no message without throwing", () => {
    expect(mapCartError({ code: "P0001", message: null }).status).toBe(500)
    expect(mapCartError({ code: "P0001" }).status).toBe(500)
  })
})

describe("cart error constructors", () => {
  it("answers 401 for an anonymous caller", () => {
    expect(unauthenticatedCartError()).toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    })
  })

  it("answers 400 for an unreadable request", () => {
    expect(invalidCartRequestError()).toMatchObject({
      status: 400,
      code: "INVALID_REQUEST",
    })
  })

  it("answers 404 — never 403 — for a line that is absent or not the caller's", () => {
    // A 403 would confirm the line exists, which is an existence oracle.
    const error = cartLineNotFoundError()

    expect(error.status).toBe(404)
    expect(error.code).toBe("CART_ITEM_NOT_FOUND")
  })
})