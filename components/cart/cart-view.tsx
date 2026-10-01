"use client"

import Link from "next/link"
import { ArrowRight, ShoppingBag } from "lucide-react"

import { CartLineItem } from "@/components/cart/cart-line-item"
import { useCart } from "@/components/cart/cart-provider"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatItemCount, formatNaira } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Cart page body.
 *
 * A Client Component because the cart lives in browser storage. Renders
 * nothing but a skeleton until hydration completes, so the server-rendered
 * markup and the first client render always agree.
 *
 * Prices here are a snapshot for display only. Checkout must re-read products,
 * prices and stock on the server before creating an order.
 */
export function CartView() {
  const { items, count, subtotal, hydrated, clearCart } = useCart()

  if (!hydrated) {
    return (
      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {[0, 1].map((key) => (
            <div key={key} className="flex gap-6 border-b border-border pb-6">
              <div className="aspect-4/5 w-24 shrink-0 animate-pulse rounded-md bg-muted sm:w-32" />
              <div className="flex-1 space-y-3">
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/5 animate-pulse rounded bg-muted" />
                <div className="h-10 w-32 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-56 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-lg border border-dashed border-border px-6 py-20 text-center">
        <ShoppingBag aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="font-heading text-2xl">Your cart is empty</h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Nothing here yet. Browse the catalogue and add a piece when something
          catches your eye.
        </p>
        <Link
          href="/shop"
          className={cn(buttonVariants({ size: "lg" }), "mt-1")}
        >
          Browse the shop
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-16">
      {/* Lines */}
      <section aria-label="Items in your cart">
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <CartLineItem key={item.lineId} lineId={item.lineId} />
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <Link
            href="/shop"
            className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Continue shopping
          </Link>
          <Button variant="ghost" size="sm" onClick={clearCart}>
            Clear cart
          </Button>
        </div>
      </section>

      {/* Summary */}
      <aside
        aria-label="Order summary"
        className="h-fit rounded-lg border border-border bg-card p-6 lg:sticky lg:top-24"
      >
        <h2 className="font-heading text-lg">Summary</h2>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Items</dt>
            <dd className="tabular-nums">{formatItemCount(count)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-medium tabular-nums">{formatNaira(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd className="text-muted-foreground">
              Calculated at checkout
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex justify-between border-t border-border pt-4">
          <span className="font-medium">Total</span>
          <span className="font-heading text-lg tabular-nums">
            {formatNaira(subtotal)}
          </span>
        </div>

        {/* Checkout is a later phase; the target route does not exist yet. */}
        <Link
          href="/checkout"
          className={cn(buttonVariants({ size: "lg" }), "mt-6 w-full")}
        >
          Proceed to checkout
          <ArrowRight aria-hidden="true" />
        </Link>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Delivery is charged at checkout based on your Nigerian destination.
          Prices and stock are re-verified before your order is placed.
        </p>
      </aside>
    </div>
  )
}