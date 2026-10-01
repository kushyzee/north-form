import type { Metadata } from "next"
import { SearchX } from "lucide-react"

import { EmptyState } from "@/components/storefront/empty-state"
import { ProductGrid } from "@/components/storefront/product-grid"
import { ShopFilters } from "@/components/storefront/shop-filters"
import {
  DEFAULT_PRODUCT_SORT,
  isProductSort,
} from "@/lib/catalogue/types"
import { getCategories, getProducts } from "@/lib/catalogue/queries"

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse the full NORTH & FORM catalogue: shirts, jeans, shoes and hoodies, priced in Nigerian Naira.",
}

/** `searchParams` is a Request-time API — values are unknown ahead of time. */
function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function ShopPage(props: PageProps<"/shop">) {
  const searchParams = await props.searchParams

  const rawSearch = firstParam(searchParams.q)
  const rawCategory = firstParam(searchParams.category)
  const rawSort = firstParam(searchParams.sort)

  // Only pass through values we understand, so a hand-edited URL cannot
  // produce an unbounded or invalid query.
  const search = rawSearch?.trim() || undefined
  const sort = isProductSort(rawSort) ? rawSort : DEFAULT_PRODUCT_SORT

  const categories = await getCategories()
  const categorySlugs = new Set(categories.map((category) => category.slug))
  const category = rawCategory && categorySlugs.has(rawCategory) ? rawCategory : undefined

  const products = await getProducts({ category, search, sort })

  // Distinguish "nothing matches this filter" from "the shop is empty".
  const hasFilter = Boolean(search) || Boolean(category)
  const activeCategoryName = categories.find((c) => c.slug === category)?.name

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <header className="max-w-2xl">
        <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
          {activeCategoryName ?? "The collection"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {activeCategoryName
            ? `Every ${activeCategoryName.toLowerCase()} piece we currently make, in stock across Nigeria.`
            : "Shirts, denim, shoes and heavyweight cotton. Built to be worn, priced in Naira."}
        </p>
      </header>

      <div className="mt-10 border-b border-border pb-8">
        <ShopFilters
          categories={categories}
          activeCategory={category}
          activeSort={sort}
          resultCount={products.length}
        />
      </div>

      <div className="mt-10">
        {products.length > 0 ? (
          <ProductGrid products={products} priorityCount={4} />
        ) : hasFilter ? (
          <EmptyState
            icon={<SearchX aria-hidden="true" className="size-7" />}
            title="No matches"
            description={
              search && category
                ? `Nothing in ${activeCategoryName?.toLowerCase()} matches “${search}”. Try a different search or clear the filters.`
                : search
                  ? `We could not find anything matching “${search}”. Try a shorter or different search.`
                  : `There are no ${activeCategoryName?.toLowerCase() ?? "products"} available right now.`
            }
            action={{ href: "/shop", label: "Clear filters" }}
          />
        ) : (
          <EmptyState
            title="The shop is empty"
            description="No products have been published yet. Please check back shortly."
          />
        )}
      </div>
    </div>
  )
}