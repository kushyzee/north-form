/**
 * Mapping database failures onto HTTP responses.
 *
 * `private.place_order` raises every *expected* failure as SQLSTATE `P0001`
 * with the machine code in the message and the human text in `detail` (see
 * Phase 5B-1 in AGENTS.md). PostgREST surfaces that as
 * `{ code: 'P0001', message: 'INSUFFICIENT_STOCK', details, hint }`, which
 * supabase-js returns as `error`. So:
 *
 *   * `code === 'P0001'` means "a business rule rejected this" and the message
 *     is one of the codes below;
 *   * **anything else is unexpected** — a connection failure, a timeout, a
 *     constraint we did not anticipate — and collapses to one generic 500. A raw
 *     PostgreSQL message can name SQL objects, and none of that is the
 *     customer's business.
 *
 * Pure and free of `server-only`, so the whole table is unit tested.
 */

/** SQLSTATE the function uses for every expected business failure. */
export const BUSINESS_ERROR_SQLSTATE = "P0001"

/** An error safe to send to the browser. */
export type OrderApiError = {
  status: number
  code: string
  message: string
}

/** The shape of a failure response body. */
export type OrderErrorBody = {
  error: { code: string; message: string }
}

/** Wraps an error in the response envelope. */
export function errorBody(error: OrderApiError): OrderErrorBody {
  return { error: { code: error.code, message: error.message } }
}

/** The caller has no session. */
export function unauthenticatedError(): OrderApiError {
  return {
    status: 401,
    code: "UNAUTHENTICATED",
    message: "Sign in to place your order.",
  }
}

/** The request body could not be read, or failed validation. */
export function invalidRequestError(): OrderApiError {
  return {
    status: 400,
    code: "INVALID_REQUEST",
    message: "We could not read that order request. Check your details and try again.",
  }
}

/** Nothing failed in a way the customer needs to hear about. */
function unexpectedError(): OrderApiError {
  return {
    status: 500,
    code: "ORDER_FAILED",
    message: "Something went wrong on our side. Your order was not created — please try again.",
  }
}

/**
 * The business-failure table, straight from the function.
 *
 * `PRODUCT_NOT_FOUND` is a 404 because the thing the request referenced is
 * genuinely absent from the catalogue; `INSUFFICIENT_STOCK` is a 409 because the
 * request is valid but conflicts with current state and retrying a *different*
 * quantity may well succeed.
 */
const BUSINESS_ERRORS: Record<string, OrderApiError> = {
  UNAUTHENTICATED: {
    status: 401,
    code: "UNAUTHENTICATED",
    message: "Sign in to place your order.",
  },
  INVALID_CART: {
    status: 400,
    code: "INVALID_CART",
    message: "We could not read your bag. Refresh the page and try again.",
  },
  EMPTY_CART: {
    status: 400,
    code: "EMPTY_CART",
    message: "Your bag is empty.",
  },
  INVALID_CART_ITEM: {
    status: 400,
    code: "INVALID_CART_ITEM",
    message: "Something in your bag is not valid any more. Please review your bag.",
  },
  INVALID_CUSTOMER: {
    status: 400,
    code: "INVALID_CUSTOMER",
    message: "Check your contact and delivery details, then try again.",
  },
  INVALID_SIZE: {
    status: 400,
    code: "INVALID_SIZE",
    message: "One of the sizes in your bag is not available for that piece.",
  },
  INVALID_STATE: {
    status: 400,
    code: "INVALID_STATE",
    message: "Choose a delivery state from the list.",
  },
  PRODUCT_NOT_FOUND: {
    status: 404,
    code: "PRODUCT_NOT_FOUND",
    message: "One of the pieces in your bag is no longer available.",
  },
  INSUFFICIENT_STOCK: {
    status: 409,
    code: "INSUFFICIENT_STOCK",
    message: "We do not have enough stock left for one of the pieces in your bag.",
  },
  ORDER_CREATION_FAILED: {
    status: 500,
    code: "ORDER_CREATION_FAILED",
    message: "We could not complete your order. Please try again.",
  },
}

/** The minimum shape this module needs from a PostgREST error. */
export type RpcError = {
  code?: string | null
  message?: string | null
}

/**
 * Turns a database error into a safe HTTP error.
 *
 * A business error keeps its code and gets the table's message. Anything else —
 * including `null`, an unknown `P0001` code, or a completely different SQLSTATE
 * — becomes the same generic 500, so an unexpected database failure can never
 * leak its text to the browser.
 */
export function mapPlaceOrderError(error: RpcError | null | undefined): OrderApiError {
  if (!error || error.code !== BUSINESS_ERROR_SQLSTATE) {
    return unexpectedError()
  }

  const mapped = error.message ? BUSINESS_ERRORS[error.message] : undefined
  return mapped ?? unexpectedError()
}