import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { EmptyState } from "@/components/storefront/empty-state"
import { Hero } from "@/components/storefront/hero"
import { ProductGrid } from "@/components/storefront/product-grid"
import { getCategories, getFeaturedProducts } from "@/lib/catalogue/queries"

// Note: `lib/supabase/server.ts` reads cookies, so every route that queries the
// catalogue is dynamically rendered. A `revalidate` export here would have no
// effect — do not add one without first changing how the client is created.

export default async function HomePage() {
  const [featuredProducts, categories] = await Promise.all([
    getFeaturedProducts(4),
    getCategories(),
  ])

  // Featured rows arrive newest-first; the oldest becomes the hero spotlight so
  // it is not duplicated in the grid directly below it.
  const spotlight = featuredProducts.at(-1) ?? null
  const gridProducts = spotlight
    ? featuredProducts.filter((product) => product.id !== spotlight.id)
    : featuredProducts

  return (
    <>
      <Hero spotlight={spotlight} />

      {/* Featured products — straight from `products.featured` */}
      <section
        aria-labelledby="featured-heading"
        className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
      >
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2
              id="featured-heading"
              className="font-heading text-2xl tracking-tight sm:text-3xl"
            >
              Featured
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The pieces we keep coming back to.
            </p>
          </div>
          <Link
            href="/shop"
            className="hidden shrink-0 items-center gap-2 text-sm tracking-wide underline underline-offset-8 transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:inline-flex"
          >
            View all
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        <div className="mt-10">
          {gridProducts.length > 0 ? (
            <ProductGrid products={gridProducts} priorityCount={1} />
          ) : (
            <EmptyState
              title="Nothing featured right now"
              description="We are refreshing the collection. Browse the full shop in the meantime."
              action={{ href: "/shop", label: "Browse the shop" }}
            />
          )}
        </div>

        <Link
          href="/shop"
          className="mt-10 inline-flex items-center gap-2 text-sm tracking-wide underline underline-offset-8 transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:hidden"
        >
          View all products
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </section>
{/* Categories — each links to the matching shop filter state */}
      <section
        aria-labelledby="categories-heading"
        className="border-y border-border"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 id="categories-heading" className="font-heading text-2xl tracking-tight sm:text-3xl">
            Shop by category
          </h2>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/shop?category=${category.slug}`}
                  className="group flex h-full flex-col justify-between gap-6 rounded-lg border border-border bg-background p-6 transition-colors hover:border-brand-ink/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
                >
                  <div>
                    <h3 className="font-heading text-xl">{category.name}</h3>
                    {category.description ? (
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {category.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="inline-flex items-center gap-2 text-xs tracking-[0.16em] uppercase">
                    Shop {category.name.toLowerCase()}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:translate-x-1"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Brand statement — restrained on purpose, no invented lore. */}
      <section
        aria-labelledby="statement-heading"
        className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <div className="max-w-3xl">
          <h2
            id="statement-heading"
            className="font-heading text-3xl leading-tight tracking-tight sm:text-4xl"
          >
            Fewer pieces. Better ones.
          </h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>
              NORTH &amp; FORM is a Nigerian menswear label built around a short,
              deliberate catalogue: shirts, denim, shoes and heavyweight cotton.
            </p>
            <p>
              We design for the Nigerian climate and the Nigerian week — pieces
              that survive the commute, the harmattan and the weekend, and still
              look considered when it matters.
            </p>
          </div>
          <Link
            href="/shop"
            className="mt-8 inline-flex items-center gap-2 text-sm tracking-wide underline underline-offset-8 transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Start with the essentials
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </section>
    </>
  )
}
