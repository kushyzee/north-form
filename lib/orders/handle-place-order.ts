/**
 * The `POST /api/orders` request decision, with no I/O.
 *
 * Authentication, body parsing, validation, the database call and the error
 * mapping are all decided here and the *effects* are injected. That is what
 * makes the trust boundary testable: the suite drives every path — anonymous,
 * malformed JSON, each validation failure, each database error code — with a
 * stub `placeOrder` and a real assertion on the status and body, in the same
 * Node-only Vitest setup the project already uses. No jsdom, no mocking
 * library, no Supabase client in sight.
 *
 * `app/api/orders/route.ts` is the thin adapter that supplies the real user and
 * the real RPC.
 */

import {
  errorBody,
  invalidRequestError,
  mapPlaceOrderError,
  unauthenticatedError,
  type OrderErrorBody,
  type RpcError,
} from "@/lib/orders/errors"
import { orderRequestSchema, toRpcParams, type PlaceOrderRpcParams } from "@/lib/orders/schema"

/** An order the database created. Every value here came from the function. */
export type PlacedOrder = {
  orderId: string
  orderNumber: string
  subtotal: number
  deliveryFee: number
  total: number
}

/** The `201` body. Flat, and never recomputed on the server. */
export type OrderSuccessBody = PlacedOrder

export type OrderApiResponse = OrderSuccessBody | OrderErrorBody

export type OrderApiResult = {
  status: number
  body: OrderApiResponse
}

/** What the injected database call resolves to. */
export type PlaceOrderFn = (
  params: PlaceOrderRpcParams,
) => Promise<
  { ok: true; order: PlacedOrder } | { ok: false; error: RpcError | null }
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * Validates the function's JSONB result into `PlacedOrder`.
 *
 * The function is trusted, but a `null` here would otherwise become
 * `success: true` with `undefined` fields reaching the confirmation page. If the
 * shape is not what we expect the order is treated as a failure.
 */
export function mapPlacedOrder(value: unknown): PlacedOrder | null {
  if (!isRecord(value)) return null

  const orderId = asString(value.order_id)
  const orderNumber = asString(value.order_number)
  const subtotal = asNumber(value.subtotal)
  const deliveryFee = asNumber(value.delivery_fee)
  const total = asNumber(value.total)

  if (
    !orderId ||
    !orderNumber ||
    subtotal === null ||
    deliveryFee === null ||
    total === null
  ) {
    return null
  }

  return { orderId, orderNumber, subtotal, deliveryFee, total }
}

/**
 * Handles one `POST /api/orders` request.
 *
 * `userId` is supplied by the caller from the *server* session, never from the
 * request body. It is used only to decide whether to answer 401 — the order's
 * owner is decided inside the database by `auth.uid()`, so passing it to the RPC
 * is both unnecessary and would be exactly the client-controlled-owner mistake
 * this endpoint exists to prevent.
 */
export async function handlePlaceOrder(input: {
  rawBody: string | null
  userId: string | null
  placeOrder: PlaceOrderFn
}): Promise<OrderApiResult> {
  if (!input.userId) {
    return { status: 401, body: errorBody(unauthenticatedError()) }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(input.rawBody ?? "null")
  } catch {
    return { status: 400, body: errorBody(invalidRequestError()) }
  }

  const request = orderRequestSchema.safeParse(parsed)
  if (!request.success) {
    // The path of the first bad field is safe to log; the value is not, and it
    // may be a customer's name or address.
    console.error(
      "[orders] rejected an invalid order request at:",
      request.error.issues[0]?.path?.join(".") || "(root)",
    )
    return { status: 400, body: errorBody(invalidRequestError()) }
  }

  const result = await input.placeOrder(toRpcParams(request.data))

  if (!result.ok) {
    const mapped = mapPlaceOrderError(result.error)
    return { status: mapped.status, body: errorBody(mapped) }
  }

  return { status: 201, body: result.order }
}