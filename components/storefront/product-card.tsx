import Link from "next/link"

import { ProductImage } from "@/components/storefront/product-image"
import { getAvailability, type Product } from "@/lib/catalogue/types"
import { formatNaira } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Catalogue product card. Server Component — it renders entirely from props.
 *
 * The whole card is not one big link: only the image and the product name link
 * to the detail page, so the name stays the single, predictable link target
 * for screen readers and keyboard users.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: Product
  priority?: boolean
}) {
  const availability = getAvailability(product.stockQuantity)
  const href = `/shop/${product.slug}`

  return (
    <article className="group relative flex flex-col">
      <Link
        href={href}
        className="relative block focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        <ProductImage
          src={product.images[0]}
          alt={product.name}
          sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 45vw"
          priority={priority}
          className="transition-opacity duration-300 group-hover:opacity-90"
        />

        {/* Availability is conveyed by text as well as colour, never colour
            alone. */}
        {availability === "out_of_stock" ? (
          <span className="absolute top-3 left-3 rounded-sm bg-brand-ink px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-brand-canvas uppercase">
            Sold out
          </span>
        ) : availability === "low_stock" ? (
          <span className="absolute top-3 left-3 rounded-sm bg-brand-canvas/95 px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-brand-ink uppercase">
            Low stock
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-1 pt-4">
        <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
          {product.category.name}
        </p>

        <h3 className="text-base leading-snug">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {product.name}
          </Link>
        </h3>

        <p
          className={cn(
            "mt-1 text-sm",
            availability === "out_of_stock" && "text-muted-foreground line-through",
          )}
        >
          {formatNaira(product.price)}
        </p>
      </div>
    </article>
  )
}