import "server-only"

import { createRequestClient } from "@/lib/supabase/server"
import type { RpcError } from "@/lib/orders/errors"

/**
 * Server-side cart writes.
 *
 * Each function is deliberately thin: it forwards to the database and hands
 * back what came out. It computes nothing — no quantity arithmetic, no stock
 * ceiling, no price — because the database is the authority for all of them.
 *
 * **The caller is never taken from the request.** These functions run through
 * the ordinary authenticated server client, which reads the request's session
 * cookies, so `auth.uid()` and RLS decide the owner. No service-role key is
 * used, and none is needed: reaching for one would *lose* the property that a
 * request is subject to exactly the policies any other client request would
 * face.
 *
 * Where a function takes a `userId`, it comes from the **verified** session
 * (the route resolves it with `getAuthUser()`), never from a request body. It
 * is defence in depth, not the authority — RLS is. Its purpose is that a
 * destructive statement is never issued without a WHERE clause naming its
 * owner, so a hypothetical policy regression narrows the damage instead of
 * emptying every cart.
 */
export type CartWriteResult =
  | { ok: true }
  /**
   * No row matched. Under RLS this means either "no such line" or "not yours" —
   * the two are deliberately indistinguishable, and both are answered 404.
   */
  | { ok: false; notFound: true }
  /** `error: null` means "the database failed in a way that is not a business rule". */
  | { ok: false; error: RpcError | null }

/** The named arguments of `private.add_cart_item(...)`. */
type AddCartItemRpcParams = {
  p_product_id: string
  p_size: string
  p_quantity: number
  /**
   * `null` for an ordinary add, which always increments. A UUID only for the
   * one-time anonymous-cart migration, where it makes a retried add a no-op on
   * a line it has already been applied to. The function compares it against the
   * caller's own line and nothing else, so it carries no authority.
   */
  p_migration_id: string | null
}

/** What the function returns once mapped and validated. */
export type AddedLine = {
  lineId: string
  /** The quantity the line now holds, not the amount that was added. */
  quantity: number
}

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

/** Validates the function's JSONB result. An unusable shape is a failure. */
export function mapAddedLine(value: unknown): AddedLine | null {
  if (!isRecord(value)) return null
  const lineId = asString(value.line_id)
  const quantity = asNumber(value.quantity)
  if (!lineId || quantity === null) return null
  return { lineId, quantity }
}

/**
 * Add `quantity` units of `productId` in `size`, merging into an existing
 * product+size line rather than creating a duplicate.
 *
 * Goes through `private.add_cart_item` rather than a direct INSERT because the
 * merge, the atomic increment and the resulting-quantity stock ceiling are all
 * properties of the upsert — a plain INSERT would raise 23505 on a repeat.
 * Product existence, size and stock are re-read inside the function.
 */
export async function addCartItem(
  productId: string,
  size: string,
  quantity: number,
  migrationId?: string,
): Promise<{ ok: true; line: AddedLine } | { ok: false; error: RpcError | null }> {
  const supabase = await createRequestClient()

  const params: AddCartItemRpcParams = {
    p_product_id: productId,
    p_size: size,
    p_quantity: quantity,
    p_migration_id: migrationId ?? null,
  }

  const { data, error } = await supabase.schema("private").rpc("add_cart_item", params)

  if (error) {
    // Only the SQLSTATE and the function's own machine code are logged; the
    // arguments are the customer's product and size choices.
    console.error(
      `[cart] add_cart_item failed: ${error.code ?? "(no code)"} ${error.message ?? ""}`.trim(),
    )
    return { ok: false, error: { code: error.code, message: error.message } }
  }

  const line = mapAddedLine(data)
  if (!line) {
    console.error("[cart] add_cart_item returned an unrecognised shape")
    return { ok: false, error: null }
  }

  return { ok: true, line }
}

/**
 * Set a line to an absolute quantity.
 *
 * A direct UPDATE under RLS, not an RPC: nothing here needs to be hidden from
 * the caller, because there is no price, no owner and no total involved — RLS
 * already restricts the row to them, and `cart_items_validate` re-checks
 * product, size and the stock ceiling on every update.
 *
 * The trigger raises `P0001` with a machine code, so failures map through the
 * same table as the function's.
 *
 * Resolves `{ ok: false, notFound: true }` when no row matched — which under
 * RLS means either "no such line" or "not yours", indistinguishable and
 * deliberately answered with a 404.
 */
export async function setCartItemQuantity(
  userId: string,
  productId: string,
  size: string,
  quantity: number,
): Promise<CartWriteResult> {
  const supabase = await createRequestClient()

  const { data, error } = await supabase
    .from("cart_items")
    .update({ quantity })
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("size", size)
    .select("id")

  if (error) {
    console.error(`[cart] setCartItemQuantity failed: ${error.code ?? "(no code)"}`.trim())
    return { ok: false, error: { code: error.code, message: error.message } }
  }

  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, notFound: true }
  }

  return { ok: true }
}

/**
 * Remove one line, addressed by product+size.
 *
 * `DELETE ... eq(product_id).eq(size)` with no user filter: RLS restricts the
 * delete to the caller's own rows, so this cannot reach anybody else's cart.
 * Removing a line that is not there is not an error — clearing an item that
 * has already gone is a legitimate end state, not a failure.
 */
export async function removeCartItem(
  userId: string,
  productId: string,
  size: string,
): Promise<CartWriteResult> {
  const supabase = await createRequestClient()

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("size", size)

  if (error) {
    console.error(`[cart] removeCartItem failed: ${error.code ?? "(no code)"}`.trim())
    return { ok: false, error: { code: error.code, message: error.message } }
  }

  return { ok: true }
}

/**
 * Empty the caller's cart.
 *
 * Scoped by `user_id` so the statement always names its owner. Clearing a cart
 * that is already empty is a legitimate end state, not a failure, so this
 * reports success even when no rows matched.
 */
export async function clearCart(userId: string): Promise<CartWriteResult> {
  const supabase = await createRequestClient()

  const { error } = await supabase.from("cart_items").delete().eq("user_id", userId)

  if (error) {
    console.error(`[cart] clearCart failed: ${error.code ?? "(no code)"}`.trim())
    return { ok: false, error: { code: error.code, message: error.message } }
  }

  return { ok: true }
}