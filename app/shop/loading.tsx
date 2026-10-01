import { Skeleton } from "@/components/ui/skeleton"

/** Route-level loading state for `/shop`. Mirrors the real grid's layout. */
export default function ShopLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="max-w-2xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-3 h-4 w-full max-w-md" />
      </div>

      <div className="mt-10 space-y-6 border-b border-border pb-8">
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      </div>

      <div
        className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4"
        aria-hidden="true"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index}>
            <Skeleton className="aspect-4/5 w-full" />
            <Skeleton className="mt-4 h-3 w-20" />
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-2 h-4 w-16" />
          </div>
        ))}
      </div>

      <p className="sr-only" role="status">
        Loading products
      </p>
    </div>
  )
}