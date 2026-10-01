import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * Reading an order for the confirmation page.
 *
 * There is deliberately no `userId` argument. `auth.uid()` inside the RLS policy
 * decides which rows can be read at all, so a request for somebody else's order
 * number simply returns nothing — the caller cannot widen the query by asking
 * for a different owner.
 *
 * Validated from `unknown` for the same reason as `lib/catalogue/queries.ts`:
 * the Supabase client is untyped in this project, and a confirmation page that
 * renders `₦undefined` is worse than one that 404s.
 */

export type OrderDetails = {
  orderNumber: string
  status: string
  customerName: string
  customerEmail: string
  customerPhone: string
  deliveryAddress: string
  deliveryCity: string
  deliveryState: string
  subtotal: number
  deliveryFee: number
  total: number
  createdAt: string
  items: OrderLineDetails[]
}

export type OrderLineDetails = {
  productName: string
  quantity: number
  size: string
  unitPrice: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toLine(value: unknown): OrderLineDetails | null {
  if (!isRecord(value)) return null
  const productName = asString(value.product_name)
  if (!productName) return null

  return {
    productName,
    quantity: asNumber(value.quantity),
    size: asString(value.size),
    unitPrice: asNumber(value.unit_price),
  }
}

/**
 * One of the caller's own orders, addressed by its order number.
 *
 * `order_number` is random rather than sequential, so it is safe to carry in a
 * URL — but it is not the thing authorising the read. RLS is.
 */
export async function getOrderByNumber(
  orderNumber: string,
): Promise<OrderDetails | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_number, status, customer_name, customer_email, customer_phone, "
        + "delivery_address, delivery_city, delivery_state, "
        + "subtotal, delivery_fee, total, created_at, order_items(product_name, quantity, size, unit_price)",
    )
    .eq("order_number", orderNumber)
    .maybeSingle()

  if (error) {
    console.error("[orders] getOrderByNumber failed:", error.message)
    return null
  }

  if (!isRecord(data)) return null

  const orderNumberValue = asString(data.order_number)
  if (!orderNumberValue) return null

  return {
    orderNumber: orderNumberValue,
    status: asString(data.status),
    customerName: asString(data.customer_name),
    customerEmail: asString(data.customer_email),
    customerPhone: asString(data.customer_phone),
    deliveryAddress: asString(data.delivery_address),
    deliveryCity: asString(data.delivery_city),
    deliveryState: asString(data.delivery_state),
    subtotal: asNumber(data.subtotal),
    deliveryFee: asNumber(data.delivery_fee),
    total: asNumber(data.total),
    createdAt: asString(data.created_at),
    items: Array.isArray(data.order_items)
      ? data.order_items
          .map(toLine)
          .filter((line): line is OrderLineDetails => line !== null)
      : [],
  }
}