import Link from "next/link"
import { ArrowRight, SearchX } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Root 404. Rendered for any unmatched route, including an unknown product
 * slug via `notFound()`.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6 lg:py-32">
      <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />

      <div className="flex flex-col gap-3">
        <p className="text-xs tracking-[0.22em] text-muted-foreground uppercase">
          Error 404
        </p>
        <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
          We couldn&rsquo;t find that page
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The link may be out of date, or the product may have been retired from
          the collection.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/shop"
          className={cn(buttonVariants({ size: "lg" }))}
        >
          Browse the shop
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link
          href="/"
          className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}