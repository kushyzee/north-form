"use client"

import { useEffect } from "react"
import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Route-level error boundary.
 *
 * Shows a concise, human message. The underlying error — which may contain
 * PostgREST internals — is logged to the console for developers and is never
 * rendered. Next.js 16 passes `retry` (not `reset`) to error boundaries.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error("[storefront] route error:", error)
  }, [error])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6 lg:py-32">
      <div className="flex flex-col gap-3">
        <p className="text-xs tracking-[0.22em] text-muted-foreground uppercase">
          Something went wrong
        </p>
        <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
          We couldn&rsquo;t load this page
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The store hit an unexpected problem loading this content. Please try
          again — if it keeps happening, come back a little later.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={retry}>
          Try again
        </Button>
        <Link
          href="/shop"
          className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
        >
          Browse the shop
        </Link>
      </div>
    </div>
  )
}