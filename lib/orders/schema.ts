/**
 * The order-placement request contract.
 *
 * The customer and delivery fields are **not** re-declared here: the request
 * extends `checkoutSchema`, the same contract the browser form is validated
 * against, so there is exactly one definition of a valid name, email, phone,
 * address, city and state. Adding a second, looser server-side schema is how a
 * value ends up accepted by the API and rejected by the form (or worse, the
 * other way round).
 *
 * This module is deliberately free of `server-only` so the whole request path
 * can be unit tested in the project's Node-only Vitest setup. It holds no
 * database access and no secrets.
 */

import { z } from "zod"

import { checkoutSchema } from "@/lib/checkout/schema"

/**
 * One cart line as the browser sends it.
 *
 * `productId`, `quantity` and `size` are all the client may say about a line.
 * There is no `product_name`, `unit_price` or `line_total` field: prices are the
 * database's to look up, and accepting them here would only give an attacker a
 * value the server would have to remember to ignore.
 */
export const cartLineSchema = z.strictObject({
  productId: z.uuid({ error: "That product reference is not a valid id." }),
  quantity: z
    .number({ error: "Each item needs a quantity." })
    .int("Each item needs a whole quantity.")
    .min(1, "Each item needs a quantity of at least 1.")
    // Six digits is the same bound the database function enforces; this stops a
    // silly number before it becomes a round trip.
    .max(999_999, "That quantity is too large."),
  size: z
    .string({ error: "Each item needs a size." })
    .trim()
    .min(1, "Each item needs a size."),
})

const cartSchema = z
  .array(cartLineSchema)
  .min(1, "Your bag is empty.")
  .max(50, "Your bag has too many separate items to place at once.")

/**
 * The full `POST /api/orders` body.
 *
 * `.strict()` is deliberate: an unknown key is rejected rather than stripped, so
 * a forged `total`, `delivery_fee`, `user_id` or `status` fails loudly at the
 * edge instead of travelling quietly into the handler.
 */
export const orderRequestSchema = checkoutSchema
  .extend({ cart: cartSchema })
  .strict()
  .refine(
    (values) => {
      // Cart line identity is `productId::size` (see lib/cart/reducer.ts), so a
      // repeat means a forged or duplicated payload rather than a second line.
      const seen = new Set<string>()
      for (const line of values.cart) {
        const key = `${line.productId}::${line.size}`
        if (seen.has(key)) return false
        seen.add(key)
      }
      return true
    },
    { error: "Your bag lists the same item and size twice.", path: ["cart"] },
  )

/** A validated `POST /api/orders` body. */
export type OrderRequest = z.infer<typeof orderRequestSchema>

/** One cart line in the shape `private.place_order` expects. */
export type RpcCartLine = {
  product_id: string
  quantity: number
  size: string
}

/**
 * The named arguments of `private.place_order(...)`.
 *
 * Note what is *absent*: `p_user_id`, `p_unit_price`, `p_subtotal`,
 * `p_delivery_fee`, `p_total`, `p_status` and `p_order_number`. The function
 * has no such parameters — identity comes from `auth.uid()`, money from
 * `products.price`, and the status and order number from the database — so there
 * is nothing here that a caller could use to influence any of them.
 */
export type PlaceOrderRpcParams = {
  p_cart: RpcCartLine[]
  p_customer_name: string
  p_customer_email: string
  p_customer_phone: string
  p_delivery_address: string
  p_delivery_city: string
  p_delivery_state: string
}

/** Maps validated browser input onto the function's named arguments. */
export function toRpcParams(values: OrderRequest): PlaceOrderRpcParams {
  return {
    p_cart: values.cart.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      size: line.size,
    })),
    p_customer_name: values.fullName,
    p_customer_email: values.email,
    p_customer_phone: values.phone,
    p_delivery_address: values.address,
    p_delivery_city: values.city,
    p_delivery_state: values.state,
  }
}