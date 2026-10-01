import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"

import { ProductGallery } from "@/components/storefront/product-gallery"
import { ProductGrid } from "@/components/storefront/product-grid"
import { ProductPurchasePanel } from "@/components/storefront/product-purchase-panel"
import {
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/catalogue/queries"
import { getAvailability } from "@/lib/catalogue/types"
import { formatNaira } from "@/lib/format"

type ProductPageProps = PageProps<"/shop/[slug]">

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await getProductBySlug(slug)

  if (!product) {
    return { title: "Product not found" }
  }

  return {
    title: product.name,
    description: `${product.name} — ${formatNaira(product.price)}. ${product.description}`,
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params

  const product = await getProductBySlug(slug)

  // Invalid slug → App Router 404, which renders `not-found.tsx`.
  if (!product) {
    notFound()
  }

  const related = await getRelatedProducts(product, 4)
  const availability = getAvailability(product.stockQuantity)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-8">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link
              href="/"
              className="transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Home
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-3.5" />
          </li>
          <li>
            <Link
              href="/shop"
              className="transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Shop
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-3.5" />
          </li>
          <li>
            <Link
              href={`/shop?category=${product.category.slug}`}
              className="transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {product.category.name}
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-3.5" />
          </li>
          <li aria-current="page" className="text-foreground">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-24">
        <ProductGallery images={product.images} productName={product.name} />

        <div className="flex flex-col gap-6 lg:py-4">
          <div className="flex flex-col gap-3">
            <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
              {product.category.name}
            </p>
            <h1 className="font-heading text-3xl leading-tight tracking-tight sm:text-4xl">
              {product.name}
            </h1>
            <p className="text-lg tabular-nums">{formatNaira(product.price)}</p>
          </div>

          <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
            {product.description}
          </p>

          {/* Availability is stated in words as well as signalled by the button. */}
          <p
            className={
              availability === "out_of_stock"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {availability === "out_of_stock"
              ? "Out of stock"
              : `${product.stockQuantity} in stock`}
          </p>

          <ProductPurchasePanel product={product} />

          <dl className="mt-4 grid gap-4 border-t border-border pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="mt-1">
                <Link
                  href={`/shop?category=${product.category.slug}`}
                  className="underline underline-offset-4 hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {product.category.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sizes</dt>
              <dd className="mt-1">
                {product.sizes.length > 0 ? product.sizes.join(", ") : "One size"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="mt-1">Across Nigeria, 2–4 working days</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Currency</dt>
              <dd className="mt-1">Nigerian Naira (NGN)</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Related products from the same category */}
      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="mt-20 border-t border-border pt-14">
          <h2 id="related-heading" className="font-heading text-2xl tracking-tight">
            More {product.category.name.toLowerCase()}
          </h2>
          <div className="mt-8">
            <ProductGrid products={related} />
          </div>
        </section>
      ) : null}
    </div>
  )
}