import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { ProductImage } from "@/components/storefront/product-image"
import type { Product } from "@/lib/catalogue/types"
import { cn } from "@/lib/utils"

/**
 * Homepage hero.
 *
 * The visual is a real product image from the catalogue rather than stock
 * artwork, so the page never ships placeholder imagery the database doesn't own.
 */
export function Hero({ spotlight }: { spotlight: Product | null }) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="border-b border-border"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24 lg:px-8">
        <div className="flex flex-col items-start gap-6">
          <p className="text-xs tracking-[0.22em] text-muted-foreground uppercase">
            Lagos, Nigeria
          </p>

          <h1
            id="hero-heading"
            className="font-heading text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            Built for the way you move.
          </h1>

          <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            Considered shirts, denim, footwear and heavyweight cotton. Made to be
            worn through the week, not just looked at.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/shop"
              className={cn(buttonVariants({ size: "lg" }), "px-8")}
            >
              Shop the collection
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link
              href="/shop?sort=price-asc"
              className="text-sm tracking-wide underline underline-offset-8 transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Best value first
            </Link>
          </div>
        </div>

        {spotlight ? (
          <Link
            href={`/shop/${spotlight.slug}`}
            className="group relative block focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            <ProductImage
              src={spotlight.images[1] ?? spotlight.images[0]}
              alt={`${spotlight.name} from the NORTH & FORM studio`}
              sizes="(min-width: 1024px) 45vw, 100vw"
              priority
              className="transition-opacity duration-500 group-hover:opacity-95"
            />
            <span className="absolute bottom-4 left-4 rounded-sm bg-brand-canvas/95 px-3 py-1.5 text-[11px] tracking-[0.16em] text-brand-ink uppercase">
              {spotlight.name}
            </span>
          </Link>
        ) : (
          <div
            aria-hidden="true"
            className="aspect-4/5 w-full bg-brand-stone/30"
          />
        )}
      </div>
    </section>
  )
}