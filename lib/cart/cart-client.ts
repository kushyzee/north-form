/**
 * Browser-side cart API client.
 *
 * One thin, testable wrapper around `fetch` for the five `/api/cart`
 * operations. It exists so the provider holds no networking code: every request
 * and every failure is asserted here in a plain Node test, with no DOM and no
 * React, in the same setup the rest of the project uses.
 *
 * Two rules this module enforces:
 *
 * - **Every successful response carries the whole cart** (see `docs/cart.md`),
 *   so callers adopt the returned cart rather than recomputing it. The server
 *   is the only thing that knows the merged quantity after an add.
 * - **A failed request never becomes state.** Callers get a typed error and
 *   keep whatever they last knew to be true; nothing here optimistically
 *   assumes a write landed.
 *
 * The API only ever returns messages written for customers, so `message` is safe
 * to surface. `NETWORK_ERROR` is the one code with no server counterpart — it
 * means the request never reached the application at all.
 */

import type { Cart } from "@/lib/cart/queries"

/** A cart line as the client sees it. Field-for-field the server's `CartLine`. */
export type CartClientItem = Cart["items"][number]

/** The Phase 1 error codes, plus the one this module can raise on its own. */
export type CartClientErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_REQUEST"
  | "INVALID_QUANTITY"
  | "INVALID_SIZE"
  | "PRODUCT_NOT_FOUND"
  | "CART_ITEM_NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "CART_FAILED"
  | "NETWORK_ERROR"

export type CartClientError = {
  code: CartClientErrorCode
  /** Customer-safe copy. The API never forwards a raw database message. */
  message: string
  status: number
}

export type CartClientResult = { ok: true; cart: Cart } | { ok: false; error: CartClientError }

/** Injected so a test can drive the client without a browser. */
export type FetchLike = typeof fetch

const NETWORK_ERROR: CartClientError = {
  code: "NETWORK_ERROR",
  message: "We could not reach the server. Check your connection and try again.",
  status: 0,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Reads the `{ error: { code, message } }` envelope the API uses.
 *
 * A malformed or absent envelope degrades to a generic message rather than
 * surfacing JSON, so nothing unexpected can reach the UI as text.
 */
function readError(payload: unknown, status: number): CartClientError {
  if (isRecord(payload) && isRecord(payload.error)) {
    const { code, message } = payload.error
    if (typeof message === "string" && message.length > 0) {
      return {
        code: typeof code === "string" ? (code as CartClientErrorCode) : "CART_FAILED",
        message,
        status,
      }
    }
  }

  return {
    code: "CART_FAILED",
    message:
      status >= 500
        ? "Something went wrong on our side. Your bag was not changed — please try again."
        : "We could not read that request. Check the item and try again.",
    status,
  }
}

/**
 * Validates a success body into a `Cart`.
 *
 * The API is trusted but a proxy or a stale deploy can still return something
 * else, and a cart page rendering `₦undefined` is worse than one that reports a
 * failure the customer can retry.
 */
function readCart(payload: unknown): Cart | null {
  if (!isRecord(payload)) return null
  const { items, itemCount, subtotal } = payload
  if (!Array.isArray(items)) return null
  if (typeof itemCount !== "number" || typeof subtotal !== "number") return null

  return { items: items as Cart["items"], itemCount, subtotal }
}

/**
 * One request, one interpretation.
 *
 * Every operation funnels through here so the two rules that matter hold
 * everywhere: a transport failure becomes a typed `NETWORK_ERROR` rather than a
 * thrown exception, and a success is only accepted once it parses as a whole
 * cart.
 */
async function request(
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<CartClientResult> {
  let response: Response
  try {
    response = await fetchImpl(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    })
  } catch {
    // The request never reached the server. Not a business failure, and the
    // caller's cart is unchanged because nothing was written.
    return { ok: false, error: NETWORK_ERROR }
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    return { ok: false, error: readError(payload, response.status) }
  }

  const cart = readCart(payload)
  if (!cart) {
    return {
      ok: false,
      error: {
        code: "CART_FAILED",
        message: "We could not read your bag. Please refresh and try again.",
        status: response.status,
      },
    }
  }

  return { ok: true, cart }
}

function jsonBody(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) }
}

/** `GET /api/cart` — the signed-in customer's cart. */
export function fetchCart(fetchImpl: FetchLike = fetch): Promise<CartClientResult> {
  return request("/api/cart", { method: "GET" }, fetchImpl)
}

/**
 * `POST /api/cart/items` — add units, merging into an existing product+size line.
 *
 * `migrationId` is for the anonymous-cart migration only; an ordinary add omits
 * it so the line always increments.
 */
export function addCartItem(
  input: { productId: string; size: string; quantity: number; migrationId?: string },
  fetchImpl: FetchLike = fetch,
): Promise<CartClientResult> {
  return request("/api/cart/items", jsonBody(input), fetchImpl)
}

/** `PATCH /api/cart/items` — set a line to an absolute quantity. */
export function setCartItemQuantity(
  input: { productId: string; size: string; quantity: number },
  fetchImpl: FetchLike = fetch,
): Promise<CartClientResult> {
  return request("/api/cart/items", { ...jsonBody(input), method: "PATCH" }, fetchImpl)
}

/** `DELETE /api/cart/items` — remove one line. Takes no quantity. */
export function removeCartItem(
  input: { productId: string; size: string },
  fetchImpl: FetchLike = fetch,
): Promise<CartClientResult> {
  return request("/api/cart/items", { ...jsonBody(input), method: "DELETE" }, fetchImpl)
}

/** `DELETE /api/cart` — empty the cart. */
export function clearCart(fetchImpl: FetchLike = fetch): Promise<CartClientResult> {
  return request("/api/cart", { method: "DELETE" }, fetchImpl)
}