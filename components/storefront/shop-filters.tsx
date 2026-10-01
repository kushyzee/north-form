"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PRODUCT_SORTS, type Category, type ProductSort } from "@/lib/catalogue/types"
import { cn } from "@/lib/utils"

const SORT_LABELS: Record<ProductSort, string> = {
  featured: "Featured",
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "name-asc": "Name: A–Z",
}

const ALL_CATEGORIES = "all"

/**
 * Catalogue filters.
 *
 * URL search params are the single source of truth (`?category=`, `?q=`,
 * `?sort=`), so every filtered view is shareable and the back button behaves.
 * This component only pushes new URLs — it holds no duplicated filter state
 * beyond the in-progress search text.
 */
export function ShopFilters({
  categories,
  activeCategory,
  activeSort,
  resultCount,
}: {
  categories: Category[]
  activeCategory: string | undefined
  activeSort: ProductSort
  resultCount: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Local mirror so typing stays responsive; the URL catches up on submit.
  const urlQuery = searchParams.get("q") ?? ""
  const [query, setQuery] = useState(urlQuery)

  // Keep the input in step with back/forward navigation. Adjusting state during
  // render (rather than in an effect) avoids a cascading extra render.
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery)
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery)
    setQuery(urlQuery)
  }

  function navigate(next: URLSearchParams) {
    // Drop defaults so shared URLs stay short and readable.
    const params = new URLSearchParams(next)
    if (!params.get("category")) params.delete("category")
    if (!params.get("q")) params.delete("q")
    if (!params.get("sort") || params.get("sort") === "featured") params.delete("sort")

    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `/shop?${qs}` : "/shop", { scroll: false })
    })
  }

  function handleCategoryChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (slug === ALL_CATEGORIES) {
      params.delete("category")
    } else {
      params.set("category", slug)
    }
    navigate(params)
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    const term = query.trim()
    if (term) {
      params.set("q", term)
    } else {
      params.delete("q")
    }
    navigate(params)
  }

  function handleClearQuery() {
    setQuery("")
    const params = new URLSearchParams(searchParams.toString())
    params.delete("q")
    navigate(params)
  }

  function handleSortChange(value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "featured") {
      params.set("sort", value)
    } else {
      params.delete("sort")
    }
    navigate(params)
  }

  const activeQuery = searchParams.get("q") ?? ""
  const hasActiveFilters =
    Boolean(activeCategory) || Boolean(activeQuery) || activeSort !== "featured"

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <form role="search" onSubmit={handleSearchSubmit} className="relative max-w-md">
        <Label htmlFor="catalogue-search" className="sr-only">
          Search products
        </Label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="catalogue-search"
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the catalogue"
          autoComplete="off"
          className="h-10 pl-9"
          disabled={isPending}
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleClearQuery}
            className="absolute top-1/2 right-1 -translate-y-1/2"
          >
            <X aria-hidden="true" />
            <span className="sr-only">Clear search</span>
          </Button>
        ) : null}
      </form>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Category filter */}
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Filter by category</legend>
          <CategoryChip
            label="All"
            active={!activeCategory}
            onClick={() => handleCategoryChange(ALL_CATEGORIES)}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              active={activeCategory === category.slug}
              onClick={() => handleCategoryChange(category.slug)}
            />
          ))}
        </fieldset>

        {/* Sort + result count */}
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <p aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
            {resultCount} {resultCount === 1 ? "product" : "products"}
          </p>

          <div className="flex items-center gap-2">
            <Label htmlFor="catalogue-sort" className="text-sm text-muted-foreground">
              Sort
            </Label>
            <Select value={activeSort} onValueChange={handleSortChange}>
              <SelectTrigger id="catalogue-sort" aria-label="Sort products">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {PRODUCT_SORTS.map((sort) => (
                  <SelectItem key={sort} value={sort}>
                    {SORT_LABELS[sort]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {activeCategory
              ? `Showing ${categories.find((c) => c.slug === activeCategory)?.name ?? activeCategory}`
              : "Showing all products"}
            {activeQuery ? ` matching “${activeQuery}”` : ""}
          </p>
          <Button
            variant="link"
            size="sm"
            onClick={() =>
              startTransition(() => router.replace("/shop", { scroll: false }))
            }
            className="h-auto p-0"
          >
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active
          ? "border-brand-ink bg-brand-ink text-brand-canvas"
          : "border-border bg-background text-muted-foreground hover:border-brand-ink/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}