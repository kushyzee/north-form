/**
 * The `/api/cart` request decisions, with no I/O.
 *
 * Authentication, body parsing, validation and error mapping are decided here
 * and the *effects* are injected. That is what makes the trust boundary
 * testable: the suite drives every path — anonymous, malformed JSON, each
 * validation failure, each database error code, "no such line" — with stub
 * effects and a real assertion on the status and body, in the same Node-only
 * Vitest setup the project already uses. No jsdom, no mocking library, no
 * Supabase client in sight.
 *
 * `app/api/cart/route.ts` and `app/api/cart/items/route.ts` are the thin
 * adapters that supply the real user and the real database calls.
 *
 * **Every successful response carries the whole cart**, reads and writes
 * alike. A web client and a mobile client then share one render path and one
 * response type instead of each needing a follow-up GET to find out what the
 * write did — which matters most for an *add*, where the quantity that ended
 * up on the line is not the quantity that was asked for.
 */

import {
  cartErrorBody,
  cartLineNotFoundError,
  invalidCartRequestError,
  mapCartError,
  unauthenticatedCartError,
  type CartApiError,
  type CartErrorBody,
} from "@/lib/cart/errors"
import {
  addCartItemSchema,
  removeCartItemSchema,
  setCartItemQuantitySchema,
} from "@/lib/cart/schema"
import type { Cart } from "@/lib/cart/queries"
import type { CartWriteResult } from "@/lib/cart/mutations"

/** Every response body this module can produce: the cart, or an error. */
export type CartApiResponse = Cart | CartErrorBody

export type CartApiResult = {
  status: number
  body: CartApiResponse
}

/** The minimum shape an injected failure needs; mirrors a PostgREST error. */
export type CartEffectsError = { code?: string | null; message?: string | null } | null

/** An add either succeeds, or fails with a database error. */
type AddResult = { ok: true } | { ok: false; error: CartEffectsError }

/**
 * The injected database calls, grouped so a test can stub one operation.
 *
 * `addCartItem` takes an optional `migrationId`, forwarded from the request.
 * It is used only by the anonymous-cart migration (see `lib/cart/migrate.ts`);
 * an ordinary add omits it and always increments.
 */
export type CartEffects = {
  getCart: () => Promise<Cart>
  addCartItem: (
    productId: string,
    size: string,
    quantity: number,
    migrationId?: string,
  ) => Promise<AddResult>
  setCartItemQuantity: (
    userId: string,
    productId: string,
    size: string,
    quantity: number,
  ) => Promise<CartWriteResult>
  removeCartItem: (userId: string, productId: string, size: string) => Promise<CartWriteResult>
  clearCart: (userId: string) => Promise<CartWriteResult>
}

/** Parses a JSON body, answering 400 rather than letting a SyntaxError escape. */
function parseBody(rawBody: string | null): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(rawBody ?? "null") }
  } catch {
    return { ok: false }
  }
}

function failure(error: CartApiError): CartApiResult {
  return { status: error.status, body: cartErrorBody(error) }
}

/**
 * Logs where a request was rejected, never what it said.
 *
 * The path of the first bad field is safe; its value is a product or size
 * choice, and there is no reason to log one.
 */
function logRejection(operation: string, path: string): void {
  console.error(`[cart] rejected an invalid ${operation} request at:`, path || "(root)")
}

/**
 * Turns a failed direct write into a response.
 *
 * A business failure keeps its code; "no row matched" becomes a 404 because
 * under RLS that covers both "not there" and "not yours", and a 403 would
 * confirm that the line exists.
 */
function writeFailure(result: CartWriteResult): CartApiResult {
  if ("notFound" in result) return failure(cartLineNotFoundError())
  if ("error" in result) return failure(mapCartError(result.error))
  // `ok: true` cannot reach here — every caller checks first — but returning a
  // safe error beats throwing if a future caller forgets.
  return failure(mapCartError(null))
}

/** The same narrowing for the add path, whose success case carries no payload. */
function addFailure(result: AddResult): CartApiResult | null {
  if (result.ok) return null
  return failure(mapCartError(result.error))
}

/** `GET /api/cart` — the signed-in customer's cart. */
export async function handleGetCart(input: {
  userId: string | null
  getCart: CartEffects["getCart"]
}): Promise<CartApiResult> {
  if (!input.userId) {
    return failure(unauthenticatedCartError())
  }

  return { status: 200, body: await input.getCart() }
}

/**
 * `POST /api/cart/items` — add units, merging into an existing line.
 *
 * `userId` decides only whether to answer 401. It is deliberately **not**
 * passed to `addCartItem`: the owner is decided inside the database by
 * `auth.uid()`, and there is no parameter a caller could use to influence it.
 */
export async function handleAddCartItem(input: {
  rawBody: string | null
  userId: string | null
  addCartItem: CartEffects["addCartItem"]
  getCart: CartEffects["getCart"]
}): Promise<CartApiResult> {
  if (!input.userId) {
    return failure(unauthenticatedCartError())
  }

  const parsed = parseBody(input.rawBody)
  if (!parsed.ok) {
    return failure(invalidCartRequestError())
  }

  const request = addCartItemSchema.safeParse(parsed.value)
  if (!request.success) {
    logRejection("add", request.error.issues[0]?.path?.join(".") ?? "(root)")
    return failure(invalidCartRequestError())
  }

  const failed = addFailure(
    await input.addCartItem(
      request.data.productId,
      request.data.size,
      request.data.quantity,
      request.data.migrationId,
    ),
  )
  if (failed) return failed

  // The database's merge means the line may now hold more than was asked for,
  // so the caller is handed the cart rather than an echo of its own request.
  return { status: 201, body: await input.getCart() }
}

/** `PATCH /api/cart/items` — set a line to an absolute quantity. */
export async function handleSetCartItemQuantity(input: {
  rawBody: string | null
  userId: string | null
  setCartItemQuantity: CartEffects["setCartItemQuantity"]
  getCart: CartEffects["getCart"]
}): Promise<CartApiResult> {
  if (!input.userId) {
    return failure(unauthenticatedCartError())
  }

  const parsed = parseBody(input.rawBody)
  if (!parsed.ok) {
    return failure(invalidCartRequestError())
  }

  const request = setCartItemQuantitySchema.safeParse(parsed.value)
  if (!request.success) {
    logRejection("quantity", request.error.issues[0]?.path?.join(".") ?? "(root)")
    return failure(invalidCartRequestError())
  }

  // The verified session id is passed through purely so the UPDATE names its
  // owner. RLS, not this argument, is what makes the write safe.
  const result = await input.setCartItemQuantity(
    input.userId,
    request.data.productId,
    request.data.size,
    request.data.quantity,
  )

  if (!result.ok) {
    return writeFailure(result)
  }

  return { status: 200, body: await input.getCart() }
}

/** `DELETE /api/cart/items` — remove one product+size line. */
export async function handleRemoveCartItem(input: {
  rawBody: string | null
  userId: string | null
  removeCartItem: CartEffects["removeCartItem"]
  getCart: CartEffects["getCart"]
}): Promise<CartApiResult> {
  if (!input.userId) {
    return failure(unauthenticatedCartError())
  }

  const parsed = parseBody(input.rawBody)
  if (!parsed.ok) {
    return failure(invalidCartRequestError())
  }

  const request = removeCartItemSchema.safeParse(parsed.value)
  if (!request.success) {
    logRejection("remove", request.error.issues[0]?.path?.join(".") ?? "(root)")
    return failure(invalidCartRequestError())
  }

  const result = await input.removeCartItem(
    input.userId,
    request.data.productId,
    request.data.size,
  )

  if (!result.ok) {
    return writeFailure(result)
  }

  return { status: 200, body: await input.getCart() }
}

/** `DELETE /api/cart` — empty the cart. */
export async function handleClearCart(input: {
  userId: string | null
  clearCart: CartEffects["clearCart"]
  getCart: CartEffects["getCart"]
}): Promise<CartApiResult> {
  if (!input.userId) {
    return failure(unauthenticatedCartError())
  }

  const result = await input.clearCart(input.userId)

  if (!result.ok) {
    return writeFailure(result)
  }

  return { status: 200, body: await input.getCart() }
}