import "server-only"

import { createRequestClient } from "@/lib/supabase/server"

/**
 * Reading the caller's cart.
 *
 * There is deliberately **no `userId` argument**, for the same reason
 * `lib/orders/queries.ts` has none: `auth.uid()` inside the RLS policy decides
 * which rows are visible at all, so a caller cannot widen the query by asking
 * for a different owner. Passing a user id here would be an invitation to
 * reintroduce exactly that.
 *
 * The catalogue is **joined on read**, never snapshotted into the cart table.
 * A repriced or renamed product therefore shows its current name and price on
 * the next load, which is the only correct behaviour for a cart that is not an
 * order.
 *
 * Validated from `unknown` for the same reason as the other query modules: the
 * Supabase client is untyped in this project, and a cart that renders
 * `₦undefined` is worse than one that renders nothing.
 */

/** One cart line, with its product details resolved from `products`. */
export type CartLine = {
  /** Composite line key: `${productId}::${size}`, matching the client reducer. */
  lineId: string
  productId: string
  productSlug: string
  productName: string
  productImage: string | null
  categoryName: string
  /** Naira, from `products.price` — never from the client. */
  unitPrice: number
  size: string
  quantity: number
  /** Current `products.stock_quantity`, so the client can cap its stepper. */
  maxQuantity: number
}

export type Cart = {
  items: CartLine[]
  /** Total units across all lines — drives the header badge. */
  itemCount: number
  /** Sum of unit price x quantity, from catalogue prices. Display only. */
  subtotal: number
}

export const emptyCart: Cart = { items: [], itemCount: 0, subtotal: 0 }

/** Everything needed to render a line. `cart_items` itself stores no money. */
const CART_SELECT =
  "product_id, size, quantity, " +
  "product:products!inner(id, name, slug, price, stock_quantity, images, " +
  "category:categories!inner(name))"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

/** PostgREST returns `numeric` as a JSON number here, but tolerate strings. */
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toCartLine(value: unknown): CartLine | null {
  if (!isRecord(value)) return null

  const productId = asString(value.product_id)
  const size = asString(value.size)
  const quantity = asNumber(value.quantity)
  if (!productId || !size || quantity === null) return null

  if (!isRecord(value.product)) return null
  const product = value.product

  const name = asString(product.name)
  const slug = asString(product.slug)
  const price = asNumber(product.price)
  const stockQuantity = asNumber(product.stock_quantity)
  const categoryName = isRecord(product.category) ? asString(product.category.name) : null
  if (!name || !slug || price === null || stockQuantity === null || !categoryName) return null

  const images = Array.isArray(product.images) ? product.images : []
  const firstImage = images.find((entry): entry is string => typeof entry === "string")

  return {
    lineId: `${productId}::${size}`,
    productId,
    productSlug: slug,
    productName: name,
    productImage: firstImage ?? null,
    categoryName,
    unitPrice: price,
    size,
    quantity,
    maxQuantity: Math.max(stockQuantity, 0),
  }
}

/**
 * The signed-in customer's cart, newest line last.
 *
 * Returns an empty cart rather than throwing when the read fails, so a
 * transient database error cannot render the storefront as a broken page. A
 * real cart that fails to load and a cart that is genuinely empty are
 * indistinguishable here on purpose — the caller re-reads after each write.
 */
export async function getCart(): Promise<Cart> {
  const supabase = await createRequestClient()

  const { data, error } = await supabase
    .from("cart_items")
    .select(CART_SELECT)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[cart] getCart failed:", error.message)
    return emptyCart
  }

  if (!Array.isArray(data)) return emptyCart

  const items = data.map(toCartLine).filter((line): line is CartLine => line !== null)

  return {
    items,
    itemCount: items.reduce((total, line) => total + line.quantity, 0),
    subtotal: items.reduce((total, line) => total + line.unitPrice * line.quantity, 0),
  }
}