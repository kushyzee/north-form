import { Skeleton } from "@/components/ui/skeleton"

/** Route-level loading state for `/auth`. Mirrors the real page's shape. */
export default function AuthLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-md">
        <Skeleton className="mx-auto h-9 w-64" />
        <Skeleton className="mx-auto mt-4 h-4 w-full max-w-sm" />
        <Skeleton className="mt-3 h-4 w-full max-w-xs" />
        <Skeleton className="mt-8 h-11 w-full" />
      </div>

      <p className="sr-only" role="status">
        Loading sign in
      </p>
    </div>
  )
}