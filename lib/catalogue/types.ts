/**
 * Catalogue domain types.
 *
 * The Supabase client is intentionally untyped in this project (no generated
 * `Database` type is wired up yet), so every row is validated at runtime by
 * `lib/catalogue/queries.ts` before it is exposed here. That keeps the rest of
 * the app free of `any` without introducing a type-generation workflow.
 */

/** A public catalogue category. */
export type Category = {
  id: string
  name: string
  slug: string
  description: string | null
}

/** A public catalogue product, always resolved with its category. */
export type Product = {
  id: string
  name: string
  slug: string
  description: string
  /** Naira, as a JS number. The DB stores `numeric(12,2)`; PostgREST returns a number. */
  price: number
  stockQuantity: number
  sizes: string[]
  images: string[]
  featured: boolean
  category: Category
}

/** Sorting options offered on the shop page, mirrored in `?sort=`. */
export const PRODUCT_SORTS = [
  "featured",
  "newest",
  "price-asc",
  "price-desc",
  "name-asc",
] as const

export type ProductSort = (typeof PRODUCT_SORTS)[number]

export const DEFAULT_PRODUCT_SORT: ProductSort = "featured"

/** Narrowing helper: rejects anything outside the known sort options. */
export function isProductSort(value: unknown): value is ProductSort {
  return typeof value === "string" && (PRODUCT_SORTS as readonly string[]).includes(value)
}

/** Product stock state, derived from `stock_quantity`. */
export type Availability = "in_stock" | "low_stock" | "out_of_stock"

/** At or below this many units we surface a "low stock" note (not urgency copy). */
export const LOW_STOCK_THRESHOLD = 5

export function getAvailability(stockQuantity: number): Availability {
  if (stockQuantity <= 0) return "out_of_stock"
  if (stockQuantity <= LOW_STOCK_THRESHOLD) return "low_stock"
  return "in_stock"
}

export function isInStock(stockQuantity: number): boolean {
  return stockQuantity > 0
}