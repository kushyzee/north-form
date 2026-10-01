import { Skeleton } from "@/components/ui/skeleton"

/** Route-level loading state for a product detail page. */
export default function ProductLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Skeleton className="mb-8 h-4 w-72" />

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-24">
        <div>
          <Skeleton className="aspect-4/5 w-full" />
          <div className="mt-3 grid grid-cols-5 gap-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="aspect-4/5 w-full" />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:py-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-11 w-2/3" />
          <div className="flex gap-3">
            <Skeleton className="h-11 w-32" />
            <Skeleton className="h-12 flex-1 sm:flex-none sm:w-48" />
          </div>
        </div>
      </div>

      <p className="sr-only" role="status">
        Loading product
      </p>
    </div>
  )
}