/**
 * Mapping cart failures onto HTTP responses.
 *
 * Two different database objects enforce the cart's business rules and both
 * use the same contract `private.place_order` does: raise SQLSTATE `P0001`
 * with the machine code in `message` and the human text in `detail`
 * (`private.add_cart_item` and the `cart_items_validate` trigger).
 * PostgREST surfaces that as `{ code: 'P0001', message: 'INSUFFICIENT_STOCK' }`,
 * which supabase-js returns as `error`. So:
 *
 *   * `code === 'P0001'` means "a business rule rejected this" and the message
 *     is one of the codes below;
 *   * **anything else is unexpected** — a connection failure, a timeout, a
 *     constraint we did not anticipate — and collapses to one generic 500. A
 *     raw PostgreSQL message can name SQL objects, and none of that is the
 *     customer's business.
 *
 * Pure and free of `server-only`, so the whole table is unit tested.
 */

/**
 * The cart error types are the order error types under cart-facing names.
 *
 * Imported (not re-exported in place) so they are ordinary local bindings the
 * rest of this module can refer to, then re-exported below for callers.
 */
import {
  errorBody,
  type OrderApiError,
  type OrderErrorBody,
  type RpcError,
} from "@/lib/orders/errors"

/** An error safe to send to the browser. Same shape as the orders error. */
type CartApiError = OrderApiError

/** The shared failure-response envelope: `{ error: { code, message } }`. */
type CartErrorBody = OrderErrorBody

/** Re-exported so the cart API has one envelope and one error type to import. */
export type { CartApiError, CartErrorBody, RpcError }

/** SQLSTATE every expected cart business failure uses. */
export const CART_BUSINESS_ERROR_SQLSTATE = "P0001"

/** Wraps a cart error in the shared response envelope. */
export function cartErrorBody(error: CartApiError): CartErrorBody {
  return errorBody(error)
}

/** The caller has no session. */
export function unauthenticatedCartError(): CartApiError {
  return {
    status: 401,
    code: "UNAUTHENTICATED",
    message: "Sign in to use your saved bag.",
  }
}

/** The request body could not be read, or failed validation. */
export function invalidCartRequestError(): CartApiError {
  return {
    status: 400,
    code: "INVALID_REQUEST",
    message: "We could not read that request. Check the item and try again.",
  }
}

/**
 * The caller's cart holds no such line.
 *
 * This is a 404, never a 403: RLS makes another user's line invisible rather
 * than forbidden, so "not yours" and "not there" are the same answer. A 403
 * would confirm that the line exists — an existence oracle.
 */
export function cartLineNotFoundError(): CartApiError {
  return {
    status: 404,
    code: "CART_ITEM_NOT_FOUND",
    message: "That item is no longer in your bag.",
  }
}

/** Nothing failed in a way the customer needs to hear about. */
function unexpectedCartError(): CartApiError {
  return {
    status: 500,
    code: "CART_FAILED",
    message: "Something went wrong on our side. Your bag was not changed — please try again.",
  }
}

/**
 * The business-failure table, straight from the database.
 *
 * `PRODUCT_NOT_FOUND` is a 404 because the thing the request referenced is
 * genuinely absent from the catalogue; `INSUFFICIENT_STOCK` is a 409 because
 * the request is valid but conflicts with current state and retrying a
 * *different* quantity may well succeed.
 */
const CART_BUSINESS_ERRORS: Record<string, CartApiError> = {
  UNAUTHENTICATED: {
    status: 401,
    code: "UNAUTHENTICATED",
    message: "Sign in to use your saved bag.",
  },
  INVALID_QUANTITY: {
    status: 400,
    code: "INVALID_QUANTITY",
    message: "Choose a quantity of at least 1.",
  },
  INVALID_SIZE: {
    status: 400,
    code: "INVALID_SIZE",
    message: "That size is not offered for this piece.",
  },
  PRODUCT_NOT_FOUND: {
    status: 404,
    code: "PRODUCT_NOT_FOUND",
    message: "That piece is no longer available.",
  },
  INSUFFICIENT_STOCK: {
    status: 409,
    code: "INSUFFICIENT_STOCK",
    message: "We do not have enough stock left for that quantity.",
  },
}

/**
 * Turns a database error into a safe HTTP error.
 *
 * A business error keeps its code and gets the table's message. Anything else —
 * including `null`, an unknown `P0001` code, or a completely different
 * SQLSTATE — becomes the same generic 500, so an unexpected database failure
 * can never leak its text to the browser.
 *
 * Note this deliberately does NOT reuse the orders table: those messages are
 * written for someone about to pay for a bag, and `PRODUCT_NOT_FOUND` in
 * particular means "one of the pieces in your bag" there — a checkout
 * sentence that reads wrong when only one add failed.
 */
export function mapCartError(error: RpcError | null | undefined): CartApiError {
  if (!error || error.code !== CART_BUSINESS_ERROR_SQLSTATE) {
    return unexpectedCartError()
  }

  const mapped = error.message ? CART_BUSINESS_ERRORS[error.message] : undefined
  return mapped ?? unexpectedCartError()
}