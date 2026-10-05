/**
 * The cart request contract.
 *
 * A client may say exactly three things about a line: which product, which
 * size, and how many. There is deliberately **no** `userId`, `unitPrice`,
 * `subtotal`, `total` or `stock` field:
 *
 *   * ownership comes from the verified Supabase session (and, in the
 *     database, from `auth.uid()`), never from the request body;
 *   * money and stock are read from `products` by the server and by
 *     `private.add_cart_item`.
 *
 * Accepting any of them here would only give an attacker a value the server
 * would have to remember to ignore — the same reasoning that keeps them out
 * of `orderRequestSchema`.
 *
 * This module is free of `server-only` so the whole request path can be unit
 * tested in the project's Node-only Vitest setup. It holds no database access
 * and no secrets.
 */

import { z } from "zod"

/** Shared line identity: `product_id + size`, matching `lib/cart/reducer.ts`. */
const cartLineKey = {
  productId: z.uuid({ error: "That product reference is not a valid id." }),
  size: z
    .string({ error: "Each item needs a size." })
    .trim()
    .min(1, "Each item needs a size."),
} as const

/**
 * Quantity rules.
 *
 * `int` and `>= 1` are enforced here as a fast-fail so a silly number never
 * becomes a round trip; `INSUFFICIENT_STOCK` and the rest are the database's
 * to decide. Six digits is the same bound `private.place_order` uses.
 *
 * Note this is *stricter than the client reducer*, which treats a requested 0
 * as "remove this line". The server has an explicit DELETE for that, so
 * writing 0 is rejected here rather than being ambiguous.
 */
const quantity = z
  .number({ error: "Each item needs a quantity." })
  .int("Each item needs a whole quantity.")
  .min(1, "Each item needs a quantity of at least 1.")
  .max(999_999, "That quantity is too large.")

/**
 * `POST /api/cart/items` — add `quantity` units, merging into an existing
 * product+size line rather than creating a second one.
 *
 * `.strict()` rejects an unknown key instead of stripping it, so a forged
 * `userId`, `unitPrice`, `total`, `stock` or `migrationId` fails loudly at
 * the edge rather than travelling quietly into the handler.
 */
export const addCartItemSchema = z.strictObject({
  ...cartLineKey,
  quantity,
})

/** `PATCH /api/cart/items` — set a line to an absolute quantity. */
export const setCartItemQuantitySchema = z.strictObject({
  ...cartLineKey,
  quantity,
})

/**
 * `DELETE /api/cart/items` — remove one line, addressed by the same
 * product+size identity. No quantity: removal is not a quantity change.
 */
export const removeCartItemSchema = z.strictObject(cartLineKey)

export type AddCartItemRequest = z.infer<typeof addCartItemSchema>
export type SetCartItemQuantityRequest = z.infer<typeof setCartItemQuantitySchema>
export type RemoveCartItemRequest = z.infer<typeof removeCartItemSchema>