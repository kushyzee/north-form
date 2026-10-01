import { ProductCard } from "@/components/storefront/product-card"
import type { Product } from "@/lib/catalogue/types"

/**
 * Responsive product grid.
 *
 * Two columns on phones so names and prices stay readable, opening up to four
 * on wide screens. `priority` is passed only to the first row so the LCP image
 * is preloaded without preloading the whole catalogue.
 */
export function ProductGrid({
  products,
  priorityCount = 0,
}: {
  products: Product[]
  /** Number of leading cards whose image should be eagerly loaded. */
  priorityCount?: number
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  )
}